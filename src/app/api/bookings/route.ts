import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { getSession } from '@/lib/auth';
import {
  BookingError,
  bookingQuerySchema,
  createBooking,
  createBookingSchema,
  listBookingBoard,
} from '@/lib/services/bookingService';

function validationResponse(error: ZodError) {
  return NextResponse.json({ error: error.issues[0]?.message ?? 'Invalid input.' }, { status: 400 });
}

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const parsed = bookingQuerySchema.safeParse({
    assetId: searchParams.get('assetId') || undefined,
    date: searchParams.get('date') || undefined,
  });

  if (!parsed.success) return validationResponse(parsed.error);

  try {
    return NextResponse.json(await listBookingBoard(parsed.data));
  } catch (error) {
    console.error('List bookings error:', error);
    return NextResponse.json({ error: 'Unable to load bookings.' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json().catch(() => null);
  const parsed = createBookingSchema.safeParse(body);
  if (!parsed.success) return validationResponse(parsed.error);

  try {
    const booking = await createBooking(session, parsed.data);
    return NextResponse.json({ booking }, { status: 201 });
  } catch (error) {
    if (error instanceof BookingError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error('Create booking error:', error);
    return NextResponse.json({ error: 'Unable to create booking.' }, { status: 500 });
  }
}
