'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { db } from '@/lib/db';
import { logActivity } from '@/lib/notifications';

export async function markNotificationRead(notificationId: string) {
  const session = await getSession();

  if (!session) {
    redirect('/login');
  }

  const notification = await db.notification.findFirst({
    where: {
      id: notificationId,
      userId: session.userId,
    },
  });

  if (!notification) {
    throw new Error('Notification not found.');
  }

  await db.notification.update({
    where: { id: notificationId },
    data: { isRead: true },
  });

  await logActivity(session.userId, 'READ_NOTIFICATION', 'Notification', notificationId, {
    type: notification.type,
  });

  revalidatePath('/notifications');
}

export async function markAllNotificationsRead() {
  const session = await getSession();

  if (!session) {
    redirect('/login');
  }

  const result = await db.notification.updateMany({
    where: {
      userId: session.userId,
      isRead: false,
    },
    data: { isRead: true },
  });

  if (result.count > 0) {
    await logActivity(session.userId, 'READ_ALL_NOTIFICATIONS', 'Notification', session.userId, {
      count: result.count,
    });
  }

  revalidatePath('/notifications');
}
