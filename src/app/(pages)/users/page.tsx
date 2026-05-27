"use client";

import { useEffect, useState } from "react";
import { collection, query, orderBy, onSnapshot, doc, updateDoc, deleteField, deleteDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/auth-context";
import { motion, AnimatePresence } from "framer-motion";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Shield, Search, Loader2, Users, ShieldCheck, ArrowDown, ArrowUp, ArrowUpDown, Trash2 } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import type { UserRole } from "@/types";
import { hasPermission } from "@/lib/permissions";

interface UserProfile {
  uid: string;
  email: string;
  displayName: string | null;
  photoURL: string | null;
  source: "myiot" | "google";
  role: UserRole;
  lastSeen?: string;
  createdAt?: string;
  requestedRole?: UserRole;
}

const ROLE_CONFIG: Record<UserRole, { label: string; desc: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  superadmin: { label: "Super Admin", desc: "Full system control & user role management", variant: "default" },
  admin: { label: "Admin", desc: "Can manage products and operations", variant: "default" },
  payment_approver: { label: "Finance Manager", desc: "Approve and manage all payment transactions — critical security role", variant: "destructive" },
  authorized: { label: "Authorized User", desc: "Can create & CRUD proposals/quotations", variant: "secondary" },
  stakeholder: { label: "Stakeholder", desc: "Read-only view with financial data access", variant: "outline" },
  viewer: { label: "Normal User (Default)", desc: "Read-only access, see & download PDFs", variant: "secondary" },
  engineer: { label: "Engineer", desc: "System planning and operations", variant: "secondary" },
  site_engineer: { label: "Site Engineer", desc: "Field engineer — approves service checklists", variant: "secondary" },
  team_leader: { label: "Technician (Team Leader)", desc: "Field technician for service routes", variant: "secondary" },
  technician: { label: "Technician", desc: "Field technician — routes and checklists", variant: "secondary" },
};

