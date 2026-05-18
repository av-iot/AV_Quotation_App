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
import { Shield, Search, Loader2, Users } from "lucide-react";
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
  stakeholder: { label: "Stakeholder", desc: "Read-only view with financial data pipeline access", variant: "outline" },
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
    <div className="p-6">
      {/* Header */}
      <div className="mb-6 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
          <Users className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-xl font-bold">User Roles & Access Control</h1>
          <p className="text-sm text-muted-foreground">Manage user permissions and security policies</p>
        </div>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4 pb-4">
          <CardTitle className="text-base">All users</CardTitle>
          <div className="relative w-72">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-8 h-9 text-sm"
              placeholder="Search by name or email…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex h-40 items-center justify-center gap-2 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
              <span className="text-sm">Loading user list…</span>
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex h-32 items-center justify-center">
              <p className="text-sm text-muted-foreground">
                {search ? "No matches found." : "No other users have registered yet."}
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">User Profile</TableHead>
                  <TableHead className="text-xs">Email</TableHead>
                  <TableHead className="text-xs">Access Source</TableHead>
                  <TableHead className="text-xs">Current Role / Permission</TableHead>
                  <TableHead className="text-xs text-right">Last Active</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <AnimatePresence>
                  {filtered.map((u, i) => (
                    <motion.tr
                      key={u.uid}
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.03 }}
                      className="border-b last:border-0 hover:bg-muted/40 transition-colors"
                    >
                      <TableCell className="py-3 text-sm font-medium">
                        <div className="flex items-center gap-2">
                          <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center font-bold text-xs uppercase text-primary">
                            {u.displayName?.charAt(0) || u.email?.charAt(0) || "?"}
                          </div>
                          <div>
                            <p className="font-semibold text-sm">{u.displayName || "Unset"}</p>
                            <p className="text-[10px] text-muted-foreground font-mono">UID: {u.uid}</p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="py-3 text-sm font-mono">{u.email}</TableCell>
                      <TableCell className="py-3">
                        <Badge variant="outline" className="text-xs capitalize font-medium">
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
                            <SelectTrigger className="w-56 h-8 text-xs font-semibold">
                              <SelectValue placeholder="Select role" />
                            </SelectTrigger>
                            <SelectContent>
                              {(Object.keys(ROLE_CONFIG) as UserRole[]).map((r) => (
                                <SelectItem key={r} value={r} className="text-xs">
                                  <div className="flex flex-col gap-0.5">
                                    <span className="font-bold">{ROLE_CONFIG[r].label}</span>
                                    <span className="text-[10px] text-muted-foreground leading-tight">{ROLE_CONFIG[r].desc}</span>
                                  </div>
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          {u.uid === user?.uid && (
                            <Badge variant="default" className="text-[10px] uppercase">
                              Active Superadmin
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="py-3 text-right text-xs text-muted-foreground tabular-nums">
                        {u.lastSeen ? new Date(u.lastSeen).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "—"}
                      </TableCell>
                    </motion.tr>
                  ))}
                </AnimatePresence>
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
