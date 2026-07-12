import { db } from '../db';
import { z } from 'zod';
import { notify, logActivity } from '../notifications';
import { MaintenanceStatus, Priority } from '@prisma/client';

// 1. Validation Schema for raising request
export const RaiseRequestSchema = z.object({
  assetId: z.string().cuid({ message: 'Invalid asset ID structure.' }),
  issueDescription: z.string().min(5, { message: 'Issue description must be at least 5 characters long.' }),
  priority: z.nativeEnum(Priority, { message: 'Invalid priority selection.' }),
  photoUrl: z.string().url({ message: 'Invalid photo URL structure.' }).nullable().optional(),
});

export async function raiseMaintenanceRequest(
  userId: string,
  input: z.infer<typeof RaiseRequestSchema>
) {
  // Validate input
  const validated = RaiseRequestSchema.parse(input);

  // Check if asset exists
  const asset = await db.asset.findUnique({
    where: { id: validated.assetId },
  });

  if (!asset) {
    throw new Error('Target asset not found.');
  }

  // Create request
  const request = await db.maintenanceRequest.create({
    data: {
      assetId: validated.assetId,
      issueDescription: validated.issueDescription,
      priority: validated.priority,
      photoUrl: validated.photoUrl || null,
      status: 'PENDING',
      raisedById: userId,
    },
    include: {
      asset: { select: { name: true, assetTag: true } },
    },
  });

  // Log activity
  await logActivity(
    userId,
    'RAISE_MAINTENANCE',
    'Asset',
    validated.assetId,
    { requestId: request.id, priority: validated.priority }
  );

  return request;
}

export async function resolveMaintenanceRequest(
  userId: string,
  userRole: string,
  requestId: string,
  action: 'APPROVE' | 'REJECT'
) {
  // Enforce server-side RBAC: Only ASSET_MANAGER or ADMIN can approve/reject
  if (userRole !== 'ASSET_MANAGER' && userRole !== 'ADMIN') {
    throw new Error('Forbidden: Only Asset Managers can resolve maintenance requests.');
  }

  const request = await db.maintenanceRequest.findUnique({
    where: { id: requestId },
    include: { asset: true },
  });

  if (!request) {
    throw new Error('Maintenance request not found.');
  }

  if (request.status !== 'PENDING') {
    throw new Error('This request has already been resolved.');
  }

  const finalStatus: MaintenanceStatus = action === 'APPROVE' ? 'APPROVED' : 'REJECTED';

  const updatedRequest = await db.$transaction(async (tx) => {
    // 1. Update the request status
    const req = await tx.maintenanceRequest.update({
      where: { id: requestId },
      data: { status: finalStatus },
    });

    // 2. If approved, automatically update the asset status to UNDER_MAINTENANCE (unless retired/disposed)
    if (action === 'APPROVE') {
      const allowedStatuses = ['AVAILABLE', 'ALLOCATED', 'RESERVED', 'UNDER_MAINTENANCE', 'LOST'];
      if (allowedStatuses.includes(request.asset.status)) {
        await tx.asset.update({
          where: { id: request.assetId },
          data: { status: 'UNDER_MAINTENANCE' },
        });
      }
    }

    return req;
  });

  // Fire notification to the reporter of the request
  await notify(
    request.raisedById,
    action === 'APPROVE' ? 'MAINTENANCE_APPROVED' : 'MAINTENANCE_REJECTED',
    `Your maintenance request for asset ${request.asset.name} (${request.asset.assetTag}) has been ${action === 'APPROVE' ? 'approved' : 'rejected'}.`
  );

  // Log activity
  await logActivity(
    userId,
    action === 'APPROVE' ? 'APPROVE_MAINTENANCE' : 'REJECT_MAINTENANCE',
    'MaintenanceRequest',
    requestId,
    { assetId: request.assetId }
  );

  return updatedRequest;
}

export async function updateMaintenanceStatus(
  userId: string,
  userRole: string,
  requestId: string,
  newStatus: MaintenanceStatus
) {
  const request = await db.maintenanceRequest.findUnique({
    where: { id: requestId },
    include: { asset: true },
  });

  if (!request) {
    throw new Error('Maintenance request not found.');
  }

  // Define valid status flow:
  // APPROVED -> TECHNICIAN_ASSIGNED -> IN_PROGRESS -> RESOLVED
  // PENDING -> APPROVED / REJECTED
  const current = request.status;

  if (current === 'PENDING' && (newStatus === 'APPROVED' || newStatus === 'REJECTED')) {
    return resolveMaintenanceRequest(userId, userRole, requestId, newStatus === 'APPROVED' ? 'APPROVE' : 'REJECT');
  }

  const validTransitions: Record<MaintenanceStatus, MaintenanceStatus[]> = {
    PENDING: ['APPROVED', 'REJECTED'],
    APPROVED: ['TECHNICIAN_ASSIGNED'],
    REJECTED: [],
    TECHNICIAN_ASSIGNED: ['IN_PROGRESS'],
    IN_PROGRESS: ['RESOLVED'],
    RESOLVED: [],
  };

  const allowed = validTransitions[current] || [];
  if (!allowed.includes(newStatus)) {
    throw new Error(`Invalid status transition from ${current} to ${newStatus}.`);
  }

  const updatedRequest = await db.$transaction(async (tx) => {
    const req = await tx.maintenanceRequest.update({
      where: { id: requestId },
      data: { status: newStatus },
    });

    // If transitioning to RESOLVED, update asset status back to AVAILABLE (unless retired/disposed)
    if (newStatus === 'RESOLVED') {
      const dbAsset = await tx.asset.findUnique({ where: { id: request.assetId } });
      if (dbAsset && dbAsset.status !== 'RETIRED' && dbAsset.status !== 'DISPOSED') {
        await tx.asset.update({
          where: { id: request.assetId },
          data: { status: 'AVAILABLE' },
        });
      }
    }

    return req;
  });

  // Fire notification if resolved
  if (newStatus === 'RESOLVED') {
    await notify(
      request.raisedById,
      'MAINTENANCE_APPROVED', // Using compatible types from teammate's list
      `Maintenance is resolved for your asset ${request.asset.name} (${request.asset.assetTag}).`
    );
  }

  // Log transition activity
  await logActivity(
    userId,
    `TRANSITION_MAINTENANCE_${newStatus}`,
    'MaintenanceRequest',
    requestId,
    { assetId: request.assetId, from: current, to: newStatus }
  );

  return updatedRequest;
}
