"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { LayoutDashboard, LogOut, Settings, Plus, Landmark, ShieldAlert, CheckCircle2, Search, ArrowRight, User, AlertCircle, Wrench, ShieldCheck, ThumbsUp, ThumbsDown } from "lucide-react";
import { Sidebar } from "@/components/sidebar";

interface Asset {
  id: string;
  assetTag: string;
  name: string;
}

interface MaintenanceRequest {
  id: string;
  assetId: string;
  asset: { id: string; name: string; assetTag: string; status: string };
  issueDescription: string;
  priority: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  status: "PENDING" | "APPROVED" | "REJECTED" | "TECHNICIAN_ASSIGNED" | "IN_PROGRESS" | "RESOLVED";
  photoUrl: string | null;
  createdAt: string;
  raisedBy: { id: string; name: string; email: string };
}

export default function MaintenanceKanbanPage() {
  const router = useRouter();

  // Authentication State
  const [currentUser, setCurrentUser] = useState<{ id: string; name: string; role: string } | null>(null);

  // Data States
  const [requests, setRequests] = useState<MaintenanceRequest[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]);
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Raise Request Modal State
  const [raiseOpen, setRaiseOpen] = useState(false);
  const [selectedAssetId, setSelectedAssetId] = useState("");
  const [issueDescription, setIssueDescription] = useState("");
  const [priority, setPriority] = useState<"LOW" | "MEDIUM" | "HIGH" | "CRITICAL">("MEDIUM");
  const [photoUrl, setPhotoUrl] = useState("");

  // Load current session
  const fetchSession = async () => {
    try {
      const res = await fetch("/api/admin/employees?limit=1"); 
      if (res.status === 401) {
        router.push("/login");
        return;
      }
      const cookies = document.cookie.split("; ");
      const sessionCookie = cookies.find((row) => row.startsWith("session="));
      if (sessionCookie) {
        const token = sessionCookie.split("=")[1];
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

  // Fetch Maintenance Requests
  const fetchRequests = async () => {
    try {
      const res = await fetch("/api/maintenance");
      if (res.ok) {
        const data = await res.json();
        setRequests(data.requests || []);
      }
    } catch (e) {
      console.error("Failed to fetch maintenance requests:", e);
    }
  };

  // Fetch Available Assets for Modal Selection
  const fetchAssets = async () => {
    try {
      const res = await fetch("/api/assets?limit=100");
      if (res.ok) {
        const data = await res.json();
        setAssets(data.assets || []);
      }
    } catch (e) {
      console.error("Failed to fetch assets:", e);
    }
  };

  useEffect(() => {
    fetchSession();
    fetchRequests();
    fetchAssets();

    // Live Polling: Poll requests every 8 seconds per Standards Rule 5
    const interval = setInterval(() => {
      fetchRequests();
    }, 8000);

    return () => clearInterval(interval);
  }, []);

  // Submit Maintenance Request
  const handleRaiseRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (!selectedAssetId || !issueDescription) {
      setError("Please select an asset and write an issue description.");
      return;
    }

    try {
      const res = await fetch("/api/maintenance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          assetId: selectedAssetId,
          issueDescription,
          priority,
          photoUrl: photoUrl || null,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to raise request");

      setSuccess("Maintenance request submitted successfully.");
      setRaiseOpen(false);
      
      // Reset form fields
      setSelectedAssetId("");
      setIssueDescription("");
      setPriority("MEDIUM");
      setPhotoUrl("");
      
      fetchRequests();
    } catch (err: any) {
      setError(err.message);
    }
  };

  // Resolve (Approve/Reject) Request
  const handleResolveRequest = async (requestId: string, action: "APPROVE" | "REJECT") => {
    setError("");
    setSuccess("");
    try {
      const res = await fetch(`/api/maintenance/${requestId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to resolve request");

      setSuccess(`Request successfully ${action === "APPROVE" ? "approved" : "rejected"}.`);
      fetchRequests();
    } catch (err: any) {
      setError(err.message);
    }
  };

  // Transition Status (Technician Workflow)
  const handleTransitionStatus = async (requestId: string, nextStatus: string) => {
    setError("");
    setSuccess("");
    try {
      const res = await fetch(`/api/maintenance/${requestId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to transition status");

      setSuccess(`Request moved to status: ${nextStatus.replaceAll('_', ' ')}.`);
      fetchRequests();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  };

  const getPriorityBadgeClass = (priority: string) => {
    switch (priority) {
      case "CRITICAL":
        return "bg-red-500/10 text-red-400 border-red-500/30";
      case "HIGH":
        return "bg-orange-500/10 text-orange-400 border-orange-500/30";
      case "MEDIUM":
        return "bg-amber-500/10 text-amber-400 border-amber-500/30";
      case "LOW":
      default:
        return "bg-slate-800 text-slate-300 border-slate-700";
    }
  };

  // Filter requests into Kanban columns
  const getColumnRequests = (statusGroup: string) => {
    return requests.filter((r) => {
      if (statusGroup === "PENDING") return r.status === "PENDING";
      if (statusGroup === "APPROVED_REJECTED") return r.status === "APPROVED" || r.status === "REJECTED";
      if (statusGroup === "TECHNICIAN") return r.status === "TECHNICIAN_ASSIGNED";
      if (statusGroup === "IN_PROGRESS") return r.status === "IN_PROGRESS";
      if (statusGroup === "RESOLVED") return r.status === "RESOLVED";
      return false;
    });
  };

  const isManager = currentUser?.role === "ASSET_MANAGER" || currentUser?.role === "ADMIN";

  return (
    <div className="flex min-h-screen bg-slate-950 text-slate-100 font-sans">
      <Sidebar activePath="/maintenance" />

      {/* Main Panel */}
      <main className="flex-1 px-8 py-8 overflow-auto">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-8 gap-4">
          <div>
            <div className="text-[10px] uppercase font-bold text-indigo-400 tracking-wider">Screen 7</div>
            <h1 className="text-3xl font-extrabold tracking-tight text-white flex items-center gap-3">
              <Wrench className="h-8 w-8 text-indigo-500" />
              Maintenance Kanban
            </h1>
            <p className="mt-1 text-slate-400">
              Track active hardware issues and approve repairs in real-time (polling live every 8s).
            </p>
          </div>

          <Dialog open={raiseOpen} onOpenChange={setRaiseOpen}>
            <DialogTrigger
              render={
                <Button
                  onClick={() => {
                    setSelectedAssetId("");
                    setIssueDescription("");
                    setPriority("MEDIUM");
                    setPhotoUrl("");
                    setError("");
                  }}
                  className="bg-indigo-600 hover:bg-indigo-500 text-white flex items-center gap-2 rounded-lg"
                >
                  <Plus className="h-4 w-4" />
                  Raise Maintenance Request
                </Button>
              }
            />
            <DialogContent className="bg-slate-900 text-slate-100 border-slate-800 max-w-md">
              <DialogHeader>
                <DialogTitle className="text-xl font-bold">Raise Maintenance Request</DialogTitle>
                <DialogDescription className="text-slate-400">
                  Select an asset and submit repair details.
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleRaiseRequest} className="space-y-4 py-2">
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
                    Select Asset
                  </label>
                  <select
                    required
                    value={selectedAssetId}
                    onChange={(e) => setSelectedAssetId(e.target.value)}
                    className="w-full rounded-lg border border-slate-800 bg-slate-950 p-2.5 text-sm text-slate-100 focus:outline-none"
                  >
                    <option value="">Select Asset...</option>
                    {assets.map((a) => (
                      <option key={a.id} value={a.id}>{a.name} ({a.assetTag})</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
                    Issue Description (Min 5 chars)
                  </label>
                  <textarea
                    required
                    rows={3}
                    value={issueDescription}
                    onChange={(e) => setIssueDescription(e.target.value)}
                    placeholder="Battery swelling, screen flickering..."
                    className="w-full rounded-lg border border-slate-800 bg-slate-950 p-2.5 text-sm text-slate-100 placeholder-slate-650 focus:outline-none"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider block">
                    Priority Urgency
                  </label>
                  <div className="flex gap-2">
                    {["LOW", "MEDIUM", "HIGH", "CRITICAL"].map((p) => (
                      <button
                        key={p}
                        type="button"
                        onClick={() => setPriority(p as any)}
                        className={`flex-1 py-1.5 px-2 text-xs font-bold border rounded-lg transition-all duration-200 ${
                          priority === p
                            ? "bg-indigo-650 text-white border-indigo-500 shadow-md shadow-indigo-600/10"
                            : "border-slate-800 bg-slate-950 text-slate-400 hover:text-slate-200"
                        }`}
                      >
                        {p}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
                    Optional Attachment Link (Photo URL)
                  </label>
                  <Input
                    value={photoUrl}
                    onChange={(e) => setPhotoUrl(e.target.value)}
                    placeholder="https://images.unsplash.com/photo-broken..."
                    className="bg-slate-950 border-slate-800 text-slate-100"
                  />
                </div>

                <DialogFooter className="pt-2">
                  <Button type="button" variant="outline" onClick={() => setRaiseOpen(false)} className="border-slate-800 text-slate-300">
                    Cancel
                  </Button>
                  <Button type="submit" className="bg-indigo-600 hover:bg-indigo-500 text-white">
                    Submit Request
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
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

        {/* Kanban Board Grid */}
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4 items-start">
          
          {/* Column 1: PENDING */}
          <div className="rounded-xl border border-slate-800 bg-slate-900/25 p-3 min-h-[60vh] space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <span className="text-sm font-bold text-slate-200">Pending Review</span>
              <span className="bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 text-[10px] font-bold px-2 py-0.5 rounded-full">
                {getColumnRequests("PENDING").length}
              </span>
            </div>
            <div className="space-y-3 max-h-[70vh] overflow-y-auto pr-1">
              {getColumnRequests("PENDING").map((req) => (
                <Card key={req.id} className="border-slate-850 bg-slate-950 text-slate-100 shadow-md">
                  <CardHeader className="p-3 pb-1">
                    <div className="flex items-start justify-between gap-1">
                      <div>
                        <div className="font-bold text-xs text-white">{req.asset.name}</div>
                        <div className="text-[9px] text-indigo-400 font-mono font-bold mt-0.5">{req.asset.assetTag}</div>
                      </div>
                      <span className={`inline-flex items-center rounded px-1.5 py-0.2 text-[8px] font-bold border ${getPriorityBadgeClass(req.priority)}`}>
                        {req.priority}
                      </span>
                    </div>
                  </CardHeader>
                  <CardContent className="p-3 pt-1 space-y-3">
                    <p className="text-xs text-slate-300 leading-relaxed font-mono">{req.issueDescription}</p>
                    <div className="flex items-center gap-1.5 text-[9px] text-slate-500">
                      <User className="h-3 w-3" />
                      <span>By {req.raisedBy.name}</span>
                    </div>
                    {isManager && (
                      <div className="flex items-center gap-2 pt-1 border-t border-slate-900">
                        <Button
                          size="sm"
                          onClick={() => handleResolveRequest(req.id, "APPROVE")}
                          className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-[10px] h-7"
                        >
                          <ThumbsUp className="h-3 w-3 mr-1" /> Approve
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleResolveRequest(req.id, "REJECT")}
                          className="flex-1 text-red-400 hover:text-red-300 hover:bg-red-950/20 text-[10px] h-7"
                        >
                          <ThumbsDown className="h-3 w-3 mr-1" /> Reject
                        </Button>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>

          {/* Column 2: APPROVED / REJECTED */}
          <div className="rounded-xl border border-slate-800 bg-slate-900/25 p-3 min-h-[60vh] space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <span className="text-sm font-bold text-slate-200">Approved / Rejected</span>
              <span className="bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 text-[10px] font-bold px-2 py-0.5 rounded-full">
                {getColumnRequests("APPROVED_REJECTED").length}
              </span>
            </div>
            <div className="space-y-3 max-h-[70vh] overflow-y-auto pr-1">
              {getColumnRequests("APPROVED_REJECTED").map((req) => (
                <Card key={req.id} className="border-slate-850 bg-slate-950 text-slate-100 shadow-md">
                  <CardHeader className="p-3 pb-1">
                    <div className="flex items-start justify-between gap-1">
                      <div>
                        <div className="font-bold text-xs text-white">{req.asset.name}</div>
                        <div className="text-[9px] text-indigo-400 font-mono font-bold mt-0.5">{req.asset.assetTag}</div>
                      </div>
                      <span className={`inline-flex items-center rounded px-1.5 py-0.2 text-[8px] font-bold border ${getPriorityBadgeClass(req.priority)}`}>
                        {req.priority}
                      </span>
                    </div>
                  </CardHeader>
                  <CardContent className="p-3 pt-1 space-y-3">
                    <p className="text-xs text-slate-300 leading-relaxed font-mono">{req.issueDescription}</p>
                    <div className="flex items-center justify-between items-center text-[10px] font-bold">
                      <span className={req.status === "APPROVED" ? "text-emerald-400" : "text-red-400"}>
                        {req.status}
                      </span>
                      {req.status === "APPROVED" && (
                        <Button
                          size="sm"
                          onClick={() => handleTransitionStatus(req.id, "TECHNICIAN_ASSIGNED")}
                          className="bg-indigo-600 hover:bg-indigo-500 text-white text-[9px] h-6 py-0 px-2 flex items-center gap-1"
                        >
                          Assign Tech <ArrowRight className="h-3 w-3" />
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>

          {/* Column 3: TECHNICIAN ASSIGNED */}
          <div className="rounded-xl border border-slate-800 bg-slate-900/25 p-3 min-h-[60vh] space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <span className="text-sm font-bold text-slate-200">Tech Assigned</span>
              <span className="bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 text-[10px] font-bold px-2 py-0.5 rounded-full">
                {getColumnRequests("TECHNICIAN").length}
              </span>
            </div>
            <div className="space-y-3 max-h-[70vh] overflow-y-auto pr-1">
              {getColumnRequests("TECHNICIAN").map((req) => (
                <Card key={req.id} className="border-slate-850 bg-slate-950 text-slate-100 shadow-md">
                  <CardHeader className="p-3 pb-1">
                    <div className="flex items-start justify-between gap-1">
                      <div>
                        <div className="font-bold text-xs text-white">{req.asset.name}</div>
                        <div className="text-[9px] text-indigo-400 font-mono font-bold mt-0.5">{req.asset.assetTag}</div>
                      </div>
                      <span className={`inline-flex items-center rounded px-1.5 py-0.2 text-[8px] font-bold border ${getPriorityBadgeClass(req.priority)}`}>
                        {req.priority}
                      </span>
                    </div>
                  </CardHeader>
                  <CardContent className="p-3 pt-1 space-y-3">
                    <p className="text-xs text-slate-300 leading-relaxed font-mono">{req.issueDescription}</p>
                    <div className="flex items-center justify-between items-center text-[10px] pt-1">
                      <span className="text-blue-400 font-semibold">ASSIGNED</span>
                      <Button
                        size="sm"
                        onClick={() => handleTransitionStatus(req.id, "IN_PROGRESS")}
                        className="bg-indigo-600 hover:bg-indigo-500 text-white text-[9px] h-6 py-0 px-2 flex items-center gap-1"
                      >
                        Start Work <ArrowRight className="h-3 w-3" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>

          {/* Column 4: IN PROGRESS */}
          <div className="rounded-xl border border-slate-800 bg-slate-900/25 p-3 min-h-[60vh] space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <span className="text-sm font-bold text-slate-200">In Progress</span>
              <span className="bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 text-[10px] font-bold px-2 py-0.5 rounded-full">
                {getColumnRequests("IN_PROGRESS").length}
              </span>
            </div>
            <div className="space-y-3 max-h-[70vh] overflow-y-auto pr-1">
              {getColumnRequests("IN_PROGRESS").map((req) => (
                <Card key={req.id} className="border-slate-850 bg-slate-950 text-slate-100 shadow-md">
                  <CardHeader className="p-3 pb-1">
                    <div className="flex items-start justify-between gap-1">
                      <div>
                        <div className="font-bold text-xs text-white">{req.asset.name}</div>
                        <div className="text-[9px] text-indigo-400 font-mono font-bold mt-0.5">{req.asset.assetTag}</div>
                      </div>
                      <span className={`inline-flex items-center rounded px-1.5 py-0.2 text-[8px] font-bold border ${getPriorityBadgeClass(req.priority)}`}>
                        {req.priority}
                      </span>
                    </div>
                  </CardHeader>
                  <CardContent className="p-3 pt-1 space-y-3">
                    <p className="text-xs text-slate-300 leading-relaxed font-mono">{req.issueDescription}</p>
                    <div className="flex items-center justify-between items-center text-[10px] pt-1">
                      <span className="text-orange-400 font-semibold">REPAIRING</span>
                      <Button
                        size="sm"
                        onClick={() => handleTransitionStatus(req.id, "RESOLVED")}
                        className="bg-emerald-600 hover:bg-emerald-500 text-white text-[9px] h-6 py-0 px-2 flex items-center gap-1"
                      >
                        Resolve <ArrowRight className="h-3 w-3" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>

          {/* Column 5: RESOLVED */}
          <div className="rounded-xl border border-slate-800 bg-slate-900/25 p-3 min-h-[60vh] space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <span className="text-sm font-bold text-slate-200">Resolved</span>
              <span className="bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 text-[10px] font-bold px-2 py-0.5 rounded-full">
                {getColumnRequests("RESOLVED").length}
              </span>
            </div>
            <div className="space-y-3 max-h-[70vh] overflow-y-auto pr-1">
              {getColumnRequests("RESOLVED").map((req) => (
                <Card key={req.id} className="border-slate-850 bg-slate-950 opacity-60 text-slate-100 shadow-md">
                  <CardHeader className="p-3 pb-1">
                    <div className="flex items-start justify-between gap-1">
                      <div>
                        <div className="font-bold text-xs text-white">{req.asset.name}</div>
                        <div className="text-[9px] text-indigo-400 font-mono font-bold mt-0.5">{req.asset.assetTag}</div>
                      </div>
                      <span className={`inline-flex items-center rounded px-1.5 py-0.2 text-[8px] font-bold border ${getPriorityBadgeClass(req.priority)}`}>
                        {req.priority}
                      </span>
                    </div>
                  </CardHeader>
                  <CardContent className="p-3 pt-1 space-y-2">
                    <p className="text-xs text-slate-300 leading-relaxed font-mono">{req.issueDescription}</p>
                    <div className="flex items-center gap-1 text-[10px] text-emerald-400 font-bold">
                      <ShieldCheck className="h-4.5 w-4.5" />
                      <span>RESOLVED</span>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>

        </div>
      </main>
    </div>
  );
}
