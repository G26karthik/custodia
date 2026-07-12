import { BookingStatus, Role } from '@prisma/client';
import { z } from 'zod';
import { db } from '@/lib/db';
import { logActivity, notify } from '@/lib/notifications';

export const bookingQuerySchema = z.object({
  assetId: z.string().optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must use YYYY-MM-DD format.').optional(),
});

export const createBookingSchema = z.object({
  assetId: z.string().min(1, 'Resource is required.'),
  startTime: z.string().datetime('Start time must be a valid date-time.'),
  endTime: z.string().datetime('End time must be a valid date-time.'),
  purpose: z.string().trim().min(3, 'Purpose must be at least 3 characters.').max(160).optional(),
});

export const updateBookingSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('CANCEL'),
  }),
  z.object({
    action: z.literal('RESCHEDULE'),
    startTime: z.string().datetime('Start time must be a valid date-time.'),
    endTime: z.string().datetime('End time must be a valid date-time.'),
    purpose: z.string().trim().min(3).max(160).optional(),
  }),
]);

type SessionUser = {
  userId: string;
  role: Role;
};

function requireBooker(session: SessionUser) {
  if (!['ADMIN', 'ASSET_MANAGER', 'DEPARTMENT_HEAD', 'EMPLOYEE'].includes(session.role)) {
    throw new BookingError('You do not have permission to book resources.', 403);
  }
}

function getDayWindow(date?: string) {
  const selectedDate = date ?? new Date().toISOString().slice(0, 10);
  const start = new Date(`${selectedDate}T00:00:00.000Z`);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);
  return { selectedDate, start, end };
}

function deriveStatus(startTime: Date, endTime: Date, storedStatus: BookingStatus) {
  if (storedStatus === BookingStatus.CANCELLED) return BookingStatus.CANCELLED;

  const now = new Date();
  if (now < startTime) return BookingStatus.UPCOMING;
  if (now >= startTime && now < endTime) return BookingStatus.ONGOING;
  return BookingStatus.COMPLETED;
}

function assertTimeRange(startTime: Date, endTime: Date) {
  if (Number.isNaN(startTime.getTime()) || Number.isNaN(endTime.getTime())) {
    throw new BookingError('Start and end time must be valid.', 400);
  }

  if (endTime <= startTime) {
    throw new BookingError('End time must be after start time.', 400);
  }
}

async function ensureBookableResource(assetId: string) {
  const resource = await db.asset.findUnique({
    where: { id: assetId },
    select: {
      id: true,
      assetTag: true,
      name: true,
      location: true,
      isBookable: true,
      status: true,
    },
  });

  if (!resource || !resource.isBookable) {
    throw new BookingError('Selected resource does not exist or is not bookable.', 400);
  }

  return resource;
}

async function assertNoOverlap(
  assetId: string,
  startTime: Date,
  endTime: Date,
  ignoreBookingId?: string
) {
  const overlapping = await db.booking.findFirst({
    where: {
      assetId,
      status: { not: BookingStatus.CANCELLED },
      ...(ignoreBookingId ? { id: { not: ignoreBookingId } } : {}),
      startTime: { lt: endTime },
      endTime: { gt: startTime },
    },
    include: {
      bookedBy: { select: { name: true } },
      asset: { select: { name: true } },
    },
  });

  if (overlapping) {
    throw new BookingError(
      `${overlapping.asset.name} is already booked from ${overlapping.startTime.toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      })} to ${overlapping.endTime.toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      })} by ${overlapping.bookedBy.name}.`,
      409
    );
  }
}

function serializeBooking<T extends BookingWithRelations>(booking: T) {
  return {
    ...booking,
    status: deriveStatus(booking.startTime, booking.endTime, booking.status),
  };
}

type BookingWithRelations = Awaited<ReturnType<typeof db.booking.findFirstOrThrow>> & {
  asset: { id: string; assetTag: string; name: string; location: string | null };
  bookedBy: { id: string; name: string; email: string };
};

export class BookingError extends Error {
  constructor(
    message: string,
    public status = 400
  ) {
    super(message);
  }
}

