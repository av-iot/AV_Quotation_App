"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import {
  collection, query, orderBy, onSnapshot,
  doc, setDoc, serverTimestamp, getDocs, where
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/auth-context";
import { motion, AnimatePresence } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import {
  FileText, Receipt, TrendingUp, TrendingDown, Clock, Plus, ArrowRight, Banknote,
  AlertCircle, ArrowUpRight, Download, Phone, MessageSquare, ChevronDown, ChevronUp, Wrench, Sun, CheckCircle2, Bell, User, Loader2, Calendar, Building2, Zap, ShieldAlert, CalendarDays, MapPin, Navigation, ClipboardCheck
} from "lucide-react";
import Link from "next/link";
import type { Proposal, Quotation } from "@/types";
import { cn } from "@/lib/utils";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";

// ─── Animation helpers ────────────────────────────────────────────────────────
const fadeUp = (delay = 0) => ({
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.35, delay, ease: [0.23, 1, 0.32, 1] } },
});

const expandAnim = {
  initial: { opacity: 0, height: 0 },
  animate: { opacity: 1, height: "auto", transition: { duration: 0.25, ease: "easeOut" } },
  exit: { opacity: 0, height: 0, transition: { duration: 0.2, ease: "easeIn" } },
};

// ─── Types ────────────────────────────────────────────────────────────────────
type TimeFilter = "MONTH" | "YEAR" | "LIFETIME";

interface Followup {
  quotationId: string;
  lastCallDate: string;
  customerResponse: string;
  nextCallDate: string;
  updatedAt?: any;
}

interface ServiceDueSite {
  projectNo: string;
  customerName: string;
  lastServiceDate: string | null;
  monthsSinceService: number | null;
  freeDone: number;
  freeTotal: number;
  urgency: "overdue" | "due-soon" | "free-pending";
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return "Morning";
  if (h < 18) return "Afternoon";
  return "Evening";
}

