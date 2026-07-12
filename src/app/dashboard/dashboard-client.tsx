'use client';

import Link from 'next/link';
import useSWR from 'swr';
import {
  AlertTriangle,
  BookOpenCheck,
  LayoutDashboard,
  LogOut,
  Plus,
  RefreshCw,
  Wrench,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Navbar } from '@/components/navbar';

type DashboardData = {
  user: { name: string; email: string; role: string; department: string };
  kpis: Record<string, number>;
  upcomingReturns: Array<{ id: string; expectedReturnDate: string | null; asset: { assetTag: string; name: string }; holder: { name: string } | null; department: { name: string } | null }>;
  overdueReturns: Array<{ id: string; expectedReturnDate: string | null; asset: { assetTag: string; name: string }; holder: { name: string } | null; department: { name: string } | null }>;
  recentActivity: Array<{ id: string; action: string; entityType: string; createdAt: string; user: { name: string } | null }>;
  refreshedAt: string;
};

const fetcher = async (url: string) => {
  const response = await fetch(url);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Request failed.');
  return data;
};

function labelFor(key: string) {
  return key
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, (char) => char.toUpperCase());
}

function dateLabel(value: string | null) {
  return value ? new Date(value).toLocaleDateString() : 'No date';
}

export function DashboardClient() {
  const { data, error } = useSWR<DashboardData>('/api/dashboard', fetcher, {
    refreshInterval: 7000,
    revalidateOnFocus: true,
  });

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    window.location.href = '/login';
  }

  const kpis = data?.kpis ?? {};

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans">
      <Navbar activePath="/dashboard" />

      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-white">
              Welcome back, {data?.user.name ?? 'AssetFlow user'}
            </h1>
            <p className="mt-2 text-sm text-slate-400">
              {data?.user.role ?? ''} | {data?.user.department ?? ''}
            </p>
          </div>
          <div className="flex items-center gap-2 rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-xs text-slate-400">
            <RefreshCw className="h-3.5 w-3.5 text-emerald-400" />
            Live dashboard polling every 7s
          </div>
        </div>

        {error ? <p className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">{error.message}</p> : null}

        <section className="mb-6 grid gap-4 md:grid-cols-2 xl:grid-cols-7">
          {Object.entries(kpis).map(([key, value]) => (
            <Card key={key} className={`border-slate-800 bg-slate-900/40 text-slate-100 ${key === 'overdueReturns' ? 'ring-1 ring-red-500/40' : ''}`}>
              <CardContent className="p-4">
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{labelFor(key)}</div>
                <div className={`mt-3 text-3xl font-extrabold ${key === 'overdueReturns' ? 'text-red-300' : 'text-white'}`}>{value}</div>
              </CardContent>
            </Card>
          ))}
        </section>

        <section className="mb-6 grid gap-4 md:grid-cols-3">
          <Link href="/assets" className="rounded-xl border border-slate-800 bg-indigo-600 p-4 text-white hover:bg-indigo-500"><Plus className="mb-3 h-5 w-5" />Register Asset</Link>
          <Link href="/resource-booking" className="rounded-xl border border-slate-800 bg-slate-900 p-4 text-slate-100 hover:bg-slate-800"><BookOpenCheck className="mb-3 h-5 w-5 text-indigo-400" />Book Resource</Link>
          <Link href="/maintenance" className="rounded-xl border border-slate-800 bg-slate-900 p-4 text-slate-100 hover:bg-slate-800"><Wrench className="mb-3 h-5 w-5 text-indigo-400" />Raise Maintenance Request</Link>
        </section>

        <div className="grid gap-6 xl:grid-cols-[1fr_1fr]">
          <Card className="border-red-500/30 bg-red-500/5 text-slate-100">
            <CardHeader><CardTitle className="flex items-center gap-2 text-red-200"><AlertTriangle className="h-5 w-5" />Overdue Returns</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {data?.overdueReturns.length === 0 ? <p className="text-sm text-slate-400">No overdue returns.</p> : null}
              {data?.overdueReturns.map((item) => (
                <div key={item.id} className="rounded-lg border border-red-500/20 bg-slate-950 p-3 text-sm">
                  <strong className="text-red-200">{item.asset.assetTag}</strong> {item.asset.name}
                  <div className="text-xs text-slate-400">Holder: {item.holder?.name || item.department?.name || 'Unassigned'} | Due {dateLabel(item.expectedReturnDate)}</div>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="border-slate-800 bg-slate-900/40 text-slate-100">
            <CardHeader><CardTitle>Upcoming Returns</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {data?.upcomingReturns.length === 0 ? <p className="text-sm text-slate-400">No upcoming returns.</p> : null}
              {data?.upcomingReturns.map((item) => (
                <div key={item.id} className="rounded-lg border border-slate-800 bg-slate-950 p-3 text-sm">
                  <strong className="text-indigo-300">{item.asset.assetTag}</strong> {item.asset.name}
                  <div className="text-xs text-slate-400">Holder: {item.holder?.name || item.department?.name || 'Unassigned'} | Due {dateLabel(item.expectedReturnDate)}</div>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="border-slate-800 bg-slate-900/40 text-slate-100 xl:col-span-2">
            <CardHeader><CardTitle>Recent Activity</CardTitle></CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-2">
              {data?.recentActivity.map((activity) => (
                <div key={activity.id} className="rounded-lg border border-slate-800 bg-slate-950 p-3 text-sm">
                  <div className="font-semibold text-white">{activity.action.replaceAll('_', ' ')}</div>
                  <div className="text-xs text-slate-400">{activity.user?.name || 'System'} | {activity.entityType} | {new Date(activity.createdAt).toLocaleString()}</div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
