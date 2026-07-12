import { POST as assetCreateHandler, GET as assetListHandler } from '../app/api/assets/route';
import { GET as assetDetailHandler } from '../app/api/assets/[id]/route';
import { setMockCookieStore, signSession } from '../lib/auth';
import { db } from '../lib/db';
import assert from 'assert';

// 1. Setup Mock Cookie Store
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

async function runPhase2Tests() {
  console.log('🧪 Starting Phase 2 (Asset Registry & Lifecycle) Integration Tests...\n');

  let managerUserId = '';
  let employeeUserId = '';
  let testCategoryId = '';
  let testDeptId = '';

  const testCategoryName = 'Integ Test Laptops Category';
  const testDeptCode = 'INTEG_DEPT_P2';
  const serial1 = 'SERIAL-1111-AF';
  const serial2 = 'SERIAL-2222-AF';

  try {
    // ---------------- CLEANUP PREVIOUS RUNS ----------------
    console.log('🧹 Cleaning up test database state...');
    
    // Delete test assets first
    await db.asset.deleteMany({
      where: {
        OR: [
          { serialNumber: { in: [serial1, serial2] } },
          { name: { startsWith: 'Integ Test Asset' } }
        ]
      }
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
      where: { email: { in: ['manager-p2@company.com', 'employee-p2@company.com'] } }
    });

    // ---------------- SEED REQUIRED RELATIONS ----------------
    console.log('🌱 Seeding relation fixtures...');
    
    // Create test category
    const category = await db.category.create({
      data: { name: testCategoryName, customFields: { warrantyMonths: 12 } }
    });
    testCategoryId = category.id;

    // Create test department
    const dept = await db.department.create({
      data: { name: 'Integ Test Dept', code: testDeptCode, status: 'ACTIVE' }
    });
    testDeptId = dept.id;

    // Create manager user
    const manager = await db.user.create({
      data: {
        name: 'Asset Manager P2',
        email: 'manager-p2@company.com',
        passwordHash: 'hash',
        role: 'ASSET_MANAGER',
        status: 'ACTIVE',
      }
    });
    managerUserId = manager.id;

    // Create employee user
    const employee = await db.user.create({
      data: {
        name: 'Regular Employee P2',
        email: 'employee-p2@company.com',
        passwordHash: 'hash',
        role: 'EMPLOYEE',
        status: 'ACTIVE',
      }
    });
    employeeUserId = employee.id;


    // ---------------- 1. API RBAC PROTECTION TESTS ----------------
    console.log('\n--- 1. Testing RBAC on Asset Registration ---');
    
    // Test unauthenticated access (no session)
    clearAuthentication();
    const unauthReq = new Request('http://localhost/api/assets', {
      method: 'POST',
      body: JSON.stringify({ name: 'Integ Test Asset 1', categoryId: testCategoryId }),
    });
    const unauthRes = await assetCreateHandler(unauthReq);
    assert.strictEqual(unauthRes.status, 401, 'Unauthenticated post should return 401');
    console.log('✅ Unauthenticated registration blocked.');

    // Test unauthorized access (Regular Employee role)
    await authenticateAs('EMPLOYEE', employeeUserId, 'employee-p2@company.com');
    const employeeReq = new Request('http://localhost/api/assets', {
      method: 'POST',
      body: JSON.stringify({ name: 'Integ Test Asset 1', categoryId: testCategoryId }),
    });
    const employeeRes = await assetCreateHandler(employeeReq);
    assert.strictEqual(employeeRes.status, 403, 'Regular Employee registration must return 403 (Forbidden)');
    console.log('✅ Regular Employee registration blocked.');


    // ---------------- 2. ASSET REGISTRATION & TAG GENERATION TESTS ----------------
    console.log('\n--- 2. Testing Asset Registration & Tag Generation ---');
    await authenticateAs('ASSET_MANAGER', managerUserId, 'manager-p2@company.com');

    // Create asset 1
    const createReq1 = new Request('http://localhost/api/assets', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Integ Test Asset 1',
        categoryId: testCategoryId,
        serialNumber: serial1,
        acquisitionCost: 1200.50,
        acquisitionDate: '2026-01-10T00:00:00.000Z',
        condition: 'Excellent',
        location: 'HQ Room 4',
        departmentId: testDeptId,
        isBookable: true
      }),
    });
    const createRes1 = await assetCreateHandler(createReq1);
    assert.strictEqual(createRes1.status, 201, 'Asset registration 1 should succeed');
    
    const createData1 = await createRes1.json();
    assert.ok(createData1.asset, 'Response should contain asset data');
    const firstTag = createData1.asset.assetTag;
    assert.match(firstTag, /AF-\d{4}/, 'Asset tag must match format AF-XXXX');
    console.log(`✅ Asset 1 registered successfully. Tag generated: ${firstTag}`);

    // Create asset 2 (Verifies auto-incrementing tag sequence)
    const createReq2 = new Request('http://localhost/api/assets', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Integ Test Asset 2',
        categoryId: testCategoryId,
        serialNumber: serial2,
        isBookable: false
      }),
    });
    const createRes2 = await assetCreateHandler(createReq2);
    assert.strictEqual(createRes2.status, 201, 'Asset registration 2 should succeed');
    const createData2 = await createRes2.json();
    const secondTag = createData2.asset.assetTag;
    
    // Parse tag numbers and verify increment
    const num1 = parseInt(firstTag.split('-')[1], 10);
    const num2 = parseInt(secondTag.split('-')[1], 10);
    assert.strictEqual(num2, num1 + 1, 'Asset tag number must increment by 1');
    console.log(`✅ Asset 2 registered successfully. Tag generated: ${secondTag} (Correctly incremented)`);

    // Verify duplicate serial number is blocked
    const dupSerialReq = new Request('http://localhost/api/assets', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Integ Test Asset 3',
        categoryId: testCategoryId,
        serialNumber: serial1, // Duplicate serial!
      }),
    });
    const dupSerialRes = await assetCreateHandler(dupSerialReq);
    assert.strictEqual(dupSerialRes.status, 400, 'Duplicate serial number registration must fail with 400');
    console.log('✅ Duplicate serial number registration blocked successfully.');


    // ---------------- 3. SEARCH & FILTERING TESTS ----------------
    console.log('\n--- 3. Testing Search & Filtering ---');
    
    // Fetch all assets with filter matching categoryId
    const filterReq = new Request(`http://localhost/api/assets?categoryId=${testCategoryId}`, {
      method: 'GET',
    });
    const filterRes = await assetListHandler(filterReq);
    assert.strictEqual(filterRes.status, 200, 'Filtering assets should succeed');
    const filterData = await filterRes.json();
    assert.ok(filterData.assets.length >= 2, 'Should return at least the 2 registered assets');
    
    // Verify search matches tag
    const searchReq = new Request(`http://localhost/api/assets?search=${firstTag}`, {
      method: 'GET',
    });
    const searchRes = await assetListHandler(searchReq);
    const searchData = await searchRes.json();
    assert.strictEqual(searchData.assets.length, 1, 'Search by specific tag should return 1 asset');
    assert.strictEqual(searchData.assets[0].assetTag, firstTag, 'Returned asset tag must match query');
    console.log('✅ Search & Filtering works correctly.');


    // ---------------- 4. DETAILED VIEW & HISTORIES TESTS ----------------
    console.log('\n--- 4. Testing Detailed View & History Retrieval ---');
    const assetId = createData1.asset.id;
    
    // Create an allocation row in the DB manually for history validation
    await db.allocation.create({
      data: {
        assetId,
        holderId: employeeUserId,
        departmentId: testDeptId,
        isActive: false,
        conditionAtReturn: 'Good',
        returnedAt: new Date(),
      }
    });

    const detailReq = new Request(`http://localhost/api/assets/${assetId}`, {
      method: 'GET',
    });
    
    // Retrieve details handler
    const detailRes = await assetDetailHandler(detailReq, { params: Promise.resolve({ id: assetId }) });
    assert.strictEqual(detailRes.status, 200, 'Detail retrieval should succeed');
    const detailData = await detailRes.json();
    
    assert.strictEqual(detailData.asset.id, assetId, 'ID in detail must match');
    assert.ok(detailData.asset.allocations, 'Response must include allocations history');
    assert.strictEqual(detailData.asset.allocations.length, 1, 'Allocation history must have 1 entry');
    assert.strictEqual(detailData.asset.allocations[0].holder.id, employeeUserId, 'Allocation holder ID must match');
    
    console.log('✅ Detailed view with allocation history retrieved correctly.');


    // ---------------- POST-TEST CLEANUP ----------------
    console.log('\n🧹 Cleaning up test database state...');
    
    // Delete test allocation
    await db.allocation.deleteMany({
      where: { assetId }
    });
    
    // Delete test assets
    await db.asset.deleteMany({
      where: {
        serialNumber: { in: [serial1, serial2] }
      }
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
      where: { email: { in: ['manager-p2@company.com', 'employee-p2@company.com'] } }
    });
    
    console.log('\n🎉 ALL PHASE 2 INTEGRATION TESTS PASSED SUCCESSFULLY!');
  } catch (error) {
    console.error('\n❌ Integration Tests Failed:', error);
    process.exit(1);
  }
}

runPhase2Tests();
