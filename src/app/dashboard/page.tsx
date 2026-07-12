import React from "react";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import Link from "next/link";
import { redirect } from "next/navigation";
import { clearSessionCookie } from "@/lib/auth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Bell, BookOpenCheck, LayoutDashboard, LogOut, Settings, User, Landmark, Wrench } from "lucide-react";

export default async function DashboardPage() {
  const session = await getSession();

  if (!session) {
    redirect("/login");
  }

  // Fetch full user profile from DB to get the latest role/status/department
  const user = await db.user.findUnique({
    where: { id: session.userId },
    include: {
      department: {
        select: { name: true },
      },
    },
  });

  if (!user || user.status !== "ACTIVE") {
    redirect("/login");
  }

  // Server action for logout
  async function handleLogout() {
    "use server";
    await clearSessionCookie();
    redirect("/login");
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans">
      {/* Top Navbar */}
      <nav className="border-b border-slate-800 bg-slate-900/50 backdrop-blur-md sticky top-0 z-50">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex h-16 items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-600 text-white shadow-md shadow-indigo-600/20">
                <LayoutDashboard className="h-5 w-5" />
              </div>
              <span className="text-xl font-bold tracking-tight text-white">AssetFlow</span>
            </div>

            <div className="flex items-center gap-4">
              <Link
                href="/assets"
                className="flex items-center gap-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white px-4 py-2 text-sm font-semibold transition-all duration-200"
              >
                <Landmark className="h-4 w-4 text-indigo-400" />
                <span>Asset Registry</span>
              </Link>

              <Link
                href="/maintenance"
                className="flex items-center gap-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white px-4 py-2 text-sm font-semibold transition-all duration-200"
              >
                <Wrench className="h-4 w-4 text-indigo-400" />
                <span>Maintenance</span>
              </Link>

              <Link
                href="/notifications"
                className="flex items-center gap-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white px-4 py-2 text-sm font-semibold transition-all duration-200"
              >
                <Bell className="h-4 w-4 text-indigo-400" />
                <span>Notifications</span>
              </Link>

              <Link
                href="/resource-booking"
                className="flex items-center gap-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white px-4 py-2 text-sm font-semibold transition-all duration-200"
              >
                <BookOpenCheck className="h-4 w-4 text-indigo-400" />
                <span>Book Resource</span>
              </Link>

              {user.role === "ADMIN" && (
                <Link
                  href="/admin/setup"
                  className="flex items-center gap-2 rounded-lg bg-indigo-600/10 hover:bg-indigo-600/20 text-indigo-400 hover:text-indigo-300 px-4 py-2 text-sm font-semibold transition-all duration-200 border border-indigo-500/20"
                >
                  <Settings className="h-4 w-4" />
                  <span>Org Setup</span>
                </Link>
              )}

              <form action={handleLogout}>
                <button
                  type="submit"
                  className="flex items-center gap-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white px-4 py-2 text-sm font-semibold transition-all duration-200"
                >
                  <LogOut className="h-4 w-4" />
                  <span>Log Out</span>
                </button>
              </form>
            </div>
          </div>
        </div>
      </nav>

      {/* Main Dashboard Panel */}
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-8">
          <h1 className="text-3xl font-extrabold tracking-tight text-white">
            Welcome back, {user.name}
          </h1>
          <p className="mt-1 text-slate-400">
            Here is your resource and asset status overview.
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {/* Profile Card */}
          <Card className="border-slate-800 bg-slate-900/40 text-slate-100 shadow-md">
            <CardHeader className="flex flex-row items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-800 text-slate-300">
                <User className="h-6 w-6" />
              </div>
              <div>
                <CardTitle className="text-lg font-bold">{user.name}</CardTitle>
                <CardDescription className="text-slate-400">
                  {user.email}
                </CardDescription>
              </div>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex justify-between border-b border-slate-800/60 pb-2">
                <span className="text-slate-400 font-medium">Role:</span>
                <span className="font-semibold text-indigo-400 tracking-wider">
                  {user.role}
                </span>
              </div>
              <div className="flex justify-between border-b border-slate-800/60 pb-2">
                <span className="text-slate-400 font-medium">Department:</span>
                <span className="font-semibold text-slate-200">
                  {user.department?.name || "Not Assigned"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400 font-medium">Status:</span>
                <span className="font-semibold text-emerald-400">
                  {user.status}
                </span>
              </div>
            </CardContent>
          </Card>

          {/* Dummy Dashboard Overview (for future features) */}
          <Card className="border-slate-800 bg-slate-900/40 text-slate-100 shadow-md md:col-span-2">
            <CardHeader>
              <CardTitle className="text-lg font-bold">Assets & Resource Overview</CardTitle>
              <CardDescription className="text-slate-400">
                Summary of resources allocated to you
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col items-center justify-center py-8 text-center">
              <p className="text-slate-500 max-w-sm mb-4">
                You currently have no active assets or resource bookings. Keep track of your inventory and make reservations easily.
              </p>
              {user.role === "ADMIN" && (
                <Link
                  href="/admin/setup"
                  className="rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 text-sm font-semibold transition-all duration-200 shadow-md shadow-indigo-600/20"
                >
                  Configure Organization setup
                </Link>
              )}
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
