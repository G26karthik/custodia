import { POST as raiseHandler, GET as listHandler } from '../app/api/maintenance/route';
import { PATCH as resolveHandler } from '../app/api/maintenance/[id]/route';
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

async function authenticateAs(role: 'EMPLOYEE' | 'ADMIN' | 'ASSET_MANAGER', userId: string, email: string) {
  const token = await signSession({ userId, email, role });
  store['session'] = token;
}

function clearAuthentication() {
  store = {};
}

async function runPhase4Tests() {
  console.log('🧪 Starting Phase 4 (Maintenance Approval Workflow) Integration Tests...\n');

  let adminUserId = '';
  let managerUserId = '';
  let employeeUserId = '';
  let testCategoryId = '';
  let testAssetId = '';
  let testRequestId = '';

  const testCategoryName = 'Integ Test Phase 4 Hardware';
  const serialNumber = 'PHASE-4-TEST-SERIAL';

  try {
    // ---------------- CLEANUP PREVIOUS RUNS ----------------
    console.log('🧹 Cleaning up test database state...');
    
    // Delete notifications and activity logs for test users
    await db.notification.deleteMany({
      where: {
        user: { email: { in: ['admin-p4@company.com', 'manager-p4@company.com', 'emp-p4@company.com'] } }
      }
    });

    await db.activityLog.deleteMany({
      where: {
        user: { email: { in: ['admin-p4@company.com', 'manager-p4@company.com', 'emp-p4@company.com'] } }
      }
    });

    // Delete maintenance requests
    await db.maintenanceRequest.deleteMany({
      where: {
        asset: { serialNumber }
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

    // Delete test users
    await db.user.deleteMany({
      where: { email: { in: ['admin-p4@company.com', 'manager-p4@company.com', 'emp-p4@company.com'] } }
    });

    // ---------------- SEED REQUIRED RELATIONS ----------------
    console.log('🌱 Seeding relation fixtures...');
    
    // Create Category
    const category = await db.category.create({
      data: { name: testCategoryName, customFields: {} }
    });
    testCategoryId = category.id;

    // Create Admin user
    const adminUser = await db.user.create({
      data: {
        name: 'Admin P4',
        email: 'admin-p4@company.com',
        passwordHash: 'hash',
        role: 'ADMIN',
        status: 'ACTIVE',
      }
    });
    adminUserId = adminUser.id;

    // Create Asset Manager user
    const manager = await db.user.create({
      data: {
        name: 'Asset Manager P4',
        email: 'manager-p4@company.com',
        passwordHash: 'hash',
        role: 'ASSET_MANAGER',
        status: 'ACTIVE',
      }
    });
    managerUserId = manager.id;

    // Create Employee user
    const employee = await db.user.create({
      data: {
        name: 'Regular Employee P4',
        email: 'emp-p4@company.com',
        passwordHash: 'hash',
        role: 'EMPLOYEE',
        status: 'ACTIVE',
      }
    });
    employeeUserId = employee.id;

    // Create Asset (AVAILABLE)
    const asset = await db.asset.create({
      data: {
        name: 'Integ Test Phase 4 Laptop',
        categoryId: testCategoryId,
        serialNumber,
        assetTag: 'AF-8888',
        status: 'AVAILABLE',
        isBookable: false,
      }
    });
    testAssetId = asset.id;


    // ---------------- 1. RAISE REQUEST & ZOD VALIDATION ----------------
    console.log('\n--- 1. Testing Raise Request & Zod Validation ---');
    await authenticateAs('EMPLOYEE', employeeUserId, 'emp-p4@company.com');

    // Test Zod validation failure: issueDescription too short
    const invalidReq1 = new Request('http://localhost/api/maintenance', {
      method: 'POST',
      body: JSON.stringify({
        assetId: testAssetId,
        issueDescription: 'bad', // less than 5 characters!
        priority: 'MEDIUM',
      }),
    });
    const invalidRes1 = await raiseHandler(invalidReq1);
    assert.strictEqual(invalidRes1.status, 400, 'Short description should be rejected with 400');
    const invalidData1 = await invalidRes1.json();
    assert.strictEqual(invalidData1.error, 'Issue description must be at least 5 characters long.', 'Should return Zod error message');
    console.log('✅ Zod validation rejected too-short description correctly.');

    // Test Zod validation failure: invalid priority
    const invalidReq2 = new Request('http://localhost/api/maintenance', {
      method: 'POST',
      body: JSON.stringify({
        assetId: testAssetId,
        issueDescription: 'Laptop keyboard does not respond.',
        priority: 'EXTREME', // Invalid priority enum!
      }),
    });
    const invalidRes2 = await raiseHandler(invalidReq2);
    assert.strictEqual(invalidRes2.status, 400, 'Invalid priority should be rejected with 400');
    console.log('✅ Zod validation rejected invalid priority correctly.');

    // Test successful creation
    const validReq = new Request('http://localhost/api/maintenance', {
      method: 'POST',
      body: JSON.stringify({
        assetId: testAssetId,
        issueDescription: 'Laptop keyboard does not respond at all.',
        priority: 'HIGH',
      }),
    });
    const validRes = await raiseHandler(validReq);
    assert.strictEqual(validRes.status, 201, 'Valid request should succeed with 201');
    const validData = await validRes.json();
    testRequestId = validData.request.id;
    assert.strictEqual(validData.request.status, 'PENDING', 'Initial request status should be PENDING');
    console.log(`✅ Maintenance request raised successfully. ID: ${testRequestId}`);


    // ---------------- 2. SERVER-SIDE RBAC RESOLUTION ----------------
    console.log('\n--- 2. Testing Server-side RBAC guards ---');
    // Regular employee tries to approve the request
    const unauthorizedReq = new Request(`http://localhost/api/maintenance/${testRequestId}`, {
      method: 'PATCH',
      body: JSON.stringify({
        action: 'APPROVE',
      }),
    });
    const unauthorizedRes = await resolveHandler(unauthorizedReq, { params: Promise.resolve({ id: testRequestId }) });
    assert.strictEqual(unauthorizedRes.status, 400, 'Unauthorized role should be rejected (returns 400 with Forbidden msg)');
    const unauthorizedData = await unauthorizedRes.json();
    assert.match(unauthorizedData.error, /Forbidden/, 'Should return Forbidden message');
    console.log('✅ Employee resolution attempt blocked correctly.');


    // ---------------- 3. APPROVED TRANSITION & ASSET STATUS ----------------
    console.log('\n--- 3. Testing Manager Approval & Asset Status Coupling ---');
    // Authenticate as Asset Manager
    await authenticateAs('ASSET_MANAGER', managerUserId, 'manager-p4@company.com');

    const approveReq = new Request(`http://localhost/api/maintenance/${testRequestId}`, {
      method: 'PATCH',
      body: JSON.stringify({
        action: 'APPROVE',
      }),
    });
    const approveRes = await resolveHandler(approveReq, { params: Promise.resolve({ id: testRequestId }) });
    assert.strictEqual(approveRes.status, 200, 'Approval should succeed with 200');
    const approveData = await approveRes.json();
    assert.strictEqual(approveData.request.status, 'APPROVED', 'Request status should update to APPROVED');
    console.log('✅ Request successfully APPROVED.');

    // Check if the asset's status was automatically set to UNDER_MAINTENANCE in DB
    const dbAsset1 = await db.asset.findUnique({ where: { id: testAssetId } });
    assert.strictEqual(dbAsset1?.status, 'UNDER_MAINTENANCE', 'Asset status must transition to UNDER_MAINTENANCE');
    console.log('✅ Asset status coupled to UNDER_MAINTENANCE successfully.');


    // ---------------- 4. RESOLVED TRANSITION & ASSET STATUS ----------------
    console.log('\n--- 4. Testing Technician Workflow & Resolution Coupling ---');
    
    // Transition 1: APPROVED -> TECHNICIAN_ASSIGNED
    const assignReq = new Request(`http://localhost/api/maintenance/${testRequestId}`, {
      method: 'PATCH',
      body: JSON.stringify({
        status: 'TECHNICIAN_ASSIGNED',
      }),
    });
    const assignRes = await resolveHandler(assignReq, { params: Promise.resolve({ id: testRequestId }) });
    assert.strictEqual(assignRes.status, 200, 'Tech assignment transition should succeed');
    const assignData = await assignRes.json();
    assert.strictEqual(assignData.request.status, 'TECHNICIAN_ASSIGNED');
    console.log('✅ Status transitioned to TECHNICIAN_ASSIGNED.');

    // Transition 2: TECHNICIAN_ASSIGNED -> IN_PROGRESS
    const startReq = new Request(`http://localhost/api/maintenance/${testRequestId}`, {
      method: 'PATCH',
      body: JSON.stringify({
        status: 'IN_PROGRESS',
      }),
    });
    const startRes = await resolveHandler(startReq, { params: Promise.resolve({ id: testRequestId }) });
    assert.strictEqual(startRes.status, 200, 'Start work transition should succeed');
    const startData = await startRes.json();
    assert.strictEqual(startData.request.status, 'IN_PROGRESS');
    console.log('✅ Status transitioned to IN_PROGRESS.');

    // Transition 3: IN_PROGRESS -> RESOLVED
    const resolveReq = new Request(`http://localhost/api/maintenance/${testRequestId}`, {
      method: 'PATCH',
      body: JSON.stringify({
        status: 'RESOLVED',
      }),
    });
    const resolveRes = await resolveHandler(resolveReq, { params: Promise.resolve({ id: testRequestId }) });
    assert.strictEqual(resolveRes.status, 200, 'Resolution transition should succeed');
    const resolveData = await resolveRes.json();
    assert.strictEqual(resolveData.request.status, 'RESOLVED');
    console.log('✅ Status transitioned to RESOLVED.');

    // Check if the asset's status was automatically reset back to AVAILABLE in DB
    const dbAsset2 = await db.asset.findUnique({ where: { id: testAssetId } });
    assert.strictEqual(dbAsset2?.status, 'AVAILABLE', 'Asset status must return back to AVAILABLE');
    console.log('✅ Asset status coupled back to AVAILABLE successfully.');


    // ---------------- POST-TEST CLEANUP ----------------
    console.log('\n🧹 Cleaning up test database state...');
    
    // Delete notifications and activity logs for test users
    await db.notification.deleteMany({
      where: {
        user: { email: { in: ['admin-p4@company.com', 'manager-p4@company.com', 'emp-p4@company.com'] } }
      }
    });

    await db.activityLog.deleteMany({
      where: {
        user: { email: { in: ['admin-p4@company.com', 'manager-p4@company.com', 'emp-p4@company.com'] } }
      }
    });

    // Delete maintenance requests
    await db.maintenanceRequest.deleteMany({
      where: {
        asset: { serialNumber }
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

    // Delete test users
    await db.user.deleteMany({
      where: { email: { in: ['admin-p4@company.com', 'manager-p4@company.com', 'emp-p4@company.com'] } }
    });

    console.log('\n🎉 ALL PHASE 4 INTEGRATION TESTS PASSED SUCCESSFULLY!');
  } catch (error) {
    console.error('\n❌ Phase 4 Integration Tests Failed:', error);
    process.exit(1);
  }
}

runPhase4Tests();
