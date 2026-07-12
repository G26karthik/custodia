import { AuditStatus, Role, VerificationStatus } from '@prisma/client';
import { z } from 'zod';
import { db } from '@/lib/db';
import { logActivity, notify } from '@/lib/notifications';

export const createAuditCycleSchema = z
  .object({
    name: z.string().trim().min(3, 'Audit name must be at least 3 characters.').max(80),
    scopeDeptId: z.string().optional(),
    location: z.string().trim().max(80).optional(),
    startDate: z.string().datetime('Start date must be valid.'),
    endDate: z.string().datetime('End date must be valid.'),
    auditorIds: z.array(z.string()).min(1, 'Assign at least one auditor.'),
  })
  .refine((data) => new Date(data.endDate) >= new Date(data.startDate), {
    message: 'End date must be on or after start date.',
    path: ['endDate'],
  });

export const updateAuditItemSchema = z.object({
  verification: z.enum(['PENDING', 'VERIFIED', 'MISSING', 'DAMAGED']),
  notes: z.string().trim().max(240).optional(),
});

type SessionUser = {
  userId: string;
  role: Role;
};

export class AuditError extends Error {
  constructor(
    message: string,
    public status = 400
  ) {
    super(message);
  }
}

function canManageAudit(role: Role) {
  return role === Role.ADMIN || role === Role.ASSET_MANAGER;
}

async function requireAuditorOrManager(session: SessionUser, auditCycleId: string) {
  if (canManageAudit(session.role)) return;

  const assignment = await db.auditCycleAuditor.findUnique({
    where: {
      auditCycleId_userId: {
        auditCycleId,
        userId: session.userId,
      },
    },
  });

  if (!assignment) {
    throw new AuditError('You are not assigned to this audit cycle.', 403);
  }
}

export async function listAuditBoard(session: SessionUser) {
  const canSeeAll = canManageAudit(session.role);

  const [cycles, departments, auditors] = await Promise.all([
    db.auditCycle.findMany({
      where: canSeeAll
        ? {}
        : {
            auditors: {
              some: { userId: session.userId },
            },
          },
      include: {
        scopeDept: { select: { id: true, name: true } },
        auditors: { include: { user: { select: { id: true, name: true, email: true, role: true } } } },
        items: {
          include: {
            asset: {
              select: {
                id: true,
                assetTag: true,
                name: true,
                location: true,
                status: true,
                department: { select: { name: true } },
              },
            },
          },
          orderBy: [{ verification: 'asc' }, { asset: { assetTag: 'asc' } }],
        },
      },
      orderBy: { createdAt: 'desc' },
    }),
    db.department.findMany({
      where: { status: 'ACTIVE' },
      select: { id: true, name: true, code: true },
      orderBy: { name: 'asc' },
    }),
    db.user.findMany({
      where: { status: 'ACTIVE' },
      select: { id: true, name: true, email: true, role: true },
      orderBy: { name: 'asc' },
    }),
  ]);

  return {
    cycles,
    departments,
    auditors,
    refreshedAt: new Date().toISOString(),
  };
}

export async function createAuditCycle(session: SessionUser, input: z.infer<typeof createAuditCycleSchema>) {
  if (!canManageAudit(session.role)) {
    throw new AuditError('Only Admins and Asset Managers can create audit cycles.', 403);
  }

  const where = {
    ...(input.scopeDeptId ? { departmentId: input.scopeDeptId } : {}),
    ...(input.location ? { location: { contains: input.location, mode: 'insensitive' as const } } : {}),
  };

  const assets = await db.asset.findMany({
    where,
    select: { id: true, location: true },
  });

  if (assets.length === 0) {
    throw new AuditError('No assets matched this audit scope.', 400);
  }

  const cycle = await db.auditCycle.create({
    data: {
      name: input.name,
      scopeDeptId: input.scopeDeptId || null,
      location: input.location || null,
      startDate: new Date(input.startDate),
      endDate: new Date(input.endDate),
      auditors: {
        createMany: {
          data: input.auditorIds.map((userId) => ({ userId })),
          skipDuplicates: true,
        },
      },
      items: {
        createMany: {
          data: assets.map((asset) => ({
            assetId: asset.id,
            expectedLocation: asset.location,
          })),
          skipDuplicates: true,
        },
      },
    },
  });

  await logActivity(session.userId, 'CREATE_AUDIT_CYCLE', 'AuditCycle', cycle.id, {
    name: cycle.name,
    assetCount: assets.length,
    auditorCount: input.auditorIds.length,
  });

  return cycle;
}

export async function updateAuditItem(
  session: SessionUser,
  auditItemId: string,
  input: z.infer<typeof updateAuditItemSchema>
) {
  const item = await db.auditItem.findUnique({
    where: { id: auditItemId },
    include: { auditCycle: true, asset: { select: { assetTag: true, name: true } } },
  });

  if (!item) throw new AuditError('Audit item not found.', 404);
  if (item.auditCycle.status === AuditStatus.CLOSED) {
    throw new AuditError('This audit cycle is closed and cannot be edited.', 409);
  }

  await requireAuditorOrManager(session, item.auditCycleId);

  const updated = await db.auditItem.update({
    where: { id: auditItemId },
    data: {
      verification: input.verification as VerificationStatus,
      notes: input.notes || null,
    },
    include: {
      asset: {
        select: {
          id: true,
          assetTag: true,
          name: true,
          location: true,
          status: true,
          department: { select: { name: true } },
        },
      },
    },
  });

  await logActivity(session.userId, 'UPDATE_AUDIT_ITEM', 'AuditItem', auditItemId, {
    assetTag: item.asset.assetTag,
    verification: input.verification,
  });

  return updated;
}

export async function closeAuditCycle(session: SessionUser, auditCycleId: string) {
  if (!canManageAudit(session.role)) {
    throw new AuditError('Only Admins and Asset Managers can close audit cycles.', 403);
  }

  const cycle = await db.auditCycle.findUnique({
    where: { id: auditCycleId },
    include: {
      items: {
        include: { asset: { select: { id: true, assetTag: true, name: true } } },
      },
    },
  });

  if (!cycle) throw new AuditError('Audit cycle not found.', 404);
  if (cycle.status === AuditStatus.CLOSED) throw new AuditError('Audit cycle is already closed.', 409);

  const flagged = cycle.items.filter(
    (item) => item.verification === VerificationStatus.MISSING || item.verification === VerificationStatus.DAMAGED
  );
  const missing = flagged.filter((item) => item.verification === VerificationStatus.MISSING);

  const closed = await db.$transaction(async (tx) => {
    if (missing.length > 0) {
      await tx.asset.updateMany({
        where: { id: { in: missing.map((item) => item.assetId) } },
        data: { status: 'LOST' },
      });
    }

    return tx.auditCycle.update({
      where: { id: auditCycleId },
      data: { status: 'CLOSED', closedAt: new Date() },
    });
  });

  if (flagged.length > 0) {
    const managers = await db.user.findMany({
      where: { role: 'ASSET_MANAGER', status: 'ACTIVE' },
      select: { id: true },
    });

    await Promise.all(
      managers.map((manager) =>
        notify(manager.id, 'AUDIT_DISCREPANCY', `${cycle.name} closed with ${flagged.length} discrepancy item(s).`)
      )
    );
  }

  await logActivity(session.userId, 'CLOSE_AUDIT_CYCLE', 'AuditCycle', auditCycleId, {
    flaggedItems: flagged.length,
    missingItems: missing.length,
  });

  return { closed, flagged };
}
