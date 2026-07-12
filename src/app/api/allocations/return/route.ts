import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { z } from 'zod';
import { logActivity } from '@/lib/notifications';

// ponytail: scale=hackathon; upgrade to optimistic-lock if concurrent returns become an issue
const ReturnSchema = z.object({
  assetId: z.string().cuid({ message: 'Valid asset ID is required.' }),
  conditionAtReturn: z.string().max(200).optional(),
});

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // RBAC: only ADMIN or ASSET_MANAGER can mark an asset as returned (Global Standards Rule 2)
  if (session.role !== 'ADMIN' && session.role !== 'ASSET_MANAGER') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const parsed = ReturnSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid input.' }, { status: 400 });
  }

  const { assetId, conditionAtReturn } = parsed.data;

  try {
    const activeAllocation = await db.allocation.findFirst({
      where: { assetId, isActive: true },
      include: { asset: { select: { name: true, assetTag: true } } },
    });

    if (!activeAllocation) {
      return NextResponse.json({ error: 'No active allocation found for this asset.' }, { status: 404 });
    }

    await db.$transaction(async (tx) => {
      await tx.allocation.update({
        where: { id: activeAllocation.id },
        data: { isActive: false, returnedAt: new Date(), conditionAtReturn: conditionAtReturn ?? null },
      });
      await tx.asset.update({
        where: { id: assetId },
        data: { status: 'AVAILABLE' },
      });
    });

    await logActivity(session.userId, 'RETURN_ASSET', 'Asset', assetId, {
      allocationId: activeAllocation.id,
      conditionAtReturn,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Return asset error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
