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
    { name: 'Shared Spaces', customFields: { bookingUnit: 'time-slot', requiresPurpose: true } },
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

  const sharedSpaces = await prisma.category.findUniqueOrThrow({
    where: { name: 'Shared Spaces' },
  });

  const operationsDept =
    (await prisma.department.findUnique({ where: { code: 'OPS' } })) ||
    (await prisma.department.create({
      data: {
        name: 'Operations',
        code: 'OPS',
        status: 'ACTIVE',
      },
    }));

  const roomB2 =
    (await prisma.asset.findUnique({ where: { assetTag: 'AF-RB2' } })) ||
    (await prisma.asset.create({
      data: {
        assetTag: 'AF-RB2',
        name: 'Conference Room B2',
        categoryId: sharedSpaces.id,
        serialNumber: 'ROOM-B2',
        condition: 'Ready',
        location: 'HQ Floor 3',
        departmentId: operationsDept.id,
        isBookable: true,
        status: 'AVAILABLE',
      },
    }));

  const demoDate = new Date();
  const demoStart = new Date(demoDate.getFullYear(), demoDate.getMonth(), demoDate.getDate(), 9, 0, 0);
  const demoEnd = new Date(demoDate.getFullYear(), demoDate.getMonth(), demoDate.getDate(), 10, 0, 0);
  const existingRoomB2Booking = await prisma.booking.findFirst({
    where: {
      assetId: roomB2.id,
      startTime: demoStart,
      endTime: demoEnd,
      status: { not: 'CANCELLED' },
    },
  });

  if (!existingRoomB2Booking) {
    await prisma.booking.create({
      data: {
        assetId: roomB2.id,
        bookedById: adminUser.id,
        startTime: demoStart,
        endTime: demoEnd,
        purpose: 'Procurement planning',
        status: 'UPCOMING',
      },
    });
    console.log('Created demo Room B2 booking from 9:00 to 10:00');
  }

  const existingNotifications = await prisma.notification.count({
    where: { userId: adminUser.id },
  });

  if (existingNotifications === 0) {
    await prisma.notification.createMany({
      data: [
        {
          userId: adminUser.id,
          type: 'ASSET_ASSIGNED',
          message: 'Laptop AF-0119 assigned to Priya Shah.',
        },
        {
          userId: adminUser.id,
          type: 'MAINTENANCE_APPROVED',
          message: 'Maintenance request for AF-0062 approved.',
        },
        {
          userId: adminUser.id,
          type: 'BOOKING_CONFIRMED',
          message: 'Booking confirmed: Room B2 from 9:00 to 10:00.',
        },
        {
          userId: adminUser.id,
          type: 'TRANSFER_APPROVED',
          message: 'Transfer approved for AF-0033 to Facilities.',
        },
        {
          userId: adminUser.id,
          type: 'OVERDUE_RETURN',
          message: 'Overdue return: AF-0201 was due 3 days ago.',
        },
        {
          userId: adminUser.id,
          type: 'AUDIT_DISCREPANCY',
          message: 'Audit discrepancy flagged: AF-0088 damaged.',
        },
      ],
    });
    console.log('Created demo notifications for admin');
  }

  const existingActivityLogs = await prisma.activityLog.count({
    where: { userId: adminUser.id },
  });

  if (existingActivityLogs === 0) {
    await prisma.activityLog.createMany({
      data: [
        {
          userId: adminUser.id,
          action: 'CREATE_DEPARTMENT',
          entityType: 'Department',
          entityId: 'TECH',
          details: { code: 'TECH', name: 'Technology' },
        },
        {
          userId: adminUser.id,
          action: 'REGISTER_ASSET',
          entityType: 'Asset',
          entityId: 'AF-0119',
          details: { assetTag: 'AF-0119', category: 'Laptops' },
        },
        {
          userId: adminUser.id,
          action: 'APPROVE_MAINTENANCE',
          entityType: 'MaintenanceRequest',
          entityId: 'AF-0062',
          details: { assetTag: 'AF-0062', priority: 'HIGH' },
        },
        {
          userId: adminUser.id,
          action: 'BOOK_RESOURCE',
          entityType: 'Booking',
          entityId: 'AF-RB2',
          details: { resource: 'Conference Room B2', start: '09:00', end: '10:00' },
        },
      ],
    });
    console.log('Created demo activity logs for admin');
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
