import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';

async function verifyAdmin() {
  const session = await getSession();
  if (!session || session.role !== 'ADMIN') {
    return false;
  }
  return true;
}

export async function GET() {
  if (!(await verifyAdmin())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const categories = await db.category.findMany({
      orderBy: { name: 'asc' },
    });
    return NextResponse.json({ categories });
  } catch (error) {
    console.error('Fetch categories error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  if (!(await verifyAdmin())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { id, name, customFields } = body;

    if (!name) {
      return NextResponse.json({ error: 'Category name is required.' }, { status: 400 });
    }

    const trimmedName = name.trim();

    // Check uniqueness
    const existingCat = await db.category.findUnique({
      where: { name: trimmedName },
    });

    if (existingCat && existingCat.id !== id) {
      return NextResponse.json({ error: `Category with name ${trimmedName} already exists.` }, { status: 400 });
    }

    // Parse customFields if it's sent as string or object
    let parsedFields = customFields;
    if (typeof customFields === 'string') {
      try {
        parsedFields = JSON.parse(customFields);
      } catch (e) {
        return NextResponse.json({ error: 'Custom fields must be a valid JSON.' }, { status: 400 });
      }
    }

    if (id) {
      const category = await db.category.update({
        where: { id },
        data: {
          name: trimmedName,
          customFields: parsedFields || null,
        },
      });
      return NextResponse.json({ category });
    } else {
      const category = await db.category.create({
        data: {
          name: trimmedName,
          customFields: parsedFields || null,
        },
      });
      return NextResponse.json({ category });
    }
  } catch (error) {
    console.error('Save category error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
