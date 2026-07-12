import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { AssetStatus, Prisma } from '@prisma/client';

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const page = parseInt(searchParams.get('page') || '1', 10);
  const limit = parseInt(searchParams.get('limit') || '10', 10);
  const search = searchParams.get('search') || '';
  const categoryId = searchParams.get('categoryId') || '';
  const status = searchParams.get('status') || '';
  const departmentId = searchParams.get('departmentId') || '';
  const location = searchParams.get('location') || '';

  const skip = (page - 1) * limit;

  const where: Prisma.AssetWhereInput = {};

  if (search) {
    where.OR = [
      { assetTag: { contains: search, mode: 'insensitive' } },
      { serialNumber: { contains: search, mode: 'insensitive' } },
      { name: { contains: search, mode: 'insensitive' } },
    ];
  }

  if (categoryId) where.categoryId = categoryId;
  if (status) where.status = status as AssetStatus;
  if (departmentId) where.departmentId = departmentId === 'none' ? null : departmentId;
  if (location) where.location = { contains: location, mode: 'insensitive' };

  try {
    const [assets, total] = await Promise.all([
      db.asset.findMany({
        where,
        skip,
        take: limit,
        include: {
          category: { select: { id: true, name: true } },
          department: { select: { id: true, name: true } },
        },
        orderBy: { assetTag: 'desc' },
      }),
      db.asset.count({ where }),
    ]);

    const [categories, departments, users] = await Promise.all([
      db.category.findMany({ select: { id: true, name: true }, orderBy: { name: 'asc' } }),
      db.department.findMany({ where: { status: 'ACTIVE' }, select: { id: true, name: true }, orderBy: { name: 'asc' } }),
      db.user.findMany({ where: { status: 'ACTIVE' }, select: { id: true, name: true, email: true }, orderBy: { name: 'asc' } }),
    ]);

    return NextResponse.json({
      assets,
      categories,
      departments,
      users,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    });
  } catch (error) {
    console.error('Fetch assets error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // RBAC check: Only ADMIN and ASSET_MANAGER can register assets (Global Standards Rule 2)
  if (session.role !== 'ADMIN' && session.role !== 'ASSET_MANAGER') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const body = await req.json();

    // Delegate to service layer with Zod validation (Global Standards Rules 3 & 4)
    const { registerAsset } = await import('@/lib/services/asset-service');
    const asset = await registerAsset(session.userId, body);

    return NextResponse.json({ asset }, { status: 201 });
  } catch (error: any) {
    // Gracefully handle Zod errors (Standards Rule 3)
    if (error?.name === 'ZodError') {
      return NextResponse.json(
        { error: error.issues[0]?.message || 'Validation failed.' },
        { status: 400 }
      );
    }
    console.error('Create asset error:', error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 400 });
  }
}
