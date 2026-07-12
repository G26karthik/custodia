import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');

  // Create ADMIN user
  const adminEmail = 'admin@assetflow.com';
  const adminPassword = 'AdminPassword123';
  const adminPasswordHash = await bcrypt.hash(adminPassword, 10);

  const existingAdmin = await prisma.user.findUnique({
    where: { email: adminEmail },
  });

  let adminUser;
  if (!existingAdmin) {
    adminUser = await prisma.user.create({
      data: {
        name: 'Admin Administrator',
        email: adminEmail,
        passwordHash: adminPasswordHash,
        role: 'ADMIN',
        status: 'ACTIVE',
      },
    });
    console.log(`Created admin user: ${adminEmail}`);
  } else {
    adminUser = existingAdmin;
    console.log(`Admin user ${adminEmail} already exists`);
  }

  // Create default departments
  const departmentsData = [
    { name: 'Technology', code: 'TECH' },
    { name: 'Human Resources', code: 'HR' },
    { name: 'Finance', code: 'FIN' },
  ];

  for (const dept of departmentsData) {
    const existingDept = await prisma.department.findUnique({
      where: { code: dept.code },
    });
    if (!existingDept) {
      await prisma.department.create({
        data: {
          name: dept.name,
          code: dept.code,
          status: 'ACTIVE',
        },
      });
      console.log(`Created department: ${dept.name} (${dept.code})`);
    }
  }

  // Create default categories
  const categoriesData = [
    { name: 'Laptops', customFields: { warrantyPeriodMonths: 36, trackingType: 'serial' } },
    { name: 'Office Furniture', customFields: { warrantyPeriodMonths: 60, material: 'wood/metal' } },
    { name: 'Monitors', customFields: { warrantyPeriodMonths: 24, resolution: '4K' } },
  ];

  for (const cat of categoriesData) {
    const existingCat = await prisma.category.findUnique({
      where: { name: cat.name },
    });
    if (!existingCat) {
      await prisma.category.create({
        data: {
          name: cat.name,
          customFields: cat.customFields,
        },
      });
      console.log(`Created category: ${cat.name}`);
    }
  }

  console.log('Seeding completed successfully!');
}

main()
  .catch((e) => {
    console.error('Error during seeding:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
