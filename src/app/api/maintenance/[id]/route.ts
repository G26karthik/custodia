import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { resolveMaintenanceRequest, updateMaintenanceStatus } from '@/lib/services/maintenance-service';
import { MaintenanceStatus } from '@prisma/client';

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id: requestId } = await params;

  try {
    const body = await req.json();
    const { action, status } = body;

    let request;

    if (action === 'APPROVE' || action === 'REJECT') {
      // Handles approval resolution flow (Restricted to ASSET_MANAGER/ADMIN)
      request = await resolveMaintenanceRequest(session.userId, session.role, requestId, action);
    } else if (status) {
      // Handles technician/assignee workflow transitions
      request = await updateMaintenanceStatus(session.userId, session.role, requestId, status as MaintenanceStatus);
    } else {
      return NextResponse.json({ error: 'Invalid payload: Either action (APPROVE/REJECT) or status must be specified.' }, { status: 400 });
    }

    return NextResponse.json({ request });
  } catch (error: any) {
    console.error('Resolve/Update maintenance error:', error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 400 });
  }
}