export async function listBookingBoard(input: z.infer<typeof bookingQuerySchema>) {
  const { selectedDate, start, end } = getDayWindow(input.date);

  const resources = await db.asset.findMany({
    where: { isBookable: true },
    select: {
      id: true,
      assetTag: true,
      name: true,
      location: true,
      status: true,
    },
    orderBy: [{ name: 'asc' }],
  });

  const selectedResourceId = input.assetId ?? resources[0]?.id ?? null;

  const bookings = selectedResourceId
    ? await db.booking.findMany({
        where: {
          assetId: selectedResourceId,
          startTime: { lt: end },
          endTime: { gt: start },
        },
        include: {
          asset: { select: { id: true, assetTag: true, name: true, location: true } },
          bookedBy: { select: { id: true, name: true, email: true } },
        },
        orderBy: { startTime: 'asc' },
      })
    : [];

  return {
    selectedDate,
    selectedResourceId,
    resources,
    bookings: bookings.map(serializeBooking),
    refreshedAt: new Date().toISOString(),
  };
}

export async function createBooking(session: SessionUser, input: z.infer<typeof createBookingSchema>) {
  requireBooker(session);

  const startTime = new Date(input.startTime);
  const endTime = new Date(input.endTime);
  assertTimeRange(startTime, endTime);

  const resource = await ensureBookableResource(input.assetId);
  await assertNoOverlap(input.assetId, startTime, endTime);

  const booking = await db.booking.create({
    data: {
      assetId: input.assetId,
      bookedById: session.userId,
      startTime,
      endTime,
      purpose: input.purpose,
      status: BookingStatus.UPCOMING,
    },
    include: {
      asset: { select: { id: true, assetTag: true, name: true, location: true } },
      bookedBy: { select: { id: true, name: true, email: true } },
    },
  });

  await notify(
    session.userId,
    'BOOKING_CONFIRMED',
    `Booking confirmed: ${resource.name} from ${startTime.toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    })} to ${endTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}.`
  );

  await logActivity(session.userId, 'BOOK_RESOURCE', 'Booking', booking.id, {
    resource: resource.name,
    assetTag: resource.assetTag,
    startTime: startTime.toISOString(),
    endTime: endTime.toISOString(),
  });

  return serializeBooking(booking);
}

export async function updateBooking(
  session: SessionUser,
  bookingId: string,
  input: z.infer<typeof updateBookingSchema>
) {
  requireBooker(session);

  const booking = await db.booking.findUnique({
    where: { id: bookingId },
    include: {
      asset: { select: { id: true, assetTag: true, name: true, location: true } },
      bookedBy: { select: { id: true, name: true, email: true } },
    },
  });

  if (!booking) {
    throw new BookingError('Booking not found.', 404);
  }

  const canManageAny = session.role === 'ADMIN' || session.role === 'ASSET_MANAGER';
  if (!canManageAny && booking.bookedById !== session.userId) {
    throw new BookingError('You can only update your own bookings.', 403);
  }

  if (input.action === 'CANCEL') {
    const cancelled = await db.booking.update({
      where: { id: bookingId },
      data: { status: BookingStatus.CANCELLED },
      include: {
        asset: { select: { id: true, assetTag: true, name: true, location: true } },
        bookedBy: { select: { id: true, name: true, email: true } },
      },
    });

    await notify(session.userId, 'BOOKING_CANCELLED', `Booking cancelled: ${booking.asset.name}.`);
    await logActivity(session.userId, 'CANCEL_BOOKING', 'Booking', bookingId, {
      resource: booking.asset.name,
    });

    return serializeBooking(cancelled);
  }

  const startTime = new Date(input.startTime);
  const endTime = new Date(input.endTime);
  assertTimeRange(startTime, endTime);
  await assertNoOverlap(booking.assetId, startTime, endTime, booking.id);

  const rescheduled = await db.booking.update({
    where: { id: bookingId },
    data: {
      startTime,
      endTime,
      purpose: input.purpose ?? booking.purpose,
      status: BookingStatus.UPCOMING,
    },
    include: {
      asset: { select: { id: true, assetTag: true, name: true, location: true } },
      bookedBy: { select: { id: true, name: true, email: true } },
    },
  });

  await notify(session.userId, 'BOOKING_CONFIRMED', `Booking rescheduled: ${booking.asset.name}.`);
  await logActivity(session.userId, 'RESCHEDULE_BOOKING', 'Booking', bookingId, {
    resource: booking.asset.name,
    startTime: startTime.toISOString(),
    endTime: endTime.toISOString(),
  });

  return serializeBooking(rescheduled);
}
