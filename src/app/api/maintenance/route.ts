import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { db } from '@/lib/db';
import { raiseMaintenanceRequest } from '@/lib/services/maintenance-service';
import { z } from 'zod';

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const requests = await db.maintenanceRequest.findMany({
      include: {
        asset: {
          select: { id: true, name: true, assetTag: true, status: true },
        },
        raisedBy: {
          select: { id: true, name: true, email: true },
        },
      },
      orderBy: [
        { priority: 'desc' },
        { createdAt: 'desc' },
      ],
    });

    return NextResponse.json({ requests });
  } catch (error) {
    console.error('Fetch maintenance requests error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await req.json();
    
    // Delegate to service layer
    const request = await raiseMaintenanceRequest(session.userId, body);

    return NextResponse.json({ request }, { status: 201 });
  } catch (error: any) {
    // Graceful error responses for Zod errors or business logic errors
    if (error instanceof z.ZodError) {
      const issue = error.issues[0];
      return NextResponse.json({ error: issue.message }, { status: 400 });
    }
    console.error('Raise maintenance request error:', error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 400 });
  }
}
