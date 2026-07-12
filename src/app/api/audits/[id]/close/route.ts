import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { AuditError, closeAuditCycle } from '@/lib/services/auditService';

export async function PATCH(_request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { id } = await context.params;
    return NextResponse.json(await closeAuditCycle(session, id));
  } catch (error) {
    if (error instanceof AuditError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error('Close audit cycle error:', error);
    return NextResponse.json({ error: 'Unable to close audit cycle.' }, { status: 500 });
  }
}
