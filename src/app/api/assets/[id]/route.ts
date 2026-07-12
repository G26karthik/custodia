import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;

  try {
    const asset = await db.asset.findUnique({
      where: { id },
      include: {
        category: {
          select: { id: true, name: true },
        },
        department: {
          select: { id: true, name: true },
        },
        allocations: {
          orderBy: { allocatedAt: 'desc' },
          include: {
            holder: {
              select: { id: true, name: true, email: true },
            },
            department: {
              select: { id: true, name: true },
            },
          },
        },
        maintenanceRequests: {
          orderBy: { createdAt: 'desc' },
          include: {
            raisedBy: {
              select: { id: true, name: true },
            },
          },
        },
      },
    });

    if (!asset) {
      return NextResponse.json({ error: 'Asset not found.' }, { status: 404 });
    }

    return NextResponse.json({ asset });
  } catch (error) {
    console.error('Fetch asset detail error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
