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

  // Build query options
  const where: Prisma.AssetWhereInput = {};

  if (search) {
    where.OR = [
      { assetTag: { contains: search, mode: 'insensitive' } },
      { serialNumber: { contains: search, mode: 'insensitive' } },
      { name: { contains: search, mode: 'insensitive' } },
    ];
  }

  if (categoryId) {
    where.categoryId = categoryId;
  }

  if (status) {
    where.status = status as AssetStatus;
  }

  if (departmentId) {
    where.departmentId = departmentId === 'none' ? null : departmentId;
  }

  if (location) {
    where.location = { contains: location, mode: 'insensitive' };
  }

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

    // Fetch filters options for search bar dropdowns
    const [categories, departments] = await Promise.all([
      db.category.findMany({ select: { id: true, name: true }, orderBy: { name: 'asc' } }),
      db.department.findMany({ where: { status: 'ACTIVE' }, select: { id: true, name: true }, orderBy: { name: 'asc' } }),
    ]);

    return NextResponse.json({
      assets,
      categories,
      departments,
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

  // RBAC check: Only ADMIN and ASSET_MANAGER can register assets
  if (session.role !== 'ADMIN' && session.role !== 'ASSET_MANAGER') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const body = await req.json();
    const {
      name,
      categoryId,
      serialNumber,
      acquisitionDate,
      acquisitionCost,
      condition,
      location,
      departmentId,
      photoUrl,
      isBookable,
    } = body;

    if (!name || !categoryId) {
      return NextResponse.json({ error: 'Name and Category are required.' }, { status: 400 });
    }

    // Check serial number uniqueness if provided
    if (serialNumber) {
      const existingSerial = await db.asset.findUnique({
        where: { serialNumber },
      });
      if (existingSerial) {
        return NextResponse.json({ error: `Serial Number ${serialNumber} is already registered.` }, { status: 400 });
      }
    }

    // Concurrency-safe unique tag auto-generation with retries
    let retries = 5;
    let assetTag = '';
    let createdAsset = null;

    while (retries > 0) {
      // Find the last generated asset tag to increment
      const lastAsset = await db.asset.findFirst({
        orderBy: { assetTag: 'desc' },
        select: { assetTag: true },
      });

      let nextNum = 1;
      if (lastAsset) {
        const match = lastAsset.assetTag.match(/AF-(\d+)/);
        if (match) {
          nextNum = parseInt(match[1], 10) + 1;
        }
      }

      assetTag = `AF-${String(nextNum).padStart(4, '0')}`;

      try {
        createdAsset = await db.asset.create({
          data: {
            assetTag,
            name,
            categoryId,
            serialNumber: serialNumber || null,
            acquisitionDate: acquisitionDate ? new Date(acquisitionDate) : null,
            acquisitionCost: acquisitionCost ? new Prisma.Decimal(acquisitionCost) : null,
            condition: condition || null,
            location: location || null,
            departmentId: departmentId || null,
            photoUrl: photoUrl || null,
            isBookable: !!isBookable,
            status: 'AVAILABLE',
          },
          include: {
            category: { select: { name: true } },
            department: { select: { name: true } },
          },
        });
        break; // Break loop if successfully created
      } catch (err: any) {
        // P2002 is Prisma error for unique constraint violation
        if (err.code === 'P2002' && err.meta?.target?.includes('assetTag')) {
          retries--;
          if (retries === 0) {
            throw new Error('Failed to generate a unique asset tag after multiple retries.');
          }
        } else {
          throw err; // Re-throw other errors (e.g. database connection issues)
        }
      }
    }

    return NextResponse.json({ asset: createdAsset }, { status: 201 });
  } catch (error: any) {
    console.error('Create asset error:', error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}
