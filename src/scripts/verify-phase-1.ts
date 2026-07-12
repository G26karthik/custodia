import { PrismaClient } from '@prisma/client';
import { SignJWT, jwtVerify } from 'jose';
import assert from 'assert';

const prisma = new PrismaClient();
const JWT_SECRET = new TextEncoder().encode('super-secret-jwt-key-for-testing');

async function testAuth() {
  console.log('Testing JWT signing and verification...');
  const payload = { userId: 'test-user-id', email: 'test@example.com', role: 'EMPLOYEE' };
  
  const token = await new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(JWT_SECRET);
    
  assert(token && typeof token === 'string', 'Token must be a valid string');
  
  const { payload: verified } = await jwtVerify(token, JWT_SECRET, {
    algorithms: ['HS256'],
  });
  
  assert.strictEqual(verified.userId, payload.userId, 'User ID must match');
  assert.strictEqual(verified.email, payload.email, 'Email must match');
  assert.strictEqual(verified.role, payload.role, 'Role must match');
  console.log('✅ JWT tests passed.');
}

async function testDatabase() {
  console.log('Testing database records (Admin, Departments, Categories)...');
  
  // 1. Verify Admin User
  const admin = await prisma.user.findUnique({
    where: { email: 'admin@assetflow.com' },
  });
  assert(admin, 'Admin user must exist in the database');
  assert.strictEqual(admin.role, 'ADMIN', 'Admin user must have ADMIN role');
  console.log(`✅ Admin user verified: ${admin.email}`);
  
  // 2. Verify Departments
  const depts = await prisma.department.findMany();
  assert(depts.length >= 3, 'Must have at least 3 departments');
  const codes = depts.map(d => d.code);
  assert(codes.includes('TECH'), 'TECH department must exist');
  assert(codes.includes('HR'), 'HR department must exist');
  console.log(`✅ Departments verified: ${codes.join(', ')}`);
  
  // 3. Verify Categories
  const categories = await prisma.category.findMany();
  assert(categories.length >= 3, 'Must have at least 3 categories');
  const names = categories.map(c => c.name);
  assert(names.includes('Laptops'), 'Laptops category must exist');
  console.log(`✅ Categories verified: ${names.join(', ')}`);
}

async function run() {
  try {
    await testAuth();
    await testDatabase();
    console.log('\n🎉 ALL PHASE 1 SELF-CHECKS PASSED SUCCESSFULLY!');
  } catch (error) {
    console.error('❌ Verification failed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

run();
