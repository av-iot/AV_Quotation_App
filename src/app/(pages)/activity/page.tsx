"use client";

import { useEffect, useState, useMemo } from "react";
import { collection, query, orderBy, limit, onSnapshot, Timestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Loader2, Search, Filter } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { format } from "date-fns";

type ActivityLog = {
  id: string;
  action: string;
  timestamp: Timestamp | null | string;
  userId: string;
  userName: string;
  userEmail: string;
  details: Record<string, any>;
};

export default function ActivityLogsPage() {
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Filters
  const [search, setSearch] = useState("");
  const [actionFilter, setActionFilter] = useState("ALL");
  const [userFilter, setUserFilter] = useState("ALL");

  useEffect(() => {
    const q = query(collection(db, "audit_logs"), orderBy("timestamp", "desc"), limit(200));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }) as ActivityLog);
      setLogs(data);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const uniqueActions = useMemo(() => Array.from(new Set(logs.map(l => l.action))), [logs]);
  const uniqueUsers = useMemo(() => Array.from(new Set(logs.map(l => l.userName))), [logs]);

  const filteredLogs = useMemo(() => {
    return logs.filter(log => {
      const matchesSearch = 
        log.userName.toLowerCase().includes(search.toLowerCase()) || 
        log.action.toLowerCase().includes(search.toLowerCase()) ||
        JSON.stringify(log.details).toLowerCase().includes(search.toLowerCase());
      
      const matchesAction = actionFilter === "ALL" || log.action === actionFilter;
      const matchesUser = userFilter === "ALL" || log.userName === userFilter;
      
      return matchesSearch && matchesAction && matchesUser;
    });
  }, [logs, search, actionFilter, userFilter]);

  const getActionColor = (action: string) => {
    if (action.includes("CREATE")) return "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400";
    if (action.includes("UPDATE")) return "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400";
    if (action.includes("DELETE")) return "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400";
    if (action.includes("GENERATE") || action.includes("PRINT")) return "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400";
    return "bg-muted text-muted-foreground";
  };

  const getLogDate = (timestamp: ActivityLog["timestamp"]) => {
    if (!timestamp) return null;
    if (timestamp instanceof Timestamp) return timestamp.toDate();
    const parsed = new Date(timestamp);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  };

  return (
    <div className="p-6 md:p-10 max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">System Activity Logs</h1>
        <p className="text-muted-foreground text-sm mt-1">Monitor who created PDFs, modified proposals, and logged into the system.</p>
      </div>

      <Card className="border-border shadow-sm overflow-hidden bg-card">
        <CardHeader className="bg-muted/30 border-b border-border px-6 py-4 flex flex-col sm:flex-row gap-4 items-center justify-between">
          <CardTitle className="text-sm font-semibold flex items-center gap-2 text-foreground">
            <Filter className="h-4 w-4 text-muted-foreground" /> Filter Logs
          </CardTitle>
          <div className="flex flex-col sm:flex-row w-full sm:w-auto gap-3">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search details..."
                className="pl-8 w-full sm:w-64 h-9 text-sm"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <Select value={actionFilter} onValueChange={setActionFilter}>
              <SelectTrigger className="h-9 w-full sm:w-40 text-sm">
                <SelectValue placeholder="All Actions" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All Actions</SelectItem>
                {uniqueActions.map(a => <SelectItem key={a} value={a}>{a.replace(/_/g, ' ')}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={userFilter} onValueChange={setUserFilter}>
              <SelectTrigger className="h-9 w-full sm:w-40 text-sm">
                <SelectValue placeholder="All Users" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All Users</SelectItem>
                {uniqueUsers.map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader className="bg-muted/30">
                <TableRow className="border-border hover:bg-transparent">
                  <TableHead className="w-[180px] text-muted-foreground">Timestamp</TableHead>
                  <TableHead className="text-muted-foreground">User</TableHead>
                  <TableHead className="text-muted-foreground">Action</TableHead>
                  <TableHead className="max-w-[300px] text-muted-foreground">Details</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody className="border-border">
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={4} className="h-32 text-center text-muted-foreground">
                      <div className="flex items-center justify-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin" /> Loading logs...
                      </div>
                    </TableCell>
                  </TableRow>
                ) : filteredLogs.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="h-32 text-center text-muted-foreground">
                      No logs found matching your filters.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredLogs.map((log) => (
                    <TableRow key={log.id} className="group border-border hover:bg-muted/50 transition-colors">
                      <TableCell className="whitespace-nowrap text-sm text-muted-foreground font-mono">
                        {(() => {
                          const date = getLogDate(log.timestamp);
                          return date ? format(date, "MMM dd, yyyy HH:mm") : "Pending...";
                        })()}
                      </TableCell>
                      <TableCell>
                        <div className="font-medium text-sm text-foreground">{log.userName}</div>
                        <div className="text-[10px] text-muted-foreground">{log.userEmail}</div>
                      </TableCell>
                      <TableCell>
                        <span className={`px-2 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider ${getActionColor(log.action)}`}>
                          {log.action.replace(/_/g, ' ')}
                        </span>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground max-w-[300px] truncate group-hover:whitespace-normal group-hover:break-words">
                        {Object.entries(log.details || {}).map(([k, v]) => (
                          <span key={k} className="mr-3 inline-block">
                            <span className="font-semibold text-foreground/60 capitalize">{k.replace(/([A-Z])/g, ' $1').trim()}:</span> {String(v)}
                          </span>
                        ))}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
