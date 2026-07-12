"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { LayoutDashboard, LogOut, Settings, Plus, User, Search, ShieldAlert, BadgeInfo, Calendar, Landmark, MapPin, Eye, CheckCircle2 } from "lucide-react";

interface Category {
  id: string;
  name: string;
}

interface Department {
  id: string;
  name: string;
}

interface Allocation {
  id: string;
  allocatedAt: string;
  expectedReturnDate: string | null;
  returnedAt: string | null;
  conditionAtReturn: string | null;
  isActive: boolean;
  holder?: { id: string; name: string; email: string } | null;
  department?: { id: string; name: string } | null;
}

interface MaintenanceRequest {
  id: string;
  createdAt: string;
  issueDescription: string;
  priority: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  status: "PENDING" | "APPROVED" | "REJECTED" | "TECHNICIAN_ASSIGNED" | "IN_PROGRESS" | "RESOLVED";
  raisedBy: { id: string; name: string };
}

interface Asset {
  id: string;
  assetTag: string;
  name: string;
  categoryId: string;
  category: { id: string; name: string };
  serialNumber: string | null;
  acquisitionDate: string | null;
  acquisitionCost: number | null;
  condition: string | null;
  location: string | null;
  departmentId: string | null;
  department: { id: string; name: string } | null;
  photoUrl: string | null;
  isBookable: boolean;
  status: "AVAILABLE" | "ALLOCATED" | "RESERVED" | "UNDER_MAINTENANCE" | "LOST" | "RETIRED" | "DISPOSED";
  allocations?: Allocation[];
  maintenanceRequests?: MaintenanceRequest[];
}

