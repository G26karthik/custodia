'use client';

import Link from 'next/link';
import useSWR from 'swr';
import { useMemo, useState } from 'react';
import {
  Bell,
  BookOpenCheck,
  CalendarDays,
  CheckCircle2,
  Clock,
  LayoutDashboard,
  Loader2,
  LogOut,
  Pencil,
  Plus,
  RefreshCw,
  XCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Sidebar } from '@/components/sidebar';

type UserSummary = {
  id: string;
  name: string;
  email: string;
  role: string;
  status: string;
};

type Resource = {
  id: string;
  assetTag: string;
  name: string;
  location: string | null;
  status: string;
};

type Booking = {
  id: string;
  assetId: string;
  bookedById: string;
  startTime: string;
  endTime: string;
  purpose: string | null;
  status: 'UPCOMING' | 'ONGOING' | 'COMPLETED' | 'CANCELLED';
  asset: Resource;
  bookedBy: {
    id: string;
    name: string;
    email: string;
  };
};

type BoardResponse = {
  selectedDate: string;
  selectedResourceId: string | null;
  resources: Resource[];
  bookings: Booking[];
  refreshedAt: string;
};

const fetcher = async (url: string) => {
  const response = await fetch(url);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Request failed.');
  return data;
};

function todayInputValue() {
  return new Date().toISOString().slice(0, 10);
}

function toDateTimeIso(date: string, time: string) {
  return new Date(`${date}T${time}:00`).toISOString();
}

