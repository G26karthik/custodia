import { Role } from '@prisma/client';
import { db } from '@/lib/db';

type SessionUser = { userId: string; role: Role };

function canSeeOrgWide(role: Role) {
  return role === 'ADMIN' || role === 'ASSET_MANAGER' || role === 'DEPARTMENT_HEAD';
}

export async function getDashboard(session: SessionUser) {
  const user = await db.user.findUnique({
    where: { id: session.userId },
    include: { department: { select: { id: true, name: true } } },
  });

  if (!user) throw new Error('User not found.');

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date(todayStart);
  todayEnd.setDate(todayEnd.getDate() + 1);
  const now = new Date();
  const scopeDepartmentId = canSeeOrgWide(session.role) ? undefined : user.departmentId || undefined;

  const [
    availableAssets,
    allocatedAssets,
    maintenanceToday,
    activeBookings,
    pendingTransfers,
    upcomingReturns,
    overdueReturns,
    recentActivity,
  ] = await Promise.all([
    db.asset.count({
      where: { status: 'AVAILABLE', ...(scopeDepartmentId ? { departmentId: scopeDepartmentId } : {}) },
    }),
    db.asset.count({
      where: { status: 'ALLOCATED', ...(scopeDepartmentId ? { departmentId: scopeDepartmentId } : {}) },
    }),
    db.maintenanceRequest.count({
      where: {
        createdAt: { gte: todayStart, lt: todayEnd },
        ...(scopeDepartmentId ? { asset: { departmentId: scopeDepartmentId } } : {}),
      },
    }),
    db.booking.count({
      where: {
        status: { not: 'CANCELLED' },
        startTime: { lte: now },
        endTime: { gt: now },
        ...(scopeDepartmentId ? { asset: { departmentId: scopeDepartmentId } } : {}),
      },
    }),
    db.transferRequest.count({
      where: { status: 'REQUESTED', ...(scopeDepartmentId ? { asset: { departmentId: scopeDepartmentId } } : {}) },
    }),
    db.allocation.findMany({
      where: {
        isActive: true,
        expectedReturnDate: { gte: now },
        ...(scopeDepartmentId ? { departmentId: scopeDepartmentId } : {}),
      },
      include: {
        asset: { select: { assetTag: true, name: true } },
        holder: { select: { name: true } },
        department: { select: { name: true } },
      },
      orderBy: { expectedReturnDate: 'asc' },
      take: 6,
    }),
    db.allocation.findMany({
      where: {
        isActive: true,
        expectedReturnDate: { lt: now },
        ...(scopeDepartmentId ? { departmentId: scopeDepartmentId } : {}),
      },
      include: {
        asset: { select: { assetTag: true, name: true } },
        holder: { select: { name: true } },
        department: { select: { name: true } },
      },
      orderBy: { expectedReturnDate: 'asc' },
      take: 6,
    }),
    db.activityLog.findMany({
      include: { user: { select: { name: true, email: true } } },
      orderBy: { createdAt: 'desc' },
      take: 8,
    }),
  ]);

  return {
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      department: user.department?.name ?? 'Not Assigned',
    },
    kpis: {
      availableAssets,
      allocatedAssets,
      maintenanceToday,
      activeBookings,
      pendingTransfers,
      upcomingReturns: upcomingReturns.length,
      overdueReturns: overdueReturns.length,
    },
    upcomingReturns,
    overdueReturns,
    recentActivity,
    refreshedAt: new Date().toISOString(),
  };
}
