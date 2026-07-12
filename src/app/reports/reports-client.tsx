'use client';

import Link from 'next/link';
import useSWR from 'swr';
import { BarChart3, Bell, Download, LayoutDashboard, Loader2, TrendingUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Navbar } from '@/components/navbar';

type ReportData = {
  utilizationByDepartment: Array<{ id: string; name: string; totalAssets: number; activeAllocations: number; utilization: number }>;
  maintenanceByMonth: Array<{ month: string; count: number }>;
  mostUsedAssets: Array<{ assetTag: string; name: string; count: number }>;
  idleAssets: Array<{ assetTag: string; name: string; status: string; daysIdle: number }>;
  maintenanceRisk: Array<{ assetTag: string; name: string; category: string; ageDays: number; daysSinceMaintenance: number; score: number }>;
  bookingHeatmap: Array<{ hour: string; count: number }>;
  refreshedAt: string;
};

const fetcher = async (url: string) => {
  const response = await fetch(url);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Request failed.');
  return data;
};

function maxValue(values: number[]) {
  return Math.max(1, ...values);
}

function Bar({ value, max, tone = 'bg-indigo-500' }: { value: number; max: number; tone?: string }) {
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-slate-800">
      <div className={`h-full rounded-full ${tone}`} style={{ width: `${Math.max(4, (value / max) * 100)}%` }} />
    </div>
  );
}

export function ReportsClient() {
  const { data, isLoading, error } = useSWR<ReportData>('/api/reports', fetcher, {
    refreshInterval: 10000,
    revalidateOnFocus: true,
  });

  const utilizationMax = maxValue(data?.utilizationByDepartment.map((row) => row.utilization) ?? []);
  const maintenanceMax = maxValue(data?.maintenanceByMonth.map((row) => row.count) ?? []);
  const bookingMax = maxValue(data?.bookingHeatmap.map((row) => row.count) ?? []);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans">
      <Navbar activePath="/reports" />

      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-white">Reports & Analytics</h1>
            <p className="mt-2 text-sm text-slate-400">Operational insight for utilization, maintenance, idle assets, and booking demand.</p>
          </div>
          <a href="/api/reports?format=csv">
            <Button className="h-10 bg-indigo-600 text-white hover:bg-indigo-500">
              <Download className="mr-2 h-4 w-4" />
              Export CSV
            </Button>
          </a>
        </div>

        {error ? <p className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">{error.message}</p> : null}
        {isLoading ? (
          <div className="flex items-center text-sm text-slate-400"><Loader2 className="mr-2 h-4 w-4 animate-spin" />Loading reports...</div>
        ) : null}

        {data ? (
          <div className="grid gap-6 lg:grid-cols-2">
            <Card className="border-slate-800 bg-slate-900/40 text-slate-100">
              <CardHeader><CardTitle>Utilization by Department</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                {data.utilizationByDepartment.map((row) => (
                  <div key={row.id} className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span>{row.name}</span>
                      <span className="text-slate-400">{row.activeAllocations}/{row.totalAssets} assets | {row.utilization}%</span>
                    </div>
                    <Bar value={row.utilization} max={utilizationMax} tone="bg-emerald-500" />
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card className="border-slate-800 bg-slate-900/40 text-slate-100">
              <CardHeader><CardTitle>Maintenance Frequency</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                {data.maintenanceByMonth.length === 0 ? <p className="text-sm text-slate-400">No maintenance requests yet.</p> : null}
                {data.maintenanceByMonth.map((row) => (
                  <div key={row.month} className="space-y-2">
                    <div className="flex justify-between text-sm"><span>{row.month}</span><span className="text-slate-400">{row.count}</span></div>
                    <Bar value={row.count} max={maintenanceMax} />
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card className="border-slate-800 bg-slate-900/40 text-slate-100">
              <CardHeader><CardTitle>Most-used Assets</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                {data.mostUsedAssets.map((asset) => (
                  <div key={asset.assetTag} className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-950 p-3 text-sm">
                    <span><strong className="text-indigo-300">{asset.assetTag}</strong> {asset.name}</span>
                    <span className="text-slate-400">{asset.count} uses</span>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card className="border-slate-800 bg-slate-900/40 text-slate-100">
              <CardHeader><CardTitle>Idle Assets</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                {data.idleAssets.map((asset) => (
                  <div key={asset.assetTag} className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-950 p-3 text-sm">
                    <span><strong className="text-indigo-300">{asset.assetTag}</strong> {asset.name}</span>
                    <span className="text-amber-300">{asset.daysIdle} idle days</span>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card className="border-slate-800 bg-slate-900/40 text-slate-100">
              <CardHeader><CardTitle>Maintenance / Retirement Risk</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                {data.maintenanceRisk.map((asset) => (
                  <div key={asset.assetTag} className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span><strong className="text-indigo-300">{asset.assetTag}</strong> {asset.name}</span>
                      <span className="text-slate-400">score {asset.score}</span>
                    </div>
                    <Bar value={asset.score} max={100} tone={asset.score > 70 ? 'bg-red-500' : 'bg-amber-500'} />
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card className="border-slate-800 bg-slate-900/40 text-slate-100">
              <CardHeader><CardTitle className="flex items-center gap-2"><TrendingUp className="h-5 w-5 text-indigo-400" />Booking Heatmap</CardTitle></CardHeader>
              <CardContent className="grid grid-cols-5 gap-2">
                {data.bookingHeatmap.map((slot) => (
                  <div key={slot.hour} className="rounded-lg border border-slate-800 bg-slate-950 p-3 text-center">
                    <div className="text-xs text-slate-500">{slot.hour}</div>
                    <div className="mt-2 rounded bg-indigo-500/20 py-2 text-lg font-bold text-indigo-200" style={{ opacity: 0.35 + slot.count / bookingMax }}>
                      {slot.count}
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        ) : null}
      </main>
    </div>
  );
}
