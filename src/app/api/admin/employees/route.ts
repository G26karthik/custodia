import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { Role, Status } from '@prisma/client';

async function verifyAdmin() {
  const session = await getSession();
  if (!session || session.role !== 'ADMIN') {
    return false;
  }
  return true;
}

export async function GET(req: Request) {
  if (!(await verifyAdmin())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const page = parseInt(searchParams.get('page') || '1', 10);
  const limit = parseInt(searchParams.get('limit') || '10', 10);
  const search = searchParams.get('search') || '';
  const roleFilter = searchParams.get('role') || '';
  const statusFilter = searchParams.get('status') || '';
  const deptFilter = searchParams.get('departmentId') || '';

  const skip = (page - 1) * limit;

  // Build prisma query where clause
  const where: any = {};

  if (search) {
    where.OR = [
      { name: { contains: search, mode: 'insensitive' } },
      { email: { contains: search, mode: 'insensitive' } },
    ];
  }

  if (roleFilter) {
    where.role = roleFilter as Role;
  }

  if (statusFilter) {
    where.status = statusFilter as Status;
  }

  if (deptFilter) {
    where.departmentId = deptFilter === 'none' ? null : deptFilter;
  }

  try {
    const [employees, total] = await Promise.all([
      db.user.findMany({
        where,
        skip,
        take: limit,
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          status: true,
          departmentId: true,
          department: {
            select: {
              id: true,
              name: true,
            },
          },
          createdAt: true,
        },
        orderBy: { name: 'asc' },
      }),
      db.user.count({ where }),
    ]);

    // Also fetch all departments to populate filters/dropdowns
    const departments = await db.department.findMany({
      where: { status: 'ACTIVE' },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });

    return NextResponse.json({
      employees,
      departments,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    });
  } catch (error) {
    console.error('Fetch employees error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  if (!(await verifyAdmin())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { id, role, status, departmentId } = body;

    if (!id) {
      return NextResponse.json({ error: 'Employee ID is required.' }, { status: 400 });
    }

    const updateData: any = {};
    
    if (role) {
      updateData.role = role as Role;
    }
    
    if (status) {
      updateData.status = status as Status;
    }
    
    if (departmentId !== undefined) {
      updateData.departmentId = departmentId || null;
    }

    const employee = await db.user.update({
      where: { id },
      data: updateData,
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        status: true,
        departmentId: true,
        department: {
          select: { id: true, name: true },
        },
      },
    });

    return NextResponse.json({ employee });
  } catch (error) {
    console.error('Update employee error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
