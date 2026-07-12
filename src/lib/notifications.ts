import { db } from './db';

export async function notify(userId: string, type: string, message: string) {
  console.log(`[Notification] To User ${userId} | Type: ${type} | Message: ${message}`);
  try {
    await db.notification.create({
      data: {
        userId,
        type,
        message,
      },
    });
  } catch (error) {
    console.error('Failed to write notification to DB:', error);
  }
}

export async function logActivity(
  userId: string | null,
  action: string,
  entityType: string,
  entityId: string,
  details?: any
) {
  console.log(`[ActivityLog] User ${userId} | Action: ${action} | Entity: ${entityType}(${entityId})`);
  try {
    await db.activityLog.create({
      data: {
        userId,
        action,
        entityType,
        entityId,
        details: details || null,
      },
    });
  } catch (error) {
    console.error('Failed to write activity log to DB:', error);
  }
}
