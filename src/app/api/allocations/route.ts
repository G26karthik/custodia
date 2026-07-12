import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { notify, logActivity } from '@/lib/notifications';

import { z } from 'zod';

const AllocateSchema = z.object({
  assetId: z.string().cuid('Valid Asset ID is required.'),
  holderId: z.string().cuid().nullable().optional(),
  departmentId: z.string().cuid().nullable().optional(),
  expectedReturnDate: z.string().datetime().nullable().optional().or(z.string().nullable().optional()),
}).refine((data) => data.holderId || data.departmentId, {
  message: 'Either Holder Employee or Department must be selected.',
  path: ['holderId'],
});

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await req.json().catch(() => null);
    const parsed = AllocateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid input.' }, { status: 400 });
    }

    const { assetId, holderId, departmentId, expectedReturnDate } = parsed.data;

    // Fetch the asset and check its current allocation status
    const asset = await db.asset.findUnique({
      where: { id: assetId },
      include: {
        allocations: {
          where: { isActive: true },
          include: {
            holder: { select: { name: true } },
            department: { select: { name: true } },
          },
        },
      },
    });

    if (!asset) {
      return NextResponse.json({ error: 'Asset not found.' }, { status: 404 });
    }

    // Conflict Rule: Check if the asset is already actively allocated
    const activeAllocation = asset.allocations[0];
    if (activeAllocation) {
      const holderName = activeAllocation.holder?.name || activeAllocation.department?.name || 'Unknown Holder';
      return NextResponse.json(
        {
          error: `Conflict: Asset is currently held by ${holderName}`,
          holderName,
          activeAllocationId: activeAllocation.id,
        },
        { status: 409 }
      );
    }

    // Create the allocation
    const allocation = await db.$transaction(async (tx) => {
      // 1. Update asset status
      await tx.asset.update({
        where: { id: assetId },
        data: { status: 'ALLOCATED' },
      });

      // 2. Create allocation row
      const alloc = await tx.allocation.create({
        data: {
          assetId,
          holderId: holderId || null,
          departmentId: departmentId || null,
          expectedReturnDate: expectedReturnDate ? new Date(expectedReturnDate) : null,
          isActive: true,
        },
      });

      return alloc;
    });

    // Fire notifications and log activity
    if (holderId) {
      await notify(
        holderId,
        'ASSET_ASSIGNED',
        `Asset ${asset.name} (${asset.assetTag}) has been allocated to you.`
      );
    }
    
    await logActivity(
      session.userId,
      'ALLOCATE_ASSET',
      'Asset',
      assetId,
      { allocationId: allocation.id, holderId, departmentId }
    );

    return NextResponse.json({ allocation }, { status: 201 });
  } catch (error) {
    console.error('Allocation error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
