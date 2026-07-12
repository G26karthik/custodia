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

  const techDept = await prisma.department.findUnique({ where: { code: 'TECH' } });
  const financeDept = await prisma.department.findUnique({ where: { code: 'FIN' } });
  const laptops = await prisma.category.findUnique({ where: { name: 'Laptops' } });
  const furniture = await prisma.category.findUnique({ where: { name: 'Office Furniture' } });
  const monitors = await prisma.category.findUnique({ where: { name: 'Monitors' } });

  const demoAssets = [
    ['AF-0101', 'ThinkPad T14', laptops?.id, techDept?.id, 'Desk T01', 'ALLOCATED'],
    ['AF-0102', 'MacBook Air', laptops?.id, techDept?.id, 'Desk T02', 'AVAILABLE'],
    ['AF-0103', 'Dell Monitor 27', monitors?.id, techDept?.id, 'Desk T03', 'AVAILABLE'],
    ['AF-0104', 'Standing Desk', furniture?.id, techDept?.id, 'Floor 2', 'AVAILABLE'],
    ['AF-0105', 'Finance Laptop', laptops?.id, financeDept?.id, 'Finance Bay', 'ALLOCATED'],
    ['AF-0106', 'Finance Monitor', monitors?.id, financeDept?.id, 'Finance Bay', 'AVAILABLE'],
    ['AF-0107', 'Visitor Chair Set', furniture?.id, operationsDept.id, 'Lobby', 'AVAILABLE'],
    ['AF-0108', 'Ops Laptop', laptops?.id, operationsDept.id, 'Ops Desk', 'UNDER_MAINTENANCE'],
    ['AF-0109', 'Conference Display', monitors?.id, operationsDept.id, 'Room B2', 'AVAILABLE'],
    ['AF-0110', 'Training Desk', furniture?.id, operationsDept.id, 'Training Room', 'AVAILABLE'],
    ['AF-0111', 'Spare Laptop', laptops?.id, techDept?.id, 'IT Store', 'AVAILABLE'],
    ['AF-0112', 'Retiring Monitor', monitors?.id, techDept?.id, 'IT Store', 'AVAILABLE'],
  ] as const;

  for (const [assetTag, name, categoryId, departmentId, location, status] of demoAssets) {
    if (!categoryId) continue;
    const existing = await prisma.asset.findUnique({ where: { assetTag } });
    if (!existing) {
      await prisma.asset.create({
        data: {
          assetTag,
          name,
          categoryId,
          departmentId: departmentId || null,
          location,
          condition: 'Good',
          serialNumber: `SN-${assetTag}`,
          acquisitionDate: new Date('2024-01-15'),
          status,
        },
      });
    }
  }

  const allocationAsset = await prisma.asset.findUnique({ where: { assetTag: 'AF-0101' } });
  if (allocationAsset) {
    const existingAllocation = await prisma.allocation.findFirst({
      where: { assetId: allocationAsset.id, isActive: true },
    });
    if (!existingAllocation) {
      await prisma.allocation.create({
        data: {
          assetId: allocationAsset.id,
          holderId: adminUser.id,
          departmentId: techDept?.id,
          expectedReturnDate: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
          isActive: true,
        },
      });
    }
  }

  const upcomingAsset = await prisma.asset.findUnique({ where: { assetTag: 'AF-0105' } });
  if (upcomingAsset) {
    const existingUpcoming = await prisma.allocation.findFirst({
      where: { assetId: upcomingAsset.id, isActive: true },
    });
    if (!existingUpcoming) {
      await prisma.allocation.create({
        data: {
          assetId: upcomingAsset.id,
          holderId: adminUser.id,
          departmentId: financeDept?.id,
          expectedReturnDate: new Date(Date.now() + 4 * 24 * 60 * 60 * 1000),
          isActive: true,
        },
      });
    }
  }

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

  const existingAudit = await prisma.auditCycle.findFirst({
    where: { name: 'Q3 Technology Audit' },
  });

  if (!existingAudit) {
    const laptopCategory = await prisma.category.findUnique({ where: { name: 'Laptops' } });
    let demoAsset = await prisma.asset.findFirst({ where: { assetTag: 'AF-AUD1' } });

    if (!demoAsset && techDept && laptopCategory) {
      demoAsset = await prisma.asset.create({
        data: {
          assetTag: 'AF-AUD1',
          name: 'Audit Demo Laptop',
          categoryId: laptopCategory.id,
          serialNumber: 'AUDIT-DEMO-001',
          condition: 'Good',
          location: 'Desk E12',
          departmentId: techDept.id,
          status: 'AVAILABLE',
        },
      });
    }

    if (techDept && demoAsset) {
      await prisma.auditCycle.create({
        data: {
          name: 'Q3 Technology Audit',
          scopeDeptId: techDept.id,
          startDate: new Date(),
          endDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
          auditors: {
            create: { userId: adminUser.id },
          },
          items: {
            create: {
              assetId: demoAsset.id,
              expectedLocation: 'Desk E12',
              verification: 'PENDING',
            },
          },
        },
      });
      console.log('Created demo audit cycle');
    }
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
