'use client';

import Link from 'next/link';
import useSWR from 'swr';
import {
  Bell,
  BookOpenCheck,
  ClipboardCheck,
  LayoutDashboard,
  LogOut,
  Landmark,
  Wrench,
  BarChart3,
  Settings,
} from 'lucide-react';
import { Button } from '@/components/ui/button';

const fetcher = async (url: string) => {
  const response = await fetch(url);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Request failed.');
  return data;
};

interface SidebarProps {
  activePath?: string;
}

export function Sidebar({ activePath }: SidebarProps) {
  const { data } = useSWR('/api/dashboard', fetcher, {
    revalidateOnFocus: false,
    revalidateIfStale: false,
  });

  const role = data?.user?.role;
  const name = data?.user?.name || 'User';

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    window.location.href = '/login';
  }

  const linkClass = (path: string) => {
    const base = 'flex items-center gap-3 rounded-lg px-4 py-3 text-sm font-semibold transition-all duration-300';
    if (activePath === path) {
      return `${base} bg-indigo-500/15 text-indigo-200 border border-indigo-400/30 shadow-[0_0_18px_rgba(99,102,241,0.25)]`;
    }
    return `${base} text-slate-300 hover:bg-slate-800/70 hover:text-white hover:translate-x-1`;
  };

  return (
    <aside className="w-64 h-screen sticky top-0 flex flex-col justify-between border-r border-slate-800/80 bg-slate-950/80 backdrop-blur-lg select-none z-50">
      <div className="flex flex-col flex-1 py-6">
        {/* Brand Logo */}
        <div className="px-6 mb-8 flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-600 text-white shadow-md shadow-indigo-600/20">
            <LayoutDashboard className="h-5 w-5" />
          </div>
          <div className="flex flex-col">
            <span className="text-lg font-bold tracking-tight text-white leading-none">AssetFlow</span>
            <span className="text-[10px] text-slate-400 mt-1 uppercase font-semibold tracking-wider">Enterprise Scale</span>
          </div>
        </div>

        {/* Navigation Items */}
        <nav className="flex-1 px-4 space-y-1">
          <Link href="/dashboard" className={linkClass('/dashboard')}>
            <LayoutDashboard className="h-4 w-4" />
            <span>Dashboard</span>
          </Link>

          {role === 'ADMIN' && (
            <Link href="/admin/setup" className={linkClass('/admin/setup')}>
              <Settings className="h-4 w-4" />
              <span>Org Setup</span>
            </Link>
          )}

          <Link href="/assets" className={linkClass('/assets')}>
            <Landmark className="h-4 w-4" />
            <span>Assets</span>
          </Link>

          <Link href="/resource-booking" className={linkClass('/resource-booking')}>
            <BookOpenCheck className="h-4 w-4" />
            <span>Resource Booking</span>
          </Link>

          <Link href="/maintenance" className={linkClass('/maintenance')}>
            <Wrench className="h-4 w-4" />
            <span>Maintenance</span>
          </Link>

          <Link href="/audit" className={linkClass('/audit')}>
            <ClipboardCheck className="h-4 w-4" />
            <span>Audit</span>
          </Link>

          {role && ['ADMIN', 'ASSET_MANAGER', 'DEPARTMENT_HEAD'].includes(role) && (
            <Link href="/reports" className={linkClass('/reports')}>
              <BarChart3 className="h-4 w-4" />
              <span>Reports</span>
            </Link>
          )}

          <Link href="/notifications" className={linkClass('/notifications')}>
            <Bell className="h-4 w-4" />
            <span>Notifications</span>
          </Link>
        </nav>
      </div>

      {/* User profile / Logout bottom panel */}
      <div className="p-4 border-t border-slate-800/80 bg-slate-950/40">
        <div className="flex items-center justify-between mb-4 px-2">
          <div className="flex flex-col min-w-0">
            <span className="text-sm font-semibold text-white truncate">{name}</span>
            <span className="text-xs text-indigo-400 font-medium truncate">{role || 'EMPLOYEE'}</span>
          </div>
        </div>
        <Button
          onClick={handleLogout}
          variant="outline"
          className="w-full flex items-center justify-center gap-2 border-slate-800 text-slate-300 hover:bg-slate-900 hover:text-white transition-all cursor-pointer"
        >
          <LogOut className="h-4 w-4" />
          <span>Log Out</span>
        </Button>
      </div>
    </aside>
  );
}
