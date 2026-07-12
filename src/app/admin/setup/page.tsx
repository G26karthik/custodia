"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LayoutDashboard, LogOut, Settings, Plus, Edit2, UserCheck, Folder, Network, Search, Trash2, ShieldAlert } from "lucide-react";
import { Sidebar } from "@/components/sidebar";

interface UserInfo {
  id: string;
  name: string;
  email: string;
}

interface Department {
  id: string;
  name: string;
  code: string;
  headId: string | null;
  head?: { id: string; name: string; email: string } | null;
  parentId: string | null;
  parent?: { id: string; name: string; code: string } | null;
  status: "ACTIVE" | "INACTIVE";
}

interface Category {
  id: string;
  name: string;
  customFields: Record<string, any> | null;
}

interface Employee {
  id: string;
  name: string;
  email: string;
  role: "EMPLOYEE" | "DEPARTMENT_HEAD" | "ASSET_MANAGER" | "ADMIN";
  status: "ACTIVE" | "INACTIVE";
  departmentId: string | null;
  department?: { id: string; name: string } | null;
}

export default function OrgSetupPage() {
  const router = useRouter();

  // Active Tab
  const [activeTab, setActiveTab] = useState("departments");

  // Common loading/error
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // --- Tab A: Departments State ---
  const [departments, setDepartments] = useState<Department[]>([]);
  const [activeUsers, setActiveUsers] = useState<UserInfo[]>([]);
  const [deptFormOpen, setDeptFormOpen] = useState(false);
  const [editingDept, setEditingDept] = useState<Department | null>(null);
  const [deptName, setDeptName] = useState("");
  const [deptCode, setDeptCode] = useState("");
  const [deptHeadId, setDeptHeadId] = useState("");
  const [deptParentId, setDeptParentId] = useState("");
  const [deptStatus, setDeptStatus] = useState<"ACTIVE" | "INACTIVE">("ACTIVE");

  // --- Tab B: Categories State ---
  const [categories, setCategories] = useState<Category[]>([]);
  const [catFormOpen, setCatFormOpen] = useState(false);
  const [editingCat, setEditingCat] = useState<Category | null>(null);
  const [catName, setCatName] = useState("");
  // Custom fields as dynamic key-value pairs
  const [catCustomFields, setCatCustomFields] = useState<{ key: string; value: string }[]>([
    { key: "", value: "" }
  ]);

  // --- Tab C: Employee Directory State ---
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [allDepts, setAllDepts] = useState<{ id: string; name: string }[]>([]);
  const [empSearch, setEmpSearch] = useState("");
  const [empRoleFilter, setEmpRoleFilter] = useState("");
  const [empStatusFilter, setEmpStatusFilter] = useState("");
  const [empDeptFilter, setEmpDeptFilter] = useState("");
  const [empPage, setEmpPage] = useState(1);
  const [empTotalPages, setEmpTotalPages] = useState(1);
  const [empTotal, setEmpTotal] = useState(0);

  // Fetch Departments
  const fetchDepartments = async () => {
    try {
      const res = await fetch("/api/admin/departments");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to fetch departments");
      setDepartments(data.departments || []);
      setActiveUsers(data.users || []);
    } catch (err: any) {
      setError(err.message);
    }
  };

  // Fetch Categories
  const fetchCategories = async () => {
    try {
      const res = await fetch("/api/admin/categories");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to fetch categories");
      setCategories(data.categories || []);
    } catch (err: any) {
      setError(err.message);
    }
  };

  // Fetch Employees
  const fetchEmployees = async (pageNum = empPage) => {
    try {
      const query = new URLSearchParams({
        page: pageNum.toString(),
        limit: "10",
        search: empSearch,
        role: empRoleFilter,
        status: empStatusFilter,
        departmentId: empDeptFilter,
      });
      const res = await fetch(`/api/admin/employees?${query.toString()}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to fetch employees");
      setEmployees(data.employees || []);
      setAllDepts(data.departments || []);
      setEmpTotalPages(data.totalPages || 1);
      setEmpTotal(data.total || 0);
    } catch (err: any) {
      setError(err.message);
    }
  };

  useEffect(() => {
    if (activeTab === "departments") {
      fetchDepartments();
    } else if (activeTab === "categories") {
      fetchCategories();
    } else if (activeTab === "employees") {
      fetchEmployees(1);
    }
  }, [activeTab]);

  // Handle Search & Filter trigger for employees
  const handleEmpFilterSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setEmpPage(1);
    fetchEmployees(1);
  };

  // Department Save
  const handleSaveDept = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");

    try {
      const res = await fetch("/api/admin/departments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: editingDept?.id,
          name: deptName,
          code: deptCode,
          headId: deptHeadId === "none" ? null : deptHeadId,
          parentId: deptParentId === "none" ? null : deptParentId,
          status: deptStatus,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save department");

      setSuccess(`Department ${deptName} saved successfully.`);
      setDeptFormOpen(false);
      fetchDepartments();
      // Reset form
      setEditingDept(null);
      setDeptName("");
      setDeptCode("");
      setDeptHeadId("");
      setDeptParentId("");
      setDeptStatus("ACTIVE");
    } catch (err: any) {
      setError(err.message);
    }
  };

  // Department Edit Trigger
  const handleEditDeptTrigger = (dept: Department) => {
    setEditingDept(dept);
    setDeptName(dept.name);
    setDeptCode(dept.code);
    setDeptHeadId(dept.headId || "none");
    setDeptParentId(dept.parentId || "none");
    setDeptStatus(dept.status);
    setDeptFormOpen(true);
  };

  // Add Category Custom Field row
  const addCustomFieldRow = () => {
    setCatCustomFields([...catCustomFields, { key: "", value: "" }]);
  };

  // Remove Category Custom Field row
  const removeCustomFieldRow = (idx: number) => {
    setCatCustomFields(catCustomFields.filter((_, i) => i !== idx));
  };

  const handleCustomFieldChange = (idx: number, field: "key" | "value", val: string) => {
    const updated = [...catCustomFields];
    updated[idx][field] = val;
    setCatCustomFields(updated);
  };

  // Category Save
  const handleSaveCat = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");

    // Build JSON object from key-value pairs
    const fieldsObj: Record<string, string> = {};
    catCustomFields.forEach((cf) => {
      if (cf.key.trim()) {
        fieldsObj[cf.key.trim()] = cf.value.trim();
      }
    });

    try {
      const res = await fetch("/api/admin/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: editingCat?.id,
          name: catName,
          customFields: fieldsObj,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save category");

      setSuccess(`Category ${catName} saved successfully.`);
      setCatFormOpen(false);
      fetchCategories();
      // Reset
      setEditingCat(null);
      setCatName("");
      setCatCustomFields([{ key: "", value: "" }]);
    } catch (err: any) {
      setError(err.message);
    }
  };

  // Category Edit Trigger
  const handleEditCatTrigger = (cat: Category) => {
    setEditingCat(cat);
    setCatName(cat.name);
    
    // Parse custom fields back into list
    if (cat.customFields) {
      const list = Object.entries(cat.customFields).map(([key, value]) => ({
        key,
        value: String(value),
      }));
      setCatCustomFields(list.length > 0 ? list : [{ key: "", value: "" }]);
    } else {
      setCatCustomFields([{ key: "", value: "" }]);
    }
    setCatFormOpen(true);
  };

  // Employee directory update handler
  const handleUpdateEmployee = async (empId: string, field: string, value: string) => {
    setError("");
    setSuccess("");

    try {
      const payload: any = { id: empId };
      if (field === "role") payload.role = value;
      if (field === "status") payload.status = value;
      if (field === "departmentId") payload.departmentId = value === "none" ? null : value;

      const res = await fetch("/api/admin/employees", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to update employee");

      setSuccess(`Employee updated successfully.`);
      fetchEmployees();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  };

  return (
    <div className="flex min-h-screen bg-slate-950 text-slate-100 font-sans">
      <Sidebar activePath="/admin/setup" />

      {/* Main Admin Setup Panel */}
      <main className="flex-1 px-8 py-8 overflow-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-extrabold tracking-tight text-white flex items-center gap-3">
            <Settings className="h-8 w-8 text-indigo-500" />
            Organization Setup
          </h1>
          <p className="mt-1 text-slate-400">
            Manage departments, asset categories, and the employee directory.
          </p>
        </div>

        {error && (
          <div className="mb-6 flex items-center gap-2 rounded-lg bg-red-950/50 border border-red-500/30 p-4 text-sm text-red-400">
            <ShieldAlert className="h-5 w-5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {success && (
          <div className="mb-6 flex items-center gap-2 rounded-lg bg-emerald-950/50 border border-emerald-500/30 p-4 text-sm text-emerald-400">
            <UserCheck className="h-5 w-5 shrink-0" />
            <span>{success}</span>
          </div>
        )}

        <Tabs defaultValue="departments" value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="bg-slate-900 border border-slate-800 p-1 rounded-xl">
            <TabsTrigger value="departments" className="data-[state=active]:bg-indigo-600 data-[state=active]:text-white rounded-lg flex items-center gap-2">
              <Network className="h-4 w-4" />
              Departments
            </TabsTrigger>
            <TabsTrigger value="categories" className="data-[state=active]:bg-indigo-600 data-[state=active]:text-white rounded-lg flex items-center gap-2">
              <Folder className="h-4 w-4" />
              Asset Categories
            </TabsTrigger>
            <TabsTrigger value="employees" className="data-[state=active]:bg-indigo-600 data-[state=active]:text-white rounded-lg flex items-center gap-2">
              <UserCheck className="h-4 w-4" />
              Employee Directory
            </TabsTrigger>
          </TabsList>

          {/* --- Tab A: Departments Content --- */}
          <TabsContent value="departments" className="space-y-4">
            <Card className="border-slate-800 bg-slate-900/40 text-slate-100 shadow-md">
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-xl font-bold">Departments List</CardTitle>
                  <CardDescription className="text-slate-400">
                    Define and organize business units and assign heads.
                  </CardDescription>
                </div>
                <Dialog open={deptFormOpen} onOpenChange={setDeptFormOpen}>
                  <DialogTrigger
                    render={
                      <Button
                        onClick={() => {
                          setEditingDept(null);
                          setDeptName("");
                          setDeptCode("");
                          setDeptHeadId("none");
                          setDeptParentId("none");
                          setDeptStatus("ACTIVE");
                        }}
                        className="bg-indigo-600 hover:bg-indigo-500 text-white flex items-center gap-2 rounded-lg"
                      >
                        <Plus className="h-4 w-4" />
                        Add Department
                      </Button>
                    }
                  />
                  <DialogContent className="bg-slate-900 text-slate-100 border-slate-800">
                    <DialogHeader>
                      <DialogTitle className="text-xl font-bold">
                        {editingDept ? "Edit Department" : "Add Department"}
                      </DialogTitle>
                      <DialogDescription className="text-slate-400">
                        Create or edit organizational department records.
                      </DialogDescription>
                    </DialogHeader>
                    <form onSubmit={handleSaveDept} className="space-y-4 py-2">
                      <div className="space-y-2">
                        <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
                          Department Name
                        </label>
                        <Input
                          required
                          value={deptName}
                          onChange={(e) => setDeptName(e.target.value)}
                          className="bg-slate-950 border-slate-800 text-slate-100"
                          placeholder="Engineering"
                        />
                      </div>

                      <div className="space-y-2">
                        <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
                          Department Code (Unique)
                        </label>
                        <Input
                          required
                          value={deptCode}
                          onChange={(e) => setDeptCode(e.target.value)}
                          className="bg-slate-950 border-slate-800 text-slate-100 uppercase"
                          placeholder="ENG"
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
                            Department Head
                          </label>
                          <select
                            value={deptHeadId}
                            onChange={(e) => setDeptHeadId(e.target.value)}
                            className="w-full rounded-lg border border-slate-800 bg-slate-950 p-2.5 text-sm text-slate-100 focus:border-indigo-500 focus:outline-none"
                          >
                            <option value="none">Assign head...</option>
                            {activeUsers.map((u) => (
                              <option key={u.id} value={u.id}>
                                {u.name} ({u.email})
                              </option>
                            ))}
                          </select>
                        </div>

                        <div className="space-y-2">
                          <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
                            Parent Department
                          </label>
                          <select
                            value={deptParentId}
                            onChange={(e) => setDeptParentId(e.target.value)}
                            className="w-full rounded-lg border border-slate-800 bg-slate-950 p-2.5 text-sm text-slate-100 focus:border-indigo-500 focus:outline-none"
                          >
                            <option value="none">No Parent (Top-level)</option>
                            {departments
                              .filter((d) => d.id !== editingDept?.id)
                              .map((d) => (
                                <option key={d.id} value={d.id}>
                                  {d.name} ({d.code})
                                </option>
                              ))}
                          </select>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
                          Status
                        </label>
                        <select
                          value={deptStatus}
                          onChange={(e) => setDeptStatus(e.target.value as any)}
                          className="w-full rounded-lg border border-slate-800 bg-slate-950 p-2.5 text-sm text-slate-100 focus:border-indigo-500 focus:outline-none"
                        >
                          <option value="ACTIVE">ACTIVE</option>
                          <option value="INACTIVE">INACTIVE</option>
                        </select>
                      </div>

                      <DialogFooter className="mt-6">
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => setDeptFormOpen(false)}
                          className="border-slate-800 hover:bg-slate-800 text-slate-300"
                        >
                          Cancel
                        </Button>
                        <Button type="submit" className="bg-indigo-600 hover:bg-indigo-500 text-white">
                          Save Changes
                        </Button>
                      </DialogFooter>
                    </form>
                  </DialogContent>
                </Dialog>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-950/20">
                  <Table>
                    <TableHeader className="bg-slate-900/60 border-b border-slate-800">
                      <TableRow>
                        <TableHead className="text-slate-300">Name</TableHead>
                        <TableHead className="text-slate-300">Code</TableHead>
                        <TableHead className="text-slate-300">Head</TableHead>
                        <TableHead className="text-slate-300">Parent</TableHead>
                        <TableHead className="text-slate-300">Status</TableHead>
                        <TableHead className="text-right text-slate-300">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {departments.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={6} className="text-center py-8 text-slate-500">
                            No departments found. Create one to get started.
                          </TableCell>
                        </TableRow>
                      ) : (
                        departments.map((dept) => (
                          <TableRow key={dept.id} className="hover:bg-slate-900/30 border-b border-slate-800/60">
                            <TableCell className="font-semibold text-white">{dept.name}</TableCell>
                            <TableCell>
                              <span className="inline-flex items-center rounded-md bg-slate-800 px-2.5 py-0.5 text-xs font-bold text-slate-200 tracking-wider">
                                {dept.code}
                              </span>
                            </TableCell>
                            <TableCell className="text-slate-300">{dept.head?.name || "-"}</TableCell>
                            <TableCell className="text-slate-400">{dept.parent?.name || "-"}</TableCell>
                            <TableCell>
                              <span
                                className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                                  dept.status === "ACTIVE"
                                    ? "bg-emerald-500/10 text-emerald-400"
                                    : "bg-red-500/10 text-red-400"
                                }`}
                              >
                                {dept.status}
                              </span>
                            </TableCell>
                            <TableCell className="text-right">
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => handleEditDeptTrigger(dept)}
                                className="text-indigo-400 hover:text-indigo-300 hover:bg-slate-800/80"
                              >
                                <Edit2 className="h-4 w-4" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* --- Tab B: Categories Content --- */}
          <TabsContent value="categories" className="space-y-4">
            <Card className="border-slate-800 bg-slate-900/40 text-slate-100 shadow-md">
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-xl font-bold">Asset Categories</CardTitle>
                  <CardDescription className="text-slate-400">
                    Create asset classifications and configure custom schema fields.
                  </CardDescription>
                </div>
                <Dialog open={catFormOpen} onOpenChange={setCatFormOpen}>
                  <DialogTrigger
                    render={
                      <Button
                        onClick={() => {
                          setEditingCat(null);
                          setCatName("");
                          setCatCustomFields([{ key: "", value: "" }]);
                        }}
                        className="bg-indigo-600 hover:bg-indigo-500 text-white flex items-center gap-2 rounded-lg"
                      >
                        <Plus className="h-4 w-4" />
                        Add Category
                      </Button>
                    }
                  />
                  <DialogContent className="bg-slate-900 text-slate-100 border-slate-800 max-w-lg">
                    <DialogHeader>
                      <DialogTitle className="text-xl font-bold">
                        {editingCat ? "Edit Category" : "Add Category"}
                      </DialogTitle>
                      <DialogDescription className="text-slate-400">
                        Create or edit categories and define custom field properties.
                      </DialogDescription>
                    </DialogHeader>
                    <form onSubmit={handleSaveCat} className="space-y-4 py-2">
                      <div className="space-y-2">
                        <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
                          Category Name
                        </label>
                        <Input
                          required
                          value={catName}
                          onChange={(e) => setCatName(e.target.value)}
                          className="bg-slate-950 border-slate-800 text-slate-100"
                          placeholder="Laptops, Office Desks, etc."
                        />
                      </div>

                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
                            Custom Schema Fields (JSON)
                          </label>
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            onClick={addCustomFieldRow}
                            className="text-indigo-400 hover:text-indigo-300 text-xs flex items-center gap-1"
                          >
                            <Plus className="h-3 w-3" /> Add Schema Field
                          </Button>
                        </div>

                        <div className="max-h-48 overflow-y-auto space-y-2 pr-1">
                          {catCustomFields.map((cf, idx) => (
                            <div key={idx} className="flex gap-2 items-center">
                              <Input
                                placeholder="Field Key (e.g. warrantyPeriod)"
                                value={cf.key}
                                onChange={(e) => handleCustomFieldChange(idx, "key", e.target.value)}
                                className="bg-slate-950 border-slate-800 text-slate-100 text-sm"
                              />
                              <Input
                                placeholder="Default Value (e.g. 24)"
                                value={cf.value}
                                onChange={(e) => handleCustomFieldChange(idx, "value", e.target.value)}
                                className="bg-slate-950 border-slate-800 text-slate-100 text-sm"
                              />
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => removeCustomFieldRow(idx)}
                                className="text-red-400 hover:text-red-300 hover:bg-slate-800/80 px-2"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          ))}
                        </div>
                      </div>

                      <DialogFooter className="mt-6">
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => setCatFormOpen(false)}
                          className="border-slate-800 hover:bg-slate-800 text-slate-300"
                        >
                          Cancel
                        </Button>
                        <Button type="submit" className="bg-indigo-600 hover:bg-indigo-500 text-white">
                          Save Changes
                        </Button>
                      </DialogFooter>
                    </form>
                  </DialogContent>
                </Dialog>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-950/20">
                  <Table>
                    <TableHeader className="bg-slate-900/60 border-b border-slate-800">
                      <TableRow>
                        <TableHead className="text-slate-300">Category Name</TableHead>
                        <TableHead className="text-slate-300">Custom Fields / Schema</TableHead>
                        <TableHead className="text-right text-slate-300">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {categories.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={3} className="text-center py-8 text-slate-500">
                            No categories found. Create one to get started.
                          </TableCell>
                        </TableRow>
                      ) : (
                        categories.map((cat) => (
                          <TableRow key={cat.id} className="hover:bg-slate-900/30 border-b border-slate-800/60">
                            <TableCell className="font-semibold text-white">{cat.name}</TableCell>
                            <TableCell>
                              {cat.customFields && Object.keys(cat.customFields).length > 0 ? (
                                <div className="flex flex-wrap gap-1.5">
                                  {Object.entries(cat.customFields).map(([key, val]) => (
                                    <span key={key} className="inline-flex items-center rounded bg-slate-800/70 border border-slate-700/60 px-2 py-0.5 text-xs text-slate-300">
                                      {key}: <strong className="text-indigo-300 ml-1">{String(val)}</strong>
                                    </span>
                                  ))}
                                </div>
                              ) : (
                                <span className="text-slate-500 italic">None</span>
                              )}
                            </TableCell>
                            <TableCell className="text-right">
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => handleEditCatTrigger(cat)}
                                className="text-indigo-400 hover:text-indigo-300 hover:bg-slate-800/80"
                              >
                                <Edit2 className="h-4 w-4" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* --- Tab C: Employee Directory Content --- */}
          <TabsContent value="employees" className="space-y-4">
            <Card className="border-slate-800 bg-slate-900/40 text-slate-100 shadow-md">
              <CardHeader>
                <CardTitle className="text-xl font-bold font-sans">Employee Directory</CardTitle>
                <CardDescription className="text-slate-400">
                  Search users, change department mappings, and promote account roles.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Search & Filter Form */}
                <form onSubmit={handleEmpFilterSubmit} className="grid grid-cols-1 gap-4 md:grid-cols-5 items-end">
                  <div className="space-y-2 md:col-span-2">
                    <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
                      Search Name / Email
                    </label>
                    <div className="relative">
                      <Search className="absolute top-3 left-3 h-4.5 w-4.5 text-slate-500" />
                      <Input
                        value={empSearch}
                        onChange={(e) => setEmpSearch(e.target.value)}
                        placeholder="Search employee..."
                        className="pl-10 bg-slate-950 border-slate-800 text-white"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
                      Role Filter
                    </label>
                    <select
                      value={empRoleFilter}
                      onChange={(e) => setEmpRoleFilter(e.target.value)}
                      className="w-full rounded-lg border border-slate-800 bg-slate-950 p-2.5 text-sm text-slate-100 focus:border-indigo-500 focus:outline-none"
                    >
                      <option value="">All Roles</option>
                      <option value="EMPLOYEE">EMPLOYEE</option>
                      <option value="DEPARTMENT_HEAD">DEPARTMENT_HEAD</option>
                      <option value="ASSET_MANAGER">ASSET_MANAGER</option>
                      <option value="ADMIN">ADMIN</option>
                    </select>
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
                      Department Filter
                    </label>
                    <select
                      value={empDeptFilter}
                      onChange={(e) => setEmpDeptFilter(e.target.value)}
                      className="w-full rounded-lg border border-slate-800 bg-slate-950 p-2.5 text-sm text-slate-100 focus:border-indigo-500 focus:outline-none"
                    >
                      <option value="">All Departments</option>
                      <option value="none">Not Assigned</option>
                      {allDepts.map((d) => (
                        <option key={d.id} value={d.id}>{d.name}</option>
                      ))}
                    </select>
                  </div>

                  <Button type="submit" className="bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-lg flex items-center justify-center gap-2">
                    <Search className="h-4 w-4" /> Filter
                  </Button>
                </form>

                {/* Directory Table */}
                <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-950/20">
                  <Table>
                    <TableHeader className="bg-slate-900/60 border-b border-slate-800">
                      <TableRow>
                        <TableHead className="text-slate-300">Name</TableHead>
                        <TableHead className="text-slate-300">Email</TableHead>
                        <TableHead className="text-slate-300">Department</TableHead>
                        <TableHead className="text-slate-300">Role</TableHead>
                        <TableHead className="text-slate-300">Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {employees.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={5} className="text-center py-8 text-slate-500">
                            No employees found matching filter criteria.
                          </TableCell>
                        </TableRow>
                      ) : (
                        employees.map((emp) => (
                          <TableRow key={emp.id} className="hover:bg-slate-900/30 border-b border-slate-800/60">
                            <TableCell className="font-semibold text-white">{emp.name}</TableCell>
                            <TableCell className="text-slate-300">{emp.email}</TableCell>
                            
                            {/* Department Change Dropdown */}
                            <TableCell>
                              <select
                                value={emp.departmentId || "none"}
                                onChange={(e) => handleUpdateEmployee(emp.id, "departmentId", e.target.value)}
                                className="rounded bg-slate-800/60 border border-slate-700/60 p-1 text-xs text-slate-200 focus:outline-none"
                              >
                                <option value="none">Assign Dept...</option>
                                {allDepts.map((d) => (
                                  <option key={d.id} value={d.id}>{d.name}</option>
                                ))}
                              </select>
                            </TableCell>

                            {/* Role Promotion Dropdown */}
                            <TableCell>
                              <select
                                value={emp.role}
                                disabled={emp.role === "ADMIN"} // Prevent self or other admin demotion easily
                                onChange={(e) => handleUpdateEmployee(emp.id, "role", e.target.value)}
                                className={`rounded border p-1 text-xs font-semibold focus:outline-none ${
                                  emp.role === "ADMIN"
                                    ? "bg-purple-500/10 border-purple-500/30 text-purple-400"
                                    : emp.role === "ASSET_MANAGER"
                                    ? "bg-indigo-500/10 border-indigo-500/30 text-indigo-400 font-bold"
                                    : emp.role === "DEPARTMENT_HEAD"
                                    ? "bg-blue-500/10 border-blue-500/30 text-blue-400"
                                    : "bg-slate-800 border-slate-700 text-slate-300"
                                }`}
                              >
                                <option value="EMPLOYEE">EMPLOYEE</option>
                                <option value="DEPARTMENT_HEAD">DEPARTMENT_HEAD</option>
                                <option value="ASSET_MANAGER">ASSET_MANAGER</option>
                                <option value="ADMIN">ADMIN</option>
                              </select>
                            </TableCell>

                            {/* Status Change Dropdown */}
                            <TableCell>
                              <select
                                value={emp.status}
                                disabled={emp.role === "ADMIN"} // Prevent disabling admin
                                onChange={(e) => handleUpdateEmployee(emp.id, "status", e.target.value)}
                                className={`rounded border p-1 text-xs font-semibold focus:outline-none ${
                                  emp.status === "ACTIVE"
                                    ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
                                    : "bg-red-500/10 border-red-500/30 text-red-400"
                                }`}
                              >
                                <option value="ACTIVE">ACTIVE</option>
                                <option value="INACTIVE">INACTIVE</option>
                              </select>
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>

                {/* Pagination Controls */}
                {empTotalPages > 1 && (
                  <div className="flex items-center justify-between pt-4">
                    <span className="text-sm text-slate-400">
                      Showing page <strong className="text-slate-200">{empPage}</strong> of <strong className="text-slate-200">{empTotalPages}</strong> (total {empTotal} users)
                    </span>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={empPage === 1}
                        onClick={() => {
                          setEmpPage(empPage - 1);
                          fetchEmployees(empPage - 1);
                        }}
                        className="border-slate-800 hover:bg-slate-800 text-slate-300"
                      >
                        Previous
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={empPage === empTotalPages}
                        onClick={() => {
                          setEmpPage(empPage + 1);
                          fetchEmployees(empPage + 1);
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
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
