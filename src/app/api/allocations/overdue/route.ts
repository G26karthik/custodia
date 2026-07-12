import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // RBAC: only ADMIN or ASSET_MANAGER can see org-wide overdue allocations (Global Standards Rule 2)
  if (session.role !== 'ADMIN' && session.role !== 'ASSET_MANAGER') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const allocations = await db.allocation.findMany({
      where: { isActive: true, expectedReturnDate: { lt: new Date() } },
      include: {
        asset: { select: { id: true, assetTag: true, name: true, status: true } },
        holder: { select: { id: true, name: true, email: true } },
        department: { select: { id: true, name: true } },
      },
      orderBy: { expectedReturnDate: 'asc' },
    });

    return NextResponse.json({ allocations });
  } catch (error) {
    console.error('Fetch overdue allocations error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
