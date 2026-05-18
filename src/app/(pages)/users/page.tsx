"use client";

import { useEffect, useState } from "react";
import { collection, query, orderBy, onSnapshot, doc, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/auth-context";
import { motion, AnimatePresence } from "framer-motion";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Shield, Search, Loader2, Users, ShieldCheck } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import type { UserRole } from "@/types";

interface UserProfile {
  uid: string;
  email: string;
  displayName: string | null;
  photoURL: string | null;
  source: "myiot" | "google";
  role: UserRole;
  lastSeen?: string;
  createdAt?: string;
}

const ROLE_CONFIG: Record<UserRole, { label: string; desc: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  superadmin: { label: "Super Admin", desc: "Full system control & user role management", variant: "default" },
  admin: { label: "Admin", desc: "Can manage products and operations", variant: "default" },
  authorized: { label: "Authorized User", desc: "Can create & CRUD proposals/quotations", variant: "secondary" },
  stakeholder: { label: "Stakeholder", desc: "Read-only view with financial data access", variant: "outline" },
  viewer: { label: "Normal User (Default)", desc: "Read-only access, see & download PDFs", variant: "secondary" },
};

export default function UsersPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    // Only allow Super Admins to fetch this collection
    if (user?.role !== "superadmin") return;

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
      await updateDoc(doc(db, "users", targetUid), { role: newRole });
      
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

  if (user?.role !== "superadmin") {
    return (
      <div className="flex h-[60vh] flex-col items-center justify-center gap-2 text-muted-foreground p-6">
        <Shield className="h-10 w-10 text-destructive mb-2" />
        <h1 className="text-lg font-bold text-foreground">Access Restricted</h1>
        <p className="text-sm">You must be logged in as a Super Admin to view this page.</p>
      </div>
    );
  }

  const filtered = users.filter(
    (u) =>
      u.email?.toLowerCase().includes(search.toLowerCase()) ||
      u.displayName?.toLowerCase().includes(search.toLowerCase())
  );

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
          ) : filtered.length === 0 ? (
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
                    <TableHead className="text-[10px] font-bold uppercase tracking-wider">User Details</TableHead>
                    <TableHead className="text-[10px] font-bold uppercase tracking-wider">Access Source</TableHead>
                    <TableHead className="text-[10px] font-bold uppercase tracking-wider">System Role / Permissions</TableHead>
                    <TableHead className="text-[10px] font-bold uppercase tracking-wider text-right">Last Active</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <AnimatePresence>
                    {filtered.map((u, i) => (
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
                          <div className="flex items-center gap-2">
                            <Select
                              value={u.role || "viewer"}
                              onValueChange={(val) => handleRoleChange(u.uid, u.email, val as UserRole)}
                              disabled={u.uid === user?.uid}
                            >
                              <SelectTrigger className={cn(
                                "w-48 h-8 text-xs font-bold border rounded-lg shadow-sm transition-all focus:ring-1 focus:ring-primary",
                                u.role === "superadmin" && "bg-primary/5 border-primary/20 text-primary",
                                u.role === "admin" && "bg-blue-500/5 border-blue-500/20 text-blue-600",
                                u.role === "authorized" && "bg-emerald-500/5 border-emerald-500/20 text-emerald-600",
                                u.role === "stakeholder" && "bg-purple-500/5 border-purple-500/20 text-purple-600",
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
