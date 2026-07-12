import type { Prisma } from '@prisma/client';
import { db } from '@/lib/db';

export const notificationTypes = [
  'ASSET_ASSIGNED',
  'MAINTENANCE_APPROVED',
  'MAINTENANCE_REJECTED',
  'BOOKING_CONFIRMED',
  'BOOKING_CANCELLED',
  'TRANSFER_APPROVED',
  'TRANSFER_REJECTED', // Added to prevent runtime crashes on Phase 3 transfer rejection
  'OVERDUE_RETURN',
  'AUDIT_DISCREPANCY',
] as const;

export type NotificationType = (typeof notificationTypes)[number];

export function assertNotificationType(type: string): asserts type is NotificationType {
  if (!notificationTypes.includes(type as NotificationType)) {
    throw new Error(`Unsupported notification type: ${type}`);
  }
}

export async function notify(userId: string, type: NotificationType | string, message: string) {
  assertNotificationType(type);
  console.log(`[Notification] To User ${userId} | Type: ${type} | Message: ${message}`);

  return db.notification.create({
    data: {
      userId,
      type,
      message,
    },
  });
}

export async function logActivity(
  userId: string | null,
  action: string,
  entityType: string,
  entityId: string,
  details?: Prisma.InputJsonValue
) {
  console.log(`[ActivityLog] User ${userId} | Action: ${action} | Entity: ${entityType}(${entityId})`);
  return db.activityLog.create({
    data: {
      userId,
      action,
      entityType,
      entityId,
      details: details ?? undefined,
    },
  });
}
