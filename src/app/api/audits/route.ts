import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { getSession } from '@/lib/auth';
import {
  AuditError,
  createAuditCycle,
  createAuditCycleSchema,
  listAuditBoard,
} from '@/lib/services/auditService';

function validationResponse(error: ZodError) {
  return NextResponse.json({ error: error.issues[0]?.message ?? 'Invalid input.' }, { status: 400 });
}

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  return NextResponse.json(await listAuditBoard(session));
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json().catch(() => null);
  const parsed = createAuditCycleSchema.safeParse(body);
  if (!parsed.success) return validationResponse(parsed.error);

  try {
    return NextResponse.json({ cycle: await createAuditCycle(session, parsed.data) }, { status: 201 });
  } catch (error) {
    if (error instanceof AuditError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error('Create audit cycle error:', error);
    return NextResponse.json({ error: 'Unable to create audit cycle.' }, { status: 500 });
  }
}