export default function UsersPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [sortField, setSortField] = useState<"name" | "email" | "source" | "role" | "lastSeen">("lastSeen");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");

  useEffect(() => {
    // Allow users with view:users permission to fetch this collection
    if (!user?.role || !hasPermission(user.role, "view:users")) return;

    const q = query(collection(db, "users"), orderBy("email"));
    const unsub = onSnapshot(q, (snap) => {
      setUsers(snap.docs.map((d) => ({ uid: d.id, ...d.data() }) as UserProfile));
      setLoading(false);
    }, (err) => {
      console.error("Failed to load users:", err);
      setLoading(false);
    });
    return unsub;
  }, [user]);

  const handleRoleChange = async (targetUid: string, targetEmail: string, newRole: UserRole) => {
    if (targetUid === user?.uid) {
      toast({
        title: "Action Restricted",
        description: "You cannot change your own superadmin privileges.",
        variant: "destructive",
      });
      return;
    }

    try {
      await updateDoc(doc(db, "users", targetUid), { 
        role: newRole,
        requestedRole: deleteField() 
      });
      
      // Log this action client-side
      const { logActivityClient } = await import("@/lib/audit-logger-client");
      await logActivityClient(user, "USER_ROLE_UPDATE", {
        updatedUserUid: targetUid,
        updatedUserEmail: targetEmail,
        newRole,
      });

      toast({
        title: "Permissions Updated",
        description: `Successfully assigned "${ROLE_CONFIG[newRole].label}" to ${targetEmail}`,
      });
    } catch (err: any) {
      toast({
        title: "Update Failed",
        description: err.message,
        variant: "destructive",
      });
    }
  };

  const handleDeleteUser = async (targetUid: string, targetEmail: string) => {
    if (targetUid === user?.uid) {
      toast({
        title: "Action Restricted",
        description: "You cannot delete your own profile.",
        variant: "destructive",
      });
      return;
    }

    if (!window.confirm(`Are you absolutely sure you want to delete the user profile for ${targetEmail}? This action cannot be undone.`)) {
      return;
    }

    try {
      await deleteDoc(doc(db, "users", targetUid));

      // Log this action client-side
      const { logActivityClient } = await import("@/lib/audit-logger-client");
      await logActivityClient(user, "USER_DELETE", {
        deletedUserUid: targetUid,
        deletedUserEmail: targetEmail,
      });

      toast({
        title: "User Profile Deleted",
        description: `Successfully deleted user profile for ${targetEmail}`,
      });
    } catch (err: any) {
      toast({
        title: "Deletion Failed",
        description: err.message,
        variant: "destructive",
      });
    }
  };

  if (user?.role !== "superadmin" && user?.role !== "admin") {
    return (
      <div className="flex h-[60vh] flex-col items-center justify-center gap-2 text-muted-foreground p-6">
        <Shield className="h-10 w-10 text-destructive mb-2" />
        <h1 className="text-lg font-bold text-foreground">Access Restricted</h1>
        <p className="text-sm">You must be logged in as an Admin to view this page.</p>
      </div>
    );
  }

  const handleSort = (field: "name" | "email" | "source" | "role" | "lastSeen") => {
    if (sortField === field) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDirection("asc");
    }
  };

  const sortedAndFiltered = [...users]
    .filter(
      (u) =>
        u.email?.toLowerCase().includes(search.toLowerCase()) ||
        u.displayName?.toLowerCase().includes(search.toLowerCase())
    )
    .sort((a, b) => {
      let valA: any = "";
      let valB: any = "";
      if (sortField === "name") { valA = a.displayName?.toLowerCase() || ""; valB = b.displayName?.toLowerCase() || ""; }
      else if (sortField === "email") { valA = a.email?.toLowerCase() || ""; valB = b.email?.toLowerCase() || ""; }
      else if (sortField === "source") { valA = a.source || ""; valB = b.source || ""; }
      else if (sortField === "role") { valA = a.role || ""; valB = b.role || ""; }
      else if (sortField === "lastSeen") { valA = a.lastSeen ? new Date(a.lastSeen).getTime() : 0; valB = b.lastSeen ? new Date(b.lastSeen).getTime() : 0; }

      if (valA < valB) return sortDirection === "asc" ? -1 : 1;
      if (valA > valB) return sortDirection === "asc" ? 1 : -1;
      return 0;
    });

  const SortIcon = ({ field }: { field: string }) => {
    if (sortField !== field) return <ArrowUpDown className="h-3 w-3 inline ml-1 opacity-40 group-hover:opacity-100 transition-opacity" />;
    if (sortDirection === "asc") return <ArrowUp className="h-3 w-3 inline ml-1" />;
    return <ArrowDown className="h-3 w-3 inline ml-1" />;
  };

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 border border-primary/20 shadow-sm">
          <Users className="h-5.5 w-5.5 text-primary" />
        </div>
        <div>
          <h1 className="text-xl font-bold tracking-tight">User Roles & Access Control</h1>
          <p className="text-xs text-muted-foreground">Manage user permissions and security policies</p>
        </div>
      </div>

      {/* Dynamic Statistics Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="border-border bg-card shadow-sm p-4 flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 border border-primary/20">
            <Users className="h-5 w-5 text-primary" />
          </div>
          <div>
            <p className="text-[10px] font-black text-muted-foreground uppercase tracking-wider">Total Members</p>
            <p className="text-xl font-bold text-foreground mt-0.5">{users.length}</p>
          </div>
        </Card>
        <Card className="border-border bg-card shadow-sm p-4 flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-500/10 border border-blue-500/20">
            <Shield className="h-5 w-5 text-blue-500" />
          </div>
          <div>
            <p className="text-[10px] font-black text-muted-foreground uppercase tracking-wider">Admins</p>
            <p className="text-xl font-bold text-foreground mt-0.5">
              {users.filter(u => u.role === "superadmin" || u.role === "admin").length}
            </p>
          </div>
        </Card>
        <Card className="border-border bg-card shadow-sm p-4 flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 border border-emerald-500/20">
            <ShieldCheck className="h-5 w-5 text-emerald-500" />
          </div>
          <div>
            <p className="text-[10px] font-black text-muted-foreground uppercase tracking-wider">Builders</p>
            <p className="text-xl font-bold text-foreground mt-0.5">
              {users.filter(u => u.role === "authorized").length}
            </p>
          </div>
        </Card>
        <Card className="border-border bg-card shadow-sm p-4 flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-purple-500/10 border border-purple-500/20">
            <Users className="h-5 w-5 text-purple-500" />
          </div>
          <div>
            <p className="text-[10px] font-black text-muted-foreground uppercase tracking-wider">Stakeholders</p>
            <p className="text-xl font-bold text-foreground mt-0.5">
              {users.filter(u => u.role === "stakeholder").length}
            </p>
          </div>
        </Card>
      </div>

      {/* Main card */}
      <Card className="border-border shadow-sm overflow-hidden">
        <CardHeader className="flex flex-row items-center justify-between gap-4 pb-4 border-b">
          <CardTitle className="text-base font-bold">All Registered Users</CardTitle>
          <div className="relative w-64 md:w-72">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-8 h-9 text-xs focus:ring-1"
              placeholder="Search by name or email…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex h-40 items-center justify-center gap-2 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
              <span className="text-sm">Loading user list…</span>
            </div>
          ) : sortedAndFiltered.length === 0 ? (
            <div className="flex h-32 items-center justify-center">
              <p className="text-sm text-muted-foreground">
                {search ? "No matches found." : "No other users have registered yet."}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto w-full">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/10 hover:bg-muted/10">
                    <TableHead className="text-[10px] font-bold uppercase tracking-wider cursor-pointer hover:bg-muted/30 transition-colors group select-none" onClick={() => handleSort("name")}>
                      User Details <SortIcon field="name" />
                    </TableHead>
                    <TableHead className="text-[10px] font-bold uppercase tracking-wider cursor-pointer hover:bg-muted/30 transition-colors group select-none" onClick={() => handleSort("source")}>
                      Access Source <SortIcon field="source" />
                    </TableHead>
                    <TableHead className="text-[10px] font-bold uppercase tracking-wider cursor-pointer hover:bg-muted/30 transition-colors group select-none" onClick={() => handleSort("role")}>
                      System Role / Permissions <SortIcon field="role" />
                    </TableHead>
                    <TableHead className="text-[10px] font-bold uppercase tracking-wider cursor-pointer hover:bg-muted/30 transition-colors text-right group select-none" onClick={() => handleSort("lastSeen")}>
                      Last Active <SortIcon field="lastSeen" />
                    </TableHead>
                    {user?.role === "superadmin" && (
                      <TableHead className="text-[10px] font-bold uppercase tracking-wider text-right select-none w-20">
                        Actions
                      </TableHead>
                    )}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <AnimatePresence>
                    {sortedAndFiltered.map((u, i) => (
                      <motion.tr
                        key={u.uid}
                        initial={{ opacity: 0, y: 4 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.02 }}
                        className="border-b last:border-0 hover:bg-muted/30 transition-colors"
                      >
                        <TableCell className="py-3 text-sm font-medium">
                          <div className="flex items-center gap-3">
                            <Avatar className="h-9 w-9 border border-border shrink-0 shadow-sm">
                              <AvatarImage src={u.photoURL || undefined} referrerPolicy="no-referrer" />
                              <AvatarFallback className="bg-primary/10 text-primary text-xs font-semibold">
                                {u.displayName?.charAt(0) || u.email?.charAt(0) || "?"}
                              </AvatarFallback>
                            </Avatar>
                            <div className="min-w-0">
                              <p className="font-bold text-sm text-foreground flex items-center gap-1.5 leading-tight">
                                {u.displayName || "Unset Name"}
                                {u.uid === user?.uid && (
                                  <Badge className="bg-emerald-500/10 text-emerald-600 border border-emerald-500/20 text-[9px] uppercase tracking-wider font-extrabold px-1.5 py-0 h-auto">
                                    You
                                  </Badge>
                                )}
                              </p>
                              <p className="text-xs text-muted-foreground mt-0.5 truncate max-w-[200px] md:max-w-xs">{u.email}</p>
                              <p className="text-[9px] text-muted-foreground/50 font-mono mt-0.5 select-all">
                                ID: {u.uid.slice(0, 8)}…
                              </p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="py-3">
                          <Badge variant="outline" className={cn(
                            "text-[10px] font-bold px-2.5 py-0.5 h-auto rounded-full capitalize",
                            u.source === "google" ? "bg-red-500/5 border-red-500/20 text-red-600" : "bg-cyan-500/5 border-cyan-500/20 text-cyan-600"
                          )}>
                            {u.source || "google"}
                          </Badge>
                        </TableCell>
                        <TableCell className="py-3">
                          <div className="flex flex-col gap-2">
                            {u.requestedRole && (
                              <div className="flex items-center gap-1.5 bg-amber-500/10 border border-amber-500/20 text-amber-700 px-2 py-1 rounded-md max-w-fit">
                                <ShieldCheck className="h-3 w-3" />
                                <span className="text-[10px] font-bold uppercase tracking-wide">
                                  Requested: {ROLE_CONFIG[u.requestedRole]?.label || u.requestedRole}
                                </span>
                                {user?.role && hasPermission(user.role, "manage:users") && (
                                  <button
                                    onClick={() => handleRoleChange(u.uid, u.email, u.role || "viewer")}
                                    className="ml-1 text-[9px] font-bold text-destructive hover:underline uppercase tracking-wide border-l pl-1.5 border-amber-500/30"
                                    title="Reject Requested Role"
                                  >
                                    Reject
                                  </button>
                                )}
                              </div>
                            )}
                            <Select
                              value={u.role || "viewer"}
                              onValueChange={(val) => handleRoleChange(u.uid, u.email, val as UserRole)}
                              disabled={u.uid === user?.uid || !user?.role || !hasPermission(user.role, "manage:users")}
                            >
                              <SelectTrigger className={cn(
                                "w-48 h-8 text-xs font-bold border rounded-lg shadow-sm transition-all focus:ring-1 focus:ring-primary",
                                u.role === "superadmin" && "bg-primary/5 border-primary/20 text-primary",
                                u.role === "admin" && "bg-blue-500/5 border-blue-500/20 text-blue-600",
                                u.role === "authorized" && "bg-emerald-500/5 border-emerald-500/20 text-emerald-600",
                                u.role === "stakeholder" && "bg-purple-500/5 border-purple-500/20 text-purple-600",
                                u.role === "engineer" && "bg-orange-500/5 border-orange-500/20 text-orange-600",
                                u.role === "team_leader" && "bg-cyan-500/5 border-cyan-500/20 text-cyan-600",
                                u.role === "technician" && "bg-sky-500/5 border-sky-500/20 text-sky-600",
                                u.role === "viewer" && "bg-muted/40 border-border text-muted-foreground"
                              )}>
                                <SelectValue placeholder="Select role" />
                              </SelectTrigger>
                              <SelectContent>
                                {(Object.keys(ROLE_CONFIG) as UserRole[]).map((r) => (
                                  <SelectItem key={r} value={r} className="text-xs cursor-pointer">
                                    <div className="flex flex-col gap-0.5 py-0.5">
                                      <span className="font-bold">{ROLE_CONFIG[r].label}</span>
                                      <span className="text-[10px] text-muted-foreground leading-tight">{ROLE_CONFIG[r].desc}</span>
                                    </div>
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        </TableCell>
                        <TableCell className="py-3 text-right text-xs text-muted-foreground font-medium tabular-nums">
                          {u.lastSeen ? new Date(u.lastSeen).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "—"}
                        </TableCell>
                        {user?.role && hasPermission(user.role, "manage:users") && (
                          <TableCell className="py-3 text-right">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-destructive hover:bg-destructive/10 hover:text-destructive rounded-lg"
                              disabled={u.uid === user?.uid}
                              onClick={() => handleDeleteUser(u.uid, u.email)}
                              title={u.uid === user?.uid ? "You cannot delete yourself" : "Delete User Profile"}
                            >
                              <Trash2 className="h-4.5 w-4.5" strokeWidth={2} />
                            </Button>
                          </TableCell>
                        )}
                      </motion.tr>
                    ))}
                  </AnimatePresence>
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