export default function AssetRegistryPage() {
  const router = useRouter();

  // Authentication State
  const [currentUser, setCurrentUser] = useState<{ id: string; name: string; role: string } | null>(null);

  // Search & Filter State
  const [assets, setAssets] = useState<Asset[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  
  const [searchTerm, setSearchTerm] = useState("");
  const [catFilter, setCatFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [deptFilter, setDeptFilter] = useState("");
  const [locFilter, setLocFilter] = useState("");
  
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalAssets, setTotalAssets] = useState(0);

  // Dialog State
  const [registerOpen, setRegisterOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [selectedAsset, setSelectedAsset] = useState<Asset | null>(null);
  
  const [loading, setLoading] = useState(false);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Register Asset Form Fields
  const [name, setName] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [serialNumber, setSerialNumber] = useState("");
  const [acquisitionDate, setAcquisitionDate] = useState("");
  const [acquisitionCost, setAcquisitionCost] = useState("");
  const [condition, setCondition] = useState("");
  const [location, setLocation] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [photoUrl, setPhotoUrl] = useState("");
  const [isBookable, setIsBookable] = useState(false);

  // Load current session
  const fetchSession = async () => {
    try {
      const res = await fetch("/api/admin/employees?limit=1"); // Quick way to see if authenticated
      if (res.status === 401) {
        router.push("/login");
        return;
      }
      // Decode JWT session cookie locally to get current user details
      const cookies = document.cookie.split("; ");
      const sessionCookie = cookies.find((row) => row.startsWith("session="));
      if (sessionCookie) {
        const token = sessionCookie.split("=")[1];
        // Decodes header/payload (rough parse for UI roles)
        const base64Url = token.split(".")[1];
        const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
        const jsonPayload = decodeURIComponent(
          window
            .atob(base64)
            .split("")
            .map((c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
            .join("")
        );
        const parsed = JSON.parse(jsonPayload);
        setCurrentUser({ id: parsed.userId, name: parsed.email, role: parsed.role });
      }
    } catch (e) {
      console.error("Session decode error:", e);
    }
  };

  // Fetch Asset List
  const fetchAssets = async (pageNum = page) => {
    setLoading(true);
    setError("");
    try {
      const query = new URLSearchParams({
        page: pageNum.toString(),
        limit: "10",
        search: searchTerm,
        categoryId: catFilter,
        status: statusFilter,
        departmentId: deptFilter,
        location: locFilter,
      });

      const res = await fetch(`/api/assets?${query.toString()}`);
      const data = await res.json();
      
      if (!res.ok) throw new Error(data.error || "Failed to fetch assets");
      
      setAssets(data.assets || []);
      setCategories(data.categories || []);
      setDepartments(data.departments || []);
      setTotalPages(data.totalPages || 1);
      setTotalAssets(data.total || 0);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSession();
    fetchAssets(1);
  }, []);

  const handleFilterSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    fetchAssets(1);
  };

  const handleResetFilters = () => {
    setSearchTerm("");
    setCatFilter("");
    setStatusFilter("");
    setDeptFilter("");
    setLocFilter("");
    setPage(1);
    // Fetch directly after resetting states
    setTimeout(() => fetchAssets(1), 0);
  };

  // Handle register asset submit
  const handleRegisterAsset = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (!name || !categoryId) {
      setError("Name and Category are required.");
      return;
    }

    try {
      const res = await fetch("/api/assets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          categoryId,
          serialNumber: serialNumber || null,
          acquisitionDate: acquisitionDate || null,
          acquisitionCost: acquisitionCost ? parseFloat(acquisitionCost) : null,
          condition: condition || null,
          location: location || null,
          departmentId: departmentId === "none" ? null : departmentId,
          photoUrl: photoUrl || null,
          isBookable,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to register asset");

      setSuccess(`Asset ${name} registered successfully with tag ${data.asset.assetTag}.`);
      setRegisterOpen(false);
      
      // Reset form
      setName("");
      setCategoryId("");
      setSerialNumber("");
      setAcquisitionDate("");
      setAcquisitionCost("");
      setCondition("");
      setLocation("");
      setDepartmentId("");
      setPhotoUrl("");
      setIsBookable(false);
      
      fetchAssets(1);
    } catch (err: any) {
      setError(err.message);
    }
  };

  // Fetch asset details
  const handleViewDetails = async (assetId: string) => {
    setDetailsLoading(true);
    setDetailsOpen(true);
    try {
      const res = await fetch(`/api/assets/${assetId}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to fetch asset details");
      setSelectedAsset(data.asset);
    } catch (err: any) {
      setError(err.message);
      setDetailsOpen(false);
    } finally {
      setDetailsLoading(false);
    }
  };

  const handleLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  };

  // Helper to color badge based on status
  const getStatusBadgeClass = (status: string) => {
    switch (status) {
      case "AVAILABLE":
        return "bg-emerald-500/10 text-emerald-400 border-emerald-500/30";
      case "ALLOCATED":
        return "bg-blue-500/10 text-blue-400 border-blue-500/30";
      case "RESERVED":
        return "bg-amber-500/10 text-amber-400 border-amber-500/30";
      case "UNDER_MAINTENANCE":
        return "bg-orange-500/10 text-orange-400 border-orange-500/30";
      case "LOST":
        return "bg-red-500/10 text-red-400 border-red-500/30";
      case "RETIRED":
        return "bg-slate-500/10 text-slate-400 border-slate-500/30";
      case "DISPOSED":
        return "bg-purple-500/10 text-purple-400 border-purple-500/30";
      default:
        return "bg-slate-800 text-slate-400 border-slate-700";
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans pb-12">
      {/* Navbar */}
      <nav className="border-b border-slate-800 bg-slate-900/50 backdrop-blur-md sticky top-0 z-50">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex h-16 items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-600 text-white shadow-md shadow-indigo-600/20">
                <Landmark className="h-5 w-5" />
              </div>
              <span className="text-xl font-bold tracking-tight text-white">AssetFlow</span>
            </div>

            <div className="flex items-center gap-4">
              <Link
                href="/dashboard"
                className="flex items-center gap-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white px-4 py-2 text-sm font-semibold transition-all duration-200"
              >
                <LayoutDashboard className="h-4 w-4" />
                <span>Dashboard</span>
              </Link>

              {currentUser?.role === "ADMIN" && (
                <Link
                  href="/admin/setup"
                  className="flex items-center gap-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white px-4 py-2 text-sm font-semibold transition-all duration-200"
                >
                  <Settings className="h-4 w-4" />
                  <span>Org Setup</span>
                </Link>
              )}

              <button
                onClick={handleLogout}
                className="flex items-center gap-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white px-4 py-2 text-sm font-semibold transition-all duration-200"
              >
                <LogOut className="h-4 w-4" />
                <span>Log Out</span>
              </button>
            </div>
          </div>
        </div>
      </nav>

      {/* Main Asset Panel */}
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-8 gap-4">
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight text-white flex items-center gap-3">
              <Landmark className="h-8 w-8 text-indigo-500" />
              Asset Registry
            </h1>
            <p className="mt-1 text-slate-400">
              Search, filter, and register physical assets.
            </p>
          </div>

          {(currentUser?.role === "ADMIN" || currentUser?.role === "ASSET_MANAGER") && (
            <Dialog open={registerOpen} onOpenChange={setRegisterOpen}>
              <DialogTrigger
                render={
                  <Button
                    onClick={() => {
                      setName("");
                      setCategoryId("");
                      setSerialNumber("");
                      setAcquisitionDate("");
                      setAcquisitionCost("");
                      setCondition("");
                      setLocation("");
                      setDepartmentId("");
                      setPhotoUrl("");
                      setIsBookable(false);
                    }}
                    className="bg-indigo-600 hover:bg-indigo-500 text-white flex items-center gap-2 rounded-lg shadow-md shadow-indigo-600/10"
                  >
                    <Plus className="h-4 w-4" />
                    Register Asset
                  </Button>
                }
              />
              <DialogContent className="bg-slate-900 text-slate-100 border-slate-800 max-w-lg">
                <DialogHeader>
                  <DialogTitle className="text-xl font-bold">Register New Asset</DialogTitle>
                  <DialogDescription className="text-slate-400">
                    Input details to register a new organizational asset.
                  </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleRegisterAsset} className="space-y-4 py-2">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
                        Asset Name
                      </label>
                      <Input
                        required
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="MacBook Pro 16-inch"
                        className="bg-slate-950 border-slate-800 text-slate-100"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
                        Category
                      </label>
                      <select
                        required
                        value={categoryId}
                        onChange={(e) => setCategoryId(e.target.value)}
                        className="w-full rounded-lg border border-slate-800 bg-slate-950 p-2.5 text-sm text-slate-100 focus:border-indigo-500 focus:outline-none"
                      >
                        <option value="">Select Category...</option>
                        {categories.map((c) => (
                          <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
                        Serial Number (Unique)
                      </label>
                      <Input
                        value={serialNumber}
                        onChange={(e) => setSerialNumber(e.target.value)}
                        placeholder="C02ZW123MD6R"
                        className="bg-slate-950 border-slate-800 text-slate-100"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
                        Department Owner
                      </label>
                      <select
                        value={departmentId}
                        onChange={(e) => setDepartmentId(e.target.value)}
                        className="w-full rounded-lg border border-slate-800 bg-slate-950 p-2.5 text-sm text-slate-100 focus:border-indigo-500 focus:outline-none"
                      >
                        <option value="none">Unassigned</option>
                        {departments.map((d) => (
                          <option key={d.id} value={d.id}>{d.name}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
                        Acquisition Date
                      </label>
                      <Input
                        type="date"
                        value={acquisitionDate}
                        onChange={(e) => setAcquisitionDate(e.target.value)}
                        className="bg-slate-950 border-slate-800 text-slate-100"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
                        Acquisition Cost (USD)
                      </label>
                      <Input
                        type="number"
                        step="0.01"
                        value={acquisitionCost}
                        onChange={(e) => setAcquisitionCost(e.target.value)}
                        placeholder="1999.99"
                        className="bg-slate-950 border-slate-800 text-slate-100"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
                        Initial Condition
                      </label>
                      <Input
                        value={condition}
                        onChange={(e) => setCondition(e.target.value)}
                        placeholder="New, Good, Fair..."
                        className="bg-slate-950 border-slate-800 text-slate-100"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
                        Location
                      </label>
                      <Input
                        value={location}
                        onChange={(e) => setLocation(e.target.value)}
                        placeholder="HQ - Floor 3"
                        className="bg-slate-950 border-slate-800 text-slate-100"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
                      Photo URL (Stubbed)
                    </label>
                    <Input
                      value={photoUrl}
                      onChange={(e) => setPhotoUrl(e.target.value)}
                      placeholder="https://images.unsplash.com/photo-stub..."
                      className="bg-slate-950 border-slate-800 text-slate-100"
                    />
                  </div>

                  <div className="flex items-center gap-2 pt-2">
                    <input
                      type="checkbox"
                      id="isBookable"
                      checked={isBookable}
                      onChange={(e) => setIsBookable(e.target.checked)}
                      className="h-4 w-4 rounded border-slate-800 bg-slate-950 text-indigo-600 focus:ring-indigo-500"
                    />
                    <label htmlFor="isBookable" className="text-sm text-slate-300 select-none">
                      Mark as shared resource (Bookable by staff)
                    </label>
                  </div>

                  <DialogFooter className="pt-4">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setRegisterOpen(false)}
                      className="border-slate-800 hover:bg-slate-800 text-slate-300"
                    >
                      Cancel
                    </Button>
                    <Button type="submit" className="bg-indigo-600 hover:bg-indigo-500 text-white">
                      Register
                    </Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          )}
        </div>

        {error && (
          <div className="mb-6 flex items-center gap-2 rounded-lg bg-red-950/50 border border-red-500/30 p-4 text-sm text-red-400">
            <ShieldAlert className="h-5 w-5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {success && (
          <div className="mb-6 flex items-center gap-2 rounded-lg bg-emerald-950/50 border border-emerald-500/30 p-4 text-sm text-emerald-400">
            <CheckCircle2 className="h-5 w-5 shrink-0" />
            <span>{success}</span>
          </div>
        )}

        {/* Search & Filters */}
        <Card className="border-slate-800 bg-slate-900/40 text-slate-100 shadow-md mb-8">
          <CardHeader className="py-4">
            <CardTitle className="text-md font-semibold text-slate-200">Search & Filters</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleFilterSubmit} className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-6 items-end">
              <div className="space-y-2 md:col-span-2">
                <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
                  Search Tag / Serial / Name
                </label>
                <div className="relative">
                  <Search className="absolute top-3 left-3 h-4.5 w-4.5 text-slate-500" />
                  <Input
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="AF-0001, laptop, serial..."
                    className="pl-10 bg-slate-950 border-slate-800 text-white placeholder-slate-500"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
                  Category
                </label>
                <select
                  value={catFilter}
                  onChange={(e) => setCatFilter(e.target.value)}
                  className="w-full rounded-lg border border-slate-800 bg-slate-950 p-2.5 text-sm text-slate-100 focus:outline-none"
                >
                  <option value="">All Categories</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
                  Status
                </label>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="w-full rounded-lg border border-slate-800 bg-slate-950 p-2.5 text-sm text-slate-100 focus:outline-none"
                >
                  <option value="">All Statuses</option>
                  <option value="AVAILABLE">AVAILABLE</option>
                  <option value="ALLOCATED">ALLOCATED</option>
                  <option value="RESERVED">RESERVED</option>
                  <option value="UNDER_MAINTENANCE">UNDER_MAINTENANCE</option>
                  <option value="LOST">LOST</option>
                  <option value="RETIRED">RETIRED</option>
                  <option value="DISPOSED">DISPOSED</option>
                </select>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
                  Department
                </label>
                <select
                  value={deptFilter}
                  onChange={(e) => setDeptFilter(e.target.value)}
                  className="w-full rounded-lg border border-slate-800 bg-slate-950 p-2.5 text-sm text-slate-100 focus:outline-none"
                >
                  <option value="">All Departments</option>
                  <option value="none">Unassigned</option>
                  {departments.map((d) => (
                    <option key={d.id} value={d.id}>{d.name}</option>
                  ))}
                </select>
              </div>

              <div className="flex gap-2">
                <Button type="submit" className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-lg flex items-center justify-center gap-1.5 py-2.5">
                  <Search className="h-4 w-4" /> Filter
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleResetFilters}
                  className="border-slate-800 hover:bg-slate-800 text-slate-300 py-2.5"
                >
                  Reset
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        {/* Assets Directory Table */}
        <Card className="border-slate-800 bg-slate-900/40 text-slate-100 shadow-md">
          <CardContent className="pt-6">
            <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-950/20">
              <Table>
                <TableHeader className="bg-slate-900/60 border-b border-slate-800">
                  <TableRow>
                    <TableHead className="text-slate-300">Tag</TableHead>
                    <TableHead className="text-slate-300">Name</TableHead>
                    <TableHead className="text-slate-300">Category</TableHead>
                    <TableHead className="text-slate-300">Serial Number</TableHead>
                    <TableHead className="text-slate-300">Status</TableHead>
                    <TableHead className="text-slate-300">Location</TableHead>
                    <TableHead className="text-slate-300">Department</TableHead>
                    <TableHead className="text-right text-slate-300">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center py-8 text-slate-500">
                        Loading assets...
                      </TableCell>
                    </TableRow>
                  ) : assets.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center py-8 text-slate-500">
                        No assets registered.
                      </TableCell>
                    </TableRow>
                  ) : (
                    assets.map((asset) => (
                      <TableRow key={asset.id} className="hover:bg-slate-900/30 border-b border-slate-800/60">
                        <TableCell className="font-bold text-indigo-400">{asset.assetTag}</TableCell>
                        <TableCell className="font-semibold text-white">{asset.name}</TableCell>
                        <TableCell>{asset.category.name}</TableCell>
                        <TableCell className="font-mono text-slate-300 text-xs">{asset.serialNumber || "-"}</TableCell>
                        <TableCell>
                          <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${getStatusBadgeClass(asset.status)}`}>
                            {asset.status}
                          </span>
                        </TableCell>
                        <TableCell className="text-slate-300">{asset.location || "-"}</TableCell>
                        <TableCell className="text-slate-400">{asset.department?.name || "-"}</TableCell>
                        <TableCell className="text-right">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleViewDetails(asset.id)}
                            className="text-indigo-400 hover:text-indigo-300 hover:bg-slate-800/80 flex items-center gap-1 ml-auto"
                          >
                            <Eye className="h-4 w-4" />
                            <span>Details</span>
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>

            {/* Pagination Controls */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between pt-6">
                <span className="text-sm text-slate-400">
                  Showing page <strong className="text-slate-200">{page}</strong> of <strong className="text-slate-200">{totalPages}</strong> (total {totalAssets} assets)
                </span>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={page === 1}
                    onClick={() => {
                      setPage(page - 1);
                      fetchAssets(page - 1);
                    }}
                    className="border-slate-800 hover:bg-slate-800 text-slate-300"
                  >
                    Previous
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={page === totalPages}
                    onClick={() => {
                      setPage(page + 1);
                      fetchAssets(page + 1);
                    }}
                    className="border-slate-800 hover:bg-slate-800 text-slate-300"
                  >
                    Next
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </main>

      {/* Asset Details & Histories Dialog Overlay */}
      <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
        <DialogContent className="bg-slate-900 text-slate-100 border-slate-800 max-w-4xl max-h-[85vh] overflow-y-auto">
          {detailsLoading || !selectedAsset ? (
            <div className="py-12 text-center text-slate-400">
              Loading asset details...
            </div>
          ) : (
            <div className="space-y-6">
              <DialogHeader className="border-b border-slate-800 pb-4">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div>
                    <DialogTitle className="text-2xl font-bold flex items-center gap-2 text-white">
                      <span>{selectedAsset.name}</span>
                      <span className="text-sm font-bold text-indigo-400 bg-indigo-500/10 px-2 py-0.5 rounded border border-indigo-500/20">{selectedAsset.assetTag}</span>
                    </DialogTitle>
                    <DialogDescription className="text-slate-400">
                      Category: {selectedAsset.category.name} | Status:{" "}
                      <span className={`inline-flex items-center rounded-full border px-2 py-0.2 text-[11px] font-bold ${getStatusBadgeClass(selectedAsset.status)}`}>
                        {selectedAsset.status}
                      </span>
                    </DialogDescription>
                  </div>
                </div>
              </DialogHeader>

              {/* Core Details Grid */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="md:col-span-2 grid grid-cols-2 gap-y-3 gap-x-4 text-sm bg-slate-950/40 p-4 rounded-xl border border-slate-800/60">
                  <div className="flex flex-col">
                    <span className="text-slate-500 font-semibold text-xs uppercase">Serial Number</span>
                    <span className="font-mono text-slate-200">{selectedAsset.serialNumber || "None"}</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-slate-500 font-semibold text-xs uppercase">Location</span>
                    <span className="text-slate-200 flex items-center gap-1"><MapPin className="h-3.5 w-3.5 text-indigo-400" />{selectedAsset.location || "None"}</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-slate-500 font-semibold text-xs uppercase">Department</span>
                    <span className="text-slate-200">{selectedAsset.department?.name || "Unassigned"}</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-slate-500 font-semibold text-xs uppercase">Initial Condition</span>
                    <span className="text-slate-200">{selectedAsset.condition || "Not logged"}</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-slate-500 font-semibold text-xs uppercase">Acquisition Cost</span>
                    <span className="text-slate-200">{selectedAsset.acquisitionCost ? `$${Number(selectedAsset.acquisitionCost).toLocaleString()}` : "None"}</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-slate-500 font-semibold text-xs uppercase">Acquisition Date</span>
                    <span className="text-slate-200 flex items-center gap-1"><Calendar className="h-3.5 w-3.5 text-indigo-400" />{selectedAsset.acquisitionDate ? new Date(selectedAsset.acquisitionDate).toLocaleDateString() : "None"}</span>
                  </div>
                  <div className="flex flex-col col-span-2 border-t border-slate-800/60 pt-2 mt-1">
                    <span className="text-slate-500 font-semibold text-xs uppercase">Booking Flag</span>
                    <span className="text-slate-300">
                      {selectedAsset.isBookable ? "✅ Yes, this resource can be booked by staff" : "❌ Personal/Static allocation only (Non-bookable)"}
                    </span>
                  </div>
                </div>

                {/* Photo Gallery (or stub) */}
                <div className="flex flex-col justify-center items-center rounded-xl border border-slate-800 bg-slate-950/60 p-4 min-h-[160px]">
                  {selectedAsset.photoUrl ? (
                    <img
                      src={selectedAsset.photoUrl}
                      alt={selectedAsset.name}
                      className="max-h-40 rounded-lg object-cover shadow border border-slate-800"
                    />
                  ) : (
                    <div className="text-center text-slate-500 text-sm space-y-1">
                      <Landmark className="h-10 w-10 mx-auto text-slate-600 mb-1" />
                      <span>No photo uploaded</span>
                      <p className="text-xs text-slate-700">Photo URL was not provided</p>
                    </div>
                  )}
                </div>
              </div>

              {/* History Tabs / Lists */}
              <div className="space-y-6 pt-4 border-t border-slate-800">
                {/* Allocation History Section */}
                <div className="space-y-3">
                  <h3 className="text-md font-bold text-white flex items-center gap-2">
                    <User className="h-4.5 w-4.5 text-indigo-400" />
                    Allocation History
                  </h3>
                  <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-950/20 text-xs">
                    <Table>
                      <TableHeader className="bg-slate-900/60 border-b border-slate-800">
                        <TableRow>
                          <TableHead className="text-slate-300 py-2.5">Holder</TableHead>
                          <TableHead className="text-slate-300 py-2.5">Department</TableHead>
                          <TableHead className="text-slate-300 py-2.5">Allocated At</TableHead>
                          <TableHead className="text-slate-300 py-2.5">Expected Return</TableHead>
                          <TableHead className="text-slate-300 py-2.5">Returned At</TableHead>
                          <TableHead className="text-slate-300 py-2.5">Condition at Return</TableHead>
                          <TableHead className="text-right text-slate-300 py-2.5">Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {!selectedAsset.allocations || selectedAsset.allocations.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={7} className="text-center py-4 text-slate-600">
                              No allocation history recorded for this asset.
                            </TableCell>
                          </TableRow>
                        ) : (
                          selectedAsset.allocations.map((alloc) => (
                            <TableRow key={alloc.id} className="hover:bg-slate-900/30 border-b border-slate-800/60">
                              <TableCell className="font-semibold text-slate-200">{alloc.holder?.name || "-"}</TableCell>
                              <TableCell>{alloc.department?.name || "-"}</TableCell>
                              <TableCell>{new Date(alloc.allocatedAt).toLocaleDateString()}</TableCell>
                              <TableCell>{alloc.expectedReturnDate ? new Date(alloc.expectedReturnDate).toLocaleDateString() : "-"}</TableCell>
                              <TableCell>{alloc.returnedAt ? new Date(alloc.returnedAt).toLocaleDateString() : "-"}</TableCell>
                              <TableCell className="max-w-[120px] truncate">{alloc.conditionAtReturn || "-"}</TableCell>
                              <TableCell className="text-right">
                                <span
                                  className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold ${
                                    alloc.isActive
                                      ? "bg-blue-500/10 text-blue-400"
                                      : "bg-slate-800 text-slate-400"
                                  }`}
                                >
                                  {alloc.isActive ? "ACTIVE" : "RETURNED"}
                                </span>
                              </TableCell>
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </div>

                {/* Maintenance History Section */}
                <div className="space-y-3">
                  <h3 className="text-md font-bold text-white flex items-center gap-2">
                    <BadgeInfo className="h-4.5 w-4.5 text-indigo-400" />
                    Maintenance History
                  </h3>
                  <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-950/20 text-xs">
                    <Table>
                      <TableHeader className="bg-slate-900/60 border-b border-slate-800">
                        <TableRow>
                          <TableHead className="text-slate-300 py-2.5">Raised By</TableHead>
                          <TableHead className="text-slate-300 py-2.5">Date Raised</TableHead>
                          <TableHead className="text-slate-300 py-2.5">Description</TableHead>
                          <TableHead className="text-slate-300 py-2.5">Priority</TableHead>
                          <TableHead className="text-right text-slate-300 py-2.5">Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {!selectedAsset.maintenanceRequests || selectedAsset.maintenanceRequests.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={5} className="text-center py-4 text-slate-600">
                              No maintenance records for this asset.
                            </TableCell>
                          </TableRow>
                        ) : (
                          selectedAsset.maintenanceRequests.map((req) => (
                            <TableRow key={req.id} className="hover:bg-slate-900/30 border-b border-slate-800/60">
                              <TableCell className="font-semibold text-slate-200">{req.raisedBy.name}</TableCell>
                              <TableCell>{new Date(req.createdAt).toLocaleDateString()}</TableCell>
                              <TableCell className="max-w-[200px] truncate" title={req.issueDescription}>
                                {req.issueDescription}
                              </TableCell>
                              <TableCell>
                                <span
                                  className={`inline-flex items-center rounded-md px-2 py-0.2 font-bold ${
                                    req.priority === "CRITICAL" || req.priority === "HIGH"
                                      ? "bg-red-500/10 text-red-400"
                                      : req.priority === "MEDIUM"
                                      ? "bg-orange-500/10 text-orange-400"
                                      : "bg-slate-800 text-slate-300"
                                  }`}
                                >
                                  {req.priority}
                                </span>
                              </TableCell>
                              <TableCell className="text-right">
                                <span
                                  className={`inline-flex items-center rounded px-2 py-0.2 font-semibold ${
                                    req.status === "RESOLVED"
                                      ? "bg-emerald-500/10 text-emerald-400"
                                      : req.status === "REJECTED"
                                      ? "bg-red-500/10 text-red-400"
                                      : "bg-blue-500/10 text-blue-400"
                                  }`}
                                >
                                  {req.status}
                                </span>
                              </TableCell>
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              </div>

              <DialogFooter className="border-t border-slate-800 pt-4">
                <Button
                  onClick={() => setDetailsOpen(false)}
                  className="bg-slate-800 hover:bg-slate-700 text-slate-100 rounded-lg px-6"
                >
                  Close View
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
