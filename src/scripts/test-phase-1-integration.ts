import { POST as signupHandler } from '../app/api/auth/signup/route';
import { POST as loginHandler } from '../app/api/auth/login/route';
import { POST as deptPostHandler, GET as deptGetHandler } from '../app/api/admin/departments/route';
import { PATCH as empPatchHandler, GET as empGetHandler } from '../app/api/admin/employees/route';
import { setMockCookieStore, signSession } from '../lib/auth';
import { db } from '../lib/db';
import assert from 'assert';

// 1. Simple Mock Cookie Store
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

// Bind the mock store to auth helpers
setMockCookieStore(mockCookies);

// Helper to set session token directly
async function authenticateAs(role: 'EMPLOYEE' | 'ADMIN' | 'ASSET_MANAGER' | 'DEPARTMENT_HEAD', userId: string, email: string) {
  const token = await signSession({ userId, email, role });
  store['session'] = token;
}

function clearAuthentication() {
  store = {};
}

async function runTests() {
  console.log('🧪 Starting Phase 1 Integration Tests...\n');

  // Test data constants
  const testEmail = 'integration-test-user@company.com';
  const testPassword = 'SecretPassword123';
  const testName = 'Integration Test Employee';

  let testUserId = '';
  let adminUserId = '';

  try {
    // ---------------- CLEANUP PREVIOUS RUNS ----------------
    console.log('🧹 Cleaning up test database state...');
    await db.user.deleteMany({
      where: { email: { in: [testEmail, 'admin-test@company.com'] } },
    });
    await db.department.deleteMany({
      where: { code: { in: ['INTEG_TEST', 'TEST_SUB'] } },
    });
    await db.category.deleteMany({
      where: { name: 'Integration Test Laptops' },
    });

    // Get or Create admin user in database for testing admin routes
    const existingAdmin = await db.user.findUnique({ where: { email: 'admin@assetflow.com' } });
    if (existingAdmin) {
      adminUserId = existingAdmin.id;
    } else {
      const admin = await db.user.create({
        data: {
          name: 'Admin User',
          email: 'admin@assetflow.com',
          passwordHash: 'hash',
          role: 'ADMIN',
          status: 'ACTIVE',
        },
      });
      adminUserId = admin.id;
    }

    // ---------------- 1. SIGNUP API TESTS ----------------
    console.log('\n--- 1. Testing Signup API ---');
    
    // Normal signup (should succeed and create EMPLOYEE)
    const signupReq = new Request('http://localhost/api/auth/signup', {
      method: 'POST',
      body: JSON.stringify({ name: testName, email: testEmail, password: testPassword }),
    });
    
    const signupRes = await signupHandler(signupReq);
    assert.strictEqual(signupRes.status, 200, 'Signup should succeed');
    
    const signupData = await signupRes.json();
    assert.ok(signupData.user, 'Signup response should return user data');
    assert.strictEqual(signupData.user.role, 'EMPLOYEE', 'Signup must force EMPLOYEE role');
    assert.ok(store['session'], 'Signup must set session cookie');
    
    testUserId = signupData.user.id;
    console.log(`✅ Signup succeeded (forces role = EMPLOYEE). User ID: ${testUserId}`);

    // Duplicate signup block
    const dupReq = new Request('http://localhost/api/auth/signup', {
      method: 'POST',
      body: JSON.stringify({ name: testName, email: testEmail, password: testPassword }),
    });
    const dupRes = await signupHandler(dupReq);
    assert.strictEqual(dupRes.status, 400, 'Duplicate signup should fail with 400');
    console.log('✅ Duplicate signup blocked correctly.');


    // ---------------- 2. LOGIN API TESTS ----------------
    console.log('\n--- 2. Testing Login API ---');
    clearAuthentication();

    // Wrong password login
    const wrongLoginReq = new Request('http://localhost/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: testEmail, password: 'wrong-password' }),
    });
    const wrongLoginRes = await loginHandler(wrongLoginReq);
    assert.strictEqual(wrongLoginRes.status, 401, 'Wrong credentials should return 401');
    console.log('✅ Invalid password login blocked.');

    // Correct password login
    const loginReq = new Request('http://localhost/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: testEmail, password: testPassword }),
    });
    const loginRes = await loginHandler(loginReq);
    assert.strictEqual(loginRes.status, 200, 'Correct credentials should return 200');
    const loginData = await loginRes.json();
    assert.strictEqual(loginData.user.id, testUserId, 'Logged in user ID should match');
    assert.ok(store['session'], 'Login must set session cookie');
    console.log('✅ Correct password login succeeded.');


    // ---------------- 3. DEPARTMENTS API (RBAC) TESTS ----------------
    console.log('\n--- 3. Testing Departments API (RBAC) ---');
    
    // Test unauthenticated access (no session cookie)
    clearAuthentication();
    const unauthDeptReq = new Request('http://localhost/api/admin/departments', { method: 'GET' });
    const unauthDeptRes = await deptGetHandler(unauthDeptReq);
    assert.strictEqual(unauthDeptRes.status, 401, 'Unauthenticated access must return 401');
    console.log('✅ Unauthenticated access to departments API blocked.');

    // Test non-admin access (EMPLOYEE session)
    await authenticateAs('EMPLOYEE', testUserId, testEmail);
    const nonAdminDeptReq = new Request('http://localhost/api/admin/departments', { method: 'GET' });
    const nonAdminDeptRes = await deptGetHandler(nonAdminDeptReq);
    assert.strictEqual(nonAdminDeptRes.status, 401, 'Non-admin access must return 401 (Unauthorized)');
    console.log('✅ Non-admin access to departments API blocked.');

    // Test admin access (ADMIN session)
    await authenticateAs('ADMIN', adminUserId, 'admin@assetflow.com');
    const adminDeptReq = new Request('http://localhost/api/admin/departments', { method: 'GET' });
    const adminDeptRes = await deptGetHandler(adminDeptReq);
    assert.strictEqual(adminDeptRes.status, 200, 'Admin access must return 200');
    console.log('✅ Admin access to departments API allowed.');

    // Admin creates department
    const newDeptReq = new Request('http://localhost/api/admin/departments', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Integration Test Department',
        code: 'INTEG_TEST',
        headId: testUserId, // Assign test employee as head (should promote them)
        status: 'ACTIVE',
      }),
    });
    const newDeptRes = await deptPostHandler(newDeptReq);
    assert.strictEqual(newDeptRes.status, 200, 'Create department should succeed');
    const newDeptData = await newDeptRes.json();
    assert.strictEqual(newDeptData.department.code, 'INTEG_TEST', 'Code must match and be upper-cased');
    
    // Check if test employee was promoted to DEPARTMENT_HEAD
    const promotedUser = await db.user.findUnique({ where: { id: testUserId } });
    assert.strictEqual(promotedUser?.role, 'DEPARTMENT_HEAD', 'Assigned head must be promoted to DEPARTMENT_HEAD');
    console.log('✅ Department created and assigned head was promoted to DEPARTMENT_HEAD.');


    // ---------------- 4. EMPLOYEE DIRECTORY ROLE PROMOTION TESTS ----------------
    console.log('\n--- 4. Testing Employee Directory API (Role Promotion) ---');

    // Admin promotes head to ASSET_MANAGER
    const promoteReq = new Request('http://localhost/api/admin/employees', {
      method: 'PATCH',
      body: JSON.stringify({
        id: testUserId,
        role: 'ASSET_MANAGER',
      }),
    });
    
    const promoteRes = await empPatchHandler(promoteReq);
    assert.strictEqual(promoteRes.status, 200, 'Promote role should succeed');
    
    const promoteData = await promoteRes.json();
    assert.strictEqual(promoteData.employee.role, 'ASSET_MANAGER', 'Role should be promoted to ASSET_MANAGER');
    
    const dbPromoted = await db.user.findUnique({ where: { id: testUserId } });
    assert.strictEqual(dbPromoted?.role, 'ASSET_MANAGER', 'Role in DB must be ASSET_MANAGER');
    console.log('✅ Employee promoted to ASSET_MANAGER successfully.');

    // Admin deactivates employee
    const deactivateReq = new Request('http://localhost/api/admin/employees', {
      method: 'PATCH',
      body: JSON.stringify({
        id: testUserId,
        status: 'INACTIVE',
      }),
    });
    const deactivateRes = await empPatchHandler(deactivateReq);
    assert.strictEqual(deactivateRes.status, 200, 'Deactivate employee should succeed');
    
    // Test that deactivated employee cannot login
    clearAuthentication();
    const loginDeactivatedReq = new Request('http://localhost/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: testEmail, password: testPassword }),
    });
    const loginDeactivatedRes = await loginHandler(loginDeactivatedReq);
    assert.strictEqual(loginDeactivatedRes.status, 403, 'Deactivated account login must fail with 403');
    console.log('✅ Account deactivation successfully blocks logins.');


    // ---------------- POST-TEST CLEANUP ----------------
    console.log('\n🧹 Cleaning up test database state...');
    await db.user.deleteMany({
      where: { email: { in: [testEmail] } },
    });
    await db.department.deleteMany({
      where: { code: { in: ['INTEG_TEST'] } },
    });
    
    console.log('\n🎉 ALL INTEGRATION TESTS PASSED SUCCESSFULLY!');
  } catch (error) {
    console.error('\n❌ Integration Tests Failed:', error);
    process.exit(1);
  }
}

runTests();
