import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { notify, logActivity } from '@/lib/notifications';

// GET: List bookings
export async function GET(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(req.url);
    const assetId = searchParams.get('assetId') || '';
    const status = searchParams.get('status') || '';
    const dateFrom = searchParams.get('dateFrom') || '';
    const dateTo = searchParams.get('dateTo') || '';

    const where: any = {};

    // Role-based: employees see only their bookings
    if (session.role === 'EMPLOYEE') {
      where.bookedById = session.userId;
    } else if (session.role === 'DEPARTMENT_HEAD') {
      const dept = await db.department.findFirst({
        where: { headId: session.userId },
        select: { id: true },
      });
      if (dept) {
        where.OR = [
          { bookedById: session.userId },
          { asset: { departmentId: dept.id } },
        ];
      } else {
        where.bookedById = session.userId;
      }
    }
    // ADMIN and ASSET_MANAGER see all

    if (assetId) {
      where.assetId = assetId;
    }

    if (status) {
      where.status = status;
    }

    if (dateFrom || dateTo) {
      where.startTime = {};
      if (dateFrom) where.startTime.gte = new Date(dateFrom);
      if (dateTo) where.startTime.lte = new Date(dateTo);
    }

    const bookings = await db.booking.findMany({
      where,
      include: {
        asset: { select: { id: true, name: true, assetTag: true, location: true } },
        bookedBy: { select: { id: true, name: true, email: true } },
      },
      orderBy: { startTime: 'desc' },
    });

    // Also return list of bookable assets for the booking form
    const bookableAssets = await db.asset.findMany({
      where: { isBookable: true, status: { in: ['AVAILABLE', 'ALLOCATED'] } },
      select: { id: true, name: true, assetTag: true, location: true },
      orderBy: { name: 'asc' },
    });

    return NextResponse.json({ bookings, bookableAssets });
  } catch (error) {
    console.error('Fetch bookings error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

// POST: Create a new booking
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { assetId, startTime, endTime, purpose } = body;

    if (!assetId || !startTime || !endTime) {
      return NextResponse.json(
        { error: 'Asset, start time, and end time are required.' },
        { status: 400 }
      );
    }

    const start = new Date(startTime);
    const end = new Date(endTime);

    if (end <= start) {
      return NextResponse.json(
        { error: 'End time must be after start time.' },
        { status: 400 }
      );
    }

    // Verify asset exists and is bookable
    const asset = await db.asset.findUnique({
      where: { id: assetId },
      select: { id: true, name: true, assetTag: true, isBookable: true },
    });

    if (!asset) {
      return NextResponse.json({ error: 'Asset not found.' }, { status: 404 });
    }

    if (!asset.isBookable) {
      return NextResponse.json(
        { error: 'This asset is not marked as bookable.' },
        { status: 400 }
      );
    }

    // Check for overlapping bookings (active/upcoming only)
    const overlap = await db.booking.findFirst({
      where: {
        assetId,
        status: { in: ['UPCOMING', 'ONGOING'] },
        startTime: { lt: end },
        endTime: { gt: start },
      },
    });

    if (overlap) {
      return NextResponse.json(
        { error: 'Conflict: This asset is already booked during the selected time slot.' },
        { status: 409 }
      );
    }

    const booking = await db.booking.create({
      data: {
        assetId,
        bookedById: session.userId,
        startTime: start,
        endTime: end,
        purpose: purpose || null,
        status: 'UPCOMING',
      },
      include: {
        asset: { select: { name: true, assetTag: true } },
        bookedBy: { select: { name: true } },
      },
    });

    await notify(
      session.userId,
      'BOOKING_CONFIRMED',
      `Your booking for ${asset.name} (${asset.assetTag}) from ${start.toLocaleString()} to ${end.toLocaleString()} has been confirmed.`
    );

    await logActivity(session.userId, 'CREATE_BOOKING', 'Booking', booking.id, {
      assetId,
      startTime: start.toISOString(),
      endTime: end.toISOString(),
    });

    return NextResponse.json({ booking }, { status: 201 });
  } catch (error) {
    console.error('Create booking error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

// PATCH: Cancel a booking
export async function PATCH(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { id, action } = body;

    if (!id || action !== 'CANCEL') {
      return NextResponse.json({ error: 'Booking ID and CANCEL action are required.' }, { status: 400 });
    }

    const booking = await db.booking.findUnique({
      where: { id },
      include: {
        asset: { select: { id: true, name: true, assetTag: true } },
        bookedBy: { select: { id: true, name: true } },
      },
    });

    if (!booking) {
      return NextResponse.json({ error: 'Booking not found.' }, { status: 404 });
    }

    // Only the booker or an admin can cancel
    if (booking.bookedById !== session.userId && session.role !== 'ADMIN' && session.role !== 'ASSET_MANAGER') {
      return NextResponse.json({ error: 'Forbidden: You can only cancel your own bookings.' }, { status: 403 });
    }

    if (booking.status !== 'UPCOMING') {
      return NextResponse.json({ error: 'Only UPCOMING bookings can be cancelled.' }, { status: 400 });
    }

    await db.booking.update({
      where: { id },
      data: { status: 'CANCELLED' },
    });

    await notify(
      booking.bookedById,
      'BOOKING_CANCELLED',
      `Your booking for ${booking.asset.name} (${booking.asset.assetTag}) has been cancelled.`
    );

    await logActivity(session.userId, 'CANCEL_BOOKING', 'Booking', id, {
      assetId: booking.assetId,
    });

    return NextResponse.json({ success: true, status: 'CANCELLED' });
  } catch (error) {
    console.error('Cancel booking error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
