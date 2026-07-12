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

interface NavbarProps {
  activePath?: string;
}

export function Navbar({ activePath }: NavbarProps) {
  const { data } = useSWR('/api/dashboard', fetcher, {
    revalidateOnFocus: false,
    revalidateIfStale: false,
  });

  const role = data?.user?.role;

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    window.location.href = '/login';
  }

  const linkClass = (path: string) => {
    const base = 'flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold transition-all duration-200';
    if (activePath === path) {
      return `${base} bg-indigo-600 text-white shadow-md shadow-indigo-600/10`;
    }
    return `${base} bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white`;
  };

  return (
    <nav className="sticky top-0 z-50 border-b border-slate-800 bg-slate-900/50 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        {/* Logo / Brand */}
        <Link href="/dashboard" className="flex items-center gap-3 hover:opacity-90 transition-opacity">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-600 text-white">
            <LayoutDashboard className="h-5 w-5" />
          </div>
          <span className="text-xl font-bold tracking-tight text-white">AssetFlow</span>
        </Link>

        {/* Navigation Links */}
        <div className="flex flex-wrap items-center gap-3">
          <Link href="/dashboard" className={linkClass('/dashboard')}>
            <LayoutDashboard className="h-4 w-4" />
            <span>Dashboard</span>
          </Link>

          <Link href="/assets" className={linkClass('/assets')}>
            <Landmark className="h-4 w-4" />
            <span>Assets</span>
          </Link>

          <Link href="/resource-booking" className={linkClass('/resource-booking')}>
            <BookOpenCheck className="h-4 w-4" />
            <span>Bookings</span>
          </Link>

          <Link href="/maintenance" className={linkClass('/maintenance')}>
            <Wrench className="h-4 w-4" />
            <span>Maintenance</span>
          </Link>

          <Link href="/notifications" className={linkClass('/notifications')}>
            <Bell className="h-4 w-4" />
            <span>Notifications</span>
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

          {role === 'ADMIN' && (
            <Link href="/admin/setup" className={linkClass('/admin/setup')}>
              <Settings className="h-4 w-4" />
              <span>Org Setup</span>
            </Link>
          )}

          <Button
            onClick={handleLogout}
            className="flex items-center gap-2 rounded-lg bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white px-4 py-2 text-sm font-semibold transition-all duration-200 cursor-pointer"
          >
            <LogOut className="h-4 w-4" />
            <span>Log Out</span>
          </Button>
        </div>
      </div>
    </nav>
  );
}
