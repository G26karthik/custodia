import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { notify, logActivity } from '@/lib/notifications';

// GET: List audit cycles
export async function GET(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Only ADMIN and ASSET_MANAGER can access audits
  if (session.role !== 'ADMIN' && session.role !== 'ASSET_MANAGER') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const { searchParams } = new URL(req.url);
    const status = searchParams.get('status') || '';
    const cycleId = searchParams.get('cycleId') || '';

    // If a specific cycle is requested, return it with full items
    if (cycleId) {
      const cycle = await db.auditCycle.findUnique({
        where: { id: cycleId },
        include: {
          scopeDept: { select: { id: true, name: true } },
          auditors: {
            include: {
              user: { select: { id: true, name: true, email: true } },
            },
          },
          items: {
            include: {
              asset: {
                select: { id: true, name: true, assetTag: true, location: true, status: true },
              },
            },
            orderBy: { asset: { assetTag: 'asc' } },
          },
        },
      });

      if (!cycle) {
        return NextResponse.json({ error: 'Audit cycle not found.' }, { status: 404 });
      }

      return NextResponse.json({ cycle });
    }

    // List all cycles
    const where: any = {};
    if (status) {
      where.status = status;
    }

    const cycles = await db.auditCycle.findMany({
      where,
      include: {
        scopeDept: { select: { id: true, name: true } },
        auditors: {
          include: {
            user: { select: { id: true, name: true } },
          },
        },
        _count: {
          select: { items: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Also get summary stats for each cycle
    const cyclesWithStats = await Promise.all(
      cycles.map(async (cycle) => {
        const itemStats = await db.auditItem.groupBy({
          by: ['verification'],
          where: { auditCycleId: cycle.id },
          _count: true,
        });

        const stats: Record<string, number> = { PENDING: 0, VERIFIED: 0, MISSING: 0, DAMAGED: 0 };
        itemStats.forEach((s) => {
          stats[s.verification] = s._count;
        });

        return { ...cycle, stats };
      })
    );

    // Return departments and users for the create form
    const [departments, users] = await Promise.all([
      db.department.findMany({
        where: { status: 'ACTIVE' },
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
      }),
      db.user.findMany({
        where: { status: 'ACTIVE' },
        select: { id: true, name: true, email: true },
        orderBy: { name: 'asc' },
      }),
    ]);

    return NextResponse.json({ cycles: cyclesWithStats, departments, users });
  } catch (error) {
    console.error('Fetch audit cycles error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

// POST: Create a new audit cycle
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (session.role !== 'ADMIN' && session.role !== 'ASSET_MANAGER') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const body = await req.json();
    const { name, scopeDeptId, location, startDate, endDate, auditorIds } = body;

    if (!name || !startDate || !endDate) {
      return NextResponse.json(
        { error: 'Name, start date, and end date are required.' },
        { status: 400 }
      );
    }

    const start = new Date(startDate);
    const end = new Date(endDate);

    if (end <= start) {
      return NextResponse.json({ error: 'End date must be after start date.' }, { status: 400 });
    }

    // Find assets matching the scope
    const assetWhere: any = {};
    if (scopeDeptId) {
      assetWhere.departmentId = scopeDeptId;
    }
    if (location) {
      assetWhere.location = { contains: location, mode: 'insensitive' };
    }

    const assetsInScope = await db.asset.findMany({
      where: assetWhere,
      select: { id: true, location: true },
    });

    // Create cycle with items and auditors in a transaction
    const cycle = await db.$transaction(async (tx) => {
      const newCycle = await tx.auditCycle.create({
        data: {
          name,
          scopeDeptId: scopeDeptId || null,
          location: location || null,
          startDate: start,
          endDate: end,
          status: 'OPEN',
        },
      });

      // Create audit items for each asset in scope
      if (assetsInScope.length > 0) {
        await tx.auditItem.createMany({
          data: assetsInScope.map((asset) => ({
            auditCycleId: newCycle.id,
            assetId: asset.id,
            expectedLocation: asset.location || null,
            verification: 'PENDING',
          })),
        });
      }

      // Assign auditors
      if (auditorIds && auditorIds.length > 0) {
        await tx.auditCycleAuditor.createMany({
          data: auditorIds.map((userId: string) => ({
            auditCycleId: newCycle.id,
            userId,
          })),
        });
      }

      return newCycle;
    });

    await logActivity(session.userId, 'CREATE_AUDIT_CYCLE', 'AuditCycle', cycle.id, {
      name,
      scopeDeptId,
      location,
      assetsCount: assetsInScope.length,
    });

    return NextResponse.json(
      { cycle, assetsPopulated: assetsInScope.length },
      { status: 201 }
    );
  } catch (error) {
    console.error('Create audit cycle error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

// PATCH: Update audit item verification or close cycle
export async function PATCH(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (session.role !== 'ADMIN' && session.role !== 'ASSET_MANAGER') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const body = await req.json();
    const { action } = body;

    if (action === 'VERIFY_ITEM') {
      const { itemId, verification, notes } = body;

      if (!itemId || !verification) {
        return NextResponse.json(
          { error: 'Item ID and verification status are required.' },
          { status: 400 }
        );
      }

      const validStatuses = ['PENDING', 'VERIFIED', 'MISSING', 'DAMAGED'];
      if (!validStatuses.includes(verification)) {
        return NextResponse.json({ error: 'Invalid verification status.' }, { status: 400 });
      }

      const item = await db.auditItem.findUnique({
        where: { id: itemId },
        include: {
          asset: { select: { id: true, name: true, assetTag: true } },
          auditCycle: { select: { id: true, status: true } },
        },
      });

      if (!item) {
        return NextResponse.json({ error: 'Audit item not found.' }, { status: 404 });
      }

      if (item.auditCycle.status !== 'OPEN') {
        return NextResponse.json({ error: 'Cannot modify items in a closed audit cycle.' }, { status: 400 });
      }

      await db.auditItem.update({
        where: { id: itemId },
        data: {
          verification,
          notes: notes || null,
        },
      });

      // Fire discrepancy notification for MISSING or DAMAGED
      if (verification === 'MISSING' || verification === 'DAMAGED') {
        // Notify all admins about discrepancy
        const admins = await db.user.findMany({
          where: { role: 'ADMIN', status: 'ACTIVE' },
          select: { id: true },
        });

        for (const admin of admins) {
          await notify(
            admin.id,
            'AUDIT_DISCREPANCY',
            `Audit discrepancy: Asset ${item.asset.name} (${item.asset.assetTag}) marked as ${verification}${notes ? ` — ${notes}` : ''}.`
          );
        }

        // If MISSING, also update asset status
        if (verification === 'MISSING') {
          await db.asset.update({
            where: { id: item.assetId },
            data: { status: 'LOST' },
          });
        }
      }

      await logActivity(session.userId, 'VERIFY_AUDIT_ITEM', 'AuditItem', itemId, {
        verification,
        assetId: item.assetId,
      });

      return NextResponse.json({ success: true, verification });
    } else if (action === 'CLOSE_CYCLE') {
      const { cycleId } = body;

      if (!cycleId) {
        return NextResponse.json({ error: 'Cycle ID is required.' }, { status: 400 });
      }

      const cycle = await db.auditCycle.findUnique({
        where: { id: cycleId },
      });

      if (!cycle) {
        return NextResponse.json({ error: 'Audit cycle not found.' }, { status: 404 });
      }

      if (cycle.status !== 'OPEN') {
        return NextResponse.json({ error: 'Audit cycle is already closed.' }, { status: 400 });
      }

      await db.auditCycle.update({
        where: { id: cycleId },
        data: { status: 'CLOSED', closedAt: new Date() },
      });

      await logActivity(session.userId, 'CLOSE_AUDIT_CYCLE', 'AuditCycle', cycleId, {});

      return NextResponse.json({ success: true, status: 'CLOSED' });
    } else {
      return NextResponse.json({ error: 'Invalid action.' }, { status: 400 });
    }
  } catch (error) {
    console.error('Update audit error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
