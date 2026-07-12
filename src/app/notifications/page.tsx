import Link from 'next/link';
import { redirect } from 'next/navigation';
import {
  Activity,
  Bell,
  BookOpenCheck,
  Check,
  CircleAlert,
  ClipboardList,
  LayoutDashboard,
  LogOut,
  Settings,
} from 'lucide-react';
import { clearSessionCookie, getSession } from '@/lib/auth';
import { db } from '@/lib/db';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { markAllNotificationsRead, markNotificationRead } from './actions';
import { Sidebar } from '@/components/sidebar';

export const dynamic = 'force-dynamic';

type NotificationTab = 'all' | 'alerts' | 'approvals' | 'bookings';

const tabs: Array<{ key: NotificationTab; label: string; types?: string[] }> = [
  { key: 'all', label: 'All' },
  { key: 'alerts', label: 'Alerts', types: ['OVERDUE_RETURN', 'AUDIT_DISCREPANCY'] },
  {
    key: 'approvals',
    label: 'Approvals',
    types: ['MAINTENANCE_APPROVED', 'MAINTENANCE_REJECTED', 'TRANSFER_APPROVED'],
  },
  { key: 'bookings', label: 'Bookings', types: ['BOOKING_CONFIRMED', 'BOOKING_CANCELLED'] },
];

const typeLabels: Record<string, string> = {
  ASSET_ASSIGNED: 'Asset assigned',
  MAINTENANCE_APPROVED: 'Maintenance approved',
  MAINTENANCE_REJECTED: 'Maintenance rejected',
  BOOKING_CONFIRMED: 'Booking confirmed',
  BOOKING_CANCELLED: 'Booking cancelled',
  TRANSFER_APPROVED: 'Transfer approved',
  OVERDUE_RETURN: 'Overdue return',
  AUDIT_DISCREPANCY: 'Audit discrepancy',
};

const typeTone: Record<string, string> = {
  OVERDUE_RETURN: 'border-red-500/40 bg-red-500/10 text-red-100',
  AUDIT_DISCREPANCY: 'border-red-500/40 bg-red-500/10 text-red-100',
  MAINTENANCE_REJECTED: 'border-red-500/40 bg-red-500/10 text-red-100',
  BOOKING_CONFIRMED: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-100',
  TRANSFER_APPROVED: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-100',
  MAINTENANCE_APPROVED: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-100',
  BOOKING_CANCELLED: 'border-amber-500/40 bg-amber-500/10 text-amber-100',
  ASSET_ASSIGNED: 'border-slate-800 bg-slate-900/60 text-slate-100',
};

function formatRelative(date: Date) {
  const diffMs = Date.now() - date.getTime();
  const minutes = Math.max(1, Math.round(diffMs / 60000));
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  return `${Math.round(hours / 24)}d ago`;
}

function getIcon(type: string) {
  if (type === 'OVERDUE_RETURN' || type === 'AUDIT_DISCREPANCY') return CircleAlert;
  if (type.includes('BOOKING')) return BookOpenCheck;
  if (type.includes('APPROVED') || type.includes('REJECTED')) return Check;
  return Bell;
}

function detailsPreview(details: unknown) {
  if (!details || typeof details !== 'object') return null;

  return Object.entries(details as Record<string, unknown>)
    .map(([key, value]) => `${key}: ${String(value)}`)
    .join(' | ');
}

