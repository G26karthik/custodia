import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { notify, logActivity } from '@/lib/notifications';
import { MaintenanceStatus } from '@prisma/client';

// GET: List maintenance requests (role-filtered)
export async function GET(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(req.url);
    const status = searchParams.get('status') || '';
    const assetId = searchParams.get('assetId') || '';

    const where: any = {};

    if (status) {
      where.status = status as MaintenanceStatus;
    }

    if (assetId) {
      where.assetId = assetId;
    }

    // Role-based filtering
    if (session.role === 'EMPLOYEE') {
      where.raisedById = session.userId;
    } else if (session.role === 'DEPARTMENT_HEAD') {
      const dept = await db.department.findFirst({
        where: { headId: session.userId },
        select: { id: true },
      });
      if (dept) {
        where.OR = [
          { raisedById: session.userId },
          { asset: { departmentId: dept.id } },
        ];
      } else {
        where.raisedById = session.userId;
      }
    }
    // ADMIN and ASSET_MANAGER can see all

    const requests = await db.maintenanceRequest.findMany({
      where,
      include: {
        asset: { select: { id: true, name: true, assetTag: true, status: true, departmentId: true } },
        raisedBy: { select: { id: true, name: true, email: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({ requests });
  } catch (error) {
    console.error('Fetch maintenance requests error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

// POST: Create a new maintenance request
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { assetId, issueDescription, priority, photoUrl } = body;

    if (!assetId || !issueDescription) {
      return NextResponse.json(
        { error: 'Asset and issue description are required.' },
        { status: 400 }
      );
    }

    const validPriorities = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
    const safePriority = validPriorities.includes(priority) ? priority : 'MEDIUM';

    // Verify asset exists
    const asset = await db.asset.findUnique({
      where: { id: assetId },
      select: { id: true, name: true, assetTag: true },
    });

    if (!asset) {
      return NextResponse.json({ error: 'Asset not found.' }, { status: 404 });
    }

    const request = await db.maintenanceRequest.create({
      data: {
        assetId,
        raisedById: session.userId,
        issueDescription,
        priority: safePriority,
        photoUrl: photoUrl || null,
        status: 'PENDING',
      },
      include: {
        asset: { select: { name: true, assetTag: true } },
        raisedBy: { select: { name: true } },
      },
    });

    await logActivity(
      session.userId,
      'RAISE_MAINTENANCE',
      'MaintenanceRequest',
      request.id,
      { assetId, priority: safePriority }
    );

    return NextResponse.json({ request }, { status: 201 });
  } catch (error) {
    console.error('Create maintenance request error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

// PATCH: Update maintenance request status
export async function PATCH(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { id, action, technicianName } = body;
    // action: 'APPROVE' | 'REJECT' | 'ASSIGN_TECHNICIAN' | 'RESOLVE'

    if (!id || !action) {
      return NextResponse.json({ error: 'Request ID and action are required.' }, { status: 400 });
    }

    const request = await db.maintenanceRequest.findUnique({
      where: { id },
      include: {
        asset: { select: { id: true, name: true, assetTag: true, departmentId: true } },
        raisedBy: { select: { id: true, name: true } },
      },
    });

    if (!request) {
      return NextResponse.json({ error: 'Maintenance request not found.' }, { status: 404 });
    }

    // RBAC check
    let isAuthorized = false;
    if (session.role === 'ADMIN' || session.role === 'ASSET_MANAGER') {
      isAuthorized = true;
    } else if (session.role === 'DEPARTMENT_HEAD') {
      const depts = await db.department.findMany({
        where: {
          headId: session.userId,
          id: request.asset.departmentId || '',
        },
      });
      if (depts.length > 0) {
        isAuthorized = true;
      }
    }

    if (!isAuthorized) {
      return NextResponse.json(
        { error: 'Forbidden: You do not have permission to manage this request.' },
        { status: 403 }
      );
    }

    if (action === 'APPROVE') {
      if (request.status !== 'PENDING') {
        return NextResponse.json({ error: 'Only PENDING requests can be approved.' }, { status: 400 });
      }

      await db.$transaction(async (tx) => {
        await tx.maintenanceRequest.update({
          where: { id },
          data: { status: 'APPROVED', approvedById: session.userId },
        });
        await tx.asset.update({
          where: { id: request.assetId },
          data: { status: 'UNDER_MAINTENANCE' },
        });
      });

      await notify(
        request.raisedById,
        'MAINTENANCE_APPROVED',
        `Your maintenance request for ${request.asset.name} (${request.asset.assetTag}) has been approved.`
      );

      await logActivity(session.userId, 'APPROVE_MAINTENANCE', 'MaintenanceRequest', id, {
        assetId: request.assetId,
      });

      return NextResponse.json({ success: true, status: 'APPROVED' });
    } else if (action === 'REJECT') {
      if (request.status !== 'PENDING') {
        return NextResponse.json({ error: 'Only PENDING requests can be rejected.' }, { status: 400 });
      }

      await db.maintenanceRequest.update({
        where: { id },
        data: { status: 'REJECTED', approvedById: session.userId },
      });

      await notify(
        request.raisedById,
        'MAINTENANCE_REJECTED',
        `Your maintenance request for ${request.asset.name} (${request.asset.assetTag}) has been rejected.`
      );

      await logActivity(session.userId, 'REJECT_MAINTENANCE', 'MaintenanceRequest', id, {
        assetId: request.assetId,
      });

      return NextResponse.json({ success: true, status: 'REJECTED' });
    } else if (action === 'ASSIGN_TECHNICIAN') {
      if (request.status !== 'APPROVED' && request.status !== 'TECHNICIAN_ASSIGNED') {
        return NextResponse.json(
          { error: 'Only APPROVED requests can have a technician assigned.' },
          { status: 400 }
        );
      }

      if (!technicianName) {
        return NextResponse.json({ error: 'Technician name is required.' }, { status: 400 });
      }

      await db.maintenanceRequest.update({
        where: { id },
        data: { status: 'TECHNICIAN_ASSIGNED', technicianName },
      });

      await logActivity(session.userId, 'ASSIGN_TECHNICIAN', 'MaintenanceRequest', id, {
        technicianName,
      });

      return NextResponse.json({ success: true, status: 'TECHNICIAN_ASSIGNED' });
    } else if (action === 'START_PROGRESS') {
      if (request.status !== 'TECHNICIAN_ASSIGNED') {
        return NextResponse.json(
          { error: 'Only TECHNICIAN_ASSIGNED requests can be moved to IN_PROGRESS.' },
          { status: 400 }
        );
      }

      await db.maintenanceRequest.update({
        where: { id },
        data: { status: 'IN_PROGRESS' },
      });

      await logActivity(session.userId, 'START_MAINTENANCE', 'MaintenanceRequest', id, {});

      return NextResponse.json({ success: true, status: 'IN_PROGRESS' });
    } else if (action === 'RESOLVE') {
      if (
        request.status !== 'IN_PROGRESS' &&
        request.status !== 'TECHNICIAN_ASSIGNED' &&
        request.status !== 'APPROVED'
      ) {
        return NextResponse.json(
          { error: 'Only active maintenance requests can be resolved.' },
          { status: 400 }
        );
      }

      // Check if asset still has an active allocation
      const activeAlloc = await db.allocation.findFirst({
        where: { assetId: request.assetId, isActive: true },
      });

      await db.$transaction(async (tx) => {
        await tx.maintenanceRequest.update({
          where: { id },
          data: { status: 'RESOLVED', resolvedAt: new Date() },
        });
        await tx.asset.update({
          where: { id: request.assetId },
          data: { status: activeAlloc ? 'ALLOCATED' : 'AVAILABLE' },
        });
      });

      await logActivity(session.userId, 'RESOLVE_MAINTENANCE', 'MaintenanceRequest', id, {
        assetId: request.assetId,
      });

      return NextResponse.json({ success: true, status: 'RESOLVED' });
    } else {
      return NextResponse.json({ error: 'Invalid action.' }, { status: 400 });
    }
  } catch (error) {
    console.error('Update maintenance request error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