function toTimeInputValue(value: string) {
  const date = new Date(value);
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function timeLabel(value: string) {
  return new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function statusClass(status: Booking['status']) {
  switch (status) {
    case 'ONGOING':
      return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300';
    case 'COMPLETED':
      return 'border-slate-700 bg-slate-800 text-slate-300';
    case 'CANCELLED':
      return 'border-red-500/30 bg-red-500/10 text-red-300';
    default:
      return 'border-indigo-500/30 bg-indigo-500/10 text-indigo-300';
  }
}

function bookingPosition(startTime: string, endTime: string) {
  const start = new Date(startTime);
  const end = new Date(endTime);
  const startMinutes = start.getHours() * 60 + start.getMinutes();
  const endMinutes = end.getHours() * 60 + end.getMinutes();
  const dayStart = 8 * 60;
  const dayEnd = 18 * 60;
  const total = dayEnd - dayStart;
  const left = Math.max(0, ((startMinutes - dayStart) / total) * 100);
  const width = Math.max(8, ((endMinutes - startMinutes) / total) * 100);
  return { left: `${left}%`, width: `${Math.min(width, 100 - left)}%` };
}

export function ResourceBookingClient({ user }: { user: UserSummary }) {
  const [date, setDate] = useState(todayInputValue());
  const [assetId, setAssetId] = useState('');
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('10:00');
  const [purpose, setPurpose] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const query = useMemo(() => {
    const params = new URLSearchParams({ date });
    if (assetId) params.set('assetId', assetId);
    return `/api/bookings?${params.toString()}`;
  }, [assetId, date]);

  const { data, isLoading, mutate, error: loadError } = useSWR<BoardResponse>(query, fetcher, {
    refreshInterval: 7000,
    revalidateOnFocus: true,
  });

  const selectedResourceId = assetId || data?.selectedResourceId || '';
  const selectedResource = data?.resources.find((resource) => resource.id === selectedResourceId);

  async function submitBooking(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setMessage('');
    setSubmitting(true);

    if (!selectedResourceId) {
      setError('Select a bookable resource first.');
      setSubmitting(false);
      return;
    }

    const body = editingId
      ? {
          action: 'RESCHEDULE',
          startTime: toDateTimeIso(date, startTime),
          endTime: toDateTimeIso(date, endTime),
          purpose,
        }
      : {
          assetId: selectedResourceId,
          startTime: toDateTimeIso(date, startTime),
          endTime: toDateTimeIso(date, endTime),
          purpose,
        };

    try {
      const response = await fetch(editingId ? `/api/bookings/${editingId}` : '/api/bookings', {
        method: editingId ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Unable to save booking.');

      setMessage(editingId ? 'Booking rescheduled.' : 'Booking confirmed.');
      setPurpose('');
      setEditingId(null);
      await mutate();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save booking.');
    } finally {
      setSubmitting(false);
    }
  }

  async function cancelBooking(bookingId: string) {
    setError('');
    setMessage('');
    const response = await fetch(`/api/bookings/${bookingId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'CANCEL' }),
    });
    const result = await response.json();
    if (!response.ok) {
      setError(result.error || 'Unable to cancel booking.');
      return;
    }
    setMessage('Booking cancelled.');
    await mutate();
  }

  function startReschedule(booking: Booking) {
    setEditingId(booking.id);
    setStartTime(toTimeInputValue(booking.startTime));
    setEndTime(toTimeInputValue(booking.endTime));
    setPurpose(booking.purpose || '');
    setMessage('');
    setError('');
  }

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    window.location.href = '/login';
  }

  return (
    <div className="flex min-h-screen bg-slate-950 text-slate-100 font-sans">
      <Sidebar activePath="/resource-booking" />

      <main className="flex-1 px-8 py-8 overflow-auto">
        <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-white">Resource Booking</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">
              Live-updating calendar for shared rooms, vehicles, and equipment with strict overlap prevention.
            </p>
          </div>
          <div className="flex items-center gap-2 rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-xs text-slate-400">
            <RefreshCw className="h-3.5 w-3.5 text-emerald-400" />
            Polling every 7s
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-[23rem_1fr]">
          <Card className="border-slate-800 bg-slate-900/40 text-slate-100">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Plus className="h-5 w-5 text-indigo-400" />
                {editingId ? 'Reschedule booking' : 'Book a slot'}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={submitBooking} className="space-y-4">
                <div className="space-y-2">
                  <label className="text-xs font-semibold uppercase tracking-wide text-slate-400">Resource</label>
                  <select
                    value={selectedResourceId}
                    onChange={(event) => setAssetId(event.target.value)}
                    className="h-10 w-full rounded-lg border border-slate-800 bg-slate-950 px-3 text-sm text-slate-100 outline-none focus:border-indigo-500"
                  >
                    {!data?.resources.length ? <option value="">No bookable resources</option> : null}
                    {data?.resources.map((resource) => (
                      <option key={resource.id} value={resource.id}>
                        {resource.name} ({resource.assetTag})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-semibold uppercase tracking-wide text-slate-400">Date</label>
                  <Input type="date" value={date} onChange={(event) => setDate(event.target.value)} className="h-10 border-slate-800 bg-slate-950 text-slate-100" />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <label className="text-xs font-semibold uppercase tracking-wide text-slate-400">Start</label>
                    <Input type="time" value={startTime} onChange={(event) => setStartTime(event.target.value)} className="h-10 border-slate-800 bg-slate-950 text-slate-100" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-semibold uppercase tracking-wide text-slate-400">End</label>
                    <Input type="time" value={endTime} onChange={(event) => setEndTime(event.target.value)} className="h-10 border-slate-800 bg-slate-950 text-slate-100" />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-semibold uppercase tracking-wide text-slate-400">Purpose</label>
                  <Input value={purpose} onChange={(event) => setPurpose(event.target.value)} placeholder="Team planning, client review..." className="h-10 border-slate-800 bg-slate-950 text-slate-100" />
                </div>

                {error ? <p className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">{error}</p> : null}
                {loadError ? <p className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">{loadError.message}</p> : null}
                {message ? <p className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-200">{message}</p> : null}

                <div className="flex gap-2">
                  <Button disabled={submitting || !selectedResourceId} className="h-10 flex-1 bg-indigo-600 text-white hover:bg-indigo-500">
                    {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
                    {editingId ? 'Save changes' : 'Confirm booking'}
                  </Button>
                  {editingId ? (
                    <Button type="button" onClick={() => setEditingId(null)} className="h-10 bg-slate-800 text-slate-300 hover:bg-slate-700">
                      Clear
                    </Button>
                  ) : null}
                </div>
              </form>
            </CardContent>
          </Card>

          <section className="space-y-6">
            <Card className="border-slate-800 bg-slate-900/40 text-slate-100">
              <CardHeader>
                <CardTitle className="flex items-center justify-between gap-3">
                  <span className="flex items-center gap-2">
                    <CalendarDays className="h-5 w-5 text-indigo-400" />
                    {selectedResource?.name || 'Booking timeline'}
                  </span>
                  <span className="text-xs font-normal text-slate-500">
                    {data?.refreshedAt ? `Updated ${new Date(data.refreshedAt).toLocaleTimeString()}` : ''}
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="mb-4 flex items-center justify-between rounded-lg border border-slate-800 bg-slate-950/60 p-3 text-sm text-slate-400">
                  <span>{selectedResource?.location || 'No location set'}</span>
                  <span>{selectedResource?.assetTag || ''}</span>
                </div>

                <div className="relative h-32 rounded-xl border border-slate-800 bg-slate-950 p-4">
                  <div className="absolute inset-x-4 top-14 h-px bg-slate-800" />
                  <div className="grid grid-cols-6 text-xs text-slate-500">
                    {['8 AM', '10 AM', '12 PM', '2 PM', '4 PM', '6 PM'].map((label) => (
                      <span key={label}>{label}</span>
                    ))}
                  </div>
                  {isLoading ? (
                    <div className="mt-8 flex items-center justify-center text-sm text-slate-500">
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Loading bookings...
                    </div>
                  ) : (
                    data?.bookings.map((booking) => {
                      const position = bookingPosition(booking.startTime, booking.endTime);
                      return (
                        <div
                          key={booking.id}
                          style={position}
                          className={`absolute top-16 min-w-28 rounded-lg border px-3 py-2 text-xs shadow-lg ${statusClass(booking.status)}`}
                          title={`${timeLabel(booking.startTime)} - ${timeLabel(booking.endTime)}`}
                        >
                          <div className="truncate font-semibold">{booking.purpose || 'Reserved'}</div>
                          <div className="truncate opacity-80">
                            {timeLabel(booking.startTime)} - {timeLabel(booking.endTime)}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </CardContent>
            </Card>

            <Card className="border-slate-800 bg-slate-900/40 text-slate-100">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Clock className="h-5 w-5 text-indigo-400" />
                  Existing bookings
                </CardTitle>
              </CardHeader>
              <CardContent>
                {!data?.bookings.length ? (
                  <p className="rounded-lg border border-slate-800 bg-slate-950 p-5 text-sm text-slate-500">
                    No bookings for this resource on the selected date.
                  </p>
                ) : (
                  <div className="space-y-3">
                    {data.bookings.map((booking) => {
                      const canEdit = booking.bookedById === user.id || user.role === 'ADMIN' || user.role === 'ASSET_MANAGER';
                      return (
                        <article key={booking.id} className="rounded-xl border border-slate-800 bg-slate-950/70 p-4">
                          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                            <div>
                              <div className="flex items-center gap-2">
                                <span className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${statusClass(booking.status)}`}>
                                  {booking.status}
                                </span>
                                <span className="text-sm font-semibold text-white">{booking.purpose || 'Reserved slot'}</span>
                              </div>
                              <p className="mt-2 text-sm text-slate-400">
                                {timeLabel(booking.startTime)} - {timeLabel(booking.endTime)} by {booking.bookedBy.name}
                              </p>
                            </div>
                            {canEdit && booking.status !== 'CANCELLED' && booking.status !== 'COMPLETED' ? (
                              <div className="flex gap-2">
                                <Button size="sm" onClick={() => startReschedule(booking)} className="bg-slate-800 text-slate-300 hover:bg-slate-700">
                                  <Pencil className="mr-2 h-3.5 w-3.5" />
                                  Reschedule
                                </Button>
                                <Button size="sm" onClick={() => cancelBooking(booking.id)} className="bg-red-500/10 text-red-300 hover:bg-red-500/20">
                                  <XCircle className="mr-2 h-3.5 w-3.5" />
                                  Cancel
                                </Button>
                              </div>
                            ) : null}
                          </div>
                        </article>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </section>
        </div>
      </main>
    </div>
  );
}
