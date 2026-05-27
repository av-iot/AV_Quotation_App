"use client";

import { useEffect, useState, useMemo } from "react";
import { collection, query, orderBy, limit, onSnapshot, Timestamp, getDoc, doc, getDocs, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import {
  Loader2,
  Search,
  Filter,
  Calendar as CalendarIcon,
  List,
  ChevronLeft,
  ChevronRight,
  Download,
  Clock,
  ChevronDown,
  ChevronUp,
  User,
  PlusCircle,
  Edit3,
  Trash2,
  Printer,
  Activity,
  FileWarning,
} from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { format, isSameDay } from "date-fns";
import { cn } from "@/lib/utils";
import { useRouter } from "next/navigation";

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
  const [viewMode, setViewMode] = useState<"list" | "calendar">("calendar");
  
  // Document Resolving States
  const [resolvingDoc, setResolvingDoc] = useState(false);
  const router = useRouter();

  // List Filters
  const [search, setSearch] = useState("");
  const [actionFilter, setActionFilter] = useState("ALL");
  const [userFilter, setUserFilter] = useState("ALL");

  // Calendar State
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDay, setSelectedDay] = useState<Date | null>(new Date());

  // User Journey Modal State
  const [journeyUser, setJourneyUser] = useState<{ userId: string; userName: string; userEmail: string } | null>(null);
  const [journeyRange, setJourneyRange] = useState<"today" | "all">("today");
  const [journeyOpen, setJourneyOpen] = useState(false);
  const [expandedLogs, setExpandedLogs] = useState<Record<string, boolean>>({});

  useEffect(() => {
    // Querying up to 1000 logs for robust calendar and history calculations
    const q = query(collection(db, "audit_logs"), orderBy("timestamp", "desc"), limit(1000));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }) as ActivityLog);
      setLogs(data);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  // Compute stats metrics dynamically
  const stats = useMemo(() => {
    const totalLogs = logs.length;
    const activeUsers = new Set(logs.map(l => l.userId)).size;
    
    // Count document prints/generations
    const printCount = logs.filter(l => 
      l.action.includes("PRINT") || 
      l.action.includes("GENERATE")
    ).length;

    // Count updates & database modifications
    const systemChanges = logs.filter(l => 
      l.action.includes("UPDATE") || 
      l.action.includes("DELETE") || 
      l.action.includes("CLEAR") ||
      l.action.includes("SETTINGS_") ||
      l.action.includes("ROLE")
    ).length;

    return { totalLogs, activeUsers, printCount, systemChanges };
  }, [logs]);

  // Helpers
  const getLogDate = (timestamp: ActivityLog["timestamp"]) => {
    if (!timestamp) return null;
    if (timestamp instanceof Timestamp) return timestamp.toDate();
    const parsed = new Date(timestamp);
    return isNaN(parsed.getTime()) ? null : parsed;
  };

  const getLogsForDay = (day: Date) => {
    return logs.filter((log) => {
      const logDate = getLogDate(log.timestamp);
      if (!logDate) return false;
      return (
        logDate.getFullYear() === day.getFullYear() &&
        logDate.getMonth() === day.getMonth() &&
        logDate.getDate() === day.getDate()
      );
    });
  };

  const getActionColor = (action: string) => {
    if (action.includes("CREATE")) return "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400 border border-blue-200/50 dark:border-blue-900/40";
    if (action.includes("UPDATE")) return "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400 border border-amber-200/50 dark:border-amber-900/40";
    if (action.includes("DELETE") || action.includes("CLEAR")) return "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400 border border-red-200/50 dark:border-red-900/40";
    if (action.includes("GENERATE") || action.includes("PRINT")) {
      return "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400 border border-emerald-200/50 dark:border-emerald-900/40";
    }
    return "bg-muted text-muted-foreground border border-border";
  };

  const getActionIcon = (action: string) => {
    const act = action.toUpperCase();
    if (act.includes("CREATE") || act.includes("NEW")) {
      return <PlusCircle className="h-3.5 w-3.5" />;
    }
    if (act.includes("UPDATE")) {
      return <Edit3 className="h-3.5 w-3.5" />;
    }
    if (act.includes("DELETE") || act.includes("CLEAR")) {
      return <Trash2 className="h-3.5 w-3.5" />;
    }
    if (act.includes("PRINT") || act.includes("GENERATE")) {
      return <Printer className="h-3.5 w-3.5" />;
    }
    if (act.includes("LOGIN") || act.includes("SESSION") || act.includes("AUTH")) {
      return <User className="h-3.5 w-3.5" />;
    }
    return <Activity className="h-3.5 w-3.5" />;
  };

  const getActionIconBg = (action: string) => {
    const act = action.toUpperCase();
    if (act.includes("CREATE") || act.includes("NEW")) return "bg-blue-500/10 text-blue-500 border-blue-500/20";
    if (act.includes("UPDATE")) return "bg-amber-500/10 text-amber-500 border-amber-500/20";
    if (act.includes("DELETE") || act.includes("CLEAR")) return "bg-red-500/10 text-red-500 border-red-500/20";
    if (act.includes("PRINT") || act.includes("GENERATE")) return "bg-emerald-500/10 text-emerald-500 border-emerald-500/20";
    return "bg-muted text-muted-foreground border-border";
  };

  const getUserColor = (email: string) => {
    let hash = 0;
    const str = email || "unknown";
    for (let i = 0; i < str.length; i++) {
      hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    const h = Math.abs(hash) % 360;
    return `hsl(${h}, 65%, 45%)`;
  };

  // Document Resolving and Navigation pipeline
  const resolveAndNavigate = async (identifier: string, typeHint?: string) => {
    if (!identifier) return;
    setResolvingDoc(true);

    try {
      const idClean = identifier.trim();
      const isFirestoreId = (str: string) => /^[a-zA-Z0-9]{20}$/.test(str);

      // 1. Direct check using typeHint
      if (typeHint === "receipt" || idClean.startsWith("REC") || idClean.toLowerCase().includes("receipt")) {
        if (isFirestoreId(idClean)) {
          const snap = await getDoc(doc(db, "receipts", idClean));
          if (snap.exists()) {
            router.push(`/receipts/${snap.id}`);
            return;
          }
        }
        const snap = await getDocs(query(collection(db, "receipts"), where("receiptNo", "==", idClean)));
        if (!snap.empty) {
          router.push(`/receipts/${snap.docs[0].id}`);
          return;
        }
      }

      if (typeHint === "quotation" || idClean.startsWith("QTN-") || idClean.startsWith("INV-") || idClean.startsWith("P_INV-") || idClean.startsWith("QTN_") || idClean.startsWith("qtn_")) {
        if (isFirestoreId(idClean)) {
          const snap = await getDoc(doc(db, "quotations", idClean));
          if (snap.exists()) {
            router.push(`/quotations/${snap.id}`);
            return;
          }
        }
        const snap = await getDocs(query(collection(db, "quotations"), where("qtnNo", "==", idClean)));
        if (!snap.empty) {
          router.push(`/quotations/${snap.docs[0].id}`);
          return;
        }
        
        // Normalize search checks
        const normalized = idClean.replace("P_INV_", "QTN_").replace("INV_", "QTN_").replace("P_INV-", "QTN-").replace("INV-", "QTN-");
        const snapNorm = await getDocs(query(collection(db, "quotations"), where("qtnNo", "==", normalized)));
        if (!snapNorm.empty) {
          router.push(`/quotations/${snapNorm.docs[0].id}`);
          return;
        }
      }

      if (typeHint === "proposal" || idClean.startsWith("PROP-") || typeHint === "project") {
        if (isFirestoreId(idClean)) {
          const snap = await getDoc(doc(db, "proposals", idClean));
          if (snap.exists()) {
            router.push(`/print/${snap.id}`);
            return;
          }
          const snapProj = await getDoc(doc(db, "projects", idClean));
          if (snapProj.exists()) {
            router.push(`/print/${snapProj.id}`);
            return;
          }
        }
        const snapProp = await getDocs(query(collection(db, "proposals"), where("qtnNo", "==", idClean)));
        if (!snapProp.empty) {
          router.push(`/print/${snapProp.docs[0].id}`);
          return;
        }
      }

      // 2. Fallbacks: Direct ID checks across collections
      if (isFirestoreId(idClean)) {
        const snapReceipt = await getDoc(doc(db, "receipts", idClean));
        if (snapReceipt.exists()) {
          router.push(`/receipts/${snapReceipt.id}`);
          return;
        }
        const snapQuotation = await getDoc(doc(db, "quotations", idClean));
        if (snapQuotation.exists()) {
          router.push(`/quotations/${snapQuotation.id}`);
          return;
        }
        const snapProposal = await getDoc(doc(db, "proposals", idClean));
        if (snapProposal.exists()) {
          router.push(`/print/${snapProposal.id}`);
          return;
        }
      }

      // Check by qtnNo or receiptNo
      if (idClean.startsWith("QTN-") || idClean.startsWith("INV-") || idClean.startsWith("P_INV-") || idClean.startsWith("QTN_") || idClean.startsWith("qtn_")) {
        const snapQ = await getDocs(query(collection(db, "quotations"), where("qtnNo", "==", idClean)));
        if (!snapQ.empty) {
          router.push(`/quotations/${snapQ.docs[0].id}`);
          return;
        }
        const snapP = await getDocs(query(collection(db, "proposals"), where("qtnNo", "==", idClean)));
        if (!snapP.empty) {
          router.push(`/print/${snapP.docs[0].id}`);
          return;
        }
      }

      if (idClean.startsWith("REC") || idClean.toLowerCase().includes("rec")) {
        const snapR = await getDocs(query(collection(db, "receipts"), where("receiptNo", "==", idClean)));
        if (!snapR.empty) {
          router.push(`/receipts/${snapR.docs[0].id}`);
          return;
        }
      }

      // 3. Last stand fallback: check qtnNo on all possible targets
      const snapQ = await getDocs(query(collection(db, "quotations"), where("qtnNo", "==", idClean)));
      if (!snapQ.empty) {
        router.push(`/quotations/${snapQ.docs[0].id}`);
        return;
      }
      const snapP = await getDocs(query(collection(db, "proposals"), where("qtnNo", "==", idClean)));
      if (!snapP.empty) {
        router.push(`/print/${snapP.docs[0].id}`);
        return;
      }
      const snapR = await getDocs(query(collection(db, "receipts"), where("receiptNo", "==", idClean)));
      if (!snapR.empty) {
        router.push(`/receipts/${snapR.docs[0].id}`);
        return;
      }

      // If not found in any queries, route to custom 404
      router.push(`/document-not-found?id=${encodeURIComponent(idClean)}&type=${typeHint || "document"}`);
    } catch (err) {
      console.error("Failed to resolve document:", err);
      router.push(`/document-not-found?id=${encodeURIComponent(identifier)}&type=${typeHint || "document"}`);
    } finally {
      setResolvingDoc(false);
    }
  };

  const parseAndRenderValue = (key: string, val: any) => {
    const valStr = String(val);
    const keyLower = key.toLowerCase();

    let typeHint = "";
    if (keyLower.includes("proposal") || keyLower.includes("project")) {
      typeHint = "proposal";
    } else if (keyLower.includes("quotation") || keyLower.includes("qtn") || keyLower.includes("invoice")) {
      typeHint = "quotation";
    } else if (keyLower.includes("receipt")) {
      typeHint = "receipt";
    }

    const isRefOrId = 
      /^[a-zA-Z0-9]{20}$/.test(valStr) || 
      /^(QTN|INV|P_INV|REC|qtn|inv|p_inv|rec)-\d{4}-\d+(?:\/\d+)?$/i.test(valStr);

    if (isRefOrId || typeHint) {
      return (
        <button
          onClick={() => resolveAndNavigate(valStr, typeHint)}
          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-primary/10 text-primary border border-primary/20 hover:bg-primary/20 hover:text-primary transition-all cursor-pointer text-[10.5px] font-mono font-bold shadow-xs active:scale-95"
          type="button"
        >
          {valStr}
          <span className="text-[9px] text-primary/70">🔗</span>
        </button>
      );
    }

    return <span>{valStr}</span>;
  };

  const renderLogDetails = (details: Record<string, any>) => {
    if (!details || Object.keys(details).length === 0) {
      return <span className="text-muted-foreground italic">No parameters recorded.</span>;
    }
    return (
      <div className="flex flex-wrap gap-x-4 gap-y-1.5 max-w-full">
        {Object.entries(details).map(([k, v]) => (
          <span key={k} className="inline-flex items-center gap-1 text-xs shrink-0">
            <span className="font-semibold text-foreground/75 capitalize">
              {k.replace(/([A-Z])/g, ' $1').trim()}:
            </span>{" "}
            {parseAndRenderValue(k, v)}
          </span>
        ))}
      </div>
    );
  };

  // Calendar calculations
  const handlePrevMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1));
  };

  const handleNextMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1));
  };

  const allGridDays = useMemo(() => {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    const firstDay = new Date(year, month, 1);
    const startDayOfWeek = firstDay.getDay(); // 0 = Sun, 1 = Mon...
    const totalDays = new Date(year, month + 1, 0).getDate();
    const prevMonthTotalDays = new Date(year, month, 0).getDate();

    const days = [];

    // Padding from previous month
    for (let i = startDayOfWeek - 1; i >= 0; i--) {
      days.push(new Date(year, month - 1, prevMonthTotalDays - i));
    }

    // Current month days
    for (let i = 1; i <= totalDays; i++) {
      days.push(new Date(year, month, i));
    }

    // Padding for next month to make exactly 42 cells (6 rows × 7 cols)
    const nextMonthPadding = 42 - days.length;
    for (let i = 1; i <= nextMonthPadding; i++) {
      days.push(new Date(year, month + 1, i));
    }

    return days;
  }, [currentMonth]);

  // Selected Day Details
  const selectedDayLogs = useMemo(() => {
    if (!selectedDay) return [];
    return getLogsForDay(selectedDay).sort((a, b) => {
      const da = getLogDate(a.timestamp)?.getTime() || 0;
      const db = getLogDate(b.timestamp)?.getTime() || 0;
      return db - da; // Show newest logs first in detail view
    });
  }, [selectedDay, logs]);

  const selectedDayActiveUsers = useMemo(() => {
    const userMap = new Map<string, { userId: string; userName: string; userEmail: string; count: number }>();
    selectedDayLogs.forEach((log) => {
      const existing = userMap.get(log.userId);
      if (existing) {
        existing.count += 1;
      } else {
        userMap.set(log.userId, {
          userId: log.userId,
          userName: log.userName || "Unknown User",
          userEmail: log.userEmail || "",
          count: 1,
        });
      }
    });
    return Array.from(userMap.values()).sort((a, b) => b.count - a.count);
  }, [selectedDayLogs]);

  // User Journey Timeline data
  const journeyLogs = useMemo(() => {
    if (!journeyUser) return [];
    const filtered = logs.filter(log => log.userId === journeyUser.userId);
    
    if (journeyRange === "today" && selectedDay) {
      return filtered.filter(log => {
        const logDate = getLogDate(log.timestamp);
        if (!logDate) return false;
        return (
          logDate.getFullYear() === selectedDay.getFullYear() &&
          logDate.getMonth() === selectedDay.getMonth() &&
          logDate.getDate() === selectedDay.getDate()
        );
      }).sort((a, b) => {
        const da = getLogDate(a.timestamp)?.getTime() || 0;
        const db = getLogDate(b.timestamp)?.getTime() || 0;
        return da - db; // Chronological order for user journey
      });
    }

    return filtered.sort((a, b) => {
      const da = getLogDate(a.timestamp)?.getTime() || 0;
      const db = getLogDate(b.timestamp)?.getTime() || 0;
      return da - db; // Chronological
    });
  }, [journeyUser, journeyRange, selectedDay, logs]);

  // Export functions
  const exportToCSV = (data: ActivityLog[], filename: string) => {
    const headers = ["Timestamp", "User Name", "User Email", "Action", "Details"];
    const rows = data.map((log) => {
      const timestamp = getLogDate(log.timestamp);
      const timeStr = timestamp ? format(timestamp, "yyyy-MM-dd HH:mm:ss") : "Pending";
      const userName = log.userName || "";
      const userEmail = log.userEmail || "";
      const action = log.action || "";
      
      const detailsStr = Object.entries(log.details || {})
        .map(([k, v]) => `${k}: ${String(v)}`)
        .join("; ");
        
      const escape = (val: string) => `"${val.replace(/"/g, '""')}"`;
      
      return [
        escape(timeStr),
        escape(userName),
        escape(userEmail),
        escape(action),
        escape(detailsStr)
      ].join(",");
    });
    
    const csvContent = [headers.join(","), ...rows].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", filename);
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const exportToJSON = (data: ActivityLog[], filename: string) => {
    const jsonContent = JSON.stringify(data, null, 2);
    const blob = new Blob([jsonContent], { type: "application/json;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", filename);
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleExportDayCSV = () => {
    if (!selectedDay) return;
    exportToCSV(selectedDayLogs, `activity_logs_${format(selectedDay, "yyyy-MM-dd")}.csv`);
  };

  const handleExportDayJSON = () => {
    if (!selectedDay) return;
    exportToJSON(selectedDayLogs, `activity_logs_${format(selectedDay, "yyyy-MM-dd")}.json`);
  };

  const handleExportJourneyCSV = () => {
    if (!journeyUser) return;
    const suffix = selectedDay && journeyRange === "today" ? `_${format(selectedDay, "yyyy-MM-dd")}` : "_all_history";
    exportToCSV(journeyLogs, `journey_${journeyUser.userName.toLowerCase().replace(/\s+/g, "_")}${suffix}.csv`);
  };

  const handleExportJourneyJSON = () => {
    if (!journeyUser) return;
    const suffix = selectedDay && journeyRange === "today" ? `_${format(selectedDay, "yyyy-MM-dd")}` : "_all_history";
    exportToJSON(journeyLogs, `journey_${journeyUser.userName.toLowerCase().replace(/\s+/g, "_")}${suffix}.json`);
  };

  const handleViewJourney = (user: typeof selectedDayActiveUsers[0]) => {
    setJourneyUser(user);
    setJourneyRange("today");
    setJourneyOpen(true);
    setExpandedLogs({});
  };

  const toggleLogDetails = (id: string) => {
    setExpandedLogs(prev => ({ ...prev, [id]: !prev[id] }));
  };

  // Filters for tabular view
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

  return (
    <div className="p-6 md:p-10 max-w-7xl mx-auto space-y-6">
      {/* Fullscreen resolving loader */}
      {resolvingDoc && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-background/80 backdrop-blur-md animate-in fade-in duration-200">
          <div className="flex flex-col items-center gap-4 p-8 rounded-2xl border bg-card/65 shadow-2xl">
            <Loader2 className="h-10 w-10 animate-spin text-primary" />
            <div className="space-y-1 text-center">
              <p className="text-sm font-bold text-foreground">Resolving Document...</p>
              <p className="text-xs text-muted-foreground">Checking server registries and print files</p>
            </div>
          </div>
        </div>
      )}

      {/* Dashboard Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border-border/60 bg-card/60 backdrop-blur-md hover:shadow-md transition-all duration-300">
          <CardContent className="p-4 flex items-center justify-between">
            <div className="space-y-1">
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Total Actions</p>
              <p className="text-2xl font-extrabold text-foreground">{stats.totalLogs}</p>
            </div>
            <div className="p-2.5 rounded-xl bg-blue-500/10 text-blue-500 border border-blue-500/25">
              <Activity className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>
        
        <Card className="border-border/60 bg-card/60 backdrop-blur-md hover:shadow-md transition-all duration-300">
          <CardContent className="p-4 flex items-center justify-between">
            <div className="space-y-1">
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Active Operators</p>
              <p className="text-2xl font-extrabold text-foreground">{stats.activeUsers}</p>
            </div>
            <div className="p-2.5 rounded-xl bg-purple-500/10 text-purple-500 border border-purple-500/25">
              <User className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/60 bg-card/60 backdrop-blur-md hover:shadow-md transition-all duration-300">
          <CardContent className="p-4 flex items-center justify-between">
            <div className="space-y-1">
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Documents Printed</p>
              <p className="text-2xl font-extrabold text-foreground">{stats.printCount}</p>
            </div>
            <div className="p-2.5 rounded-xl bg-emerald-500/10 text-emerald-500 border border-emerald-500/25">
              <Download className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/60 bg-card/60 backdrop-blur-md hover:shadow-md transition-all duration-300">
          <CardContent className="p-4 flex items-center justify-between">
            <div className="space-y-1">
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">System Changes</p>
              <p className="text-2xl font-extrabold text-foreground">{stats.systemChanges}</p>
            </div>
            <div className="p-2.5 rounded-xl bg-amber-500/10 text-amber-500 border border-amber-500/25">
              <Clock className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Header and Toggle */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">System Activity Logs</h1>
          <p className="text-muted-foreground text-sm mt-1">Monitor who created PDFs, modified proposals, and logged into the system.</p>
        </div>
        <div className="flex bg-muted p-1 rounded-xl border self-start">
          <button
            onClick={() => setViewMode("list")}
            className={cn(
              "flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold transition-all cursor-pointer",
              viewMode === "list"
                ? "bg-background text-foreground shadow-xs"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <List className="h-4 w-4" />
            List View
          </button>
          <button
            onClick={() => setViewMode("calendar")}
            className={cn(
              "flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold transition-all cursor-pointer",
              viewMode === "calendar"
                ? "bg-background text-foreground shadow-xs"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <CalendarIcon className="h-4 w-4" />
            Calendar View
          </button>
        </div>
      </div>

      {viewMode === "list" ? (
        /* Tabular List View */
        <Card className="border-border shadow-sm overflow-hidden bg-card/60 backdrop-blur-md">
          <CardHeader className="bg-muted/30 border-b border-border px-6 py-4 flex flex-col sm:flex-row gap-4 items-center justify-between">
            <CardTitle className="text-sm font-semibold flex items-center gap-2 text-foreground">
              <Filter className="h-4 w-4 text-muted-foreground" /> Filter Logs
            </CardTitle>
            <div className="flex flex-col sm:flex-row w-full sm:w-auto gap-3 items-center">
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
              
              <div className="flex gap-2 w-full sm:w-auto shrink-0 mt-2 sm:mt-0">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => exportToCSV(filteredLogs, "filtered_activity_logs.csv")}
                  className="flex-1 sm:flex-initial text-xs font-bold gap-1.5 h-9 rounded-lg"
                  disabled={filteredLogs.length === 0}
                >
                  <Download className="h-3.5 w-3.5" />
                  Export CSV
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => exportToJSON(filteredLogs, "filtered_activity_logs.json")}
                  className="flex-1 sm:flex-initial text-xs font-bold gap-1.5 h-9 rounded-lg"
                  disabled={filteredLogs.length === 0}
                >
                  <Download className="h-3.5 w-3.5" />
                  Export JSON
                </Button>
              </div>
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
                    <TableHead className="max-w-[400px] text-muted-foreground">Details</TableHead>
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
                          <div className="font-semibold text-sm text-foreground">{log.userName}</div>
                          <div className="text-[10px] text-muted-foreground font-medium">{log.userEmail}</div>
                        </TableCell>
                        <TableCell>
                          <span className={cn("px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider", getActionColor(log.action))}>
                            {log.action.replace(/_/g, ' ')}
                          </span>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground max-w-[400px] break-words">
                          {renderLogDetails(log.details)}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      ) : (
        /* Calendar View Mode */
        <div className="grid gap-6 lg:grid-cols-3">
          {/* Calendar Card */}
          <Card className="lg:col-span-2 border-border shadow-sm bg-card/60 backdrop-blur-md overflow-hidden">
            <CardHeader className="bg-muted/30 border-b border-border px-6 py-4 flex flex-row items-center justify-between">
              <CardTitle className="text-base font-bold flex items-center gap-2">
                <CalendarIcon className="h-4.5 w-4.5 text-primary animate-pulse" />
                Activity Calendar
              </CardTitle>
              <div className="flex items-center gap-3">
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8 rounded-lg"
                  onClick={handlePrevMonth}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="text-sm font-bold min-w-[100px] text-center">
                  {format(currentMonth, "MMMM yyyy")}
                </span>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8 rounded-lg"
                  onClick={handleNextMonth}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-6">
              <div className="grid grid-cols-7 gap-2 mb-3 text-center text-xs font-bold text-muted-foreground uppercase tracking-widest">
                <div>Sun</div>
                <div>Mon</div>
                <div>Tue</div>
                <div>Wed</div>
                <div>Thu</div>
                <div>Fri</div>
                <div>Sat</div>
              </div>
              <div className="grid grid-cols-7 gap-2">
                {allGridDays.map((day, idx) => {
                  const dayLogs = getLogsForDay(day);
                  const isActive = dayLogs.length > 0;
                  const isSelected = selectedDay && isSameDay(day, selectedDay);
                  const isCurrentMonth = day.getMonth() === currentMonth.getMonth();
                  const uniqueUsersCount = new Set(dayLogs.map((l) => l.userId)).size;
                  
                  // Heatmap log density class calculation
                  let densityClass = "";
                  if (isActive && !isSelected) {
                    const count = dayLogs.length;
                    if (count <= 3) {
                      densityClass = "bg-emerald-500/[0.04] dark:bg-emerald-400/[0.03] border-emerald-500/20 hover:bg-emerald-500/[0.08]";
                    } else if (count <= 8) {
                      densityClass = "bg-emerald-500/[0.09] dark:bg-emerald-400/[0.07] border-emerald-500/30 hover:bg-emerald-500/[0.15]";
                    } else {
                      densityClass = "bg-emerald-500/[0.18] dark:bg-emerald-400/[0.14] border-emerald-500/45 hover:bg-emerald-500/[0.26]";
                    }
                  }

                  return (
                    <button
                      key={idx}
                      onClick={() => setSelectedDay(day)}
                      className={cn(
                        "flex flex-col items-start justify-between p-2.5 h-20 rounded-xl border text-left transition-all hover:scale-[1.02] active:scale-[0.98] cursor-pointer",
                        !isCurrentMonth && "opacity-30 bg-muted/10",
                        isCurrentMonth && !isActive && "bg-card hover:bg-muted/30 border-border",
                        isSelected
                          ? "border-primary ring-2 ring-primary/20 bg-primary/5 hover:bg-primary/5 shadow-sm"
                          : "",
                        densityClass
                      )}
                    >
                      <span className={cn(
                        "text-xs font-bold font-mono h-5 w-5 flex items-center justify-center rounded-full",
                        isSameDay(day, new Date()) && "bg-primary text-primary-foreground font-black shadow-xs shadow-primary/30"
                      )}>
                        {day.getDate()}
                      </span>
                      
                      {isActive && (
                        <div className="w-full flex flex-col gap-0.5 items-end mt-auto">
                          <span className="text-[10px] font-extrabold text-primary font-mono leading-none">
                            {dayLogs.length} act{dayLogs.length > 1 ? "s" : ""}
                          </span>
                          <span className="text-[8px] text-muted-foreground font-semibold leading-none">
                            {uniqueUsersCount} user{uniqueUsersCount > 1 ? "s" : ""}
                          </span>
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* Selected Day Details Panel */}
          <Card className="border-border shadow-sm bg-card/60 backdrop-blur-md overflow-hidden flex flex-col">
            <CardHeader className="bg-muted/30 border-b border-border px-6 py-4 flex flex-row items-center gap-2">
              <Clock className="h-4.5 w-4.5 text-primary" />
              <CardTitle className="text-base font-bold text-foreground">
                Day Details
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6 flex-1 flex flex-col justify-between">
              {selectedDay ? (
                <div className="space-y-6 w-full">
                  <div>
                    <h3 className="font-extrabold text-lg text-foreground leading-snug">
                      {format(selectedDay, "EEEE, MMMM dd, yyyy")}
                    </h3>
                    <p className="text-xs text-muted-foreground mt-1 font-medium">
                      {selectedDayLogs.length === 0
                        ? "No activity logged on this day."
                        : `${selectedDayLogs.length} total actions recorded by ${selectedDayActiveUsers.length} active users.`}
                    </p>
                  </div>

                  {selectedDayLogs.length > 0 && (
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleExportDayCSV}
                        className="flex-1 text-xs font-bold gap-1.5 h-9 rounded-lg"
                      >
                        <Download className="h-3.5 w-3.5" />
                        Export CSV
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleExportDayJSON}
                        className="flex-1 text-xs font-bold gap-1.5 h-9 rounded-lg"
                      >
                        <Download className="h-3.5 w-3.5" />
                        Export JSON
                      </Button>
                    </div>
                  )}

                  {selectedDayActiveUsers.length > 0 ? (
                    <div className="space-y-3">
                      <h4 className="text-xs font-black text-muted-foreground uppercase tracking-widest">
                        Active Users ({selectedDayActiveUsers.length})
                      </h4>
                      <div className="divide-y divide-border border rounded-xl overflow-hidden bg-muted/10 max-h-[350px] overflow-y-auto space-y-1 p-1">
                        {selectedDayActiveUsers.map((user) => {
                          const userColor = getUserColor(user.userEmail);
                          const initials = (user.userName || "U").split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase();
                          return (
                            <div key={user.userId} className="flex items-center justify-between p-3 text-sm hover:bg-muted/50 transition-colors rounded-xl border border-transparent hover:border-border/40">
                              <div className="flex items-center gap-3 min-w-0">
                                <div
                                  className="w-9 h-9 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0 shadow-sm"
                                  style={{ backgroundColor: userColor }}
                                >
                                  {initials}
                                </div>
                                <div className="min-w-0">
                                  <p className="font-bold text-foreground truncate">{user.userName}</p>
                                  <p className="text-[10px] text-muted-foreground truncate">{user.userEmail}</p>
                                </div>
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                <Badge variant="outline" className="font-mono text-[10px] font-extrabold px-2 py-0.5 bg-background shadow-xs">
                                  {user.count}
                                </Badge>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => handleViewJourney(user)}
                                  className="text-xs font-black text-primary hover:bg-primary/10 hover:text-primary h-8 px-2.5 rounded-lg active:scale-95 transition-all"
                                >
                                  Journey
                                </Button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ) : (
                    <div className="border border-dashed rounded-xl p-8 text-center text-muted-foreground text-xs font-semibold">
                      No users were active on this day.
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-center py-12 text-muted-foreground flex flex-col items-center justify-center gap-3 my-auto w-full">
                  <CalendarIcon className="h-8 w-8 text-muted-foreground/50 stroke-[1.5]" />
                  <p className="text-sm font-semibold">Select a day on the calendar to view activity details.</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* User Journey Modal */}
      <Dialog open={journeyOpen} onOpenChange={setJourneyOpen}>
        <DialogContent className="max-w-2xl bg-background border border-border shadow-xl rounded-xl p-6">
          <DialogHeader className="space-y-1">
            <DialogTitle className="text-lg font-bold flex items-center gap-2 text-foreground">
              <User className="h-5 w-5 text-primary" />
              User Journey: {journeyUser?.userName}
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground font-medium">
              {journeyUser?.userEmail}
            </DialogDescription>
          </DialogHeader>

          {/* Range Selector */}
          <div className="flex bg-muted p-0.5 rounded-lg border self-start text-xs font-bold mt-2">
            <button
              onClick={() => setJourneyRange("today")}
              className={cn(
                "px-3 py-1.5 rounded-md transition-all cursor-pointer",
                journeyRange === "today"
                  ? "bg-background text-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              Selected Day Logs
            </button>
            <button
              onClick={() => setJourneyRange("all")}
              className={cn(
                "px-3 py-1.5 rounded-md transition-all cursor-pointer",
                journeyRange === "all"
                  ? "bg-background text-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              All History (Max 1000)
            </button>
          </div>

          {/* Timeline */}
          <div className="my-4 max-h-[50vh] overflow-y-auto pr-2 min-h-[150px] relative border rounded-xl p-4 bg-muted/10">
            {journeyLogs.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground text-xs font-medium">
                No logs found for this user in selected range.
              </div>
            ) : (
              <div className="relative pl-8 border-l-2 border-primary/20 space-y-6">
                {journeyLogs.map((log) => {
                  const logDate = getLogDate(log.timestamp);
                  const formattedTime = logDate ? format(logDate, "HH:mm:ss") : "Pending";
                  const formattedDate = logDate ? format(logDate, "yyyy-MM-dd HH:mm:ss") : "Pending";
                  const isExpanded = !!expandedLogs[log.id];

                  return (
                    <div key={log.id} className="relative group">
                      {/* Timeline Bullet Action Icon */}
                      <span className={cn(
                        "absolute -left-[45px] top-0.5 h-7 w-7 rounded-full border bg-background flex items-center justify-center z-10 transition-all shadow-xs group-hover:scale-110",
                        getActionIconBg(log.action)
                      )}>
                        {getActionIcon(log.action)}
                      </span>

                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-black font-mono text-muted-foreground">
                            {journeyRange === "today" ? formattedTime : formattedDate}
                          </span>
                          <span className={cn("px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider shrink-0", getActionColor(log.action))}>
                            {log.action.replace(/_/g, ' ')}
                          </span>
                        </div>

                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => toggleLogDetails(log.id)}
                          className="h-7 text-xs font-bold text-primary hover:bg-primary/5 flex items-center gap-1 self-start sm:self-center rounded-lg"
                        >
                          Details
                          {isExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                        </Button>
                      </div>

                      {/* Log details expansion */}
                      {isExpanded && (
                        <div className="mt-2 p-3 bg-muted/60 backdrop-blur-xs border rounded-xl text-[11px] font-mono leading-relaxed animate-in fade-in-50 duration-100 space-y-1.5">
                          {renderLogDetails(log.details)}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <DialogFooter className="flex flex-col sm:flex-row sm:justify-between items-center gap-2 border-t pt-4">
            <div className="flex gap-2 w-full sm:w-auto">
              <Button
                variant="outline"
                size="sm"
                onClick={handleExportJourneyCSV}
                className="flex-1 sm:flex-initial text-xs font-bold gap-1 h-8 rounded-lg"
                disabled={journeyLogs.length === 0}
              >
                <Download className="h-3.5 w-3.5" />
                CSV
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleExportJourneyJSON}
                className="flex-1 sm:flex-initial text-xs font-bold gap-1 h-8 rounded-lg"
                disabled={journeyLogs.length === 0}
              >
                <Download className="h-3.5 w-3.5" />
                JSON
              </Button>
            </div>
            <DialogClose asChild>
              <Button size="sm" className="w-full sm:w-auto text-xs font-bold h-8 rounded-lg">
                Close
              </Button>
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