export default async function NotificationsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: NotificationTab }>;
}) {
  const session = await getSession();

  if (!session) {
    redirect('/login');
  }

  const user = await db.user.findUnique({
    where: { id: session.userId },
    include: { department: true },
  });

  if (!user || user.status !== 'ACTIVE') {
    redirect('/login');
  }

  const { tab: requestedTab } = await searchParams;
  const activeTab = tabs.some((item) => item.key === requestedTab) ? requestedTab ?? 'all' : 'all';
  const tabConfig = tabs.find((item) => item.key === activeTab) ?? tabs[0];

  const [notifications, unreadCount, activityLogs] = await Promise.all([
    db.notification.findMany({
      where: {
        userId: user.id,
        ...(tabConfig.types ? { type: { in: tabConfig.types } } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    }),
    db.notification.count({
      where: {
        userId: user.id,
        isRead: false,
      },
    }),
    user.role === 'ADMIN'
      ? db.activityLog.findMany({
          include: {
            user: {
              select: {
                name: true,
                email: true,
                role: true,
              },
            },
          },
          orderBy: { createdAt: 'desc' },
        })
      : Promise.resolve([]),
  ]);

  return (
    <div className="flex min-h-screen bg-slate-950 text-slate-100 font-sans">
      <Sidebar activePath="/notifications" />

      <main className="flex-1 px-8 py-8 overflow-auto">
        <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-indigo-400">Screen 10</p>
            <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-white">
              Activity Logs & Notifications
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">
              Role-aware updates for bookings, approvals, overdue returns, and audit discrepancies.
            </p>
          </div>
          <form action={markAllNotificationsRead}>
            <Button className="bg-indigo-600 text-white hover:bg-indigo-500">
              <Check className="mr-2 h-4 w-4" />
              Mark all read
              {unreadCount > 0 ? <span className="ml-1 text-indigo-100">({unreadCount})</span> : null}
            </Button>
          </form>
        </div>

        <div className="mb-6 flex flex-wrap gap-2">
          {tabs.map((item) => (
            <Link
              key={item.key}
              href={`/notifications?tab=${item.key}`}
              className={[
                'rounded-lg border px-4 py-2 text-sm font-semibold transition-all',
                activeTab === item.key
                  ? 'border-indigo-500 bg-indigo-600/20 text-white'
                  : 'border-slate-800 bg-slate-900/60 text-slate-400 hover:text-white',
              ].join(' ')}
            >
              {item.label}
            </Link>
          ))}
        </div>

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_28rem]">
          <section className="space-y-3">
            {notifications.length === 0 ? (
              <Card className="border-slate-800 bg-slate-900/40 text-slate-100">
                <CardContent className="p-8 text-sm text-slate-400">
                  No notifications match this filter.
                </CardContent>
              </Card>
            ) : (
              notifications.map((notification) => {
                const Icon = getIcon(notification.type);
                return (
                  <article
                    key={notification.id}
                    className={[
                      'rounded-xl border p-4 shadow-md',
                      typeTone[notification.type] ?? 'border-slate-800 bg-slate-900/60 text-slate-100',
                      notification.isRead ? 'opacity-70' : 'ring-1 ring-indigo-400/25',
                    ].join(' ')}
                  >
                    <div className="flex gap-3">
                      <div className="mt-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-current/30 bg-black/20">
                        <Icon className="h-5 w-5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
                          <p className="text-sm font-bold">
                            {typeLabels[notification.type] ?? notification.type}
                          </p>
                          <p className="text-xs text-slate-400">{formatRelative(notification.createdAt)}</p>
                        </div>
                        <p className="mt-2 text-sm leading-6 text-white">{notification.message}</p>
                        <div className="mt-3 flex items-center justify-between gap-3">
                          <span className="text-xs text-slate-400">
                            {notification.isRead ? 'Read' : 'Unread'}
                          </span>
                          {!notification.isRead ? (
                            <form action={markNotificationRead.bind(null, notification.id)}>
                              <Button size="sm" className="h-8 bg-slate-800 text-white hover:bg-slate-700">
                                <Check className="mr-2 h-3.5 w-3.5" />
                                Mark read
                              </Button>
                            </form>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  </article>
                );
              })
            )}
          </section>

          <section>
            <Card className="border-slate-800 bg-slate-900/40 text-slate-100">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Activity className="h-5 w-5 text-indigo-400" />
                  Admin Activity Log
                </CardTitle>
              </CardHeader>
              <CardContent>
                {user.role !== 'ADMIN' ? (
                  <p className="text-sm leading-6 text-slate-400">
                    Full activity logs are visible to Admin users only. Current role: {user.role}.
                  </p>
                ) : activityLogs.length === 0 ? (
                  <p className="text-sm text-slate-400">No activity has been recorded yet.</p>
                ) : (
                  <ol className="max-h-[42rem] divide-y divide-slate-800 overflow-y-auto">
                    {activityLogs.map((log) => (
                      <li key={log.id} className="py-4">
                        <div className="flex items-start gap-3">
                          <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-800 bg-slate-950">
                            <ClipboardList className="h-4 w-4 text-indigo-400" />
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-bold text-white">{log.action.replaceAll('_', ' ')}</p>
                            <p className="mt-1 text-xs leading-5 text-slate-400">
                              {log.user?.name ?? 'System'} did this on {log.entityType}{' '}
                              <span className="font-mono">{log.entityId}</span>
                            </p>
                            {detailsPreview(log.details) ? (
                              <p className="mt-2 break-words rounded-lg border border-slate-800 bg-slate-950 p-2 text-xs text-slate-400">
                                {detailsPreview(log.details)}
                              </p>
                            ) : null}
                            <p className="mt-2 text-xs text-slate-500">{formatRelative(log.createdAt)}</p>
                          </div>
                        </div>
                      </li>
                    ))}
                  </ol>
                )}
              </CardContent>
            </Card>
          </section>
        </div>
      </main>
    </div>
  );
}
