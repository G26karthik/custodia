import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { db } from '@/lib/db';
import { logActivity } from '@/lib/notifications';

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getSession();

  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await context.params;
  const notification = await db.notification.findFirst({
    where: {
      id,
      userId: session.userId,
    },
  });

  if (!notification) {
    return NextResponse.json({ error: 'Notification not found' }, { status: 404 });
  }

  await db.notification.update({
    where: { id },
    data: { isRead: true },
  });

  await logActivity(session.userId, 'READ_NOTIFICATION', 'Notification', id, {
    type: notification.type,
    source: 'api',
  });

  return NextResponse.json({ ok: true });
}
