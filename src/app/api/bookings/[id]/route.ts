import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { getSession } from '@/lib/auth';
import { BookingError, updateBooking, updateBookingSchema } from '@/lib/services/bookingService';

function validationResponse(error: ZodError) {
  return NextResponse.json({ error: error.issues[0]?.message ?? 'Invalid input.' }, { status: 400 });
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json().catch(() => null);
  const parsed = updateBookingSchema.safeParse(body);
  if (!parsed.success) return validationResponse(parsed.error);

  try {
    const { id } = await context.params;
    const booking = await updateBooking(session, id, parsed.data);
    return NextResponse.json({ booking });
  } catch (error) {
    if (error instanceof BookingError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error('Update booking error:', error);
    return NextResponse.json({ error: 'Unable to update booking.' }, { status: 500 });
  }
}
