import { POST as allocateHandler } from '../app/api/allocations/route';
import { GET as overdueHandler } from '../app/api/allocations/overdue/route';
import { POST as returnHandler } from '../app/api/allocations/return/route';
import { POST as transferCreateHandler, PATCH as transferResolveHandler, GET as transferListHandler } from '../app/api/transfers/route';
import { setMockCookieStore, signSession } from '../lib/auth';
import { db } from '../lib/db';
import assert from 'assert';

// Setup Mock Cookie Store
let store: Record<string, string> = {};
const mockCookies = {
  get: (key: string) => {
    return store[key] ? { value: store[key] } : undefined;
  },
  set: (key: string, value: string) => {
    store[key] = value;
  },
  delete: (key: string) => {
    delete store[key];
  },
};

setMockCookieStore(mockCookies);

async function authenticateAs(role: 'EMPLOYEE' | 'ADMIN' | 'ASSET_MANAGER' | 'DEPARTMENT_HEAD', userId: string, email: string) {
  const token = await signSession({ userId, email, role });
  store['session'] = token;
}

function clearAuthentication() {
  store = {};
}

async function runPhase3Tests() {
  console.log('🧪 Starting Phase 3 (Allocation, Return, and Transfer) Integration Tests...\n');

  let adminUserId = '';
  let employeeUserId1 = '';
  let employeeUserId2 = '';
  let testCategoryId = '';
  let testDeptId = '';
  let testAssetId = '';

  const testCategoryName = 'Integ Test Phase 3 Laptops';
  const testDeptCode = 'INTEG_DEPT_P3';
  const serialNumber = 'PHASE-3-TEST-SERIAL';

  try {
    // ---------------- CLEANUP PREVIOUS RUNS ----------------
    console.log('🧹 Cleaning up test database state...');
    
    // Delete notifications and activity logs
    await db.notification.deleteMany({
      where: {
        user: { email: { in: ['admin-p3@company.com', 'emp1-p3@company.com', 'emp2-p3@company.com'] } }
      }
    });

    await db.activityLog.deleteMany({
      where: {
        user: { email: { in: ['admin-p3@company.com', 'emp1-p3@company.com', 'emp2-p3@company.com'] } }
      }
    });

    // Delete transfer requests
    await db.transferRequest.deleteMany({
      where: {
        OR: [
          { fromUser: { email: { in: ['emp1-p3@company.com', 'emp2-p3@company.com'] } } },
          { toUser: { email: { in: ['emp1-p3@company.com', 'emp2-p3@company.com'] } } }
        ]
      }
    });

    // Delete allocations
    await db.allocation.deleteMany({
      where: {
        OR: [
          { holder: { email: { in: ['emp1-p3@company.com', 'emp2-p3@company.com'] } } }
        ]
      }
    });

    // Delete test assets
    await db.asset.deleteMany({
      where: { serialNumber }
    });

    // Delete test category
    await db.category.deleteMany({
      where: { name: testCategoryName }
    });

    // Delete test department
    await db.department.deleteMany({
      where: { code: testDeptCode }
    });

    // Delete test users
    await db.user.deleteMany({
      where: { email: { in: ['admin-p3@company.com', 'emp1-p3@company.com', 'emp2-p3@company.com'] } }
    });

    // ---------------- SEED REQUIRED RELATIONS ----------------
    console.log('🌱 Seeding relation fixtures...');
    
    // Create Category
    const category = await db.category.create({
      data: { name: testCategoryName, customFields: {} }
    });
    testCategoryId = category.id;

    // Create Department
    const dept = await db.department.create({
      data: { name: 'Integ Test Dept Phase 3', code: testDeptCode, status: 'ACTIVE' }
    });
    testDeptId = dept.id;

    // Create Admin user
    const adminUser = await db.user.create({
      data: {
        name: 'Admin P3',
        email: 'admin-p3@company.com',
        passwordHash: 'hash',
        role: 'ADMIN',
        status: 'ACTIVE',
      }
    });
    adminUserId = adminUser.id;

    // Create Employee 1 (Source assignee)
    const emp1 = await db.user.create({
      data: {
        name: 'Employee One P3',
        email: 'emp1-p3@company.com',
        passwordHash: 'hash',
        role: 'EMPLOYEE',
        status: 'ACTIVE',
      }
    });
    employeeUserId1 = emp1.id;

    // Create Employee 2 (Target assignee for transfer)
    const emp2 = await db.user.create({
      data: {
        name: 'Employee Two P3',
        email: 'emp2-p3@company.com',
        passwordHash: 'hash',
        role: 'EMPLOYEE',
        status: 'ACTIVE',
      }
    });
    employeeUserId2 = emp2.id;

    // Create Asset (AVAILABLE)
    const asset = await db.asset.create({
      data: {
        name: 'Integ Test Phase 3 Asset',
        categoryId: testCategoryId,
        serialNumber,
        assetTag: 'AF-9999',
        status: 'AVAILABLE',
        isBookable: false,
      }
    });
    testAssetId = asset.id;


    // ---------------- 1. ASSET ALLOCATION ----------------
    console.log('\n--- 1. Testing Asset Allocation ---');
    await authenticateAs('ADMIN', adminUserId, 'admin-p3@company.com');

    const allocReq = new Request('http://localhost/api/allocations', {
      method: 'POST',
      body: JSON.stringify({
        assetId: testAssetId,
        holderId: employeeUserId1,
        expectedReturnDate: new Date(Date.now() + 86400000).toISOString(), // 1 day from now
      }),
    });
    const allocRes = await allocateHandler(allocReq);
    assert.strictEqual(allocRes.status, 201, 'Allocation should succeed with 201');
    const allocData = await allocRes.json();
    assert.ok(allocData.allocation.isActive, 'Allocation must be active');
    console.log('✅ Asset allocated successfully.');

    // Verify asset status updated to ALLOCATED in DB
    const dbAsset1 = await db.asset.findUnique({ where: { id: testAssetId } });
    assert.strictEqual(dbAsset1?.status, 'ALLOCATED', 'Asset status should update to ALLOCATED');
    console.log('✅ Database status updated to ALLOCATED.');


    // ---------------- 2. ALLOCATION CONFLICT RULE ----------------
    console.log('\n--- 2. Testing Allocation Conflict Rule ---');
    // Try to allocate same asset to Employee 2
    const conflictReq = new Request('http://localhost/api/allocations', {
      method: 'POST',
      body: JSON.stringify({
        assetId: testAssetId,
        holderId: employeeUserId2,
      }),
    });
    const conflictRes = await allocateHandler(conflictReq);
    assert.strictEqual(conflictRes.status, 409, 'Re-allocating active asset must return 409 Conflict');
    const conflictData = await conflictRes.json();
    assert.match(conflictData.error, /Conflict: Asset is currently held by/, 'Should return informative conflict message');
    assert.strictEqual(conflictData.holderName, 'Employee One P3', 'Should return holder name');
    console.log('✅ Double allocation conflict blocked. Message: ' + conflictData.error);


    // ---------------- 3. TRANSFER REQUEST ----------------
    console.log('\n--- 3. Testing Transfer Request ---');
    // Regular employee requests transfer
    await authenticateAs('EMPLOYEE', employeeUserId2, 'emp2-p3@company.com');

    const transferReq = new Request('http://localhost/api/transfers', {
      method: 'POST',
      body: JSON.stringify({
        assetId: testAssetId,
        toUserId: employeeUserId2,
        reason: 'Need it for project testing.',
      }),
    });
    const transferRes = await transferCreateHandler(transferReq);
    assert.strictEqual(transferRes.status, 201, 'Transfer request should be created with 201');
    const transferData = await transferRes.json();
    assert.strictEqual(transferData.transferRequest.status, 'REQUESTED', 'Transfer Request status should be REQUESTED');
    const transferId = transferData.transferRequest.id;
    console.log(`✅ Transfer Request raised. ID: ${transferId}`);


    // ---------------- 4. TRANSFER APPROVAL & REALLOCATION ----------------
    console.log('\n--- 4. Testing Transfer Approval & Reallocation ---');
    // Admin approves the transfer
    await authenticateAs('ADMIN', adminUserId, 'admin-p3@company.com');

    const approveReq = new Request('http://localhost/api/transfers', {
      method: 'PATCH',
      body: JSON.stringify({
        id: transferId,
        action: 'APPROVE',
      }),
    });
    const approveRes = await transferResolveHandler(approveReq);
    assert.strictEqual(approveRes.status, 200, 'Approve action should return 200');
    const approveData = await approveRes.json();
    assert.strictEqual(approveData.status, 'REALLOCATED', 'Approve should change transfer status to REALLOCATED');
    console.log('✅ Transfer request approved and marked REALLOCATED.');

    // Verify old allocation is closed, new is open
    const allocations = await db.allocation.findMany({
      where: { assetId: testAssetId },
      orderBy: { allocatedAt: 'desc' },
    });
    assert.strictEqual(allocations.length, 2, 'Should have exactly 2 allocation records');
    assert.strictEqual(allocations[0].isActive, true, 'New allocation must be active');
    assert.strictEqual(allocations[0].holderId, employeeUserId2, 'New holder must be Employee 2');
    assert.strictEqual(allocations[1].isActive, false, 'Old allocation must be inactive');
    assert.strictEqual(allocations[1].holderId, employeeUserId1, 'Old holder was Employee 1');
    assert.ok(allocations[1].returnedAt, 'Old allocation returnedAt should be set');
    assert.strictEqual(allocations[1].conditionAtReturn, 'Transferred', 'Old allocation conditionAtReturn log set');
    console.log('✅ Historical and active allocation chains validated successfully.');


    // ---------------- 5. OVERDUE ALLOCATIONS QUERY ----------------
    console.log('\n--- 5. Testing Overdue Allocations Query ---');
    
    // Fetch current active allocation and update expectedReturnDate to past manually
    await db.allocation.updateMany({
      where: { assetId: testAssetId, isActive: true },
      data: {
        expectedReturnDate: new Date(Date.now() - 3600000), // 1 hour ago (past!)
      },
    });

    const overdueRes = await overdueHandler();
    assert.strictEqual(overdueRes.status, 200, 'Overdue query should succeed with 200');
    const overdueData = await overdueRes.json();
    assert.ok(overdueData.allocations.length >= 1, 'Should return at least 1 overdue allocation');
    assert.strictEqual(overdueData.allocations[0].asset.id, testAssetId, 'Asset ID must match test asset');
    console.log('✅ Overdue allocations detection verified.');


    // ---------------- 6. RETURN WORKFLOW ----------------
    console.log('\n--- 6. Testing Return Workflow ---');
    // Return asset
    const returnReq = new Request('http://localhost/api/allocations/return', {
      method: 'POST',
      body: JSON.stringify({
        assetId: testAssetId,
        conditionAtReturn: 'Good condition',
      }),
    });
    const returnRes = await returnHandler(returnReq);
    assert.strictEqual(returnRes.status, 200, 'Return handler should succeed with 200');
    console.log('✅ Asset returned successfully.');

    // Verify allocations are closed and status is AVAILABLE
    const finalAsset = await db.asset.findUnique({
      where: { id: testAssetId },
      include: { allocations: { where: { isActive: true } } },
    });
    assert.strictEqual(finalAsset?.status, 'AVAILABLE', 'Asset status must reset to AVAILABLE');
    assert.strictEqual(finalAsset.allocations.length, 0, 'No active allocations should remain');
    console.log('✅ Asset status reset to AVAILABLE, active allocations closed.');


    // ---------------- POST-TEST CLEANUP ----------------
    console.log('\n🧹 Cleaning up test database state...');
    
    // Delete notifications and activity logs
    await db.notification.deleteMany({
      where: {
        user: { email: { in: ['admin-p3@company.com', 'emp1-p3@company.com', 'emp2-p3@company.com'] } }
      }
    });

    await db.activityLog.deleteMany({
      where: {
        user: { email: { in: ['admin-p3@company.com', 'emp1-p3@company.com', 'emp2-p3@company.com'] } }
      }
    });

    // Delete transfer requests
    await db.transferRequest.deleteMany({
      where: {
        OR: [
          { fromUser: { email: { in: ['emp1-p3@company.com', 'emp2-p3@company.com'] } } },
          { toUser: { email: { in: ['emp1-p3@company.com', 'emp2-p3@company.com'] } } }
        ]
      }
    });

    // Delete allocations
    await db.allocation.deleteMany({
      where: {
        OR: [
          { holder: { email: { in: ['emp1-p3@company.com', 'emp2-p3@company.com'] } } }
        ]
      }
    });

    // Delete test assets
    await db.asset.deleteMany({
      where: { serialNumber }
    });

    // Delete test category
    await db.category.deleteMany({
      where: { name: testCategoryName }
    });

    // Delete test department
    await db.department.deleteMany({
      where: { code: testDeptCode }
    });

    // Delete test users
    await db.user.deleteMany({
      where: { email: { in: ['admin-p3@company.com', 'emp1-p3@company.com', 'emp2-p3@company.com'] } }
    });

    console.log('\n🎉 ALL PHASE 3 INTEGRATION TESTS PASSED SUCCESSFULLY!');
  } catch (error) {
    console.error('\n❌ Phase 3 Integration Tests Failed:', error);
    process.exit(1);
  }
}

runPhase3Tests();
