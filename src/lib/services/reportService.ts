import { Role } from '@prisma/client';
import { db } from '@/lib/db';

type SessionUser = {
  userId: string;
  role: Role;
};

export class ReportError extends Error {
  constructor(
    message: string,
    public status = 400
  ) {
    super(message);
  }
}

function requireManager(session: SessionUser) {
  if (session.role !== 'ADMIN' && session.role !== 'ASSET_MANAGER' && session.role !== 'DEPARTMENT_HEAD') {
    throw new ReportError('You do not have permission to view reports.', 403);
  }
}

function daysBetween(date: Date | null | undefined) {
  if (!date) return null;
  return Math.floor((Date.now() - date.getTime()) / (24 * 60 * 60 * 1000));
}

export async function getReports(session: SessionUser) {
  requireManager(session);

  const [departments, maintenance, bookings, allocations, assets] = await Promise.all([
    db.department.findMany({
      include: {
        assets: { select: { id: true, status: true } },
        allocations: { where: { isActive: true }, select: { id: true } },
      },
      orderBy: { name: 'asc' },
    }),
    db.maintenanceRequest.findMany({
      include: { asset: { include: { category: true } } },
      orderBy: { createdAt: 'asc' },
    }),
    db.booking.findMany({
      include: { asset: true },
      where: { status: { not: 'CANCELLED' } },
    }),
    db.allocation.findMany({
      include: { asset: true },
    }),
    db.asset.findMany({
      include: {
        category: true,
        bookings: { where: { status: { not: 'CANCELLED' } }, select: { id: true, createdAt: true } },
        allocations: { select: { id: true, createdAt: true } },
        maintenanceRequests: { select: { id: true, createdAt: true, resolvedAt: true } },
      },
      orderBy: { assetTag: 'asc' },
    }),
  ]);

  const utilizationByDepartment = departments.map((department) => ({
    id: department.id,
    name: department.name,
    totalAssets: department.assets.length,
    activeAllocations: department.allocations.length,
    utilization:
      department.assets.length === 0 ? 0 : Math.round((department.allocations.length / department.assets.length) * 100),
  }));

  const maintenanceByMonth = Array.from(
    maintenance.reduce((map, request) => {
      const key = request.createdAt.toISOString().slice(0, 7);
      map.set(key, (map.get(key) ?? 0) + 1);
      return map;
    }, new Map<string, number>())
  ).map(([month, count]) => ({ month, count }));

  const usageCounts = new Map<string, { assetTag: string; name: string; count: number }>();
  for (const booking of bookings) {
    const current = usageCounts.get(booking.assetId) ?? {
      assetTag: booking.asset.assetTag,
      name: booking.asset.name,
      count: 0,
    };
    current.count += 1;
    usageCounts.set(booking.assetId, current);
  }
  for (const allocation of allocations) {
    const current = usageCounts.get(allocation.assetId) ?? {
      assetTag: allocation.asset.assetTag,
      name: allocation.asset.name,
      count: 0,
    };
    current.count += 1;
    usageCounts.set(allocation.assetId, current);
  }

  const mostUsedAssets = Array.from(usageCounts.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  const idleAssets = assets
    .map((asset) => {
      const activityDates = [
        ...asset.bookings.map((booking) => booking.createdAt),
        ...asset.allocations.map((allocation) => allocation.createdAt),
        ...asset.maintenanceRequests.map((request) => request.createdAt),
      ];
      const lastActivity = activityDates.sort((a, b) => b.getTime() - a.getTime())[0] ?? asset.createdAt;
      return {
        assetTag: asset.assetTag,
        name: asset.name,
        status: asset.status,
        daysIdle: daysBetween(lastActivity) ?? 0,
      };
    })
    .filter((asset) => asset.daysIdle >= 30 || asset.status === 'AVAILABLE')
    .sort((a, b) => b.daysIdle - a.daysIdle)
    .slice(0, 8);

  const maintenanceRisk = assets
    .map((asset) => {
      const lastMaintenance = asset.maintenanceRequests
        .map((request) => request.resolvedAt ?? request.createdAt)
        .sort((a, b) => b.getTime() - a.getTime())[0];
      const ageDays = daysBetween(asset.acquisitionDate) ?? 0;
      const daysSinceMaintenance = daysBetween(lastMaintenance) ?? ageDays;
      const score = Math.min(100, Math.round(ageDays / 12 + daysSinceMaintenance / 3 + asset.maintenanceRequests.length * 12));
      return {
        assetTag: asset.assetTag,
        name: asset.name,
        category: asset.category.name,
        ageDays,
        daysSinceMaintenance,
        score,
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 8);

  const bookingHeatmap = Array.from({ length: 10 }, (_, index) => {
    const hour = index + 8;
    const count = bookings.filter((booking) => {
      const start = booking.startTime.getHours();
      const end = booking.endTime.getHours();
      return start <= hour && end > hour;
    }).length;
    return { hour: `${String(hour).padStart(2, '0')}:00`, count };
  });

  return {
    utilizationByDepartment,
    maintenanceByMonth,
    mostUsedAssets,
    idleAssets,
    maintenanceRisk,
    bookingHeatmap,
    refreshedAt: new Date().toISOString(),
  };
}

export async function getReportsCsv(session: SessionUser) {
  const report = await getReports(session);
  const rows = [
    ['Section', 'Name', 'Metric', 'Value'],
    ...report.utilizationByDepartment.map((row) => [
      'Utilization by Department',
      row.name,
      'Utilization %',
      String(row.utilization),
    ]),
    ...report.mostUsedAssets.map((row) => ['Most Used Assets', `${row.assetTag} ${row.name}`, 'Use Count', String(row.count)]),
    ...report.idleAssets.map((row) => ['Idle Assets', `${row.assetTag} ${row.name}`, 'Days Idle', String(row.daysIdle)]),
    ...report.maintenanceRisk.map((row) => ['Maintenance Risk', `${row.assetTag} ${row.name}`, 'Risk Score', String(row.score)]),
  ];

  return rows.map((row) => row.map((cell) => `"${cell.replaceAll('"', '""')}"`).join(',')).join('\n');
}
