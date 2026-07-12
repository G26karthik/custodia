import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { notify, logActivity } from '@/lib/notifications';
import { TransferStatus } from '@prisma/client';

// GET: List transfer requests filtered by role permissions
export async function GET(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(req.url);
    const status = searchParams.get('status') || '';

    const where: any = {};
    if (status) {
      where.status = status as TransferStatus;
    }

    // Role-based filtering for security
    if (session.role === 'EMPLOYEE') {
      // Employees can only see requests they raised or are target of
      where.OR = [
        { fromUserId: session.userId },
        { toUserId: session.userId },
      ];
    } else if (session.role === 'DEPARTMENT_HEAD') {
      // Fetch department of this head
      const dept = await db.department.findFirst({
        where: { headId: session.userId },
        select: { id: true },
      });
      if (dept) {
        // Can see requests involving members of their department or themselves
        where.OR = [
          { fromUser: { departmentId: dept.id } },
          { toUser: { departmentId: dept.id } },
          { fromUserId: session.userId },
          { toUserId: session.userId },
        ];
      } else {
        where.OR = [
          { fromUserId: session.userId },
          { toUserId: session.userId },
        ];
      }
    }
    // ADMIN and ASSET_MANAGER can see all requests (no filter added)

    const transfers = await db.transferRequest.findMany({
      where,
      include: {
        asset: { select: { id: true, name: true, assetTag: true, status: true } },
        fromUser: { select: { id: true, name: true, email: true, departmentId: true } },
        toUser: { select: { id: true, name: true, email: true, departmentId: true } },
      },
      orderBy: { requestedAt: 'desc' },
    });

    return NextResponse.json({ transfers });
  } catch (error) {
    console.error('Fetch transfers error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

// POST: Create a new transfer request
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { assetId, toUserId, reason } = body;

    if (!assetId || !toUserId) {
      return NextResponse.json({ error: 'Asset and Target Employee are required.' }, { status: 400 });
    }

    // 1. Get the current active allocation for this asset
    const activeAllocation = await db.allocation.findFirst({
      where: { assetId, isActive: true },
    });

    if (!activeAllocation) {
      return NextResponse.json({ error: 'No active allocation found for this asset to transfer.' }, { status: 400 });
    }

    // 2. Block transfer request if assignee is already the current holder
    if (activeAllocation.holderId === toUserId) {
      return NextResponse.json({ error: 'Target employee is already the current holder of this asset.' }, { status: 400 });
    }

    // 3. Create the TransferRequest record
    const transferRequest = await db.transferRequest.create({
      data: {
        assetId,
        fromUserId: activeAllocation.holderId,
        toUserId,
        reason: reason || null,
        status: 'REQUESTED',
      },
      include: {
        asset: { select: { name: true, assetTag: true } },
        toUser: { select: { name: true } },
      },
    });

    // Log activity
    await logActivity(
      session.userId,
      'REQUEST_TRANSFER',
      'Asset',
      assetId,
      { transferRequestId: transferRequest.id, toUserId }
    );

    return NextResponse.json({ transferRequest }, { status: 201 });
  } catch (error) {
    console.error('Create transfer error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

// PATCH: Approve or Reject a transfer request
export async function PATCH(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { id, action } = body; // action is 'APPROVE' or 'REJECT'

    if (!id || !action) {
      return NextResponse.json({ error: 'Request ID and Action are required.' }, { status: 400 });
    }

    // 1. Fetch TransferRequest and relation data
    const transfer = await db.transferRequest.findUnique({
      where: { id },
      include: {
        asset: { select: { id: true, name: true, assetTag: true } },
        fromUser: { select: { id: true, name: true, departmentId: true } },
        toUser: { select: { id: true, name: true, departmentId: true } },
      },
    });

    if (!transfer) {
      return NextResponse.json({ error: 'Transfer Request not found.' }, { status: 404 });
    }

    if (transfer.status !== 'REQUESTED') {
      return NextResponse.json({ error: 'This transfer request has already been resolved.' }, { status: 400 });
    }

    // 2. RBAC check: Only ASSET_MANAGER, ADMIN, or the relevant DEPARTMENT_HEAD can approve
    // "relevant DEPARTMENT_HEAD" is the head of the department of the releasing user (fromUser) or target user (toUser)
    let isAuthorized = false;

    if (session.role === 'ADMIN' || session.role === 'ASSET_MANAGER') {
      isAuthorized = true;
    } else if (session.role === 'DEPARTMENT_HEAD') {
      // Check if logged-in user is the head of releasing or target department
      const depts = await db.department.findMany({
        where: {
          headId: session.userId,
          id: {
            in: [
              transfer.fromUser?.departmentId || '',
              transfer.toUser?.departmentId || '',
            ].filter(Boolean),
          },
        },
      });
      if (depts.length > 0) {
        isAuthorized = true;
      }
    }

    if (!isAuthorized) {
      return NextResponse.json({ error: 'Forbidden: You do not have permissions to resolve this request.' }, { status: 403 });
    }

    // 3. Resolve transfer
    if (action === 'APPROVE') {
      await db.$transaction(async (tx) => {
        // Find current active allocation
        const activeAlloc = await tx.allocation.findFirst({
          where: { assetId: transfer.assetId, isActive: true },
        });

        if (activeAlloc) {
          // Close old active allocation
          await tx.allocation.update({
            where: { id: activeAlloc.id },
            data: {
              isActive: false,
              returnedAt: new Date(),
              conditionAtReturn: 'Transferred',
            },
          });
        }

        // Open new allocation for the target user (toUserId)
        await tx.allocation.create({
          data: {
            assetId: transfer.assetId,
            holderId: transfer.toUserId,
            isActive: true,
          },
        });

        // Update transfer status
        await tx.transferRequest.update({
          where: { id },
          data: {
            status: 'REALLOCATED',
            decidedAt: new Date(),
            decidedById: session.userId,
          },
        });
      });

      // Fire notifications
      if (transfer.fromUserId) {
        await notify(
          transfer.fromUserId,
          'TRANSFER_APPROVED',
          `Your asset ${transfer.asset.name} (${transfer.asset.assetTag}) has been transferred to ${transfer.toUser.name}.`
        );
      }

      await notify(
        transfer.toUserId,
        'ASSET_ASSIGNED',
        `Asset ${transfer.asset.name} (${transfer.asset.assetTag}) has been transferred to you.`
      );

      await logActivity(
        session.userId,
        'APPROVE_TRANSFER',
        'Asset',
        transfer.assetId,
        { transferRequestId: id, fromUserId: transfer.fromUserId, toUserId: transfer.toUserId }
      );

      return NextResponse.json({ success: true, status: 'REALLOCATED' });
    } else if (action === 'REJECT') {
      await db.transferRequest.update({
        where: { id },
        data: {
          status: 'REJECTED',
          decidedAt: new Date(),
          decidedById: session.userId,
        },
      });

      // Notify target requester
      await notify(
        transfer.toUserId,
        'TRANSFER_REJECTED',
        `Your transfer request for ${transfer.asset.name} (${transfer.asset.assetTag}) has been rejected.`
      );

      await logActivity(
        session.userId,
        'REJECT_TRANSFER',
        'Asset',
        transfer.assetId,
        { transferRequestId: id }
      );

      return NextResponse.json({ success: true, status: 'REJECTED' });
    } else {
      return NextResponse.json({ error: 'Invalid action.' }, { status: 400 });
    }
  } catch (error) {
    console.error('Resolve transfer error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
