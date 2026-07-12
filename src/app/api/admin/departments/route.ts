import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { Status } from '@prisma/client';

// Helper to check if current user is ADMIN
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
  const limit = parseInt(searchParams.get('limit') || '50', 10);
  const skip = (page - 1) * limit;

  try {
    const [departments, total] = await Promise.all([
      db.department.findMany({
        skip,
        take: limit,
        include: {
          head: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
          parent: {
            select: {
              id: true,
              name: true,
              code: true,
            },
          },
        },
        orderBy: { name: 'asc' },
      }),
      db.department.count(),
    ]);

    // Also get all active users to populate the "Head" dropdown in frontend
    const users = await db.user.findMany({
      where: { status: 'ACTIVE' },
      select: { id: true, name: true, email: true },
      orderBy: { name: 'asc' },
    });

    return NextResponse.json({
      departments,
      users,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    });
  } catch (error) {
    console.error('Fetch departments error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  if (!(await verifyAdmin())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { id, name, code, headId, parentId, status } = body;

    if (!name || !code) {
      return NextResponse.json({ error: 'Name and Code are required.' }, { status: 400 });
    }

    const deptCode = code.toUpperCase().trim();

    // Check code uniqueness (only for new departments or if code is changing)
    const existingCode = await db.department.findUnique({
      where: { code: deptCode },
    });

    if (existingCode && existingCode.id !== id) {
      return NextResponse.json({ error: `Department code ${deptCode} already exists.` }, { status: 400 });
    }

    if (id) {
      // Update department
      const department = await db.department.update({
        where: { id },
        data: {
          name,
          code: deptCode,
          headId: headId || null,
          parentId: parentId || null,
          status: status as Status,
        },
        include: {
          head: { select: { id: true, name: true } },
          parent: { select: { id: true, name: true } },
        },
      });

      // If headId is updated, promote user's role to DEPARTMENT_HEAD if they are currently just EMPLOYEE
      if (headId) {
        const user = await db.user.findUnique({ where: { id: headId } });
        if (user && user.role === 'EMPLOYEE') {
          await db.user.update({
            where: { id: headId },
            data: { role: 'DEPARTMENT_HEAD' },
          });
        }
      }

      return NextResponse.json({ department });
    } else {
      // Create department
      const department = await db.department.create({
        data: {
          name,
          code: deptCode,
          headId: headId || null,
          parentId: parentId || null,
          status: (status as Status) || 'ACTIVE',
        },
        include: {
          head: { select: { id: true, name: true } },
          parent: { select: { id: true, name: true } },
        },
      });

      // If headId is assigned, promote user to DEPARTMENT_HEAD if they are currently just EMPLOYEE
      if (headId) {
        const user = await db.user.findUnique({ where: { id: headId } });
        if (user && user.role === 'EMPLOYEE') {
          await db.user.update({
            where: { id: headId },
            data: { role: 'DEPARTMENT_HEAD' },
          });
        }
      }

      return NextResponse.json({ department });
    }
  } catch (error) {
    console.error('Save department error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