function fmtRs(n: number) {
  if (n >= 1_000_000) return `Rs. ${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `Rs. ${(n / 1_000).toFixed(0)}K`;
  return `Rs. ${n.toLocaleString("en-US")}`;
}

function parseServiceDate(s: string): Date | null {
  if (!s || s === "---" || s === "—") return null;
  const p = s.trim().split(/[/\-]/);
  if (p.length === 3) {
    const [d, m, y] = p.map(Number);
    if (y > 1000) return new Date(y, m - 1, d);
  }
  const dt = new Date(s);
  return isNaN(dt.getTime()) ? null : dt;
}

function monthsAgo(d: Date): number {
  const now = new Date();
  return Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24 * 30.44));
}

function daysUntil(dateStr: string): number | null {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return null;
  return Math.ceil((d.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
}

// ─── Dashboard ────────────────────────────────────────────────────────────────
export default function DashboardPage() {
  const { user } = useAuth();
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [quotations, setQuotations] = useState<Quotation[]>([]);
  const [followups, setFollowups] = useState<Record<string, Followup>>({});
  const [legacyServiceRecords, setLegacyServiceRecords] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [timeFilter, setTimeFilter] = useState<TimeFilter>("MONTH");
  const [expandedInvoice, setExpandedInvoice] = useState<string | null>(null);
  const [serviceExpanded, setServiceExpanded] = useState(false);
  const [editingFollowup, setEditingFollowup] = useState<string | null>(null);
  const [followupDraft, setFollowupDraft] = useState<Partial<Followup>>({});
  const [savingFollowup, setSavingFollowup] = useState(false);
  const [showRolePrompt, setShowRolePrompt] = useState(false);
  const [updatingRole, setUpdatingRole] = useState(false);
  const [requestedRole, setRequestedRole] = useState<string>("");
  const [pendingApprovals, setPendingApprovals] = useState<any[]>([]);
  const [todayPlans, setTodayPlans] = useState<any[]>([]);

  useEffect(() => {
    if (user && user.role === "viewer" && !(user as any).roleSetupComplete) {
      setShowRolePrompt(true);
    } else {
      setShowRolePrompt(false);
    }
  }, [user]);

  const handleRequestRole = async () => {
    if (!user?.uid) return;
    setUpdatingRole(true);
    try {
      const updates: any = { roleSetupComplete: true };
      if (requestedRole) {
        updates.requestedRole = requestedRole;
      }
      await setDoc(doc(db, "users", user.uid), updates, { merge: true });
      setShowRolePrompt(false);
    } catch (e) {
      console.error(e);
      setUpdatingRole(false);
    }
  };



  // ── Data fetching ──────────────────────────────────────────────────────────
  useEffect(() => {
    const unsubP = onSnapshot(
      query(collection(db, "proposals"), orderBy("createdAt", "desc")),
      (s) => setProposals(s.docs.map((d) => ({ id: d.id, ...d.data() }) as Proposal))
    );
    const unsubQ = onSnapshot(
      query(collection(db, "quotations"), orderBy("createdAt", "desc")),
      (s) => { setQuotations(s.docs.map((d) => ({ id: d.id, ...d.data() }) as Quotation)); setLoading(false); }
    );
    
    // Service Approvals
    const unsubApprovals = onSnapshot(
      query(collection(db, "service_checklists"), where("status", "==", "pending_approval")),
      (s) => setPendingApprovals(s.docs.map(d => ({ id: d.id, ...d.data() })))
    );

    // Today's Plans
    const todayStr = new Date().toISOString().split("T")[0];
    const unsubPlans = onSnapshot(
      query(collection(db, "servicePlans"), where("date", "==", todayStr)),
      (s) => setTodayPlans(s.docs.map(d => ({ id: d.id, ...d.data() })))
    );

    return () => { unsubP(); unsubQ(); unsubApprovals(); unsubPlans(); };
  }, []);

  useEffect(() => {
    getDocs(collection(db, "invoice_followups")).then((snap) => {
      const map: Record<string, Followup> = {};
      snap.docs.forEach((d) => { map[d.id] = { quotationId: d.id, ...d.data() } as Followup; });
      setFollowups(map);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    fetch(`/api/services/legacy?t=${Date.now()}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => { if (Array.isArray(d)) setLegacyServiceRecords(d); })
      .catch(() => {});
  }, []);

  // ── Filtered data ──────────────────────────────────────────────────────────
  const filterData = useCallback((data: any[], type: "current" | "previous") => {
    return data.filter((item) => {
      if (timeFilter === "LIFETIME") return type === "current";
      let d: Date;
      if (item.createdAt?.seconds) d = new Date(item.createdAt.seconds * 1000);
      else if (item.date) d = new Date(item.date);
      else return false;
      if (isNaN(d.getTime())) return false;
      const now = new Date();
      if (timeFilter === "MONTH") {
        const cur = d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
        const prev = d.getMonth() === new Date(now.getFullYear(), now.getMonth() - 1, 1).getMonth() && d.getFullYear() === new Date(now.getFullYear(), now.getMonth() - 1, 1).getFullYear();
        return type === "current" ? cur : prev;
      }
      if (timeFilter === "YEAR") {
        return type === "current" ? d.getFullYear() === now.getFullYear() : d.getFullYear() === now.getFullYear() - 1;
      }
      return true;
    });
  }, [timeFilter]);

  const currentQ = useMemo(() => filterData(quotations, "current"), [quotations, filterData]);
  const prevQ    = useMemo(() => filterData(quotations, "previous"), [quotations, filterData]);
  const currentP = useMemo(() => filterData(proposals, "current"), [proposals, filterData]);
  const prevP    = useMemo(() => filterData(proposals, "previous"), [proposals, filterData]);

  const currentRevenue = useMemo(() => currentQ.reduce((s, q) => s + (q.total || 0), 0), [currentQ]);
  const prevRevenue    = useMemo(() => prevQ.reduce((s, q) => s + (q.total || 0), 0), [prevQ]);

  const calcTrend = (curr: number, prev: number) => {
    if (timeFilter === "LIFETIME") return null;
    if (prev === 0 && curr === 0) return { val: 0, isPos: true };
    if (prev === 0) return { val: 100, isPos: true };
    const diff = ((curr - prev) / prev) * 100;
    return { val: Math.abs(Math.round(diff)), isPos: diff >= 0 };
  };

  // Unpaid invoices — all, not time-filtered
  const unpaidInvoices = useMemo(() =>
    quotations.filter((q) => !["fully_paid", "installed", "commissioned"].includes(q.paymentStatus || ""))
      .sort((a, b) => {
        // Sort: overdue follow-ups first, then by amount desc
        const fa = followups[a.id];
        const fb = followups[b.id];
        const daysA = fa?.nextCallDate ? daysUntil(fa.nextCallDate) ?? 999 : 999;
        const daysB = fb?.nextCallDate ? daysUntil(fb.nextCallDate) ?? 999 : 999;
        if (daysA !== daysB) return daysA - daysB;
        return (b.total || 0) - (a.total || 0);
      }),
    [quotations, followups]
  );

  const totalUnpaid = useMemo(() =>
    unpaidInvoices.reduce((s, q) => {
      const inv = q.installmentAmount ?? q.total ?? 0;
      const paid = q.paidAmount || 0;
      return s + Math.max(0, inv - paid);
    }, 0),
    [unpaidInvoices]
  );

  // Service due sites
  const serviceDueSites = useMemo((): ServiceDueSite[] => {
    const sites: ServiceDueSite[] = [];
    legacyServiceRecords.forEach((rec: any) => {
      const milestones: any[] = (rec.milestones ?? []).filter((m: any) => m.date && m.date !== "---");
      const freeDone = parseInt(rec.freeServiceDone || "0") || 0;
      const freeTotal = parseInt(rec.serviceRounds || "0") || 0;

      // Find last service date
      let lastDate: Date | null = null;
      milestones.forEach((m: any) => {
        const d = parseServiceDate(m.date);
        if (d && (!lastDate || d > lastDate)) lastDate = d;
      });

      const months = lastDate ? monthsAgo(lastDate) : null;
      const lastDateStr = (lastDate as Date | null)?.toLocaleDateString("en-GB") ?? null;

      let urgency: ServiceDueSite["urgency"] | null = null;
      if (months === null || months >= 12) urgency = "overdue";
      else if (months >= 10) urgency = "due-soon";
      else if (freeTotal > 0 && freeDone < freeTotal) urgency = "free-pending";

      if (urgency) {
        sites.push({
          projectNo: rec.projectNo,
          customerName: rec.customerName || "—",
          lastServiceDate: lastDateStr,
          monthsSinceService: months,
          freeDone,
          freeTotal,
          urgency,
        });
      }
    });
    return sites.sort((a, b) => {
      const order = { overdue: 0, "due-soon": 1, "free-pending": 2 };
      if (order[a.urgency] !== order[b.urgency]) return order[a.urgency] - order[b.urgency];
      return (b.monthsSinceService ?? 999) - (a.monthsSinceService ?? 999);
    });
  }, [legacyServiceRecords]);

  // Role checks
  const canViewMoney = !user?.role || ["superadmin", "admin", "authorized", "stakeholder"].includes(user.role);
  const canCRUD      = user?.role && ["superadmin", "admin", "authorized"].includes(user.role);

  // Follow-up save
  const saveFollowup = async (quotationId: string) => {
    if (!followupDraft.lastCallDate && !followupDraft.nextCallDate && !followupDraft.customerResponse) return;
    setSavingFollowup(true);
    try {
      const data = {
        quotationId,
        lastCallDate: followupDraft.lastCallDate || "",
        customerResponse: followupDraft.customerResponse || "",
        nextCallDate: followupDraft.nextCallDate || "",
        updatedAt: serverTimestamp(),
        updatedBy: user?.uid || "",
      };
      await setDoc(doc(db, "invoice_followups", quotationId), data);
      setFollowups((prev) => ({ ...prev, [quotationId]: { ...data } as Followup }));
      setEditingFollowup(null);
    } catch (e) { console.error(e); }
    finally { setSavingFollowup(false); }
  };

  const exportToCSV = () => {
    const rows = [["Type", "Ref No", "Customer", "Date", "Status", "Amount (Rs)"]];
    currentQ.forEach((q) => rows.push(["Quotation", q.qtnNo || "", `"${q.customer?.name || ""}"`,
      new Date((q.createdAt as any)?.seconds * 1000 || q.date || Date.now()).toLocaleDateString(),
      q.status || "confirmed", (q.total || 0).toString()]));
    currentP.forEach((p) => rows.push(["Proposal", p.propNo || p.qtnNo || "", `"${p.customer?.name || ""}"`,
      new Date((p.createdAt as any)?.seconds * 1000 || p.date || Date.now()).toLocaleDateString(),
      p.status || "draft", (p.options?.[0]?.pricing?.totalPrice || 0).toString()]));
    const link = document.createElement("a");
    link.href = "data:text/csv;charset=utf-8," + encodeURI(rows.map((r) => r.join(",")).join("\n"));
    link.download = `alta_vision_export_${timeFilter.toLowerCase()}.csv`;
    document.body.appendChild(link); link.click(); document.body.removeChild(link);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[70vh]">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
          <p className="text-sm text-muted-foreground font-medium">Loading dashboard…</p>
        </div>
      </div>
    );
  }

  const greeting   = getGreeting();
  const firstName  = user?.displayName?.split(" ")[0] || "User";
  const drafts     = proposals.filter((p) => p.status === "draft");
  const sentCount  = currentP.filter((p) => p.status === "sent").length;
  const approvedCount = currentP.filter((p) => p.status === "approved").length;
  const draftCount = currentP.filter((p) => !p.status || p.status === "draft").length;

  // KPI stats
  const kpis = [
    canViewMoney && {
      label: "Revenue",
      value: fmtRs(currentRevenue),
      sub: timeFilter === "LIFETIME" ? "all time" : `vs ${fmtRs(prevRevenue)} last ${timeFilter.toLowerCase()}`,
      icon: Banknote,
      color: "text-emerald-600 bg-emerald-500/10 border-emerald-500/20",
      trend: calcTrend(currentRevenue, prevRevenue),
    },
    canViewMoney && {
      label: "Unpaid Balance",
      value: fmtRs(totalUnpaid),
      sub: `${unpaidInvoices.length} invoice${unpaidInvoices.length !== 1 ? "s" : ""} pending`,
      icon: AlertCircle,
      color: totalUnpaid > 0 ? "text-red-600 bg-red-500/10 border-red-500/20" : "text-emerald-600 bg-emerald-500/10 border-emerald-500/20",
      trend: null,
    },
    {
      label: "Invoices Issued",
      value: currentQ.length.toString(),
      sub: `${prevQ.length} last period`,
      icon: Receipt,
      color: "text-blue-600 bg-blue-500/10 border-blue-500/20",
      trend: calcTrend(currentQ.length, prevQ.length),
    },
    {
      label: "Proposals",
      value: currentP.length.toString(),
      sub: `${draftCount} draft${draftCount !== 1 ? "s" : ""}`,
      icon: FileText,
      color: "text-violet-600 bg-violet-500/10 border-violet-500/20",
      trend: calcTrend(currentP.length, prevP.length),
    },
    {
      label: "Sites Need Service",
      value: serviceDueSites.length.toString(),
      sub: `${serviceDueSites.filter((s) => s.urgency === "overdue").length} overdue`,
      icon: Wrench,
      color: serviceDueSites.some((s) => s.urgency === "overdue")
        ? "text-amber-600 bg-amber-500/10 border-amber-500/20"
        : "text-zinc-500 bg-zinc-500/10 border-zinc-500/20",
      trend: null,
    },
  ].filter(Boolean) as any[];

  if (showRolePrompt) {
    return (
      <div className="flex items-center justify-center min-h-[80vh] p-4 animate-in zoom-in-95 duration-500">
        <div className="w-full max-w-md bg-card border border-border rounded-xl shadow-xl overflow-hidden flex flex-col">
          <div className="p-6 border-b border-border/50 bg-muted/20">
            <h2 className="flex items-center gap-2 text-xl font-black text-foreground">
              <ShieldAlert className="h-6 w-6 text-amber-500" /> Account Role Setup
            </h2>
            <p className="text-sm text-muted-foreground mt-2 font-medium">Do you need more system privileges?</p>
          </div>
          <div className="p-6 space-y-5">
            <div className="p-4 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900/50 rounded-lg space-y-1.5">
              <p className="text-sm font-bold text-blue-900 dark:text-blue-300">Request Role from Admin</p>
              <p className="text-xs text-blue-800/80 dark:text-blue-400/80 leading-relaxed">By default, you are a Viewer. If your job requires more access (e.g. creating proposals, field operations), you can request a specific role below.</p>
              
              <div className="pt-3">
                <select 
                  value={requestedRole}
                  onChange={(e) => setRequestedRole(e.target.value)}
                  className="w-full h-10 px-3 py-2 text-sm border rounded-md font-semibold text-foreground bg-background"
                >
                  <option value="">Stay as Viewer (No extra privileges)</option>
                  <option value="admin">Admin</option>
                  <option value="authorized">Authorized User (Quotations)</option>
                  <option value="engineer">Engineer</option>
                  <option value="team_leader">Technician (Team Leader)</option>
                  <option value="technician">Technician</option>
                  <option value="stakeholder">Stakeholder</option>
                </select>
              </div>
            </div>
            <div className="p-4 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/50 rounded-lg space-y-3">
              <p className="text-sm font-bold text-amber-700 flex items-center gap-1.5">
                <AlertCircle className="h-4 w-4" /> Admin Approval Required
              </p>
              <div className="text-[11px] font-semibold text-amber-800/80 dark:text-amber-300/80 space-y-2 pl-5">
                <p>EN: If you request a role, you will remain a Viewer until an Admin approves your request.</p>
                <p className="font-si">SI: ඔබ නව ගිණුම් වර්ගයක් ඉල්ලා සිටියහොත්, Admin විසින් එය අනුමත කරන තෙක් ඔබ Viewer ලෙස පවතිනු ඇත.</p>
                <p className="font-ta">TA: நீங்கள் புதிய பங்கை கோரினால், நிர்வாகி அங்கீகரிக்கும் வரை நீங்கள் பார்வையாளராகவே (Viewer) இருப்பீர்கள்.</p>
              </div>
            </div>
          </div>
          <div className="p-6 border-t border-border/50 bg-muted/10 flex flex-col sm:flex-row gap-3">
            <Button onClick={handleRequestRole} disabled={updatingRole} className="w-full h-12 bg-amber-600 hover:bg-amber-700 text-white font-bold">
              {updatingRole ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              {requestedRole ? "Submit Request" : "Continue as Viewer"}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 max-w-[1440px] mx-auto space-y-7 animate-in fade-in duration-400">

      {/* ── Header ── */}
      <motion.div {...fadeUp(0)} className="flex flex-col md:flex-row justify-between items-start md:items-end gap-5">
        <div>
          <div className="inline-flex items-center gap-1.5 text-xs font-bold text-primary mb-2.5 bg-primary/8 px-3 py-1.5 rounded-full border border-primary/15">
            <CalendarDays className="h-3.5 w-3.5" />
            {new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}
          </div>
          <h1 className="text-3xl md:text-4xl font-black tracking-tight text-foreground">
            Good {greeting},{" "}
            <span className="bg-clip-text text-transparent bg-gradient-to-r from-primary via-violet-500 to-indigo-500">{firstName}</span>
          </h1>
          <p className="text-muted-foreground mt-1.5 text-sm font-medium">Your operations overview for today.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="inline-flex bg-muted/40 p-1 rounded-lg border border-border/50 gap-0.5">
            {(["MONTH", "YEAR", "LIFETIME"] as TimeFilter[]).map((tf) => (
              <button
                key={tf}
                onClick={() => setTimeFilter(tf)}
                className={cn(
                  "px-3.5 py-1.5 text-xs font-semibold rounded-md transition-all",
                  timeFilter === tf
                    ? "bg-background shadow-sm text-foreground ring-1 ring-border"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                )}
              >
                {tf === "MONTH" ? "Month" : tf === "YEAR" ? "Year" : "All Time"}
              </button>
            ))}
          </div>
          <Button onClick={exportToCSV} variant="outline" size="sm" className="gap-2 h-9">
            <Download className="h-3.5 w-3.5" /> Export
          </Button>
          {canCRUD && (
            <Button size="sm" className="gap-2 h-9" asChild>
              <Link href="/proposals/new"><Plus className="h-3.5 w-3.5" /> New Proposal</Link>
            </Button>
          )}
        </div>
      </motion.div>

      {/* ── Role-Based Action Banners ── */}
      <div className="space-y-4">
        {/* Engineer Pending Approvals Banner */}
        {(user?.role === "engineer" || user?.role === "site_engineer" || user?.role === "admin" || user?.role === "superadmin") && pendingApprovals.length > 0 && (
          <motion.div {...fadeUp(0.05)} className="relative overflow-hidden bg-gradient-to-r from-amber-500 to-orange-500 rounded-2xl shadow-lg border border-amber-400 p-4 sm:p-5 text-white flex flex-col sm:flex-row items-center justify-between gap-4 print:hidden">
            <div className="flex items-center gap-4 w-full sm:w-auto">
              <div className="bg-white/20 p-3 rounded-full shrink-0">
                <ClipboardCheck className="h-6 w-6 text-white" />
              </div>
              <div>
                <h3 className="text-lg font-black tracking-tight flex items-center gap-2">
                  Action Required
                  <Badge variant="secondary" className="bg-white text-amber-600 hover:bg-white border-0">{pendingApprovals.length}</Badge>
                </h3>
                <p className="text-sm font-medium text-white/90">You have {pendingApprovals.length} service site{pendingApprovals.length > 1 ? "s" : ""} waiting for your approval.</p>
              </div>
            </div>
            <Button asChild className="w-full sm:w-auto shrink-0 bg-white text-amber-600 hover:bg-amber-50 font-bold border-0 shadow-sm">
              <Link href="/services">Review Approvals <ArrowRight className="ml-2 h-4 w-4" /></Link>
            </Button>
          </motion.div>
        )}

        {/* Team Leader / Member Today's Plan Banner */}
        {(() => {
          if (!user) return null;
          const userName = (user.displayName || "").trim().toLowerCase();
          const myTodayPlans = todayPlans.filter((p: any) => {
            const leader  = (p.teamLeader || "").trim().toLowerCase();
            const members = (p.members || []).map((m: string) => m.trim().toLowerCase());
            return leader === userName || members.includes(userName);
          });
          if (myTodayPlans.length === 0) return null;

          const SHOW = 6; // max buttons before collapsing
          const visible = myTodayPlans.slice(0, SHOW);
          const overflow = myTodayPlans.length - SHOW;

          return (
            <motion.div {...fadeUp(0.05)} className="relative overflow-hidden bg-gradient-to-r from-blue-600 to-indigo-600 rounded-2xl shadow-lg border border-blue-500 p-4 sm:p-5 text-white print:hidden">
              {/* Header row */}
              <div className="flex items-center gap-4 mb-3">
                <div className="bg-white/20 p-2.5 rounded-full shrink-0">
                  <Navigation className="h-5 w-5 text-white" />
                </div>
                <div>
                  <h3 className="text-base font-black tracking-tight leading-tight">
                    Today&apos;s Service {myTodayPlans.length === 1 ? "Route" : "Routes"}
                  </h3>
                  <p className="text-xs font-medium text-white/80 mt-0.5">
                    {myTodayPlans.length} active plan{myTodayPlans.length !== 1 ? "s" : ""} scheduled for today
                  </p>
                </div>
              </div>

              {/* Button grid — 1 col on mobile, 2 cols on sm, 3 cols on lg */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {visible.map((plan: any) => {
                  const done  = (plan.sites || []).filter((s: any) => s.siteStatus === "completed").length;
                  const total = plan.sites?.length || 0;
                  const isLive = plan.status === "in_progress";
                  return (
                    <Button key={plan.id} asChild
                      className="h-auto py-2.5 px-3 bg-white/15 hover:bg-white/25 border border-white/30 text-white font-bold shadow-sm justify-start gap-2 text-left group transition-all">
                      <Link href={`/services/route/${plan.id}`}>
                        <MapPin className="h-3.5 w-3.5 shrink-0 text-white/80" />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            {isLive && (
                              <span className="flex h-1.5 w-1.5 shrink-0">
                                <span className="animate-ping absolute inline-flex h-1.5 w-1.5 rounded-full bg-white opacity-60" />
                                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-white" />
                              </span>
                            )}
                            <span className="text-xs font-black truncate">{plan.planNo}</span>
                          </div>
                          <span className="text-[10px] font-medium text-white/70">{done}/{total} sites</span>
                        </div>
                      </Link>
                    </Button>
                  );
                })}
                {overflow > 0 && (
                  <Button asChild
                    className="h-auto py-2.5 px-3 bg-white/10 hover:bg-white/20 border border-white/20 text-white/80 font-bold text-xs shadow-sm justify-center">
                    <Link href="/services">+{overflow} more →</Link>
                  </Button>
                )}
              </div>
            </motion.div>
          );
        })()}
      </div>

      {/* ── KPI Cards ── */}
      <div className={cn("grid gap-4", canViewMoney ? "sm:grid-cols-2 lg:grid-cols-5" : "sm:grid-cols-3")}>
        {kpis.map((kpi, i) => (
          <motion.div key={kpi.label} {...fadeUp(i * 0.07)}>
            <Card className="border-border/60 hover:border-border/90 shadow-sm transition-all hover:shadow-md group">
              <CardContent className="p-5">
                <div className="flex items-center justify-between mb-3.5">
                  <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">{kpi.label}</p>
                  <div className={cn("p-2 rounded-lg border", kpi.color)}>
                    <kpi.icon className="h-3.5 w-3.5" />
                  </div>
                </div>
                <p className="text-2xl font-black tracking-tight text-foreground">{kpi.value}</p>
                <div className="mt-2 flex items-center gap-2">
                  {kpi.trend ? (
                    <span className={cn(
                      "inline-flex items-center gap-0.5 text-[11px] font-bold px-1.5 py-0.5 rounded",
                      kpi.trend.isPos ? "bg-emerald-500/10 text-emerald-600" : "bg-red-500/10 text-red-500"
                    )}>
                      {kpi.trend.isPos ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                      {kpi.trend.val}%
                    </span>
                  ) : null}
                  <span className="text-[11px] text-muted-foreground font-medium truncate">{kpi.sub}</span>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      {/* ── Main Grid ── */}
      <div className="grid gap-6 lg:grid-cols-3 items-start">

        {/* Left (col-span-2) */}
        <div className="lg:col-span-2 space-y-6">

          {/* ── Unpaid Invoices Panel ── */}
          <motion.div {...fadeUp(0.25)}>
            <Card className="border-border/60 shadow-sm overflow-hidden">
              <CardHeader className="pb-3 border-b border-border/40">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="p-2 rounded-lg bg-red-500/10 border border-red-500/20">
                      <Banknote className="h-4 w-4 text-red-600" />
                    </div>
                    <div>
                      <CardTitle className="text-sm font-black uppercase tracking-wider">Unpaid Invoices</CardTitle>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        {unpaidInvoices.length} invoice{unpaidInvoices.length !== 1 ? "s" : ""} · {canViewMoney ? fmtRs(totalUnpaid) + " outstanding" : "click to view"}
                      </p>
                    </div>
                  </div>
                  <Link href="/quotations" className="text-xs font-bold text-primary hover:underline flex items-center gap-1">
                    View all <ArrowRight className="h-3 w-3" />
                  </Link>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                {unpaidInvoices.length === 0 ? (
                  <div className="py-10 flex flex-col items-center justify-center text-center">
                    <div className="h-10 w-10 rounded-full bg-emerald-500/10 flex items-center justify-center mb-2.5 border border-emerald-500/20">
                      <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                    </div>
                    <p className="text-sm font-bold text-foreground">All invoices paid!</p>
                    <p className="text-xs text-muted-foreground mt-1">No outstanding balances.</p>
                  </div>
                ) : (
                  <div className="divide-y divide-border/40">
                    {unpaidInvoices.slice(0, 8).map((q) => {
                      const inv = q.installmentAmount ?? q.total ?? 0;
                      const paid = q.paidAmount || 0;
                      const balance = Math.max(0, inv - paid);
                      const isPartial = paid > 0 && paid < inv;
                      const fu = followups[q.id];
                      const isExpanded = expandedInvoice === q.id;
                      const isEditing = editingFollowup === q.id;
                      const daysToCall = fu?.nextCallDate ? daysUntil(fu.nextCallDate) : null;
                      const callOverdue = daysToCall !== null && daysToCall <= 0;
                      const callSoon = daysToCall !== null && daysToCall > 0 && daysToCall <= 3;

                      return (
                        <div key={q.id} className={cn("transition-colors", isExpanded ? "bg-muted/30" : "hover:bg-muted/20")}>
                          {/* Row header — click to expand */}
                          <button
                            type="button"
                            className="w-full text-left px-5 py-3.5 flex items-center gap-4"
                            onClick={() => setExpandedInvoice(isExpanded ? null : q.id)}
                          >
                            <div className="h-9 w-9 rounded-lg bg-muted/60 border border-border/50 flex items-center justify-center shrink-0 text-sm font-black text-muted-foreground">
                              {q.customer?.name?.charAt(0) || "?"}
                            </div>
                            <div className="flex-1 min-w-0 text-left">
                              <p className="text-sm font-bold text-foreground truncate">{q.customer?.name || "Unnamed"}</p>
                              <p className="text-[11px] text-muted-foreground mt-0.5 flex items-center gap-1.5 flex-wrap">
                                <span className="font-mono">{q.qtnNo || q.id.slice(0, 8)}</span>
                                {q.installmentNo && <span className="bg-muted px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wider">Inst {q.installmentNo}</span>}
                              </p>
                            </div>
                            {/* Follow-up indicator */}
                            {fu?.nextCallDate && (
                              <div className={cn(
                                "shrink-0 text-[10px] font-bold px-2 py-1 rounded-full border flex items-center gap-1",
                                callOverdue ? "bg-red-50 text-red-600 border-red-200 dark:bg-red-950/20 dark:border-red-800/40 animate-pulse"
                                  : callSoon ? "bg-amber-50 text-amber-600 border-amber-200 dark:bg-amber-950/20"
                                  : "bg-blue-50 text-blue-600 border-blue-200 dark:bg-blue-950/20"
                              )}>
                                <Bell className="h-2.5 w-2.5" />
                                {callOverdue ? "Call overdue" : callSoon ? `Call in ${daysToCall}d` : new Date(fu.nextCallDate).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                              </div>
                            )}
                            {canViewMoney && (
                              <div className="shrink-0 text-right">
                                <p className={cn("font-black text-sm font-mono", balance > 0 ? "text-red-600" : "text-emerald-600")}>
                                  {fmtRs(balance)}
                                </p>
                                <span className={cn(
                                  "text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded border",
                                  isPartial ? "text-amber-600 bg-amber-50 border-amber-200 dark:bg-amber-950/20"
                                    : "text-red-500 bg-red-50 border-red-200 dark:bg-red-950/20"
                                )}>
                                  {isPartial ? "Partial" : "Unpaid"}
                                </span>
                              </div>
                            )}
                            <div className="shrink-0 text-muted-foreground">
                              {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                            </div>
                          </button>

                          {/* Expanded follow-up panel */}
                          <AnimatePresence>
                            {isExpanded && (
                              <motion.div {...expandAnim} className="overflow-hidden">
                                <div className="px-5 pb-5 pt-1 space-y-4 border-t border-border/30">
                                  {/* Invoice stats row */}
                                  <div className="grid grid-cols-3 gap-3">
                                    <div className="rounded-lg bg-muted/50 border border-border/50 p-3">
                                      <p className="text-[9px] font-black text-muted-foreground uppercase tracking-widest mb-1">Invoiced</p>
                                      <p className="font-mono font-black text-sm text-foreground">{fmtRs(inv)}</p>
                                    </div>
                                    <div className="rounded-lg bg-emerald-500/5 border border-emerald-500/20 p-3">
                                      <p className="text-[9px] font-black text-emerald-600/80 uppercase tracking-widest mb-1">Paid</p>
                                      <p className="font-mono font-black text-sm text-emerald-600">{fmtRs(paid)}</p>
                                    </div>
                                    <div className="rounded-lg bg-red-500/5 border border-red-400/20 p-3">
                                      <p className="text-[9px] font-black text-red-500/80 uppercase tracking-widest mb-1">Balance</p>
                                      <p className="font-mono font-black text-sm text-red-500">{fmtRs(balance)}</p>
                                    </div>
                                  </div>

                                  {/* Follow-up info / edit */}
                                  {!isEditing ? (
                                    <div className="rounded-xl border border-border/60 bg-background p-4 space-y-3">
                                      <div className="flex items-center justify-between">
                                        <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest flex items-center gap-1.5">
                                          <Phone className="h-3 w-3" /> Follow-up Log
                                        </p>
                                        <div className="flex items-center gap-2">
                                          <Link href={`/quotations/${q.id}`} className="text-[10px] font-bold text-primary hover:underline">Open Invoice →</Link>
                                          <button
                                            type="button"
                                            onClick={() => {
                                              const today = new Date().toISOString().split("T")[0];
                                              const twoWeeks = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
                                              setEditingFollowup(q.id);
                                              setFollowupDraft({
                                                lastCallDate: fu?.lastCallDate || today,
                                                customerResponse: fu?.customerResponse || "",
                                                nextCallDate: fu?.nextCallDate || twoWeeks,
                                              });
                                            }}
                                            className="text-[10px] font-black px-2.5 py-1 rounded-lg bg-primary/10 text-primary hover:bg-primary/15 transition-colors border border-primary/20"
                                          >
                                            {fu ? "Edit" : "+ Log Call"}
                                          </button>
                                        </div>
                                      </div>

                                      {fu ? (
                                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                                          <div>
                                            <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider mb-1 flex items-center gap-1">
                                              <Phone className="h-2.5 w-2.5" /> Last Called
                                            </p>
                                            <p className="font-semibold text-foreground">{fu.lastCallDate ? new Date(fu.lastCallDate).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "—"}</p>
                                          </div>
                                          <div className="sm:col-span-2">
                                            <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider mb-1 flex items-center gap-1">
                                              <MessageSquare className="h-2.5 w-2.5" /> Customer Said
                                            </p>
                                            <p className="font-semibold text-foreground leading-snug">{fu.customerResponse || "—"}</p>
                                          </div>
                                          <div className="sm:col-span-3">
                                            <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider mb-1 flex items-center gap-1">
                                              <Calendar className="h-2.5 w-2.5" /> Call Again On
                                            </p>
                                            <p className={cn("font-bold", callOverdue ? "text-red-600" : callSoon ? "text-amber-600" : "text-foreground")}>
                                              {fu.nextCallDate ? new Date(fu.nextCallDate).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric" }) : "—"}
                                              {callOverdue && " · Overdue!"}
                                              {callSoon && ` · In ${daysToCall} day${daysToCall !== 1 ? "s" : ""}`}
                                            </p>
                                          </div>
                                        </div>
                                      ) : (
                                        <p className="text-xs text-muted-foreground italic">No follow-up logged yet. Click "+ Log Call" to record the last contact.</p>
                                      )}
                                    </div>
                                  ) : (
                                    <div className="rounded-xl border border-primary/25 bg-primary/5 p-4 space-y-3">
                                      <p className="text-[10px] font-black text-primary uppercase tracking-widest flex items-center gap-1.5">
                                        <Phone className="h-3 w-3" /> Log Follow-up
                                      </p>
                                      <div className="grid grid-cols-2 gap-3">
                                        <div className="space-y-1">
                                          <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Last Called</label>
                                          <Input
                                            type="date"
                                            value={followupDraft.lastCallDate || ""}
                                            onChange={(e) => setFollowupDraft((p) => ({ ...p, lastCallDate: e.target.value }))}
                                            className="h-8 text-xs"
                                          />
                                        </div>
                                        <div className="space-y-1">
                                          <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Call Again On</label>
                                          <Input
                                            type="date"
                                            value={followupDraft.nextCallDate || ""}
                                            onChange={(e) => setFollowupDraft((p) => ({ ...p, nextCallDate: e.target.value }))}
                                            className="h-8 text-xs"
                                          />
                                        </div>
                                        <div className="col-span-2 space-y-1.5">
                                          <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">What Did Customer Say?</label>
                                          <div className="flex flex-wrap gap-1.5">
                                            {[
                                              "Will transfer by end of month",
                                              "Will pay next week",
                                              "Needs more time",
                                              "Reviewing proposal",
                                              "Price too high",
                                              "Requested revision",
                                              "Not answering",
                                              "Not interested",
                                            ].map((preset) => (
                                              <button
                                                key={preset}
                                                type="button"
                                                onClick={() => setFollowupDraft((p) => ({ ...p, customerResponse: preset }))}
                                                className={`text-[10px] px-2 py-0.5 rounded-full border font-semibold transition-colors ${followupDraft.customerResponse === preset ? "bg-primary text-primary-foreground border-primary" : "bg-muted/40 text-muted-foreground border-border hover:bg-muted"}`}
                                              >
                                                {preset}
                                              </button>
                                            ))}
                                          </div>
                                          <Textarea
                                            rows={2}
                                            placeholder="e.g. Will transfer by end of month…"
                                            value={followupDraft.customerResponse || ""}
                                            onChange={(e) => setFollowupDraft((p) => ({ ...p, customerResponse: e.target.value }))}
                                            className="text-xs resize-none"
                                          />
                                        </div>
                                      </div>
                                      <div className="flex gap-2 justify-end">
                                        <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setEditingFollowup(null)}>Cancel</Button>
                                        <Button size="sm" className="h-7 text-xs bg-primary" disabled={savingFollowup} onClick={() => saveFollowup(q.id)}>
                                          {savingFollowup ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
                                          Save
                                        </Button>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>
                      );
                    })}
                    {unpaidInvoices.length > 8 && (
                      <div className="px-5 py-3 text-center">
                        <Link href="/quotations" className="text-xs font-bold text-primary hover:underline">
                          +{unpaidInvoices.length - 8} more unpaid invoices →
                        </Link>
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </motion.div>

          {/* ── Recent Activity ── */}
          <motion.div {...fadeUp(0.35)}>
            <Card className="border-border/60 shadow-sm">
              <CardHeader className="pb-2 border-b border-border/40">
                <CardTitle className="text-sm font-black uppercase tracking-wider">Recent Activity</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <Tabs defaultValue="proposals">
                  <TabsList className="m-4 mb-0 inline-flex bg-muted/40 border border-border/50">
                    <TabsTrigger value="proposals" className="text-xs data-[state=active]:bg-background data-[state=active]:shadow-sm">Proposals</TabsTrigger>
                    <TabsTrigger value="quotations" className="text-xs data-[state=active]:bg-background data-[state=active]:shadow-sm">Invoices</TabsTrigger>
                  </TabsList>

                  <TabsContent value="proposals" className="p-4 pt-3 space-y-1 outline-none">
                    {proposals.slice(0, 6).map((p) => (
                      <Link href={`/proposals/${p.id}`} key={p.id}>
                        <div className="group flex items-center justify-between py-2.5 px-3 rounded-lg hover:bg-muted/40 border border-transparent hover:border-border/40 transition-all">
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="h-8 w-8 rounded-full bg-primary/10 text-primary flex items-center justify-center font-black text-xs border border-primary/20 shrink-0">
                              {p.customer?.name?.charAt(0) || "C"}
                            </div>
                            <div className="min-w-0">
                              <p className="text-sm font-semibold truncate group-hover:text-primary transition-colors">{p.customer?.name || "Unnamed"}</p>
                              <p className="text-[11px] text-muted-foreground">{p.propNo || p.qtnNo} · {new Date((p.createdAt as any)?.seconds * 1000 || p.date || Date.now()).toLocaleDateString("en-GB")}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-3 shrink-0">
                            <span className={cn(
                              "text-[10px] font-black px-2 py-0.5 rounded-full border uppercase tracking-wider",
                              p.status === "converted" ? "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/20 dark:text-emerald-400"
                                : p.status === "confirmed" ? "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/20 dark:text-blue-400"
                                : "bg-muted text-muted-foreground border-border"
                            )}>
                              {p.status || "Draft"}
                            </span>
                            <ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                          </div>
                        </div>
                      </Link>
                    ))}
                    <div className="pt-2 border-t border-border/40">
                      <Button variant="ghost" size="sm" asChild className="w-full justify-between text-muted-foreground h-8 text-xs">
                        <Link href="/proposals">All proposals <ArrowRight className="h-3.5 w-3.5" /></Link>
                      </Button>
                    </div>
                  </TabsContent>

                  <TabsContent value="quotations" className="p-4 pt-3 space-y-1 outline-none">
                    {quotations.slice(0, 6).map((q) => (
                      <Link href={`/quotations/${q.id}`} key={q.id}>
                        <div className="group flex items-center justify-between py-2.5 px-3 rounded-lg hover:bg-muted/40 border border-transparent hover:border-border/40 transition-all">
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="h-8 w-8 rounded-md bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center border border-emerald-500/20 shrink-0">
                              <Receipt className="h-3.5 w-3.5" />
                            </div>
                            <div className="min-w-0">
                              <p className="text-sm font-semibold truncate group-hover:text-emerald-600 transition-colors">{q.customer?.name || "Unnamed"}</p>
                              <p className="text-[11px] text-muted-foreground">{q.qtnNo} · {new Date((q.createdAt as any)?.seconds * 1000 || q.date || Date.now()).toLocaleDateString("en-GB")}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-3 shrink-0">
                            {canViewMoney && <p className="text-sm font-black font-mono text-foreground">{fmtRs(q.total || 0)}</p>}
                            <ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                          </div>
                        </div>
                      </Link>
                    ))}
                    <div className="pt-2 border-t border-border/40">
                      <Button variant="ghost" size="sm" asChild className="w-full justify-between text-muted-foreground h-8 text-xs">
                        <Link href="/quotations">All invoices <ArrowRight className="h-3.5 w-3.5" /></Link>
                      </Button>
                    </div>
                  </TabsContent>
                </Tabs>
              </CardContent>
            </Card>
          </motion.div>
        </div>

        {/* Right Column */}
        <div className="space-y-5">

          {/* ── Sites Need Service ── */}
          <motion.div {...fadeUp(0.3)}>
            <Card className="border-border/60 shadow-sm overflow-hidden">
              <CardHeader
                className="pb-3 border-b border-border/40 cursor-pointer select-none hover:bg-muted/20 transition-colors"
                onClick={() => setServiceExpanded(!serviceExpanded)}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 rounded-lg bg-amber-500/10 border border-amber-500/20">
                      <Wrench className="h-3.5 w-3.5 text-amber-600" />
                    </div>
                    <CardTitle className="text-sm font-black uppercase tracking-wider">Maintenance & Service Recommendations</CardTitle>
                    {serviceDueSites.length > 0 && (
                      <span className="text-[9px] font-black bg-amber-100 dark:bg-amber-950/50 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800/40 px-2 py-0.5 rounded-full uppercase tracking-wide">
                        {serviceDueSites.length} site{serviceDueSites.length !== 1 ? "s" : ""}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Link
                      href="/services"
                      onClick={(e) => e.stopPropagation()}
                      className="text-[10px] font-bold text-primary hover:underline"
                    >
                      View all
                    </Link>
                    <motion.div animate={{ rotate: serviceExpanded ? 180 : 0 }} transition={{ duration: 0.2 }}>
                      <ChevronDown className="h-4 w-4 text-muted-foreground" />
                    </motion.div>
                  </div>
                </div>
                {!serviceExpanded && serviceDueSites.length > 0 && (
                  <p className="text-[10px] text-muted-foreground mt-1.5 font-medium">
                    Sites commissioned or last serviced more than 6 months ago · click to expand
                  </p>
                )}
              </CardHeader>
              <AnimatePresence initial={false}>
              {serviceExpanded && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
                style={{ overflow: "hidden" }}
              >
              <CardContent className="p-0">
                {serviceDueSites.length === 0 ? (
                  <div className="py-8 flex flex-col items-center justify-center text-center">
                    <Sun className="h-7 w-7 text-amber-400 mb-2" />
                    <p className="text-sm font-bold">All sites up to date</p>
                    <p className="text-xs text-muted-foreground mt-0.5">No service actions needed.</p>
                  </div>
                ) : (
                  <div className="divide-y divide-border/30">
                    {serviceDueSites.slice(0, 7).map((site) => (
                      <div key={site.projectNo} className="flex items-center gap-3 px-4 py-3 hover:bg-muted/30 transition-colors">
                        <div className={cn(
                          "h-8 w-8 rounded-lg flex items-center justify-center border shrink-0",
                          site.urgency === "overdue" ? "bg-red-50 border-red-200 text-red-600 dark:bg-red-950/20 dark:border-red-800/40"
                            : site.urgency === "due-soon" ? "bg-amber-50 border-amber-200 text-amber-600 dark:bg-amber-950/20"
                            : "bg-blue-50 border-blue-200 text-blue-600 dark:bg-blue-950/20"
                        )}>
                          {site.urgency === "overdue" ? <AlertCircle className="h-3.5 w-3.5" />
                            : site.urgency === "due-soon" ? <Clock className="h-3.5 w-3.5" />
                            : <Wrench className="h-3.5 w-3.5" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-bold truncate text-foreground">{site.customerName}</p>
                          <p className="text-[10px] text-muted-foreground mt-0.5 flex items-center gap-1">
                            <span className="font-mono">#{site.projectNo}</span>
                            {site.lastServiceDate
                              ? <span>· Last: {site.lastServiceDate} ({site.monthsSinceService}mo)</span>
                              : <span>· Never serviced</span>}
                          </p>
                        </div>
                        <span className={cn(
                          "text-[9px] font-black px-2 py-0.5 rounded-full border uppercase tracking-wider shrink-0",
                          site.urgency === "overdue" ? "text-red-600 bg-red-50 border-red-200 dark:bg-red-950/20"
                            : site.urgency === "due-soon" ? "text-amber-600 bg-amber-50 border-amber-200 dark:bg-amber-950/20"
                            : "text-blue-600 bg-blue-50 border-blue-200 dark:bg-blue-950/20"
                        )}>
                          {site.urgency === "overdue" ? "Overdue"
                            : site.urgency === "due-soon" ? "Due soon"
                            : `Free ${site.freeDone}/${site.freeTotal}`}
                        </span>
                      </div>
                    ))}
                    {serviceDueSites.length > 7 && (
                      <div className="px-4 py-2.5 text-center">
                        <Link href="/projects" className="text-[11px] font-bold text-primary hover:underline">
                          +{serviceDueSites.length - 7} more →
                        </Link>
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
              </motion.div>
              )}
              </AnimatePresence>
            </Card>
          </motion.div>

          {/* ── Draft Proposals ── */}
          <motion.div {...fadeUp(0.4)}>
            <Card className="border-border/60 shadow-sm overflow-hidden">
              <CardHeader className="pb-3 border-b border-border/40">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 rounded-lg bg-violet-500/10 border border-violet-500/20">
                    <FileText className="h-3.5 w-3.5 text-violet-600" />
                  </div>
                  <CardTitle className="text-sm font-black uppercase tracking-wider">Draft Proposals</CardTitle>
                  {drafts.length > 0 && (
                    <span className="ml-auto text-[10px] font-black px-2 py-0.5 rounded-full bg-violet-100 text-violet-700 border border-violet-200 dark:bg-violet-950/30 dark:text-violet-400">
                      {drafts.length}
                    </span>
                  )}
                </div>
              </CardHeader>
              <CardContent className="p-0">
                {drafts.length === 0 ? (
                  <div className="py-8 text-center">
                    <CheckCircle2 className="h-6 w-6 text-emerald-500 mx-auto mb-2" />
                    <p className="text-sm font-bold">All caught up!</p>
                    <p className="text-xs text-muted-foreground mt-0.5">No drafts pending.</p>
                  </div>
                ) : (
                  <div className="divide-y divide-border/30">
                    {drafts.slice(0, 5).map((p) => (
                      <div key={p.id} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-muted/30 transition-colors">
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-bold truncate">{p.customer?.name || "Unnamed"}</p>
                          <p className="text-[10px] text-muted-foreground">{new Date((p.createdAt as any)?.seconds * 1000 || p.date || Date.now()).toLocaleDateString("en-GB")}</p>
                        </div>
                        <Button variant="outline" size="sm" className="h-7 text-[10px] px-2.5 shrink-0" asChild>
                          <Link href={`/proposals/${p.id}`}>Edit</Link>
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </motion.div>

          {/* ── Pipeline Breakdown ── */}
          <motion.div {...fadeUp(0.5)}>
            <Card className="border-border/60 shadow-sm bg-muted/10">
              <CardHeader className="pb-3 border-b border-border/40">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 rounded-lg bg-primary/10 border border-primary/20">
                    <Zap className="h-3.5 w-3.5 text-primary" />
                  </div>
                  <CardTitle className="text-sm font-black uppercase tracking-wider">Pipeline</CardTitle>
                  <span className="ml-auto text-[10px] text-muted-foreground font-semibold">{timeFilter === "MONTH" ? "This Month" : timeFilter === "YEAR" ? "This Year" : "All Time"}</span>
                </div>
              </CardHeader>
              <CardContent className="p-4 space-y-4">
                {[
                  { label: "Drafts", count: draftCount, color: "[&>div]:bg-zinc-400", total: currentP.length },
                  { label: "Sent to Client", count: sentCount, color: "[&>div]:bg-blue-500", total: currentP.length },
                  { label: "Approved", count: approvedCount, color: "[&>div]:bg-emerald-500", total: currentP.length },
                  { label: "Invoiced", count: currentQ.length, color: "[&>div]:bg-violet-500", total: Math.max(currentQ.length, currentP.length) },
                ].map(({ label, count, color, total }) => (
                  <div key={label}>
                    <div className="flex items-center justify-between text-xs mb-1.5">
                      <span className="text-muted-foreground font-semibold">{label}</span>
                      <span className="font-black text-foreground">{count}</span>
                    </div>
                    <Progress value={total > 0 ? (count / total) * 100 : 0} className={cn("h-1.5 bg-muted/60", color)} />
                  </div>
                ))}
              </CardContent>
            </Card>
          </motion.div>

        </div>
      </div>
    </div>
  );
}
