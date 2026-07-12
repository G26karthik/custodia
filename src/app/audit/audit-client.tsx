'use client';

import Link from 'next/link';
import useSWR from 'swr';
import { useState } from 'react';
import { Bell, CheckCircle2, ClipboardCheck, LayoutDashboard, Loader2, Lock, Search, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';

type UserSummary = { id: string; name: string; email: string; role: string; status?: string };
type Department = { id: string; name: string; code: string };
type Asset = {
  id: string;
  assetTag: string;
  name: string;
  location: string | null;
  status: string;
  department: { name: string } | null;
};
type AuditItem = {
  id: string;
  expectedLocation: string | null;
  verification: 'PENDING' | 'VERIFIED' | 'MISSING' | 'DAMAGED';
  notes: string | null;
  asset: Asset;
};
type AuditCycle = {
  id: string;
  name: string;
  status: 'OPEN' | 'CLOSED';
  location: string | null;
  startDate: string;
  endDate: string;
  scopeDept: { id: string; name: string } | null;
  auditors: Array<{ user: UserSummary }>;
  items: AuditItem[];
};
type AuditBoard = {
  cycles: AuditCycle[];
  departments: Department[];
  auditors: UserSummary[];
  refreshedAt: string;
};

const fetcher = async (url: string) => {
  const response = await fetch(url);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Request failed.');
  return data;
};

function inputDate(daysFromNow = 0) {
  const date = new Date();
  date.setDate(date.getDate() + daysFromNow);
  return date.toISOString().slice(0, 10);
}

function toIsoDate(value: string) {
  return new Date(`${value}T00:00:00`).toISOString();
}

function badgeClass(value: AuditItem['verification'] | AuditCycle['status']) {
  if (value === 'VERIFIED') return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300';
  if (value === 'MISSING') return 'border-red-500/30 bg-red-500/10 text-red-300';
  if (value === 'DAMAGED') return 'border-amber-500/30 bg-amber-500/10 text-amber-300';
  if (value === 'CLOSED') return 'border-slate-700 bg-slate-800 text-slate-300';
  return 'border-indigo-500/30 bg-indigo-500/10 text-indigo-300';
}

export function AuditClient({ user }: { user: UserSummary }) {
  const { data, mutate, isLoading, error: loadError } = useSWR<AuditBoard>('/api/audits', fetcher, {
    refreshInterval: 7000,
    revalidateOnFocus: true,
  });
  const [selectedCycleId, setSelectedCycleId] = useState('');
  const [name, setName] = useState('Q3 Engineering Audit');
  const [scopeDeptId, setScopeDeptId] = useState('');
  const [location, setLocation] = useState('');
  const [startDate, setStartDate] = useState(inputDate());
  const [endDate, setEndDate] = useState(inputDate(7));
  const [auditorIds, setAuditorIds] = useState<string[]>([]);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const selectedCycle = data?.cycles.find((cycle) => cycle.id === (selectedCycleId || data.cycles[0]?.id));
  const canManage = user.role === 'ADMIN' || user.role === 'ASSET_MANAGER';
  const discrepancies = selectedCycle?.items.filter((item) => item.verification === 'MISSING' || item.verification === 'DAMAGED') ?? [];

  async function createCycle(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setMessage('');
    setSubmitting(true);

    try {
      const response = await fetch('/api/audits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          scopeDeptId: scopeDeptId || undefined,
          location: location || undefined,
          startDate: toIsoDate(startDate),
          endDate: toIsoDate(endDate),
          auditorIds,
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Unable to create audit cycle.');
      setMessage('Audit cycle created with in-scope asset checklist.');
      setSelectedCycleId(result.cycle.id);
      await mutate();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to create audit cycle.');
    } finally {
      setSubmitting(false);
    }
  }

  async function updateItem(item: AuditItem, verification: AuditItem['verification']) {
    setError('');
    setMessage('');
    const response = await fetch(`/api/audits/items/${item.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ verification, notes: notes[item.id] || item.notes || undefined }),
    });
    const result = await response.json();
    if (!response.ok) {
      setError(result.error || 'Unable to update audit item.');
      return;
    }
    setMessage(`${item.asset.assetTag} marked ${verification}.`);
    await mutate();
  }

  async function closeCycle() {
    if (!selectedCycle) return;
    setError('');
    setMessage('');
    const response = await fetch(`/api/audits/${selectedCycle.id}/close`, { method: 'PATCH' });
    const result = await response.json();
    if (!response.ok) {
      setError(result.error || 'Unable to close audit cycle.');
      return;
    }
    setMessage(`Audit closed with ${result.flagged.length} discrepancy item(s).`);
    await mutate();
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans">
      <nav className="sticky top-0 z-50 border-b border-slate-800 bg-slate-900/50 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-600 text-white">
              <ClipboardCheck className="h-5 w-5" />
            </div>
            <span className="text-xl font-bold tracking-tight text-white">AssetFlow</span>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/dashboard" className="flex items-center gap-2 rounded-lg bg-slate-800 px-4 py-2 text-sm font-semibold text-slate-300 hover:bg-slate-700 hover:text-white">
              <LayoutDashboard className="h-4 w-4" />
              Dashboard
            </Link>
            <Link href="/notifications" className="flex items-center gap-2 rounded-lg bg-slate-800 px-4 py-2 text-sm font-semibold text-slate-300 hover:bg-slate-700 hover:text-white">
              <Bell className="h-4 w-4" />
              Notifications
            </Link>
          </div>
        </div>
      </nav>

      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-8">
          <p className="text-sm font-semibold uppercase tracking-wide text-indigo-400">Phase 8 | Screen 8</p>
          <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-white">Asset Audit</h1>
          <p className="mt-2 text-sm text-slate-400">Create cycles, verify assets, and close discrepancy reports with live updates.</p>
        </div>

        <div className="grid gap-6 lg:grid-cols-[24rem_1fr]">
          <section className="space-y-6">
            {canManage ? (
              <Card className="border-slate-800 bg-slate-900/40 text-slate-100">
                <CardHeader>
                  <CardTitle>Create Audit Cycle</CardTitle>
                </CardHeader>
                <CardContent>
                  <form onSubmit={createCycle} className="space-y-4">
                    <Input value={name} onChange={(event) => setName(event.target.value)} className="h-10 border-slate-800 bg-slate-950 text-slate-100" />
                    <select value={scopeDeptId} onChange={(event) => setScopeDeptId(event.target.value)} className="h-10 w-full rounded-lg border border-slate-800 bg-slate-950 px-3 text-sm">
                      <option value="">All departments</option>
                      {data?.departments.map((department) => (
                        <option key={department.id} value={department.id}>{department.name}</option>
                      ))}
                    </select>
                    <Input value={location} onChange={(event) => setLocation(event.target.value)} placeholder="Optional location scope" className="h-10 border-slate-800 bg-slate-950 text-slate-100" />
                    <div className="grid grid-cols-2 gap-3">
                      <Input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} className="h-10 border-slate-800 bg-slate-950 text-slate-100" />
                      <Input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} className="h-10 border-slate-800 bg-slate-950 text-slate-100" />
                    </div>
                    <div className="max-h-36 space-y-2 overflow-auto rounded-lg border border-slate-800 bg-slate-950 p-3">
                      {data?.auditors.map((auditor) => (
                        <label key={auditor.id} className="flex items-center gap-2 text-sm text-slate-300">
                          <input
                            type="checkbox"
                            checked={auditorIds.includes(auditor.id)}
                            onChange={(event) =>
                              setAuditorIds((current) =>
                                event.target.checked ? [...current, auditor.id] : current.filter((id) => id !== auditor.id)
                              )
                            }
                          />
                          {auditor.name} ({auditor.role})
                        </label>
                      ))}
                    </div>
                    <Button disabled={submitting} className="h-10 w-full bg-indigo-600 text-white hover:bg-indigo-500">
                      {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />}
                      Create checklist
                    </Button>
                  </form>
                </CardContent>
              </Card>
            ) : null}

            <Card className="border-slate-800 bg-slate-900/40 text-slate-100">
              <CardHeader>
                <CardTitle>Audit Cycles</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {isLoading ? <p className="text-sm text-slate-400">Loading audits...</p> : null}
                {data?.cycles.map((cycle) => (
                  <button
                    key={cycle.id}
                    onClick={() => setSelectedCycleId(cycle.id)}
                    className={`w-full rounded-lg border p-3 text-left text-sm transition ${selectedCycle?.id === cycle.id ? 'border-indigo-500 bg-indigo-500/10' : 'border-slate-800 bg-slate-950 hover:bg-slate-900'}`}
                  >
                    <div className="font-semibold text-white">{cycle.name}</div>
                    <div className="mt-1 text-xs text-slate-400">{cycle.items.length} assets | {cycle.scopeDept?.name || cycle.location || 'All assets'}</div>
                  </button>
                ))}
              </CardContent>
            </Card>
          </section>

          <section className="space-y-4">
            {error || loadError ? <p className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">{error || loadError?.message}</p> : null}
            {message ? <p className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-200">{message}</p> : null}

            {!selectedCycle ? (
              <Card className="border-slate-800 bg-slate-900/40 text-slate-100">
                <CardContent className="p-8 text-sm text-slate-400">No audit cycle selected.</CardContent>
              </Card>
            ) : (
              <Card className="border-slate-800 bg-slate-900/40 text-slate-100">
                <CardHeader>
                  <CardTitle className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <span>{selectedCycle.name}</span>
                    <span className={`rounded-full border px-3 py-1 text-xs ${badgeClass(selectedCycle.status)}`}>{selectedCycle.status}</span>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="mb-4 grid gap-3 md:grid-cols-3">
                    <div className="rounded-lg border border-slate-800 bg-slate-950 p-3 text-sm text-slate-400">Auditors: {selectedCycle.auditors.map((a) => a.user.name).join(', ')}</div>
                    <div className="rounded-lg border border-slate-800 bg-slate-950 p-3 text-sm text-slate-400">Discrepancies: {discrepancies.length}</div>
                    {canManage && selectedCycle.status === 'OPEN' ? (
                      <Button onClick={closeCycle} className="h-full bg-indigo-600 text-white hover:bg-indigo-500">
                        <Lock className="mr-2 h-4 w-4" />
                        Close audit cycle
                      </Button>
                    ) : null}
                  </div>

                  <div className="overflow-hidden rounded-xl border border-slate-800">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-950 text-slate-400">
                        <tr>
                          <th className="p-3 text-left">Asset</th>
                          <th className="p-3 text-left">Expected Location</th>
                          <th className="p-3 text-left">Verification</th>
                          <th className="p-3 text-left">Notes</th>
                          <th className="p-3 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800">
                        {selectedCycle.items.map((item) => (
                          <tr key={item.id} className="bg-slate-900/30">
                            <td className="p-3">
                              <div className="font-semibold text-white">{item.asset.assetTag}</div>
                              <div className="text-xs text-slate-400">{item.asset.name}</div>
                            </td>
                            <td className="p-3 text-slate-300">{item.expectedLocation || item.asset.location || '-'}</td>
                            <td className="p-3">
                              <span className={`rounded-full border px-2.5 py-1 text-xs ${badgeClass(item.verification)}`}>{item.verification}</span>
                            </td>
                            <td className="p-3">
                              <Input value={notes[item.id] ?? item.notes ?? ''} onChange={(event) => setNotes((current) => ({ ...current, [item.id]: event.target.value }))} disabled={selectedCycle.status === 'CLOSED'} className="h-9 border-slate-800 bg-slate-950 text-slate-100" />
                            </td>
                            <td className="p-3">
                              <div className="flex justify-end gap-2">
                                <Button size="sm" disabled={selectedCycle.status === 'CLOSED'} onClick={() => updateItem(item, 'VERIFIED')} className="bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20"><CheckCircle2 className="mr-1 h-3.5 w-3.5" />Verified</Button>
                                <Button size="sm" disabled={selectedCycle.status === 'CLOSED'} onClick={() => updateItem(item, 'MISSING')} className="bg-red-500/10 text-red-300 hover:bg-red-500/20"><XCircle className="mr-1 h-3.5 w-3.5" />Missing</Button>
                                <Button size="sm" disabled={selectedCycle.status === 'CLOSED'} onClick={() => updateItem(item, 'DAMAGED')} className="bg-amber-500/10 text-amber-300 hover:bg-amber-500/20">Damaged</Button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}
