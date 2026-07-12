import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { logActivity } from '@/lib/notifications';

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { assetId, conditionAtReturn } = body;

    if (!assetId) {
      return NextResponse.json({ error: 'Asset ID is required.' }, { status: 400 });
    }

    // Find the active allocation
    const activeAllocation = await db.allocation.findFirst({
      where: { assetId, isActive: true },
      include: {
        asset: { select: { name: true, assetTag: true } },
      },
    });

    if (!activeAllocation) {
      return NextResponse.json({ error: 'No active allocation found for this asset.' }, { status: 404 });
    }

    await db.$transaction(async (tx) => {
      // 1. Close allocation
      await tx.allocation.update({
        where: { id: activeAllocation.id },
        data: {
          isActive: false,
          returnedAt: new Date(),
          conditionAtReturn: conditionAtReturn || null,
        },
      });

      // 2. Set asset status to AVAILABLE
      await tx.asset.update({
        where: { id: assetId },
        data: { status: 'AVAILABLE' },
      });
    });

    await logActivity(
      session.userId,
      'RETURN_ASSET',
      'Asset',
      assetId,
      { allocationId: activeAllocation.id, conditionAtReturn }
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Return asset error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
