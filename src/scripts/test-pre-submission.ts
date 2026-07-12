/**
 * Pre-submission Hardening Check
 *
 * Validates:
 * 1. Zod input validation on Signup POST route.
 * 2. Zod input validation and RBAC enforcement on Allocations Return POST route.
 * 3. RBAC enforcement on Allocations Overdue GET route.
 */

import assert from 'assert';
import { Role } from '@prisma/client';
import { db } from '../lib/db';
import { setMockCookieStore, signSession } from '../lib/auth';
import { POST as signupHandler } from '../app/api/auth/signup/route';
import { POST as returnHandler } from '../app/api/allocations/return/route';
import { GET as overdueHandler } from '../app/api/allocations/overdue/route';

let store: Record<string, string> = {};
const mockCookies = {
  get: (key: string) => (store[key] ? { value: store[key] } : undefined),
  set: (key: string, value: string) => { store[key] = value; },
  delete: (key: string) => { delete store[key]; },
};
setMockCookieStore(mockCookies);

async function authenticateAs(role: Role, userId: string, email: string) {
  const token = await signSession({ userId, email, role });
  store['session'] = token;
}

function clearAuth() {
  store = {};
}

async function runChecks() {
  console.log('🧪 Running Pre-submission Hardening Tests...\n');

  // --- SIGNUP ZOD TESTS ---
  console.log('Checking Signup Zod Validation...');
  
  // 1. Invalid email
  const invalidEmailRes = await signupHandler(new Request('http://localhost/api/auth/signup', {
    method: 'POST',
    body: JSON.stringify({ name: 'Hardening Test User', email: 'invalid-email-format', password: 'ValidPassword123' }),
  }));
  assert.strictEqual(invalidEmailRes.status, 400, 'Invalid email format should fail with 400');
  const invalidEmailData = await invalidEmailRes.json();
  assert.match(invalidEmailData.error, /valid email/i, 'Error message should complain about valid email format');
  console.log('✅ Signup rejects invalid email format with clean message.');

  // 2. Name too short
  const shortNameRes = await signupHandler(new Request('http://localhost/api/auth/signup', {
    method: 'POST',
    body: JSON.stringify({ name: 'A', email: 'valid@company.com', password: 'ValidPassword123' }),
  }));
  assert.strictEqual(shortNameRes.status, 400, 'Name < 2 chars should fail with 400');
  const shortNameData = await shortNameRes.json();
  assert.match(shortNameData.error, /at least 2/i, 'Error message should specify min length');
  console.log('✅ Signup rejects short name.');

  // --- RETURN ROUTE RBAC & ZOD ---
  console.log('\nChecking Return Route RBAC & Zod...');

  // Setup mock user IDs
  const empId = 'temp-emp-id';
  const mgrId = 'temp-mgr-id';

  // 1. Employee blocked from Return Route (RBAC)
  await authenticateAs(Role.EMPLOYEE, empId, 'emp@company.com');
  const empReturnRes = await returnHandler(new Request('http://localhost/api/allocations/return', {
    method: 'POST',
    body: JSON.stringify({ assetId: 'cmrhnrvj7000583hc43otr5hj' }),
  }));
  assert.strictEqual(empReturnRes.status, 403, 'Employee should receive 403 Forbidden on returning assets');
  console.log('✅ Employee blocked from returning assets (403).');

  // 2. Manager Zod Validation (missing assetId)
  await authenticateAs(Role.ASSET_MANAGER, mgrId, 'mgr@company.com');
  const badReturnRes = await returnHandler(new Request('http://localhost/api/allocations/return', {
    method: 'POST',
    body: JSON.stringify({ assetId: 'invalid-cuid-format' }),
  }));
  assert.strictEqual(badReturnRes.status, 400, 'Invalid asset CUID should fail with 400');
  const badReturnData = await badReturnRes.json();
  assert.match(badReturnData.error, /Valid asset ID/i, 'Error message should match Zod validation');
  console.log('✅ Return route rejects invalid asset CUID with clean 400.');

  // --- OVERDUE ROUTE RBAC ---
  console.log('\nChecking Overdue Route RBAC...');

  // 1. Employee blocked from Overdue Route
  await authenticateAs(Role.EMPLOYEE, empId, 'emp@company.com');
  const empOverdueRes = await overdueHandler();
  assert.strictEqual(empOverdueRes.status, 403, 'Employee should receive 403 on overdue check');
  console.log('✅ Employee blocked from querying org-wide overdue allocations.');

  // 2. Manager permitted to Overdue Route
  await authenticateAs(Role.ASSET_MANAGER, mgrId, 'mgr@company.com');
  const mgrOverdueRes = await overdueHandler();
  assert.strictEqual(mgrOverdueRes.status, 200, 'Manager should receive 200 on overdue check');
  console.log('✅ Manager permitted to query overdue allocations.');

  console.log('\n🎉 ALL PRE-SUBMISSION HARDENING TESTS PASSED!');
}

runChecks().catch((err) => {
  console.error('\n❌ Pre-submission Hardening Tests FAILED:', err);
  process.exit(1);
});
