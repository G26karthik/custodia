import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { getSession } from '@/lib/auth';
import { AuditError, updateAuditItem, updateAuditItemSchema } from '@/lib/services/auditService';

function validationResponse(error: ZodError) {
  return NextResponse.json({ error: error.issues[0]?.message ?? 'Invalid input.' }, { status: 400 });
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json().catch(() => null);
  const parsed = updateAuditItemSchema.safeParse(body);
  if (!parsed.success) return validationResponse(parsed.error);

  try {
    const { id } = await context.params;
    return NextResponse.json({ item: await updateAuditItem(session, id, parsed.data) });
  } catch (error) {
    if (error instanceof AuditError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error('Update audit item error:', error);
    return NextResponse.json({ error: 'Unable to update audit item.' }, { status: 500 });
  }
}
