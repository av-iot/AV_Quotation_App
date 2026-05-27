"use client";

import { useEffect, useState, useMemo, useCallback, useRef } from "react";
import dynamic from "next/dynamic";
import { collection, query, orderBy, onSnapshot, addDoc, serverTimestamp, getDocs, updateDoc, doc, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/auth-context";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import {
  Wrench, Plus, Search, Loader2, Trash2, ArrowRight, Pencil, Settings,
  MoreVertical, Check, AlertTriangle, Calendar,
  Upload, Route, Navigation, Users, ClipboardList,
  CheckCircle2, X, Map as MapIcon, ArrowUp, ArrowDown,
  CornerDownRight, RotateCcw, Eye, Play, ClipboardCheck, Clock,
  MessageSquare, Phone, Mail, Copy, Building2, ExternalLink, Receipt, FileText,
  ChevronLeft, ChevronRight,
} from "lucide-react";
import type { ServiceRecord, ServiceStatus, OfficeLocation } from "@/types";
import type { SystemType, ServiceScope, SiteCategory } from "@/lib/checklistTasks";
import { SYSTEM_TYPE_LABELS, SERVICE_SCOPE_LABELS, SITE_CATEGORY_LABELS } from "@/lib/checklistTasks";
import { cn } from "@/lib/utils";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useTheme } from "next-themes";
import { geocodeAddress, getCachedCoords } from "@/lib/geocode";
import type { MapSite, MapOffice } from "@/components/services/ServiceMap";

const ServiceMap = dynamic(() => import("@/components/services/ServiceMap"), {
  ssr: false,
  loading: () => (
    <div className="absolute inset-0 flex flex-col items-center justify-center bg-muted/20 backdrop-blur-[2px] z-10 text-muted-foreground">
      <Loader2 className="h-8 w-8 animate-spin mb-3 text-primary" />
      <p className="text-sm font-bold tracking-wide">Please wait, map is loading...</p>
    </div>
  )
});

// ─────────────────────────────────────── helpers ──────────────────────────────
function haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function nearestNeighborOrder(
  startLat: number, startLng: number,
  sites: any[],
  getCoord: (s: any) => { lat: number; lng: number } | null
): { ordered: any[]; unresolved: any[] } {
  const withC = sites.filter(s => getCoord(s));
  const withoutC = sites.filter(s => !getCoord(s));
  let remaining = [...withC];
  const ordered: any[] = [];
  let curLat = startLat, curLng = startLng;
  while (remaining.length > 0) {
    let bestIdx = 0, bestDist = Infinity;
    for (let i = 0; i < remaining.length; i++) {
      const c = getCoord(remaining[i])!;
      const d = haversine(curLat, curLng, c.lat, c.lng);
      if (d < bestDist) { bestDist = d; bestIdx = i; }
    }
    const chosen = remaining.splice(bestIdx, 1)[0];
    ordered.push(chosen);
    const c = getCoord(chosen)!;
    curLat = c.lat; curLng = c.lng;
  }
  return { ordered, unresolved: withoutC };
}

function parseAnyDate(val: any): Date | null {
  if (!val) return null;
  if (val.seconds !== undefined) return new Date(val.seconds * 1000);
  if (val instanceof Date) return val;
  const str = String(val).trim();
  if (str === "—" || str === "Pending" || !str) return null;
  const dmw = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (dmw) return new Date(+dmw[3], +dmw[2] - 1, +dmw[1]);
  const ymd = str.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (ymd) return new Date(+ymd[1], +ymd[2] - 1, +ymd[3]);
  const d = new Date(str);
  return isNaN(d.getTime()) ? null : d;
}

// ── Comprehensive service status pipeline (new statuses + legacy backward-compat) ───
type SvcStatusCfg = { label: string; dot: string; badge: string; next: string | null; group: string };
const SVC_STATUS: Record<string, SvcStatusCfg> = {
  pending: { label: "Pending", dot: "#94a3b8", badge: "bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800/50 dark:text-slate-300 dark:border-slate-700", next: "Send Quotation", group: "pending" },
  quotation_sent: { label: "Quotation Sent", dot: "#3b82f6", badge: "bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-900", next: "Add to Plan", group: "quotation_sent" },
  quotation_generated: { label: "Quotation Sent", dot: "#3b82f6", badge: "bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-900", next: "Add to Plan", group: "quotation_sent" },
  proforma_generated: { label: "Quotation Sent", dot: "#3b82f6", badge: "bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-900", next: "Add to Plan", group: "quotation_sent" },
  in_plan: { label: "In Plan", dot: "#8b5cf6", badge: "bg-violet-100 text-violet-700 border-violet-200 dark:bg-violet-950/40 dark:text-violet-300 dark:border-violet-900", next: "Mark Ongoing", group: "in_plan" },
  ongoing: { label: "Ongoing", dot: "#f59e0b", badge: "bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900", next: "Mark Work Done", group: "ongoing" },
  work_completed: { label: "Work Completed", dot: "#10b981", badge: "bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900", next: "Send Invoice", group: "work_completed" },
  invoice_sent: { label: "Invoice Sent", dot: "#f97316", badge: "bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-950/40 dark:text-orange-300 dark:border-orange-900", next: "Log Payment", group: "invoice_sent" },
  payment_received: { label: "Payment Received", dot: "#22c55e", badge: "bg-green-100 text-green-700 border-green-200 dark:bg-green-950/40 dark:text-green-300 dark:border-green-900", next: "Mark Complete", group: "payment_received" },
  invoice_generated: { label: "Paid", dot: "#22c55e", badge: "bg-green-100 text-green-700 border-green-200 dark:bg-green-950/40 dark:text-green-300 dark:border-green-900", next: "Mark Complete", group: "payment_received" },
  completed: { label: "Done ✓", dot: "#64748b", badge: "bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800/50 dark:text-slate-400 dark:border-slate-700", next: null, group: "completed" },
};
const STATUS_TABS = [
  { key: "all", label: "All", activeClass: "bg-foreground text-background border-foreground", countClass: "bg-background/20 text-background" },
  { key: "pending", label: "⏳ New", activeClass: "bg-slate-700 text-white border-slate-600", countClass: "bg-white/20 text-white" },
  { key: "quotation_sent", label: "📄 Quotation Sent", activeClass: "bg-blue-600 text-white border-blue-500", countClass: "bg-white/20 text-white" },
  { key: "in_plan", label: "📅 In Plan", activeClass: "bg-violet-600 text-white border-violet-500", countClass: "bg-white/20 text-white" },
  { key: "ongoing", label: "🔧 Ongoing", activeClass: "bg-amber-600 text-white border-amber-500", countClass: "bg-white/20 text-white" },
  { key: "work_completed", label: "✅ Work Done", activeClass: "bg-emerald-600 text-white border-emerald-500", countClass: "bg-white/20 text-white" },
  { key: "invoice_sent", label: "📬 Invoice Sent", activeClass: "bg-orange-600 text-white border-orange-500", countClass: "bg-white/20 text-white" },
  { key: "payment_received", label: "💰 Payment", activeClass: "bg-green-600 text-white border-green-500", countClass: "bg-white/20 text-white" },
  { key: "completed", label: "🏁 Done", activeClass: "bg-slate-500 text-white border-slate-400", countClass: "bg-white/20 text-white" },
] as const;

const TEAMS = [
  { id: "A", name: "Team A", color: "#3b82f6" },
  { id: "B", name: "Team B", color: "#8b5cf6" },
  { id: "C", name: "Team C", color: "#f59e0b" },
  { id: "D", name: "Team D", color: "#ef4444" },
  { id: "E", name: "Team E", color: "#10b981" },
];

const PLAN_STATUS_STYLES: Record<string, string> = {
  planned: "bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300",
  in_progress: "bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300",
  completed: "bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300",
};

// ─────────────────────────────────────── component ────────────────────────────
export default function ServicesPage() {
  const router = useRouter();
  const { firebaseUser, user } = useAuth();
  const { toast } = useToast();
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";

  // ── Data ──
  const [services, setServices] = useState<ServiceRecord[]>([]);
  const [availableChecklists, setAvailableChecklists] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 20;
  const [projects, setProjects] = useState<any[]>([]);
  const [legacyProjects, setLegacyProjects] = useState<any[]>([]);
  const [legacyServices, setLegacyServices] = useState<any[]>([]);
  const [, setLoadingLegacy] = useState(true);
  const [uploadingCSV, setUploadingCSV] = useState(false);
  const [servicePlans, setServicePlans] = useState<any[]>([]);

  // ── Map ──
  const [mapSites, setMapSites] = useState<MapSite[]>([]);
  const [geocodingTotal, setGeocodingTotal] = useState(0);
  const [geocodingDone, setGeocodingDone] = useState(0);
  const geocodingRef = useRef(false);

  // ── Selection ──
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [mapPanel, setMapPanel] = useState<"search" | "plans" | "sites" | "approvals" | null>(null);
  const [pendingApprovals, setPendingApprovals] = useState<any[]>([]);
  const [sendMessageTo, setSendMessageTo] = useState<any | null>(null);

  useEffect(() => {
    if (user?.role === "engineer") setMapPanel("approvals");
  }, [user]);
  const [siteSearch, setSiteSearch] = useState("");

  // ── Plan modal ──
  const [planModal, setPlanModal] = useState(false);
  const [planDate, setPlanDate] = useState(new Date().toISOString().split("T")[0]);
  const [planLeader, setPlanLeader] = useState("");
  const [planMembers, setPlanMembers] = useState<string[]>([""]);
  const [planOffice, setPlanOffice] = useState("colombo");
  const [planNotes, setPlanNotes] = useState("");
  const [savingPlan, setSavingPlan] = useState(false);
  const [techUsers, setTechUsers] = useState<{ uid: string; name: string; role: string }[]>([]);
  // Route ordering within plan modal
  const [routeOrder, setRouteOrder] = useState<string[]>([]);   // projectNos in visit order
  const [deferredSites, setDeferredSites] = useState<{ projectNo: string; reason: string }[]>([]);
  const [routeOptimised, setRouteOptimised] = useState(false);
  const [siteNotes, setSiteNotes] = useState<Record<string, string>>({});       // per-site notes keyed by projectNo
  const [siteNoteOpen, setSiteNoteOpen] = useState<Set<string>>(new Set());    // which note inputs are expanded
  const [siteServiceConfig, setSiteServiceConfig] = useState<Record<string, {
    systemType: SystemType;
    serviceScope: ServiceScope;
    siteCategory: SiteCategory;
  }>>({});

  // ── Edit plan modal ──
  const [editModal, setEditModal] = useState<any | null>(null);
  const [editLeader, setEditLeader] = useState("");
  const [editMembers, setEditMembers] = useState<string[]>([""]);
  const [editDate, setEditDate] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);

  const openEditPlan = (plan: any) => {
    setEditModal(plan);
    setEditLeader(plan.teamLeader || "");
    setEditMembers(plan.members?.length > 0 ? plan.members : [""]);
    setEditDate(plan.date || "");
    setEditNotes(plan.notes || "");
  };

  const handleSavePlan = async () => {
    if (!editModal) return;
    setSavingEdit(true);
    try {
      await updateDoc(doc(db, "servicePlans", editModal.id), {
        date: editDate,
        teamLeader: editLeader.trim(),
        members: editMembers.map((m: string) => m.trim()).filter(Boolean),
        notes: editNotes.trim(),
        updatedAt: serverTimestamp(),
      });
      toast({ title: "Plan Updated", description: `${editModal.planNo} updated.` });
      setEditModal(null);
    } catch (err: any) {
      toast({ title: "Failed", description: err.message, variant: "destructive" });
    } finally {
      setSavingEdit(false);
    }
  };

  // ── Settings ──
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [ratePerKm, setRatePerKm] = useState("300");
  const [offices, setOffices] = useState<OfficeLocation[]>([
    { id: "colombo", name: "Colombo Office", lat: 6.864488, lng: 80.009497 },
    { id: "matara", name: "Charlie Mount Industrial Zone", lat: 5.996394, lng: 80.461759 },
  ]);
  const [threshold1, setThreshold1] = useState("2");
  const [rate1, setRate1] = useState("5000");
  const [threshold2, setThreshold2] = useState("20");
  const [rate2, setRate2] = useState("1000");
  const [rateAbove, setRateAbove] = useState("500");
  const [pricingHistory, setPricingHistory] = useState<{ validFrom: string; t1: number; r1: number; t2: number; r2: number; ra: number }[]>([]);
  const [officeSearches, setOfficeSearches] = useState<string[]>([]);
  const [officeSearching, setOfficeSearching] = useState<boolean[]>([]);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const canCRUD = user?.role && ["superadmin", "admin", "authorized"].includes(user.role);
  const isTechnician = user?.role === "team_leader" || user?.role === "site_engineer" || user?.role === "technician";

  // ── Auto-optimize route when plan modal opens ──────────────────────────────
  useEffect(() => {
    if (!planModal) return;

    const selectedProjects = recommendedServices.filter(p => selected.has(p.projectNo));
    const selectedRequests = services.filter(s => s.status === "pending" && selected.has(s.id));
    const selectedItems = [...selectedProjects, ...selectedRequests];

    const getCoord = (s: any): { lat: number; lng: number } | null => {
      const idToCheck = s.projectNo || s.id;
      const onMap = mapSites.find(m => m.id === idToCheck || m.projectNo === idToCheck);
      if (onMap) return { lat: onMap.lat, lng: onMap.lng };
      if (s.lat && s.lng) return { lat: s.lat as number, lng: s.lng as number };
      if (s.location?.lat && s.location?.lng) return { lat: s.location.lat as number, lng: s.location.lng as number };
      return null;
    };

    // ── Auto-detect nearest office from centroid of selected site coords ─────
    let chosenOffice = offices.find(o => o.id === planOffice) || offices[0];
    if (offices.length > 1 && selectedItems.length > 0) {
      const coords = selectedItems.map(getCoord).filter(Boolean) as { lat: number; lng: number }[];
      if (coords.length > 0) {
        const clat = coords.reduce((sum, c) => sum + c.lat, 0) / coords.length;
        const clng = coords.reduce((sum, c) => sum + c.lng, 0) / coords.length;
        const nearest = offices.reduce((best, o) =>
          haversine(clat, clng, o.lat, o.lng) < haversine(clat, clng, best.lat, best.lng) ? o : best
        );
        chosenOffice = nearest;
        setPlanOffice(nearest.id); // reflect in dropdown
      }
    }

    if (!chosenOffice?.lat || !chosenOffice?.lng) return;
    const { ordered, unresolved } = nearestNeighborOrder(chosenOffice.lat, chosenOffice.lng, selectedItems, getCoord);
    setRouteOrder([...ordered, ...unresolved].map(s => s.projectNo));
    setDeferredSites([]);
    setRouteOptimised(true);

    // Auto-populate per-site service config from project data
    const validSysTypes: SystemType[] = ["ongrid", "hybrid", "hybrid-offgrid", "offgrid", "grid-backup"];
    const newConfigs: Record<string, { systemType: SystemType; serviceScope: ServiceScope; siteCategory: SiteCategory }> = {};
    for (const p of selectedItems) {
      const sys: SystemType = validSysTypes.includes(p.systemType as SystemType)
        ? (p.systemType as SystemType)
        : "ongrid";
      const mt = (p as any).mountType as string | undefined;
      const cat: SiteCategory = mt === "ground" || mt === "ground_mount"
        ? "ground_mount"
        : mt === "boc"
          ? "boc"
          : "standard";

      const st = (p as any).serviceType as string | undefined;
      let scope: ServiceScope = "full";
      if (st === "troubleshoot") scope = "troubleshoot";
      if (st === "expansion") scope = "expansion";

      const projectNo = p.projectNo || p.id;
      if (projectNo) {
        newConfigs[projectNo] = { systemType: sys, serviceScope: scope, siteCategory: cat };
      }
    }
    setSiteServiceConfig(newConfigs);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [planModal, planOffice]);

  // ── Load settings ──
  useEffect(() => {
    const saved = {
      serviceRatePerKm: setRatePerKm,
      serviceThreshold1: setThreshold1,
      serviceRate1: setRate1,
      serviceThreshold2: setThreshold2,
      serviceRate2: setRate2,
      serviceRateAbove: setRateAbove,
    };
    Object.entries(saved).forEach(([k, fn]) => { const v = localStorage.getItem(k); if (v) fn(v); });
    const so = localStorage.getItem("serviceOffices");
    if (so) {
      try {
        let parsed = JSON.parse(so);
        if (Array.isArray(parsed)) {
          let migrated = false;
          parsed = parsed.map(o => {
            if (o.id === "matara" && (o.name === "Matara Office" || o.lat !== 5.996394 || o.lng !== 80.461759)) {
              migrated = true;
              return { ...o, name: "Charlie Mount Industrial Zone", lat: 5.996394, lng: 80.461759 };
            }
            if (o.id === "colombo" && (o.lat !== 6.864488 || o.lng !== 80.009497)) {
              migrated = true;
              return { ...o, name: "Colombo Office", lat: 6.864488, lng: 80.009497 };
            }
            return o;
          });
          if (migrated) {
            localStorage.setItem("serviceOffices", JSON.stringify(parsed));
          }
          setOffices(parsed);
        }
      } catch { }
    }
    const ph = localStorage.getItem("servicePricingHistory");
    if (ph) { try { setPricingHistory(JSON.parse(ph)); } catch { } }
  }, []);

  const saveSettings = () => {
    localStorage.setItem("serviceRatePerKm", ratePerKm);
    localStorage.setItem("serviceOffices", JSON.stringify(offices));
    localStorage.setItem("serviceThreshold1", threshold1);
    localStorage.setItem("serviceRate1", rate1);
    localStorage.setItem("serviceThreshold2", threshold2);
    localStorage.setItem("serviceRate2", rate2);
    localStorage.setItem("serviceRateAbove", rateAbove);
    const newSnap = {
      validFrom: new Date().toISOString().slice(0, 10),
      t1: parseFloat(threshold1) || 2, r1: parseFloat(rate1) || 5000,
      t2: parseFloat(threshold2) || 20, r2: parseFloat(rate2) || 1000,
      ra: parseFloat(rateAbove) || 500,
    };
    const newHistory = [...pricingHistory, newSnap].sort((a, b) => a.validFrom < b.validFrom ? -1 : 1);
    setPricingHistory(newHistory);
    localStorage.setItem("servicePricingHistory", JSON.stringify(newHistory));
    setSettingsOpen(false);
  };

  const searchOfficeCoords = async (idx: number) => {
    const q = (officeSearches[idx] || "").trim();
    if (!q) return;
    setOfficeSearching(prev => { const n = [...prev]; n[idx] = true; return n; });
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&limit=1`,
        { headers: { Accept: "application/json" } }
      );
      const data = await res.json();
      if (data[0]) {
        const n = [...offices];
        n[idx] = { ...n[idx], lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
        setOffices(n);
        setOfficeSearches(prev => { const n2 = [...prev]; n2[idx] = ""; return n2; });
      } else {
        toast({ title: "Location not found", description: `No results for "${q}"`, variant: "destructive" });
      }
    } catch {
      toast({ title: "Search failed", variant: "destructive" });
    } finally {
      setOfficeSearching(prev => { const n = [...prev]; n[idx] = false; return n; });
    }
  };

  // ── Firestore listeners ──
  // Priority 1: services list (real-time, small collection)
  useEffect(() => {
    if (!firebaseUser) return;
    const unsub = onSnapshot(query(collection(db, "services"), orderBy("createdAt", "desc")), s => {
      setServices(s.docs.map(d => ({ id: d.id, ...d.data() }) as ServiceRecord));
      setLoading(false);
    });
    return () => unsub();
  }, [firebaseUser]);

  // Listener for available checklist documents
  useEffect(() => {
    if (!firebaseUser) return;
    const unsub = onSnapshot(collection(db, "serviceChecklistData"), snap => {
      setAvailableChecklists(new Set(snap.docs.map(d => d.id)));
    });
    return () => unsub();
  }, [firebaseUser]);

  // Priority 2: service plans + approvals (real-time, status changes during active day)
  useEffect(() => {
    if (!firebaseUser) return;
    const unsub1 = onSnapshot(query(collection(db, "servicePlans"), orderBy("createdAt", "desc")), s => {
      setServicePlans(s.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    const unsub2 = onSnapshot(query(collection(db, "service_checklists"), where("status", "==", "pending_approval")), s => {
      setPendingApprovals(s.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    return () => { unsub1(); unsub2(); };
  }, [firebaseUser]);

  // Priority 3: projects — one-time fetch (avoids re-running the heavy recommendedServices
  // computation every time any project document is updated in real-time)
  useEffect(() => {
    if (!firebaseUser) return;
    getDocs(query(collection(db, "projects"))).then(s => {
      setProjects(s.docs.map(d => ({ id: d.id, ...d.data() })));
    });
  }, [firebaseUser]);

  // ── Load technician / team-leader accounts for plan modal ──
  useEffect(() => {
    if (!firebaseUser) return;
    getDocs(query(collection(db, "users"), where("role", "in", ["team_leader", "technician"]))).then(snap => {
      setTechUsers(
        snap.docs
          .map(d => ({ uid: d.id, name: (d.data().displayName || d.data().email || d.id) as string, role: d.data().role as string }))
          .sort((a, b) => a.name.localeCompare(b.name))
      );
    });
  }, [firebaseUser]);

  // ── Auto-fill Team Members based on last plan for selected leader ──
  useEffect(() => {
    if (!planLeader) return;
    const leaderPlans = servicePlans.filter(p => p.teamLeader === planLeader).sort((a, b) => b.date.localeCompare(a.date));
    if (leaderPlans.length > 0 && leaderPlans[0].members) {
      setPlanMembers(leaderPlans[0].members.length > 0 ? leaderPlans[0].members : [""]);
    } else {
      setPlanMembers([""]);
    }
  }, [planLeader, servicePlans]);

  useEffect(() => {
    if (!editLeader) return;
    // Only auto-fill if the selected leader is different from the one originally in the plan we are editing
    if (editModal && editLeader === editModal.teamLeader) {
      setEditMembers(editModal.members?.length > 0 ? editModal.members : [""]);
      return;
    }
    const leaderPlans = servicePlans.filter(p => p.teamLeader === editLeader).sort((a, b) => b.date.localeCompare(a.date));
    if (leaderPlans.length > 0 && leaderPlans[0].members) {
      setEditMembers(leaderPlans[0].members.length > 0 ? leaderPlans[0].members : [""]);
    } else {
      setEditMembers([""]);
    }
  }, [editLeader, servicePlans, editModal]);

  // ── Legacy data ──
  const fetchLegacyProjects = async () => {
    try {
      const res = await fetch(`/api/projects/legacy?t=${Date.now()}`, { cache: "no-store" });
      if (res.ok) { const d = await res.json(); if (Array.isArray(d)) setLegacyProjects(d); }
    } catch { }
  };
  const fetchLegacyServices = async () => {
    try {
      setLoadingLegacy(true);
      const res = await fetch(`/api/services/legacy?t=${Date.now()}`, { cache: "no-store" });
      if (res.ok) { const d = await res.json(); if (Array.isArray(d)) setLegacyServices(d); }
    } catch { } finally { setLoadingLegacy(false); }
  };
  // Defer legacy data — not needed for initial render, load after main data settles
  useEffect(() => {
    const t = setTimeout(() => { fetchLegacyProjects(); fetchLegacyServices(); }, 2000);
    return () => clearTimeout(t);
  }, []);

  // ── Recommended services (sites due) ──
  // ── All sites (both systems, no date filter) — used for search ──
  const allSites = useMemo(() => {
    const defaultTiers = {
      t1: parseFloat(threshold1) || 2, r1: parseFloat(rate1) || 5000,
      t2: parseFloat(threshold2) || 20, r2: parseFloat(rate2) || 1000,
      ra: parseFloat(rateAbove) || 500,
    };
    const getPriceForSite = (cap: number, refDate: Date | null): number => {
      let tiers = defaultTiers;
      if (pricingHistory.length > 0 && refDate) {
        const refStr = refDate.toISOString().slice(0, 10);
        let best: typeof pricingHistory[0] | null = null;
        for (const snap of pricingHistory) {
          if (snap.validFrom <= refStr && (!best || snap.validFrom > best.validFrom)) best = snap;
        }
        if (!best) best = [...pricingHistory].sort((a, b) => a.validFrom < b.validFrom ? -1 : 1)[0];
        if (best) tiers = best;
      }
      const { t1, r1, t2, r2, ra } = tiers;
      if (cap <= t1) return r1;
      if (cap <= t2) return r1 + (cap - t1) * r2;
      return r1 + (t2 - t1) * r2 + (cap - t2) * ra;
    };
    const haversineDistKm = (lat1: number, lon1: number, lat2: number, lon2: number) => {
      const R = 6371;
      const dLat = (lat2 - lat1) * Math.PI / 180;
      const dLon = (lon2 - lon1) * Math.PI / 180;
      const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
      return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    };

    const activeProjs = projects
      .filter((p: any) => ["commissioned", "fully_settled", "in_operation"].includes(p.stage || "commissioned"))
      .map((p: any) => ({
        id: p.id,
        projectNo: p.siteNo || p.id.slice(0, 8),
        customerName: p.customer?.name || "—",
        phone: p.customer?.phone || "—",
        email: p.customer?.email || "—",
        address: p.customer?.address || p.address || "",
        solarCapacity: p.solarCapacity || 0,
        commissionedAt: p.commissionedAt || p.installedAt || null,
        lastServiceDate: p.lastServiceDate || null,
        lat: (p.latitude as number) || null,
        lng: (p.longitude as number) || null,
        systemType: (p.systemType || (p.battery ? "hybrid" : "ongrid")) as string,
        mountType: (p.mountType || "roof") as string,
        _source: "new" as const,
      }));
    const legacyProjs = legacyProjects.map((p: any) => ({
      id: null,
      projectNo: p.projectNo,
      customerName: p.customerName,
      phone: p.contactNumber || "—",
      email: p.emailAddress || "—",
      address: p.billingAddress || p.address || "",
      solarCapacity: p.solarPanelCapacity || p.inverterCapacity || 0,
      commissionedAt: p.systemOn || p.projectInstallationDate || null,
      lastServiceDate: null,
      lat: (p.latitude as number) || null,
      lng: (p.longitude as number) || null,
      systemType: "ongrid" as string,
      mountType: "roof" as string,
      _source: "legacy" as const,
    }));

    // Deduplicate by projectNo (new system takes priority)
    const seen = new Set<string>();
    return [...activeProjs, ...legacyProjs]
      .filter(p => { if (seen.has(p.projectNo)) return false; seen.add(p.projectNo); return true; })
      .map(p => {
        const cap = p.solarCapacity || 0;
        const commDate = parseAnyDate(p.commissionedAt);
        const svcDate = parseAnyDate(p.lastServiceDate);
        const newest = [commDate, svcDate].filter(Boolean).sort((a: any, b: any) => b.getTime() - a.getTime())[0];
        const monthsAgo = newest ? Math.floor(Math.abs(Date.now() - newest.getTime()) / (1000 * 60 * 60 * 24 * 30)) : 0;
        const price = getPriceForSite(cap, commDate);
        let travelCost = 0, distanceKm = 0;
        if (p.lat && p.lng && offices.length > 0) {
          distanceKm = haversineDistKm(offices[0].lat, offices[0].lng, p.lat, p.lng);
          travelCost = distanceKm * 2 * (parseFloat(ratePerKm) || 100);
        }
        return { ...p, recommendedPrice: Math.round(price), travelCost: Math.round(travelCost), totalCost: Math.round(price + travelCost), distanceKm: Math.round(distanceKm), monthsAgo };
      });
  }, [projects, legacyProjects, threshold1, rate1, threshold2, rate2, rateAbove, pricingHistory, offices, ratePerKm]);

  // ── Count existing services per projectNo (Firestore + legacy CSV data) ──
  const siteServiceCountMap = useMemo(() => {
    const map: Record<string, number> = {};
    // Firestore service records
    services.forEach(s => {
      if (s.projectNo) map[s.projectNo] = (map[s.projectNo] || 0) + 1;
    });
    // Firestore project.serviceRecords (manually migrated legacy entries)
    projects.forEach((p: any) => {
      const pNo: string = p.siteNo || p.id?.slice(0, 8) || "";
      const legacyCount: number = p.serviceRecords?.length || 0;
      if (pNo && legacyCount > 0) map[pNo] = (map[pNo] || 0) + legacyCount;
    });
    // CSV service milestones (from OLD_SERVICE_*.csv files)
    legacyServices.forEach((ls: any) => {
      const pNo: string = ls.projectNo || "";
      const count: number = ls.milestones?.length || 0;
      // Only add if not already counted from Firestore to avoid double-counting migrated data
      if (pNo && count > 0 && !map[pNo]) map[pNo] = count;
    });
    return map;
  }, [services, projects, legacyServices]);

  // ── Recommended (due for service: 6+ months since last svc or commission) ──
  const recommendedServices = useMemo(() => {
    const sixMonthsAgo = new Date(); sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
    return allSites.filter(p => {
      const commDate = parseAnyDate(p.commissionedAt);
      const svcDate = parseAnyDate(p.lastServiceDate);
      const newest = [commDate, svcDate].filter(Boolean).sort((a: any, b: any) => b.getTime() - a.getTime())[0];
      return newest && newest.getFullYear() >= 2010 && newest < sixMonthsAgo;
    });
  }, [allSites]);

  // ── Populate map markers ──
  useEffect(() => {
    if (recommendedServices.length === 0) return;

    // 1. Sites with stored GPS — show immediately, no API call needed
    const withCoords: MapSite[] = recommendedServices
      .filter(p => p.lat && p.lng)
      .map(p => ({
        id: p.projectNo, projectNo: p.projectNo, projectId: p.id || undefined,
        customerName: p.customerName, address: p.address,
        solarCapacity: p.solarCapacity, monthsAgo: p.monthsAgo, phone: p.phone,
        lat: p.lat!, lng: p.lng!,
      }));

    // 2. Sites with Nominatim cache — also immediate
    const fromCache: MapSite[] = recommendedServices
      .filter(p => (!p.lat || !p.lng) && p.address.length > 5)
      .map(p => {
        const coords = getCachedCoords(p.address);
        if (!coords) return null;
        return { id: p.projectNo, projectNo: p.projectNo, projectId: p.id || undefined, customerName: p.customerName, address: p.address, solarCapacity: p.solarCapacity, monthsAgo: p.monthsAgo, phone: p.phone, ...coords };
      })
      .filter(Boolean) as MapSite[];

    // 2.5 Pending service requests
    const requestSites: MapSite[] = services
      .filter(s => s.status === "pending" && s.location?.lat && s.location?.lng)
      .map(s => ({
        id: s.id, projectNo: s.projectNo || "", customerName: s.customer?.name || "Unknown",
        address: s.location?.address || "", solarCapacity: parseFloat(s.capacity || "0") || 0,
        monthsAgo: 0, phone: s.customer?.phone || "", lat: s.location!.lat, lng: s.location!.lng,
        isRequest: true,
      }));

    const knownIds = new Set([...withCoords, ...fromCache, ...requestSites].map(s => s.id));
    setMapSites([...withCoords, ...fromCache, ...requestSites]);

    // 3. Geocode the rest (up to 50, sorted by urgency) — only runs once
    if (geocodingRef.current) return;
    geocodingRef.current = true;

    const needsGeocode = recommendedServices
      .filter(p => !knownIds.has(p.projectNo) && p.address.length > 5)
      .sort((a, b) => b.monthsAgo - a.monthsAgo)
      .slice(0, 50);

    setGeocodingTotal(needsGeocode.length);
    setGeocodingDone(0);

    let done = 0;
    (async () => {
      for (const p of needsGeocode) {
        const coords = await geocodeAddress(p.address);
        done++;
        setGeocodingDone(done);
        if (coords) {
          const site: MapSite = { id: p.projectNo, projectNo: p.projectNo, projectId: p.id || undefined, customerName: p.customerName, address: p.address, solarCapacity: p.solarCapacity, monthsAgo: p.monthsAgo, phone: p.phone, ...coords };
          setMapSites(prev => {
            const exists = prev.find(s => s.id === site.id);
            return exists ? prev.map(s => s.id === site.id ? site : s) : [...prev, site];
          });
        }
      }
    })();
  }, [recommendedServices.length, services]);

  // ── Toggle site selection ──
  const toggleSite = useCallback((id: string) => {
    setSelected(prev => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  }, []);

  // ── Sites in active (non-completed) plans — exclude from map so they don't show as "available" ──
  const activePlanSiteIds = useMemo(() => {
    const set = new Set<string>();
    servicePlans
      .filter(p => p.status !== "completed")
      .forEach(p => (p.sites || []).forEach((s: any) => { if (s.projectNo) set.add(s.projectNo); }));
    return set;
  }, [servicePlans]);

  // ── Deferred sites from ALL plans (persistent, not just current modal state) ──
  const historicDeferredIds = useMemo(() => {
    const set = new Set<string>();
    servicePlans.forEach(p => {
      (p.deferredSites || []).forEach((d: any) => { if (d.projectNo) set.add(d.projectNo); });
      // Also include sites skipped *within* a plan's sites array
      (p.sites || []).filter((s: any) => s.siteStatus === "skipped").forEach((s: any) => { if (s.projectNo) set.add(s.projectNo); });
    });
    return set;
  }, [servicePlans]);

  // ── Map sites: exclude sites currently in an active plan ──
  const visibleMapSites = useMemo(
    () => mapSites.filter(s => !activePlanSiteIds.has(s.projectNo) && !activePlanSiteIds.has(s.id)),
    [mapSites, activePlanSiteIds]
  );

  // ── Map office markers ──
  const mapOffices: MapOffice[] = offices
    .filter(o => o.lat && o.lng)
    .map(o => ({ id: o.id, name: o.name, lat: o.lat, lng: o.lng }));

  // ── Build GPS-only path-based Google Maps route URL ──
  const buildGpsRouteUrl = (
    officeId: string,
    coordMap: Map<string, { lat: number, lng: number }>,
    siteOrder: string[],
    endOff?: { lat: number; lng: number } | null,
  ) => {
    const office = offices.find(o => o.id === officeId);
    if (!office?.lat || !office?.lng) return "";
    const stops = siteOrder.map(id => coordMap.get(id)).filter(Boolean) as { lat: number, lng: number }[];
    if (stops.length === 0) return "";
    const segments = [
      `${office.lat},${office.lng}`,
      ...stops.map(c => `${c.lat},${c.lng}`),
      endOff?.lat ? `${endOff.lat},${endOff.lng}` : "",
    ].filter(Boolean);
    return `https://www.google.com/maps/dir/${segments.join("/")}`;
  };

  // ── Open the route details/checklist page ──
  const openPlanRoute = async (plan: any) => {
    router.push(`/services/route/${plan.id}`);
  };

  // ── Route reorder helpers ──────────────────────────────────────────────────
  const moveRouteUp = (idx: number) => {
    if (idx === 0) return;
    setRouteOrder(prev => { const n = [...prev];[n[idx - 1], n[idx]] = [n[idx], n[idx - 1]]; return n; });
  };
  const moveRouteDown = (idx: number) => {
    setRouteOrder(prev => { if (idx >= prev.length - 1) return prev; const n = [...prev];[n[idx], n[idx + 1]] = [n[idx + 1], n[idx]]; return n; });
  };
  const deferSite = (projectNo: string) => {
    setRouteOrder(prev => prev.filter(id => id !== projectNo));
    setDeferredSites(prev => [...prev, { projectNo, reason: "" }]);
  };
  const restoreSite = (projectNo: string) => {
    setDeferredSites(prev => prev.filter(d => d.projectNo !== projectNo));
    setRouteOrder(prev => [...prev, projectNo]);
  };
  const updateDeferReason = (projectNo: string, reason: string) => {
    setDeferredSites(prev => prev.map(d => d.projectNo === projectNo ? { ...d, reason } : d));
  };

  // ── Create service plan ──
  const handleCreatePlan = async () => {
    if (selected.size === 0 || !planDate) return;
    setSavingPlan(true);
    try {
      const dateStr = planDate.replace(/-/g, "");
      const snap = await getDocs(collection(db, "servicePlans"));
      const prefix = `SP_${dateStr}_`;
      let maxN = 0;
      snap.forEach(d => {
        const pNo = d.data().planNo as string;
        if (pNo?.startsWith(prefix)) maxN = Math.max(maxN, parseInt(pNo.replace(prefix, ""), 10) || 0);
      });
      const planNo = `${prefix}${String(maxN + 1).padStart(3, "0")}`;

      // Use the user-ordered route (or fall back to original selection order)
      const orderedIds = routeOrder.length > 0 ? routeOrder : Array.from(selected);
      const siteMap = new Map(
        recommendedServices.filter(p => selected.has(p.projectNo))
          .map(p => [p.projectNo, p])
      );
      const sitesData = orderedIds
        .filter(id => siteMap.has(id))
        .map((id, order) => {
          const p = siteMap.get(id)!;
          const cfg = siteServiceConfig[id] || { systemType: "ongrid" as SystemType, serviceScope: "full" as ServiceScope, siteCategory: "standard" as SiteCategory };
          return { projectNo: p.projectNo, projectId: p.id, customerName: p.customerName, address: p.address, solarCapacity: p.solarCapacity, monthsAgo: p.monthsAgo, lastServiceDate: p.lastServiceDate || null, commissionedAt: p.commissionedAt || null, lat: p.lat || null, lng: p.lng || null, routeOrder: order + 1, siteStatus: "pending", note: siteNotes[p.projectNo]?.trim() || "", systemType: cfg.systemType, serviceScope: cfg.serviceScope, siteCategory: cfg.siteCategory };
        });

      // Gather GPS coords for every selected site — prefer stored coords, then map cache, then geocode on-the-fly
      const coordMap = new Map<string, { lat: number, lng: number }>();
      for (const p of sitesData) {
        if (p.lat && p.lng) {
          coordMap.set(p.projectNo, { lat: p.lat, lng: p.lng });
          continue;
        }
        const onMap = mapSites.find(s => s.id === p.projectNo);
        if (onMap) {
          coordMap.set(p.projectNo, { lat: onMap.lat, lng: onMap.lng });
        } else if (p.address) {
          const cached = getCachedCoords(p.address);
          if (cached) {
            coordMap.set(p.projectNo, cached);
          } else {
            const fresh = await geocodeAddress(p.address);
            if (fresh) {
              coordMap.set(p.projectNo, fresh);
              setMapSites(prev => [...prev, { id: p.projectNo, projectNo: p.projectNo, projectId: p.projectId, customerName: p.customerName, address: p.address, solarCapacity: p.solarCapacity, monthsAgo: p.monthsAgo, ...fresh }]);
            }
          }
        }
      }

      // Closest end office to the last site in the route
      const lastSiteId = sitesData[sitesData.length - 1]?.projectNo;
      const lastCoord = lastSiteId ? coordMap.get(lastSiteId) : null;
      const endOffice = lastCoord && offices.length > 1
        ? offices.reduce((best, o) => {
          const d = (lat1: number, lng1: number, lat2: number, lng2: number) => Math.sqrt((lat2 - lat1) ** 2 + (lng2 - lng1) ** 2);
          return d(lastCoord.lat, lastCoord.lng, o.lat, o.lng) < d(lastCoord.lat, lastCoord.lng, best.lat, best.lng) ? o : best;
        })
        : offices.find(o => o.id === planOffice) || offices[0];

      const routeUrl = buildGpsRouteUrl(planOffice, coordMap, sitesData.map(p => p.projectNo), endOffice);

      // Persist resolved GPS coords on each site so future route clicks don't need to re-geocode
      const sitesWithCoords = sitesData.map(p => {
        const c = coordMap.get(p.projectNo);
        return c ? { ...p, lat: c.lat, lng: c.lng } : p;
      });

      await addDoc(collection(db, "servicePlans"), {
        planNo,
        date: planDate,
        teamLeader: planLeader.trim(),
        members: planMembers.map(m => m.trim()).filter(Boolean),
        sites: sitesWithCoords,
        deferredSites: deferredSites.map(d => ({
          ...d,
          ...siteMap.get(d.projectNo),
          deferredAt: new Date().toISOString(),
          deferredBy: user?.displayName || user?.email || "Unknown",
        })),
        status: "planned",
        routeUrl,
        routeOptimised,
        officeId: planOffice,
        startOfficeId: planOffice,
        endOfficeId: endOffice?.id || planOffice,
        notes: planNotes.trim(),
        routeChanges: [],
        createdAt: serverTimestamp(),
        createdBy: user?.uid || "",
        createdByName: user?.displayName || user?.email || "Unknown",
      });

      if (routeUrl) window.open(routeUrl, "_blank", "noopener,noreferrer");

      setSelected(new Set());
      setPlanModal(false);
      setRouteOrder([]); setDeferredSites([]); setRouteOptimised(false);
      setPlanLeader(""); setPlanMembers([""]); setPlanNotes("");
      setSiteNotes({}); setSiteNoteOpen(new Set()); setSiteServiceConfig({});
      toast({ title: "Service Plan Created", description: `${planNo} created for ${sitesData.length} site${sitesData.length !== 1 ? "s" : ""}.` });
    } catch (err: any) {
      toast({ title: "Failed", description: err.message, variant: "destructive" });
    } finally {
      setSavingPlan(false);
    }
  };

  // ── Messaging ──
  const buildServiceMsg = (proj: any) =>
    `Dear Sir/Madam,\n\nHope you're enjoying the benefits of your ${proj.solarCapacity} kWp solar system (${proj.customerName} — Site #${proj.projectNo})! 🌞\n\nIt has been ${proj.monthsAgo} months since your system was last serviced. Regular maintenance keeps your system performing at its best.\n\nWe would like to offer you a special rate for a routine service for your system for a special discounted price of ${proj.recommendedPrice.toLocaleString()} LKR.\n\nPlease reply to book at a convenient time.\n\nWarm regards,\nAlta Vision Solar Team`;

  const handleCopyMessage = (proj: any) => {
    navigator.clipboard.writeText(buildServiceMsg(proj));
    setCopiedId(proj.projectNo);
    setTimeout(() => setCopiedId(null), 2000);
  };
  const handleWhatsApp = (proj: any) => {
    const phone = proj.phone?.replace(/[^0-9]/g, "");
    const final = phone?.startsWith("0") ? "94" + phone.slice(1) : phone;
    window.open(`https://wa.me/${final}?text=${encodeURIComponent(buildServiceMsg(proj))}`, "_blank");
  };

  // ── CSV Upload ──
  const handleCSVUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files?.length) return;
    for (let i = 0; i < files.length; i++) {
      if (!files[i].name.toLowerCase().endsWith(".csv")) {
        toast({ title: "Invalid file", description: `"${files[i].name}" must be .csv`, variant: "destructive" });
        return;
      }
    }
    setUploadingCSV(true);
    try {
      const idToken = firebaseUser ? await firebaseUser.getIdToken() : "dev_session_token";
      for (let i = 0; i < files.length; i++) {
        const text = await files[i].text();
        if (!text.trim()) continue;
        const res = await fetch("/api/projects/upload", { method: "POST", headers: { "Content-Type": "text/plain", "Authorization": `Bearer ${idToken}`, "X-Filename": files[i].name, "X-File-Type": "service" }, body: text });
        const result = await res.json();

        if (!res.ok) throw new Error(result.error || `Failed to upload "${files[i].name}"`);

        if (result.changelog && result.changelog.length > 0) {
          toast({
            title: `Updated: ${files[i].name}`,
            description: (
              <div className="mt-2 w-[340px] max-h-40 overflow-y-auto bg-slate-950 text-slate-50 p-2 rounded text-[10px] font-mono whitespace-pre-wrap">
                {result.changelog.join("\n")}
              </div>
            ),
          });
        }
      }
      toast({ title: "Upload Successful" });
      fetchLegacyServices(); fetchLegacyProjects();
    } catch (err: any) {
      toast({ title: "Upload Failed", description: err.message, variant: "destructive" });
    } finally { setUploadingCSV(false); e.target.value = ""; }
  };

  const getCustomerName = (s: any) => {
    if (!s.customer) return "";
    if (typeof s.customer === "string") return s.customer;
    return s.customer.name || "";
  };

  const getStatusCount = (groupKey: string) => {
    return services.filter(s => {
      const q = search.trim().toLowerCase();
      const matchesSearch = !q ||
        getCustomerName(s).toLowerCase().includes(q) ||
        (s.serviceNo || "").toLowerCase().includes(q) ||
        (s.projectNo || "").toLowerCase().includes(q) ||
        (s.serviceType || "").toLowerCase().includes(q);
      if (!matchesSearch) return false;
      if (groupKey === "all") return true;
      return (SVC_STATUS[s.status]?.group ?? "pending") === groupKey;
    }).length;
  };

  const handleStatusTransition = async (service: any, nextStatus: string) => {
    try {
      const { doc, updateDoc } = await import("firebase/firestore");
      await updateDoc(doc(db, "services", service.id), {
        status: nextStatus,
        updatedAt: serverTimestamp(),
      });
      toast({
        title: "Status Updated",
        description: `Service status moved to ${SVC_STATUS[nextStatus]?.label || nextStatus}.`,
      });
    } catch (err: any) {
      toast({
        title: "Transition Failed",
        description: err.message,
        variant: "destructive",
      });
    }
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return services.filter(s => {
      const matchesSearch = !q ||
        getCustomerName(s).toLowerCase().includes(q) ||
        (s.serviceNo || "").toLowerCase().includes(q) ||
        (s.projectNo || "").toLowerCase().includes(q) ||
        (s.serviceType || "").toLowerCase().includes(q);
      const matchesStatus = statusFilter === "all" ||
        (SVC_STATUS[s.status]?.group ?? "pending") === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [services, search, statusFilter]);
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginatedServices = useMemo(
    () => filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [filtered, page, PAGE_SIZE]
  );

  const filteredSites = useMemo(() => {
    const q = siteSearch.trim().toLowerCase();
    if (!q) return recommendedServices;
    // When searching: span ALL sites (both new + legacy, regardless of service due date)
    return allSites.filter(p =>
      p.customerName?.toLowerCase().includes(q) ||
      p.projectNo?.toLowerCase().includes(q) ||
      p.address?.toLowerCase().includes(q) ||
      p.phone?.toLowerCase().includes(q)
    );
  }, [allSites, recommendedServices, siteSearch]);

  const activePlans = servicePlans.filter(p => p.status !== "completed");
  const completedPlans = servicePlans.filter(p => p.status === "completed");

  const filteredApprovals = useMemo(() => {
    if (user?.role === "admin" || user?.role === "superadmin") return pendingApprovals;
    if (user?.role === "team_leader" || user?.role === "site_engineer" || user?.role === "technician") return pendingApprovals.filter(a => a.submittedBy === user?.uid);
    return pendingApprovals.filter(a => a.approvedBy === user?.uid);
  }, [pendingApprovals, user]);

  // ── Render ──
  return (
    <div className="flex flex-col h-full">

      {/* ── Header ── */}
      <div className="flex items-center justify-between gap-4 px-6 py-4 border-b border-border/50 bg-card/30 flex-none flex-wrap">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
            <MapIcon className="h-5 w-5 text-emerald-600" />
          </div>
          <div>
            <h1 className="text-lg font-black text-foreground">Service Operations</h1>
            <p className="text-[11px] text-muted-foreground font-medium">
              {mapSites.length} sites on map
              {geocodingDone < geocodingTotal && (
                <span className="ml-2 text-amber-500">· geocoding {geocodingDone}/{geocodingTotal}…</span>
              )}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {canCRUD && (
            <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm" className="gap-1.5 h-8 text-[11px] font-bold">
                  <Settings className="h-3.5 w-3.5" /> Settings
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[425px]">
                <DialogHeader><DialogTitle>Service Settings</DialogTitle></DialogHeader>
                <div className="grid gap-4 py-4 max-h-[75vh] overflow-y-auto pr-1">
                  <div className="grid gap-2">
                    <Label className="text-xs font-bold">Travel Rate (LKR/km)</Label>
                    <Input type="number" value={ratePerKm} onChange={e => setRatePerKm(e.target.value)} />
                  </div>
                  <div className="border-t pt-3 space-y-3">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-bold text-primary uppercase tracking-wider">Service Pricing Rules</h4>
                      {pricingHistory.length > 0 && (
                        <span className="text-[9px] text-muted-foreground">
                          Active from <span className="font-bold">{pricingHistory[pricingHistory.length - 1].validFrom}</span>
                        </span>
                      )}
                    </div>
                    <p className="text-[10px] text-muted-foreground leading-relaxed">
                      Sites commissioned before the save date keep their historical price. New rates only apply to sites commissioned after today.
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="grid gap-1"><Label className="text-[10px] uppercase font-bold text-muted-foreground">Tier 1 (kW)</Label><Input type="number" value={threshold1} onChange={e => setThreshold1(e.target.value)} /></div>
                      <div className="grid gap-1"><Label className="text-[10px] uppercase font-bold text-muted-foreground">Flat Rate ≤T1</Label><Input type="number" value={rate1} onChange={e => setRate1(e.target.value)} /></div>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="grid gap-1"><Label className="text-[10px] uppercase font-bold text-muted-foreground">Tier 2 (kW)</Label><Input type="number" value={threshold2} onChange={e => setThreshold2(e.target.value)} /></div>
                      <div className="grid gap-1"><Label className="text-[10px] uppercase font-bold text-muted-foreground">Rate T1–T2 /kW</Label><Input type="number" value={rate2} onChange={e => setRate2(e.target.value)} /></div>
                    </div>
                    <div className="grid gap-1"><Label className="text-[10px] uppercase font-bold text-muted-foreground">Rate Above T2 /kW</Label><Input type="number" value={rateAbove} onChange={e => setRateAbove(e.target.value)} /></div>
                    {pricingHistory.length > 1 && (
                      <div className="rounded-md bg-muted/30 border border-border/40 p-2 space-y-1">
                        <p className="text-[9px] font-black uppercase text-muted-foreground tracking-wider mb-1">Price History</p>
                        {[...pricingHistory].reverse().slice(0, 5).map((s, i) => (
                          <div key={i} className="flex items-center justify-between text-[10px]">
                            <span className="text-muted-foreground">{s.validFrom}</span>
                            <span className="font-semibold">≤{s.t1}kW → Rs.{s.r1.toLocaleString()}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="grid gap-2 border-t pt-3">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs font-bold">Office Locations</Label>
                      <Button variant="secondary" size="sm" className="h-7 text-[10px] font-bold" onClick={() => setOffices([...offices, { id: Date.now().toString(), name: "New Office", lat: 6.9271, lng: 79.8612 }])}>
                        <Plus className="h-3 w-3 mr-1" /> Add Office
                      </Button>
                    </div>
                    <div className="space-y-3 max-h-[300px] overflow-y-auto pr-0.5">
                      {offices.map((office, idx) => {
                        const isInSriLanka = office.lat >= 5.5 && office.lat <= 10.0 && office.lng >= 79.0 && office.lng <= 82.0;
                        const hasCoords = office.lat !== 0 || office.lng !== 0;
                        const mapsUrl = `https://www.google.com/maps?q=${office.lat},${office.lng}`;
                        return (
                          <div key={idx} className="rounded-xl border border-border overflow-hidden">
                            {/* Header bar */}
                            <div className="flex items-center gap-2 px-2.5 py-1.5 bg-muted/40 border-b border-border/60">
                              <Building2 className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                              <Input
                                value={office.name}
                                onChange={e => { const n = [...offices]; n[idx].name = e.target.value; setOffices(n); }}
                                placeholder="Office Name"
                                className="h-6 text-xs font-bold bg-transparent border-none shadow-none px-0 focus-visible:ring-0 flex-1"
                              />
                              {hasCoords && (
                                <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-full shrink-0 ${isInSriLanka ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>
                                  {isInSriLanka ? "✓ Sri Lanka" : "⚠ Check"}
                                </span>
                              )}
                              <Button variant="ghost" size="icon" className="h-5 w-5 shrink-0 text-destructive hover:text-destructive hover:bg-destructive/10" onClick={() => setOffices(offices.filter((_, i) => i !== idx))}>
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </div>
                            {/* Coordinate inputs — PRIMARY */}
                            <div className="p-2.5 space-y-2">
                              <div className="grid grid-cols-2 gap-2">
                                <div className="space-y-0.5">
                                  <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">Latitude</p>
                                  <Input
                                    type="number"
                                    step="0.0000001"
                                    value={office.lat}
                                    onChange={e => { const n = [...offices]; n[idx].lat = parseFloat(e.target.value) || 0; setOffices(n); }}
                                    placeholder="e.g. 6.9271"
                                    className="h-8 text-sm font-mono font-bold"
                                  />
                                </div>
                                <div className="space-y-0.5">
                                  <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">Longitude</p>
                                  <Input
                                    type="number"
                                    step="0.0000001"
                                    value={office.lng}
                                    onChange={e => { const n = [...offices]; n[idx].lng = parseFloat(e.target.value) || 0; setOffices(n); }}
                                    placeholder="e.g. 79.8612"
                                    className="h-8 text-sm font-mono font-bold"
                                  />
                                </div>
                              </div>
                              {hasCoords && (
                                <a
                                  href={mapsUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 text-[10px] font-semibold text-blue-600 hover:text-blue-700 hover:underline"
                                >
                                  <ExternalLink className="h-3 w-3" />
                                  Verify on Google Maps
                                </a>
                              )}
                              {/* Geocode search — SECONDARY helper */}
                              <div className="border-t border-border/40 pt-2 space-y-1">
                                <p className="text-[9px] text-muted-foreground/60 font-medium">Search fills coordinates automatically — verify above before saving</p>
                                <div className="flex gap-1">
                                  <Input
                                    value={officeSearches[idx] || ""}
                                    onChange={e => setOfficeSearches(prev => { const n = [...prev]; n[idx] = e.target.value; return n; })}
                                    onKeyDown={e => e.key === "Enter" && searchOfficeCoords(idx)}
                                    placeholder="Search location (e.g. Colombo, Sri Lanka)…"
                                    className="h-7 text-xs flex-1"
                                  />
                                  <Button variant="secondary" size="icon" className="h-7 w-7 shrink-0"
                                    onClick={() => searchOfficeCoords(idx)}
                                    disabled={officeSearching[idx]}
                                  >
                                    {officeSearching[idx] ? <Loader2 className="h-3 w-3 animate-spin" /> : <Search className="h-3 w-3" />}
                                  </Button>
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
                <div className="flex justify-end gap-2 border-t pt-3">
                  <Button variant="outline" onClick={() => setSettingsOpen(false)}>Cancel</Button>
                  <Button onClick={saveSettings}>Save Settings</Button>
                </div>
              </DialogContent>
            </Dialog>
          )}
          {canCRUD && (
            <div className="relative">
              <Button variant="outline" size="sm" className="gap-1.5 h-8 text-[11px] font-bold cursor-pointer" asChild>
                <label htmlFor="svc-csv" className="cursor-pointer flex items-center gap-1.5">
                  <Upload className="h-3.5 w-3.5 text-emerald-600" />
                  Upload CSV
                  <input id="svc-csv" type="file" accept=".csv" className="hidden" onChange={handleCSVUpload} disabled={uploadingCSV} multiple />
                </label>
              </Button>
              {uploadingCSV && <div className="absolute inset-0 bg-background/70 flex items-center justify-center rounded"><Loader2 className="h-3.5 w-3.5 animate-spin text-primary" /></div>}
            </div>
          )}
          <Button asChild variant="outline" size="sm" className="gap-1.5 h-8 text-[11px] font-bold">
            <Link href="/services/kpi"><Play className="h-3.5 w-3.5 text-violet-600" /> KPIs</Link>
          </Button>
          {/* {canCRUD && (
            <Button asChild size="sm" className="gap-1.5 h-8 text-[11px] font-bold">
              <Link href="/services/new"><Plus className="h-3.5 w-3.5 text-primary-foreground" /> New Service Request</Link>
            </Button>
          )} */}
        </div>
      </div>

      {/* ── Main split: Map + Panel ── */}
      <div className="flex flex-1 overflow-hidden" style={{ minHeight: 520 }}>

        {/* ── Map ── */}
        <div className="flex-1 relative isolate">
          <ServiceMap
            sites={visibleMapSites}
            offices={mapOffices}
            selected={selected}
            skipped={historicDeferredIds}
            onToggle={toggleSite}
            onSelectBulk={setSelected}
            isDark={isDark}
          />



          {/* ── Map toolbar (top-left) ── */}
          <div className="absolute top-4 left-4 z-[1000] flex flex-col gap-2 pointer-events-auto">
            {/* Icon buttons row */}
            <div className="flex items-center gap-0.5 bg-card/95 backdrop-blur border border-border shadow-lg rounded-xl p-1">
              {/* Search */}
              <button
                onClick={() => setMapPanel(p => p === "search" ? null : "search")}
                title="Search sites"
                className={`h-8 w-8 flex items-center justify-center rounded-lg transition-colors ${mapPanel === "search" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}
              >
                <Search className="h-3.5 w-3.5" />
              </button>

              {/* Plans */}
              <button
                onClick={() => setMapPanel(p => p === "plans" ? null : "plans")}
                title="Active plans"
                className={`h-8 flex items-center gap-1 px-2 rounded-lg transition-colors ${mapPanel === "plans" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}
              >
                <ClipboardList className="h-3.5 w-3.5 shrink-0" />
                <span className="text-[11px] font-black">{activePlans.length}</span>
              </button>

              {/* Sites Due */}
              {!isTechnician && (
                <button
                  onClick={() => setMapPanel(p => p === "sites" ? null : "sites")}
                  title="Sites due"
                  className={`h-8 flex items-center gap-1 px-2 rounded-lg transition-colors ${mapPanel === "sites" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}
                >
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                  <span className={`text-[11px] font-black ${mapPanel !== "sites" ? "text-amber-600" : ""}`}>{recommendedServices.length}</span>
                </button>
              )}

              {/* Approvals */}
              {(isTechnician || user?.role === "engineer" || user?.role === "admin" || user?.role === "superadmin") && (
                <button
                  onClick={() => setMapPanel(p => p === "approvals" ? null : "approvals")}
                  title="Pending approvals"
                  className={`h-8 flex items-center gap-1 px-2 rounded-lg transition-colors ${mapPanel === "approvals" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}
                >
                  <ClipboardCheck className="h-3.5 w-3.5 shrink-0" />
                  {filteredApprovals.length > 0 && (
                    <span className={`text-[11px] font-black ${mapPanel !== "approvals" ? "text-amber-600" : ""}`}>{filteredApprovals.length}</span>
                  )}
                </button>
              )}
            </div>

            {/* Plan Service row — shown when sites selected */}
            {selected.size > 0 && (
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setPlanModal(true)}
                  className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white px-3 py-2 rounded-xl shadow-xl text-xs font-black transition-colors whitespace-nowrap"
                >
                  <Route className="h-3.5 w-3.5 shrink-0" />
                  <span className="hidden sm:inline">Plan </span>
                  <span>{selected.size}</span>
                  <span className="hidden sm:inline"> site{selected.size !== 1 ? "s" : ""}</span>
                </button>
                <button onClick={() => setSelected(new Set())} title="Clear selection"
                  className="bg-card/95 backdrop-blur-sm border border-border shadow-lg p-2 rounded-xl hover:bg-muted active:scale-95 transition-all">
                  <X className="h-3.5 w-3.5 text-muted-foreground" />
                </button>
              </div>
            )}

            {/* Search dropdown */}
            {mapPanel === "search" && (
              <div className="w-72 bg-card/97 backdrop-blur border border-border shadow-xl rounded-xl overflow-hidden">
                <div className="p-2.5 border-b border-border/50">
                  <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                    <input autoFocus type="text" value={siteSearch} onChange={e => setSiteSearch(e.target.value)}
                      placeholder="Search by name, site #, address…"
                      className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg border border-border/60 bg-background placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-primary/40" />
                  </div>
                </div>
                {siteSearch && (
                  <div className="max-h-56 overflow-y-auto divide-y divide-border/30">
                    {filteredSites.length === 0 ? (
                      <div className="py-6 text-center text-xs text-muted-foreground">No matching sites</div>
                    ) : filteredSites.slice(0, 12).map(proj => {
                      const isSelected = selected.has(proj.projectNo);
                      const urgencyColor = proj.monthsAgo > 18 ? "text-red-600" : proj.monthsAgo > 12 ? "text-orange-500" : "text-amber-500";
                      return (
                        <div key={proj.projectNo}
                          className={`px-3 py-2 cursor-pointer transition-colors ${isSelected ? "bg-emerald-50 dark:bg-emerald-950/20" : "hover:bg-muted/30"}`}
                          onClick={() => toggleSite(proj.projectNo)}>
                          <div className="flex items-center gap-2">
                            <div className={`h-4 w-4 rounded border-2 shrink-0 flex items-center justify-center ${isSelected ? "bg-emerald-600 border-emerald-600" : "border-muted-foreground/40"}`}>
                              {isSelected && <Check className="h-2.5 w-2.5 text-white" />}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="text-xs font-bold truncate">{proj.customerName} <span className="font-mono text-muted-foreground text-[9px]">#{proj.projectNo}</span></div>
                              <span className={`text-[10px] font-black ${urgencyColor}`}>{proj.monthsAgo}mo ago</span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                    {filteredSites.length > 12 && <div className="py-2 text-center text-[10px] text-muted-foreground">+{filteredSites.length - 12} more</div>}
                  </div>
                )}
              </div>
            )}

            {/* Plans dropdown */}
            {mapPanel === "plans" && (
              <div className="w-80 bg-card/97 backdrop-blur border border-border shadow-xl rounded-xl overflow-hidden">
                {/* Header */}
                <div className="px-3 py-2.5 border-b border-border/50 flex items-center justify-between bg-muted/30">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Service Plans</span>
                    {activePlans.filter((p: any) => p.status === "in_progress").length > 0 && (
                      <span className="relative flex h-2 w-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500" />
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                    {activePlans.filter((p: any) => p.status === "in_progress").length > 0 && (
                      <span className="font-bold text-blue-600">{activePlans.filter((p: any) => p.status === "in_progress").length} live</span>
                    )}
                    {activePlans.filter((p: any) => p.status === "planned").length > 0 && (
                      <span className="font-bold text-amber-600">{activePlans.filter((p: any) => p.status === "planned").length} planned</span>
                    )}
                    {completedPlans.length > 0 && <span>{completedPlans.length} done</span>}
                  </div>
                </div>
                <div className="max-h-[55vh] overflow-y-auto p-2 space-y-2">
                  {activePlans.length === 0 && completedPlans.length === 0 ? (
                    <div className="py-8 text-center text-muted-foreground">
                      <ClipboardList className="h-6 w-6 mx-auto mb-1.5 opacity-30" />
                      <p className="text-xs font-semibold">No service plans yet</p>
                    </div>
                  ) : (
                    [...activePlans, ...completedPlans].map(plan => {
                      const total = plan.sites?.length || 0;
                      const done = (plan.sites || []).filter((s: any) => s.siteStatus === "completed").length;
                      const pct = total > 0 ? Math.round((done / total) * 100) : 0;
                      const isLive = plan.status === "in_progress";
                      const isDone = plan.status === "completed";
                      const members = (plan.members || []).filter(Boolean);
                      const userName = (user?.displayName || "").trim().toLowerCase();
                      const isMyPlan = isTechnician && (
                        (plan.teamLeader || "").trim().toLowerCase() === userName ||
                        members.some((m: string) => m.trim().toLowerCase() === userName)
                      );
                      return (
                        <div key={plan.id} className={cn(
                          "rounded-xl border overflow-hidden transition-all",
                          isLive ? "border-blue-200 dark:border-blue-900/50 bg-blue-50/30 dark:bg-blue-950/20 shadow-sm" :
                            isDone ? "border-border/65 bg-muted/90 dark:bg-muted/30 shadow-sm" :
                              "border-border bg-background",
                          isMyPlan && isLive && "ring-2 ring-blue-400 dark:ring-blue-600 shadow-md"
                        )}>
                          {/* Body */}
                          <div className="flex items-stretch">
                            {/* Left accent bar */}
                            <div className={`w-1 shrink-0 ${isDone ? "bg-emerald-500/70" : isLive ? "bg-blue-500" : "bg-amber-400"}`} />
                            <div className="flex-1 p-2.5 space-y-2">
                              {/* Plan number + status */}
                              <div className="flex items-center gap-1.5 flex-wrap">
                                {isLive && (
                                  <span className="relative flex h-2 w-2 shrink-0">
                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
                                    <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500" />
                                  </span>
                                )}
                                <span className={cn("text-[11px] font-black font-mono", isDone ? "text-muted-foreground/90" : "text-foreground")}>{plan.planNo}</span>
                                <Badge variant="outline" className={`text-[9px] font-bold uppercase px-1.5 py-0 h-4 ${PLAN_STATUS_STYLES[plan.status] || ""}`}>
                                  {plan.status?.replace("_", " ")}
                                </Badge>
                                {isMyPlan && (
                                  <span className="text-[9px] font-black bg-primary text-primary-foreground px-1.5 py-0.5 rounded-full">Your Plan</span>
                                )}
                              </div>
                              {/* Date */}
                              <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                                <Calendar className="h-3 w-3 shrink-0" />
                                <span>{plan.date}</span>
                              </div>
                              {/* Team */}
                              {(plan.teamLeader || members.length > 0) && (
                                <div className="space-y-1">
                                  {plan.teamLeader && (
                                    <div className="flex items-center gap-1.5">
                                      <span className="text-[9px] font-black uppercase text-muted-foreground/60 w-12 shrink-0">Leader</span>
                                      <span className={cn("text-[10px] font-bold", isDone ? "text-muted-foreground/80" : "text-foreground")}>{plan.teamLeader}</span>
                                    </div>
                                  )}
                                  {members.length > 0 && (
                                    <div className="flex items-start gap-1.5">
                                      <span className="text-[9px] font-black uppercase text-muted-foreground/60 w-12 shrink-0 pt-0.5">Team</span>
                                      <div className="flex flex-wrap gap-1">
                                        {members.map((m: string, i: number) => (
                                          <span key={i} className={cn("text-[9px] px-1.5 py-0.5 rounded-full font-medium", isDone ? "bg-background/80 text-muted-foreground/80 border border-border/40" : "bg-muted text-muted-foreground")}>{m}</span>
                                        ))}
                                      </div>
                                    </div>
                                  )}
                                </div>
                              )}
                              {/* Progress */}
                              {total > 0 && (
                                <div className="space-y-1">
                                  <div className="flex items-center justify-between text-[9px]">
                                    <span className="text-muted-foreground">{done} of {total} sites complete</span>
                                    <span className={`font-black ${isDone ? "text-emerald-600/80" : isLive ? "text-blue-600" : "text-foreground"}`}>{pct}%</span>
                                  </div>
                                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                                    <div className={`h-full rounded-full transition-all ${isDone ? "bg-emerald-500/70" : "bg-blue-500"}`} style={{ width: `${pct}%` }} />
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                          {/* Action bar */}
                          <div className="border-t border-border/50 px-2 py-1.5 flex items-center gap-1 bg-muted/20">
                            <Link href={`/services/route/${plan.id}`} onClick={() => setMapPanel(null)}
                              className={cn("flex-1 inline-flex items-center justify-center gap-1 text-[10px] font-bold px-2 py-1.5 rounded-lg transition-colors", isDone ? "bg-primary/70 text-primary-foreground/90 hover:bg-primary/80" : "bg-primary text-primary-foreground hover:bg-primary/90")}>
                              <Eye className="h-3 w-3" /> View
                            </Link>
                            {plan.sites?.length > 0 && (
                              <button onClick={() => { openPlanRoute(plan); setMapPanel(null); }}
                                className={cn("flex-1 inline-flex items-center justify-center gap-1 text-[10px] font-bold px-2 py-1.5 rounded-lg transition-colors", isDone ? "bg-blue-600/70 text-white/90 hover:bg-blue-600/80" : "bg-blue-600 text-white hover:bg-blue-700")}>
                                <Navigation className="h-3 w-3" /> Route
                              </button>
                            )}
                            {plan.status !== "completed" && canCRUD && (
                              <button onClick={() => updateDoc(doc(db, "servicePlans", plan.id), { status: plan.status === "planned" ? "in_progress" : "completed", updatedAt: serverTimestamp() })}
                                className="flex-1 inline-flex items-center justify-center gap-1 text-[10px] font-bold bg-emerald-600 text-white hover:bg-emerald-700 px-2 py-1.5 rounded-lg transition-colors">
                                <Check className="h-3 w-3" /> {plan.status === "planned" ? "Start" : "Done"}
                              </button>
                            )}
                            {canCRUD && (
                              <button onClick={() => { openEditPlan(plan); setMapPanel(null); }}
                                className={cn("inline-flex items-center justify-center gap-1 text-[10px] font-bold px-2 py-1.5 rounded-lg border transition-colors", isDone ? "bg-muted/50 hover:bg-accent text-muted-foreground border-border/40" : "bg-muted hover:bg-accent text-foreground border-border/60")}
                                title="Change team / edit">
                                <Pencil className="h-3 w-3" /> Team
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            )}

            {/* Sites dropdown */}
            {mapPanel === "sites" && (
              <div className="w-80 bg-card/97 backdrop-blur border border-border shadow-xl rounded-xl overflow-hidden">
                <div className="px-2.5 py-2 border-b border-border/50 space-y-1.5">
                  <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                    <input type="text" value={siteSearch} onChange={e => setSiteSearch(e.target.value)}
                      placeholder="Search sites…"
                      className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg border border-border/60 bg-background placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-primary/40" />
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold text-muted-foreground">{filteredSites.length}{siteSearch ? ` of ${recommendedServices.length}` : ""} sites due</span>
                    <div className="flex gap-2">
                      <button onClick={() => setSelected(new Set(filteredSites.map(p => p.projectNo)))} className="text-[10px] font-bold text-primary hover:underline">Select All</button>
                      {selected.size > 0 && <button onClick={() => setSelected(new Set())} className="text-[10px] font-bold text-muted-foreground hover:underline">Clear</button>}
                    </div>
                  </div>
                </div>
                <div className="max-h-[55vh] overflow-y-auto divide-y divide-border/30">
                  {filteredSites.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-10 gap-1.5 text-muted-foreground">
                      <CheckCircle2 className="h-6 w-6 text-emerald-500/50" />
                      <p className="text-xs font-semibold">{siteSearch ? "No matching sites" : "All sites up to date"}</p>
                    </div>
                  ) : filteredSites.map(proj => {
                    const isSelected = selected.has(proj.projectNo);
                    const onMap = mapSites.some(s => s.id === proj.projectNo);
                    const urgencyColor = proj.monthsAgo > 18 ? "text-red-600" : proj.monthsAgo > 12 ? "text-orange-500" : "text-amber-500";
                    return (
                      <div key={proj.projectNo}
                        className={`px-3 py-2.5 cursor-pointer transition-colors select-none ${isSelected ? "bg-emerald-50 dark:bg-emerald-950/20" : "hover:bg-muted/30"}`}
                        onClick={() => toggleSite(proj.projectNo)}>
                        <div className="flex items-start gap-2.5">
                          <div className={`mt-0.5 h-4 w-4 rounded border-2 shrink-0 flex items-center justify-center ${isSelected ? "bg-emerald-600 border-emerald-600" : "border-muted-foreground/40"}`}>
                            {isSelected && <Check className="h-2.5 w-2.5 text-white" />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="text-xs font-bold truncate">{proj.customerName}</span>
                              <span className="text-[9px] font-mono text-muted-foreground shrink-0">#{proj.projectNo}</span>
                              {!onMap && <span className="text-[8px] text-muted-foreground/50 italic shrink-0">no map</span>}
                            </div>
                            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                              <span className={`text-[10px] font-black ${urgencyColor}`}>{proj.monthsAgo}mo ago</span>
                              {proj.solarCapacity > 0 && <span className="text-[10px] text-muted-foreground">⚡ {proj.solarCapacity}kWp</span>}
                              {proj.totalCost > 0 && <span className="text-[10px] font-bold text-emerald-600">Rs.{proj.totalCost.toLocaleString()}</span>}
                            </div>
                          </div>
                          <button onClick={e => { e.stopPropagation(); setSendMessageTo(proj); setMapPanel(null); }}
                            className="text-[9px] bg-primary/10 text-primary px-1.5 py-1 rounded font-bold hover:bg-primary/20 flex items-center gap-0.5 shrink-0 transition-colors">
                            <MessageSquare className="h-3 w-3" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Approvals dropdown */}
            {mapPanel === "approvals" && (
              <div className="w-80 bg-card/97 backdrop-blur border border-border shadow-xl rounded-xl overflow-hidden">
                <div className="px-3 py-2 border-b border-border/50 flex items-center justify-between">
                  <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Pending Approvals</span>
                  <span className="text-[10px] text-amber-600 font-bold">{filteredApprovals.length}</span>
                </div>
                <div className="max-h-[55vh] overflow-y-auto p-2 space-y-2">
                  {filteredApprovals.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-8 gap-1.5 text-muted-foreground">
                      <ClipboardCheck className="h-6 w-6 opacity-30" />
                      <p className="text-xs font-semibold">No pending approvals</p>
                    </div>
                  ) : filteredApprovals.map(approval => (
                    <Link key={approval.id} href={`/services/route/${approval.planId}`} onClick={() => setMapPanel(null)}
                      className="block relative p-3 rounded-xl border bg-background hover:shadow-sm transition-all overflow-hidden">
                      <div className="absolute left-0 top-0 bottom-0 w-1 bg-amber-500" />
                      <div className="pl-1 space-y-1">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-black font-mono">#{approval.projectNo}</span>
                          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">Waiting</span>
                        </div>
                        <div className="text-[10px] text-muted-foreground flex items-center gap-1">
                          <Clock className="h-3 w-3" /> {approval.submittedByName || "team leader"}
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

      </div>

      {/* ── Send Message Modal ── */}
      <Dialog open={!!sendMessageTo} onOpenChange={o => !o && setSendMessageTo(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="font-black flex items-center gap-2">
              <MessageSquare className="h-5 w-5 text-primary" /> Contact Customer
            </DialogTitle>
          </DialogHeader>
          {sendMessageTo && (
            <div className="space-y-4 py-2">
              <div className="text-sm bg-muted/30 p-3 rounded-lg border font-mono whitespace-pre-wrap max-h-60 overflow-y-auto">
                {buildServiceMsg(sendMessageTo)}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <Button
                  onClick={() => handleWhatsApp(sendMessageTo)}
                  className="w-full gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold"
                >
                  <Phone className="h-4 w-4" /> WhatsApp
                </Button>
                <Button
                  onClick={() => {
                    const mailto = `mailto:${sendMessageTo.email || ""} ?subject=Alta Vision Solar - Service Reminder&body=${encodeURIComponent(buildServiceMsg(sendMessageTo))}`;
                    window.open(mailto, "_blank");
                  }}
                  className="w-full gap-2 bg-blue-600 hover:bg-blue-700 text-white font-bold"
                >
                  <Mail className="h-4 w-4" /> Email
                </Button>
                <Button
                  variant="outline"
                  onClick={() => handleCopyMessage(sendMessageTo)}
                  className="w-full gap-2 font-bold"
                >
                  <Copy className="h-4 w-4" /> {copiedId === sendMessageTo.projectNo ? "Copied!" : "Copy"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Plan Service Modal ── */}
      <Dialog open={planModal} onOpenChange={setPlanModal}>
        <DialogContent className="max-w-lg p-0 gap-0 overflow-hidden">
          {/* Header */}
          <div className="flex items-center gap-3 px-5 py-4 border-b border-border/50 bg-emerald-600">
            <div className="h-9 w-9 rounded-xl bg-white/20 flex items-center justify-center shrink-0">
              <Route className="h-5 w-5 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-base font-black text-white leading-tight">Create Service Plan</h2>
              <p className="text-emerald-100 text-xs">{routeOrder.length} site{routeOrder.length !== 1 ? "s" : ""} selected · {planDate}</p>
            </div>
          </div>

          <div className="overflow-y-auto max-h-[75vh]">

            {/* ── Section 1: Route ── */}
            <div className="px-4 pt-4 pb-3 border-b border-border/40">
              <div className="flex items-center justify-between mb-2.5">
                <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
                  <Route className="h-3 w-3" /> Route Order
                  {routeOptimised && <span className="text-emerald-600 font-semibold normal-case">· optimised ✓</span>}
                </span>
                <button type="button"
                  onClick={() => {
                    const office = offices.find(o => o.id === planOffice) || offices[0];
                    if (!office?.lat) return;
                    const items = recommendedServices.filter(p => routeOrder.includes(p.projectNo));
                    const getC = (s: any) => { const m = mapSites.find(x => x.id === s.projectNo); return m ? { lat: m.lat, lng: m.lng } : (s.lat && s.lng ? { lat: s.lat, lng: s.lng } : null); };
                    const { ordered, unresolved } = nearestNeighborOrder(office.lat, office.lng, items, getC);
                    setRouteOrder([...ordered, ...unresolved].map(s => s.projectNo));
                    setRouteOptimised(true);
                  }}
                  className="flex items-center gap-1 text-[10px] font-bold text-primary hover:underline">
                  <RotateCcw className="h-3 w-3" /> Re-optimise
                </button>
              </div>

              <div className="space-y-1.5">
                {routeOrder.map((pNo, idx) => {
                  const p = recommendedServices.find(x => x.projectNo === pNo);
                  if (!p) return null;
                  const onMap = mapSites.some(s => s.id === pNo);
                  const lastSvcDate = parseAnyDate(p.lastServiceDate);
                  const commDate = parseAnyDate(p.commissionedAt);
                  const refDate = lastSvcDate || commDate;
                  const fmtRef = refDate ? refDate.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : null;
                  const svcLabel = lastSvcDate ? `Last svc: ${fmtRef}` : commDate ? `Commissioned: ${fmtRef}` : null;
                  const urgBg = p.monthsAgo > 18 ? "bg-red-500" : p.monthsAgo > 12 ? "bg-orange-500" : "bg-amber-400";
                  const urgText = p.monthsAgo > 18 ? "text-red-600" : p.monthsAgo > 12 ? "text-orange-600" : "text-amber-600";
                  const noteOpen = siteNoteOpen.has(pNo);
                  const hasNote = !!(siteNotes[pNo]?.trim());
                  const toggleNote = () => setSiteNoteOpen(prev => { const n = new Set(prev); n.has(pNo) ? n.delete(pNo) : n.add(pNo); return n; });
                  return (
                    <div key={pNo} className="rounded-xl border border-border/50 overflow-hidden bg-card shadow-sm">
                      <div className="flex items-stretch">
                        {/* Urgency bar */}
                        <div className={`w-1 shrink-0 ${urgBg}`} />
                        {/* Content */}
                        <div className="flex items-center gap-2 flex-1 min-w-0 px-2.5 py-2">
                          <span className="text-[10px] font-black text-muted-foreground/60 w-4 text-right shrink-0">{idx + 1}</span>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="text-xs font-black text-foreground">#{pNo}</span>
                              <span className="text-xs text-muted-foreground font-medium truncate">{p.customerName.split(" ").slice(0, 3).join(" ")}</span>
                              {p.solarCapacity > 0 && (
                                <span className="text-[9px] font-bold bg-amber-50 dark:bg-amber-950/30 text-amber-700 border border-amber-200 dark:border-amber-900 px-1.5 py-0.5 rounded-full shrink-0">
                                  ⚡ {p.solarCapacity} kWp
                                </span>
                              )}
                              <span className="text-[9px] font-black bg-blue-50 dark:bg-blue-950/30 text-blue-700 border border-blue-200 dark:border-blue-900 px-1.5 py-0.5 rounded-full shrink-0">
                                Visit #{(siteServiceCountMap[pNo] || 0) + 1}
                              </span>
                              {!onMap && <span className="text-[9px] text-muted-foreground/50 italic shrink-0">no GPS</span>}
                            </div>
                            <div className="flex items-center gap-2 mt-0.5">
                              {svcLabel && <span className="text-[9px] text-muted-foreground">{svcLabel}</span>}
                              {p.monthsAgo > 0 && <span className={`text-[9px] font-black ${urgText}`}>({p.monthsAgo}mo ago)</span>}
                            </div>
                          </div>
                          <div className="flex items-center gap-0.5 shrink-0">
                            <button type="button" onClick={toggleNote} title={hasNote ? "Edit note" : "Add note"}
                              className={`h-6 w-6 flex items-center justify-center rounded-lg transition-colors ${hasNote || noteOpen ? "text-primary bg-primary/10" : "text-muted-foreground hover:text-primary hover:bg-muted"}`}>
                              <MessageSquare className="h-3 w-3" />
                            </button>
                            <button type="button" onClick={() => moveRouteUp(idx)} disabled={idx === 0}
                              className="h-6 w-6 flex items-center justify-center rounded-lg text-muted-foreground hover:bg-muted disabled:opacity-20 transition-colors">
                              <ArrowUp className="h-3 w-3" />
                            </button>
                            <button type="button" onClick={() => moveRouteDown(idx)} disabled={idx === routeOrder.length - 1}
                              className="h-6 w-6 flex items-center justify-center rounded-lg text-muted-foreground hover:bg-muted disabled:opacity-20 transition-colors">
                              <ArrowDown className="h-3 w-3" />
                            </button>
                            <button type="button" onClick={() => deferSite(pNo)} title="Defer"
                              className="h-6 w-6 flex items-center justify-center rounded-lg text-muted-foreground hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950/30 transition-colors">
                              <X className="h-3 w-3" />
                            </button>
                          </div>
                        </div>
                      </div>
                      {/* Per-site service config selectors */}
                      {(() => {
                        const cfg = siteServiceConfig[pNo] || { systemType: "ongrid" as SystemType, serviceScope: "full" as ServiceScope, siteCategory: "standard" as SiteCategory };
                        const setCfg = (patch: Partial<typeof cfg>) =>
                          setSiteServiceConfig(prev => ({ ...prev, [pNo]: { ...cfg, ...patch } }));
                        // Detect if systemType matches the project's stored value (auto-detected)
                        const projSysType = recommendedServices.find(r => r.projectNo === pNo)?.systemType;
                        const sysTypeIsAuto = projSysType && cfg.systemType === projSysType;
                        return (
                          <div className="px-2.5 py-1.5 bg-muted/30 border-t border-border/30 space-y-1.5">
                            {/* Row 1: Grid type + Site type */}
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <div className="flex items-center gap-1">
                                <span className="text-[9px] font-black uppercase text-muted-foreground/60">Grid</span>
                                {sysTypeIsAuto && (
                                  <span className="text-[8px] font-bold text-emerald-600 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900 px-1 rounded">auto</span>
                                )}
                              </div>
                              <select
                                value={cfg.systemType}
                                onChange={e => setCfg({ systemType: e.target.value as SystemType })}
                                className="h-6 text-[10px] font-bold rounded-lg border border-border/60 bg-background px-1.5 focus:outline-none focus:ring-1 focus:ring-primary/30"
                              >
                                {(Object.entries(SYSTEM_TYPE_LABELS) as [SystemType, typeof SYSTEM_TYPE_LABELS[SystemType]][]).map(([k, v]) => (
                                  <option key={k} value={k}>{v.short}</option>
                                ))}
                              </select>
                              <span className="text-[9px] font-black uppercase text-muted-foreground/60 ml-1">Site</span>
                              <select
                                value={cfg.siteCategory}
                                onChange={e => setCfg({ siteCategory: e.target.value as SiteCategory })}
                                className="h-6 text-[10px] font-bold rounded-lg border border-border/60 bg-background px-1.5 focus:outline-none focus:ring-1 focus:ring-primary/30"
                              >
                                {(Object.entries(SITE_CATEGORY_LABELS) as [SiteCategory, typeof SITE_CATEGORY_LABELS[SiteCategory]][]).map(([k, v]) => (
                                  <option key={k} value={k}>{v.label}</option>
                                ))}
                              </select>
                            </div>
                            {/* Row 2: Visit Type */}
                            <div className="flex items-center gap-1.5">
                              <span className="text-[9px] font-black uppercase text-muted-foreground/60">Visit Type</span>
                              <select
                                value={cfg.serviceScope}
                                onChange={e => setCfg({ serviceScope: e.target.value as ServiceScope })}
                                className="h-6 text-[10px] font-bold rounded-lg border border-primary/40 bg-background px-1.5 focus:outline-none focus:ring-1 focus:ring-primary/30 text-primary"
                              >
                                {(Object.entries(SERVICE_SCOPE_LABELS) as [ServiceScope, typeof SERVICE_SCOPE_LABELS[ServiceScope]][]).map(([k, v]) => (
                                  <option key={k} value={k}>{v.label}</option>
                                ))}
                              </select>
                            </div>
                          </div>
                        );
                      })()}
                      {(noteOpen || hasNote) && (
                        <div className="px-3 pb-2 pt-1 bg-primary/5 border-t border-primary/10">
                          <input autoFocus={noteOpen && !hasNote}
                            className="w-full text-[11px] bg-white dark:bg-card border border-border/60 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-primary/40 placeholder:text-muted-foreground/50"
                            placeholder="e.g. 'bring replacement fuse', 'dog on site', 'customer home after 2pm'…"
                            value={siteNotes[pNo] || ""}
                            onChange={e => setSiteNotes(prev => ({ ...prev, [pNo]: e.target.value }))}
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Deferred */}
              {deferredSites.length > 0 && (
                <div className="mt-2 space-y-1">
                  <p className="text-[9px] font-black uppercase text-amber-600 flex items-center gap-1">
                    <AlertTriangle className="h-3 w-3" /> Deferred ({deferredSites.length})
                  </p>
                  {deferredSites.map(d => (
                    <div key={d.projectNo} className="flex items-center gap-2 bg-amber-50 dark:bg-amber-950/20 rounded-lg px-2.5 py-1.5 border border-amber-200 dark:border-amber-900/40">
                      <span className="text-[10px] font-mono font-black text-amber-700 shrink-0">#{d.projectNo}</span>
                      <input className="flex-1 min-w-0 text-[10px] bg-transparent border-0 outline-none placeholder:text-amber-400 text-amber-700"
                        placeholder="Reason (optional)…" value={d.reason}
                        onChange={e => updateDeferReason(d.projectNo, e.target.value)} />
                      <button type="button" onClick={() => restoreSite(d.projectNo)}
                        className="text-[9px] text-primary hover:underline font-bold shrink-0">restore</button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* ── Section 2: Logistics ── */}
            <div className="px-4 py-3.5 border-b border-border/40">
              <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-2.5 flex items-center gap-1.5">
                <Calendar className="h-3 w-3" /> Date &amp; Office
              </p>
              <div className="grid grid-cols-2 gap-2.5">
                <div className="space-y-1">
                  <Label className="text-[10px] text-muted-foreground font-semibold">Service Date</Label>
                  <Input type="date" value={planDate} onChange={e => setPlanDate(e.target.value)}
                    className="h-9 rounded-xl text-sm font-semibold" />
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px] text-muted-foreground font-semibold">Starting Office</Label>
                  <select value={planOffice} onChange={e => setPlanOffice(e.target.value)}
                    className="w-full h-9 rounded-xl border border-input bg-background px-3 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-primary/30">
                    {offices.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
                  </select>
                </div>
              </div>
            </div>

            {/* ── Section 3: Team ── */}
            <div className="px-4 py-3.5 border-b border-border/40">
              <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-2.5 flex items-center gap-1.5">
                <Users className="h-3 w-3" /> Team
                {planLeader && <span className="text-emerald-600 normal-case font-semibold">· auto-filled from recent plan</span>}
              </p>
              {/* Leader */}
              <div className="space-y-1 mb-2.5">
                <Label className="text-[10px] text-muted-foreground font-semibold">Team Leader</Label>
                <select value={planLeader} onChange={e => setPlanLeader(e.target.value)}
                  className="w-full h-10 rounded-xl border border-input bg-background px-3 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-primary/30">
                  <option value="">— Select team leader —</option>
                  {techUsers.map(u => (
                    <option key={u.uid} value={u.name}>{u.name} {u.role === "team_leader" ? "· Leader" : u.role === "technician" ? "· Tech" : "· Engineer"}</option>
                  ))}
                </select>
              </div>
              {/* Members */}
              <div className="space-y-1">
                <Label className="text-[10px] text-muted-foreground font-semibold">Team Members</Label>
                <div className="space-y-1.5">
                  {planMembers.map((m, i) => (
                    <div key={i} className="flex gap-1.5 items-center">
                      <div className="h-6 w-6 rounded-full bg-muted flex items-center justify-center shrink-0 text-[10px] font-black text-muted-foreground">{i + 1}</div>
                      <Input value={m} onChange={e => { const n = [...planMembers]; n[i] = e.target.value; setPlanMembers(n); }}
                        placeholder={`Member ${i + 1} name`} className="h-8 flex-1 text-sm rounded-xl" />
                      <button onClick={() => setPlanMembers(planMembers.filter((_, j) => j !== i))}
                        className="h-7 w-7 flex items-center justify-center rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors shrink-0">
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                  {/* Quick-add known team members */}
                  <div className="flex flex-wrap gap-1.5 pt-0.5">
                    {techUsers
                      .filter(u => u.name !== planLeader && !planMembers.includes(u.name))
                      .map(u => (
                        <button key={u.uid} type="button"
                          onClick={() => setPlanMembers(prev => {
                            const empty = prev.findIndex(m => !m.trim());
                            if (empty >= 0) { const n = [...prev]; n[empty] = u.name; return n; }
                            return [...prev, u.name];
                          })}
                          className="flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-full border border-border/60 text-muted-foreground hover:border-primary/40 hover:text-primary hover:bg-primary/5 transition-colors">
                          <Plus className="h-2.5 w-2.5" /> {u.name}
                        </button>
                      ))}
                    <button onClick={() => setPlanMembers([...planMembers, ""])}
                      className="flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-full border border-dashed border-border/60 text-muted-foreground hover:border-primary/60 hover:text-primary transition-colors">
                      <Plus className="h-2.5 w-2.5" /> Custom
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* ── Section 4: Notes ── */}
            <div className="px-4 py-3.5">
              <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-2 flex items-center gap-1.5">
                <MessageSquare className="h-3 w-3" /> Team Notes <span className="font-normal normal-case">(optional)</span>
              </Label>
              <Textarea value={planNotes} onChange={e => setPlanNotes(e.target.value)}
                placeholder="Special instructions, tools to bring, meeting point…" rows={2}
                className="resize-none text-sm rounded-xl" />
            </div>
          </div>

          {/* Footer */}
          <div className="flex gap-2 px-4 py-3.5 border-t border-border/50 bg-muted/20">
            <Button variant="outline" onClick={() => setPlanModal(false)} className="flex-1 rounded-xl">Cancel</Button>
            <Button onClick={handleCreatePlan} disabled={savingPlan || selected.size === 0}
              className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold gap-2 rounded-xl">
              {savingPlan ? <Loader2 className="h-4 w-4 animate-spin" /> : <Route className="h-4 w-4" />}
              Create Plan &amp; Open Route
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Edit Plan Modal ── */}
      <Dialog open={!!editModal} onOpenChange={open => { if (!open) setEditModal(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="font-black flex items-center gap-2">
              <Pencil className="h-4 w-4 text-primary" />
              Edit Plan {editModal?.planNo}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Date */}
            <div className="space-y-1">
              <Label className="text-[10px] font-black uppercase text-muted-foreground">Service Date</Label>
              <Input type="date" value={editDate} onChange={e => setEditDate(e.target.value)} className="h-9" />
            </div>

            {/* Team Leader */}
            <div className="space-y-1">
              <Label className="text-[10px] font-black uppercase text-muted-foreground">Team Leader</Label>
              <select
                value={editLeader}
                onChange={e => setEditLeader(e.target.value)}
                className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm font-semibold"
              >
                <option value="">— Select team leader —</option>
                {techUsers.map(u => (
                  <option key={u.uid} value={u.name}>{u.name}</option>
                ))}
              </select>
            </div>

            {/* Members */}
            <div className="space-y-1">
              <Label className="text-[10px] font-black uppercase text-muted-foreground">Team Members</Label>
              <div className="space-y-1.5">
                {editMembers.map((m, i) => (
                  <div key={i} className="flex gap-1.5">
                    <Input
                      value={m}
                      onChange={e => { const n = [...editMembers]; n[i] = e.target.value; setEditMembers(n); }}
                      placeholder={`Member ${i + 1}`}
                      className="h-8 flex-1 text-sm"
                    />
                    <Button size="icon" variant="ghost" className="h-8 w-8 shrink-0"
                      onClick={() => setEditMembers(editMembers.filter((_, j) => j !== i))}>
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
                <button
                  onClick={() => setEditMembers([...editMembers, ""])}
                  className="text-[10px] font-bold text-primary hover:underline flex items-center gap-1">
                  <Plus className="h-3 w-3" /> Add Member
                </button>
              </div>
            </div>

            {/* Notes */}
            <div className="space-y-1">
              <Label className="text-[10px] font-black uppercase text-muted-foreground">Notes</Label>
              <Textarea
                value={editNotes}
                onChange={e => setEditNotes(e.target.value)}
                placeholder="Instructions or notes for the team..."
                rows={2}
                className="resize-none text-sm"
              />
            </div>
          </div>

          <div className="flex gap-2 pt-2 border-t border-border/50">
            <Button variant="outline" onClick={() => setEditModal(null)} className="flex-1">Cancel</Button>
            <Button
              onClick={handleSavePlan}
              disabled={savingEdit}
              className="flex-1 font-bold gap-2"
            >
              {savingEdit ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              Save Changes
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Technician: Today's Routes ── */}
      {isTechnician && (() => {
        const todayStr = new Date().toLocaleDateString("en-CA");
        const userName = (user?.displayName || "").trim().toLowerCase();
        const myPlans = activePlans.filter((p: any) => {
          const leader = (p.teamLeader || "").trim().toLowerCase();
          const members = (p.members || []).map((m: string) => m.trim().toLowerCase());
          return leader === userName || members.some((m: string) => m === userName);
        });
        const todayPlans = myPlans.filter((p: any) => p.date === todayStr);
        const otherPlans = myPlans.filter((p: any) => p.date !== todayStr);
        const allMyPlans = [...todayPlans, ...otherPlans];
        return (
          <div className="flex-none border-t border-border/50 p-4 space-y-2.5">
            <div className="flex items-center justify-between">
              <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                {todayPlans.length > 0 ? "Today's Service Routes" : myPlans.length > 0 ? "Upcoming Routes" : "Service Routes"}
              </p>
              {allMyPlans.length > 0 && (
                <span className="text-[9px] font-bold text-muted-foreground bg-muted/60 px-2 py-0.5 rounded-full">
                  {allMyPlans.length} active
                </span>
              )}
            </div>
            {todayPlans.length > 0 && (
              <p className="text-[10px] text-muted-foreground">
                You have <span className="font-bold text-foreground">{todayPlans.length}</span> active service plan{todayPlans.length !== 1 ? "s" : ""} scheduled for today.
              </p>
            )}
            {allMyPlans.length > 0 ? (
              <div className="space-y-2">
                {allMyPlans.map((plan: any) => {
                  const isToday = plan.date === todayStr;
                  const isLive = plan.status === "in_progress";
                  const planTotal = plan.sites?.length || 0;
                  const planDone = (plan.sites || []).filter((s: any) => s.siteStatus === "completed").length;
                  const planPct = planTotal > 0 ? Math.round((planDone / planTotal) * 100) : 0;
                  return (
                    <Link key={plan.id} href={`/services/route/${plan.id}`}>
                      <div className={cn(
                        "rounded-xl border-2 p-3.5 cursor-pointer group transition-all",
                        isLive
                          ? "border-blue-300 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/30 hover:bg-blue-100 dark:hover:bg-blue-950/50"
                          : isToday
                            ? "border-primary/40 bg-primary/5 hover:bg-primary/10"
                            : "border-border/60 bg-muted/20 hover:bg-muted/40"
                      )}>
                        <div className="flex items-center gap-3">
                          <div className={cn(
                            "h-9 w-9 rounded-xl flex items-center justify-center shrink-0",
                            isLive ? "bg-blue-100 dark:bg-blue-900/40" : "bg-primary/10"
                          )}>
                            <Route className={cn("h-4 w-4", isLive ? "text-blue-600 dark:text-blue-400" : "text-primary")} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5 mb-0.5 flex-wrap">
                              {isLive && (
                                <span className="flex items-center gap-1 text-[9px] font-black text-blue-600 dark:text-blue-400">
                                  <span className="relative flex h-1.5 w-1.5">
                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
                                    <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-blue-500" />
                                  </span>
                                  LIVE
                                </span>
                              )}
                              {!isLive && isToday && <span className="text-[9px] font-black text-primary uppercase tracking-widest">Today</span>}
                              {!isToday && <span className="text-[9px] font-semibold text-muted-foreground">{plan.date}</span>}
                            </div>
                            <p className="text-sm font-black text-foreground truncate">{plan.planNo}</p>
                            <p className="text-[10px] text-muted-foreground">{planDone}/{planTotal} sites · {plan.teamLeader || "No leader"}</p>
                            {plan.notes?.trim() && (
                              <p className="text-[10px] text-amber-700 dark:text-amber-400 mt-0.5 italic line-clamp-1">📝 {plan.notes}</p>
                            )}
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <span className={cn("text-xs font-black", isLive ? "text-blue-600 dark:text-blue-400" : "text-primary")}>{planPct}%</span>
                            <ArrowRight className={cn("h-4 w-4 group-hover:translate-x-0.5 transition-transform", isLive ? "text-blue-500" : "text-primary")} />
                          </div>
                        </div>
                        {planTotal > 0 && (
                          <div className="mt-2.5 h-1.5 bg-muted/60 rounded-full overflow-hidden">
                            <div className={cn("h-full rounded-full transition-all", isLive ? "bg-blue-500" : "bg-primary")} style={{ width: `${planPct}%` }} />
                          </div>
                        )}
                      </div>
                    </Link>
                  );
                })}
              </div>
            ) : (
              <div className="rounded-xl border border-border/50 bg-muted/20 p-5 text-center space-y-2">
                <Route className="h-8 w-8 text-muted-foreground/40 mx-auto" />
                <p className="text-sm font-semibold text-muted-foreground">No active plans assigned</p>
                <p className="text-xs text-muted-foreground/60">Check back later or contact your team leader</p>
              </div>
            )}
          </div>
        );
      })()}

      {/* ── All Services Table — hidden for field technicians ── */}
      {!isTechnician && (
        <div className="flex-none border-t border-border/50">
          <Card className="shadow-none rounded-none border-0">
            {/* Header with Title and Search */}
            <CardHeader className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 pb-4 border-b border-border/50 px-6 pt-5 bg-background">
              <div>
                <CardTitle className="text-sm font-black uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                  <ClipboardList className="h-4 w-4 text-primary" />
                  All Service Records
                </CardTitle>
                <p className="text-xs text-muted-foreground mt-1">
                  Manage service pipeline, track worksheets, quotes, and payment states.
                </p>
              </div>
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 w-full md:w-auto">
                <div className="relative w-full sm:w-64">
                  <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    className="pl-9 h-9 text-sm"
                    placeholder="Search services..."
                    value={search}
                    onChange={(e) => {
                      setSearch(e.target.value);
                      setPage(1); // reset to page 1 on search
                    }}
                  />
                </div>
                {canCRUD && (
                  <Button asChild size="sm" className="h-9 font-semibold shrink-0">
                    <Link href="/services/new">
                      <Plus className="h-4 w-4 mr-1.5" />
                      New Request
                    </Link>
                  </Button>
                )}
              </div>
            </CardHeader>

            {/* Filter Tabs Section */}
            <div className="px-6 py-3 border-b border-border/40 bg-muted/10">
              <div className="flex flex-wrap gap-1.5 items-center">
                {STATUS_TABS.map((tab) => {
                  const isActive = statusFilter === tab.key;
                  const count = getStatusCount(tab.key);
                  return (
                    <button
                      key={tab.key}
                      onClick={() => {
                        setStatusFilter(tab.key);
                        setPage(1); // reset to page 1 on filter change
                      }}
                      className={cn(
                        "inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-full border transition-all duration-200",
                        isActive
                          ? tab.activeClass
                          : "bg-background text-muted-foreground border-border hover:bg-muted/50"
                      )}
                    >
                      <span>{tab.label}</span>
                      <span
                        className={cn(
                          "px-1.5 py-0.2 text-[10px] font-bold rounded-full",
                          isActive
                            ? tab.countClass
                            : "bg-muted text-muted-foreground"
                        )}
                      >
                        {count}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Card Content (Table & Loading States) */}
            <CardContent className="p-0">
              {loading ? (
                <div className="flex h-48 items-center justify-center gap-2 text-muted-foreground">
                  <Loader2 className="h-6 w-6 animate-spin text-primary" />
                  <span className="text-sm font-medium">Loading service records...</span>
                </div>
              ) : filtered.length === 0 ? (
                <div className="flex h-48 flex-col items-center justify-center gap-2 text-muted-foreground bg-muted/5">
                  <Wrench className="h-8 w-8 opacity-30 animate-pulse text-muted-foreground" />
                  <p className="text-sm font-medium">{search ? "No matches found." : "No services under this status."}</p>
                  {search && (
                    <Button variant="ghost" size="sm" onClick={() => { setSearch(""); setStatusFilter("all"); }} className="text-xs text-primary underline">
                      Clear Search & Filters
                    </Button>
                  )}
                </div>
              ) : (
                <>
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader className="bg-muted/30">
                        <TableRow className="hover:bg-transparent">
                          <TableHead className="text-xs font-black uppercase tracking-wider h-11 px-6">Service No</TableHead>
                          <TableHead className="text-xs font-black uppercase tracking-wider h-11">Customer & System</TableHead>
                          <TableHead className="text-xs font-black uppercase tracking-wider h-11">Financials</TableHead>
                          <TableHead className="text-xs font-black uppercase tracking-wider h-11">Pipeline Status</TableHead>
                          <TableHead className="text-xs font-black uppercase tracking-wider h-11 text-right px-6">Actions & Transitions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {paginatedServices.map((s) => {
                          const statusCfg = SVC_STATUS[s.status] || {
                            label: s.status || "Pending",
                            dot: "#94a3b8",
                            badge: "bg-slate-100 text-slate-700 border-slate-200",
                            next: null,
                          };

                          // Smart Next CTA based on the current pipeline status
                          let ctaLabel = "";
                          let ctaAction = () => { };
                          let ctaLink = "";
                          let ctaIcon = null;
                          let ctaVariant: "default" | "outline" | "secondary" | "ghost" = "default";

                          if (s.status === "pending") {
                            ctaLabel = "Quotation";
                            ctaLink = `/services/${s.id}`;
                            ctaIcon = <FileText className="h-3 w-3 mr-1" />;
                            ctaVariant = "outline";
                          } else if (s.status === "quotation_sent" || s.status === "quotation_generated" || s.status === "proforma_generated") {
                            ctaLabel = "Add to Plan";
                            ctaAction = () => {
                              setSelected(new Set([s.projectNo || s.id]));
                              setPlanModal(true);
                              toast({
                                title: "Site Selected",
                                description: `Ready to plan for project #${s.projectNo || s.id}.`,
                              });
                            };
                            ctaIcon = <Calendar className="h-3 w-3 mr-1" />;
                          } else if (s.status === "in_plan") {
                            ctaLabel = "Start Work";
                            ctaAction = () => handleStatusTransition(s, "ongoing");
                            ctaIcon = <Play className="h-3 w-3 mr-1" />;
                          } else if (s.status === "ongoing") {
                            ctaLabel = "Worksheet";
                            ctaLink = `/services/${s.id}/checklist`;
                            ctaIcon = <ClipboardCheck className="h-3 w-3 mr-1" />;
                            ctaVariant = "default";
                          } else if (s.status === "work_completed") {
                            ctaLabel = "Send Invoice";
                            ctaLink = `/services/${s.id}`;
                            ctaIcon = <Receipt className="h-3 w-3 mr-1" />;
                            ctaVariant = "secondary";
                          } else if (s.status === "invoice_sent") {
                            ctaLabel = "Log Payment";
                            ctaLink = `/services/${s.id}`;
                            ctaIcon = <Copy className="h-3 w-3 mr-1" />;
                            ctaVariant = "outline";
                          } else if (s.status === "payment_received" || s.status === "invoice_generated") {
                            ctaLabel = "Complete";
                            ctaAction = () => handleStatusTransition(s, "completed");
                            ctaIcon = <CheckCircle2 className="h-3 w-3 mr-1" />;
                          }

                          return (
                            <TableRow key={s.id} className="border-b border-border/40 last:border-0 hover:bg-muted/10 transition-colors group">
                              {/* Service Number with Icon */}
                              <TableCell className="py-3 px-6 font-mono font-bold text-sm text-primary">
                                <div className="flex flex-col gap-0.5">
                                  <span className="flex items-center gap-1.5">
                                    {s.serviceNo || "Draft"}
                                  </span>
                                  <span className="text-[10px] font-normal text-muted-foreground">
                                    {s.scheduledDate || (s as any).date || "No date"}
                                  </span>
                                </div>
                              </TableCell>

                              {/* Customer Information & System Size */}
                              <TableCell className="py-3">
                                <div className="flex flex-col">
                                  <span className="font-semibold text-sm text-foreground">{getCustomerName(s) || "—"}</span>
                                  <span className="text-xs text-muted-foreground flex items-center gap-1.5 mt-0.5">
                                    <span>#{s.projectNo || "N/A"}</span>
                                    {s.serviceType && (
                                      <>
                                        <span className="text-muted-foreground/30">•</span>
                                        <span className="px-1.5 py-0.2 bg-muted text-[10px] rounded-md font-medium capitalize">{s.serviceType}</span>
                                      </>
                                    )}
                                  </span>
                                </div>
                              </TableCell>

                              {/* Financial Details */}
                              <TableCell className="py-3 text-sm font-medium">
                                {s.isFreeService ? (
                                  <Badge className="bg-emerald-500/10 hover:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 font-bold text-[10px] uppercase">
                                    FREE
                                  </Badge>
                                ) : typeof s.costs?.totalCost === "number" && s.costs.totalCost > 0 ? (
                                  <div className="flex flex-col">
                                    <span className="font-semibold text-foreground">LKR {s.costs.totalCost.toLocaleString()}</span>
                                    {s.invoiceId && (
                                      <span className="text-[9px] text-muted-foreground font-mono mt-0.5">
                                        INV: {s.invoiceId}
                                      </span>
                                    )}
                                  </div>
                                ) : (
                                  <span className="text-muted-foreground text-xs">—</span>
                                )}
                              </TableCell>

                              {/* Pipeline Status with Colored Dot Indicator */}
                              <TableCell className="py-3">
                                <div className="flex items-center flex-wrap gap-2">
                                  <Badge variant="outline" className={cn("inline-flex items-center gap-1.5 text-[10px] uppercase font-bold px-2 py-0.5 rounded-full border shadow-none", statusCfg.badge)}>
                                    <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: statusCfg.dot }} />
                                    {statusCfg.label}
                                  </Badge>

                                  {/* Active / Completed Worksheet Quick Access Button */}
                                  {availableChecklists.has(s.id) && (
                                    <Link
                                      href={`/services/${s.id}/checklist`}
                                      className="inline-flex items-center gap-1 text-[10px] font-black text-emerald-600 hover:text-emerald-700 bg-emerald-50 dark:bg-emerald-950/20 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-900/60 px-2 py-0.5 rounded-full transition-all duration-200 hover:shadow-xs shrink-0"
                                      title="View worksheet checklist"
                                    >
                                      <ClipboardCheck className="h-3 w-3" />
                                      Sheet ✓
                                    </Link>
                                  )}
                                </div>
                              </TableCell>

                              {/* Smart Transitions and Manage Actions */}
                              <TableCell className="py-3 px-6 text-right">
                                <div className="flex items-center justify-end gap-2">
                                  {/* Inline Quick Action / Next Step CTA */}
                                  {ctaLabel && (
                                    ctaLink ? (
                                      <Button size="sm" variant={ctaVariant} className="h-8 text-xs font-bold gap-1 transition-all" asChild>
                                        <Link href={ctaLink}>
                                          {ctaIcon}
                                          {ctaLabel}
                                        </Link>
                                      </Button>
                                    ) : (
                                      <Button size="sm" variant={ctaVariant} className="h-8 text-xs font-bold gap-1 transition-all" onClick={ctaAction}>
                                        {ctaIcon}
                                        {ctaLabel}
                                      </Button>
                                    )
                                  )}

                                  {/* View Print Quote button if available */}
                                  {s.invoiceId && s.status !== "completed" && (
                                    <Button size="icon" variant="outline" className="h-8 w-8 text-amber-600 border-amber-200 hover:bg-amber-50 dark:border-amber-900/60 dark:text-amber-400 dark:hover:bg-amber-950/30" asChild title="Print Quotation">
                                      <Link href={`/print/service/${s.invoiceId}`} target="_blank">
                                        <FileText className="h-4 w-4" />
                                      </Link>
                                    </Button>
                                  )}

                                  {/* Manage Button */}
                                  {canCRUD && (
                                    <Button size="sm" variant="outline" className="h-8 text-xs font-bold hidden lg:flex" asChild>
                                      <Link href={`/services/${s.id}`}>
                                        Manage
                                        <ArrowRight className="h-3 w-3 ml-1" />
                                      </Link>
                                    </Button>
                                  )}

                                  {/* Dropdown Options */}
                                  {canCRUD && (
                                    <DropdownMenu>
                                      <DropdownMenuTrigger asChild>
                                        <Button variant="ghost" size="icon" className="h-8 w-8 hover:bg-muted/80"><MoreVertical className="h-4 w-4" /></Button>
                                      </DropdownMenuTrigger>
                                      <DropdownMenuContent align="end" className="w-44">
                                        <DropdownMenuItem asChild>
                                          <Link href={`/services/${s.id}`}><Pencil className="h-4 w-4 mr-2" /> Edit Details</Link>
                                        </DropdownMenuItem>
                                        <DropdownMenuItem asChild>
                                          <Link href={`/services/new?projectNo=${s.projectNo}`}><Plus className="h-4 w-4 mr-2" /> New Req</Link>
                                        </DropdownMenuItem>
                                        {availableChecklists.has(s.id) && (
                                          <DropdownMenuItem asChild>
                                            <Link href={`/services/${s.id}/checklist`}><ClipboardList className="h-4 w-4 mr-2" /> Service Sheet</Link>
                                          </DropdownMenuItem>
                                        )}
                                        {(user?.role === "superadmin" || user?.role === "admin") && (
                                          <>
                                            <DropdownMenuSeparator />
                                            <DropdownMenuItem className="text-destructive focus:text-destructive focus:bg-destructive/10 cursor-pointer" onClick={async () => {
                                              if (confirm("Are you sure you want to delete this service record?")) {
                                                const { deleteDoc, doc } = await import("firebase/firestore");
                                                await deleteDoc(doc(db, "services", s.id));
                                                toast({ title: "Deleted Successfully", description: `Service ${s.serviceNo || ""} was deleted.` });
                                              }
                                            }}>
                                              <Trash2 className="h-4 w-4 mr-2" /> Delete
                                            </DropdownMenuItem>
                                          </>
                                        )}
                                      </DropdownMenuContent>
                                    </DropdownMenu>
                                  )}
                                </div>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>

                  {/* Redesigned Premium Pagination Footer */}
                  <div className="flex flex-col sm:flex-row items-center justify-between gap-4 px-6 py-4 border-t border-border/50 bg-background text-sm text-muted-foreground select-none">
                    <div>
                      Showing <span className="font-semibold text-foreground">{filtered.length > 0 ? (page - 1) * PAGE_SIZE + 1 : 0}</span> to{" "}
                      <span className="font-semibold text-foreground">
                        {Math.min(page * PAGE_SIZE, filtered.length)}
                      </span>{" "}
                      of <span className="font-semibold text-foreground">{filtered.length}</span> services
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-8 w-8"
                        disabled={page === 1}
                        onClick={() => setPage(page - 1)}
                      >
                        <ChevronLeft className="h-4 w-4" />
                      </Button>

                      {Array.from({ length: totalPages }).map((_, i) => {
                        const pageNum = i + 1;
                        const isCurrent = pageNum === page;
                        // For space savings on massive lists, skip middle pages
                        if (totalPages > 5 && Math.abs(pageNum - page) > 1 && pageNum !== 1 && pageNum !== totalPages) {
                          if (pageNum === 2 || pageNum === totalPages - 1) {
                            return <span key={pageNum} className="px-1 text-muted-foreground/50">...</span>;
                          }
                          return null;
                        }
                        return (
                          <Button
                            key={pageNum}
                            variant={isCurrent ? "default" : "outline"}
                            size="icon"
                            className="h-8 w-8 text-xs font-bold"
                            onClick={() => setPage(pageNum)}
                          >
                            {pageNum}
                          </Button>
                        );
                      })}

                      <Button
                        variant="outline"
                        size="icon"
                        className="h-8 w-8"
                        disabled={page === totalPages}
                        onClick={() => setPage(page + 1)}
                      >
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </div>
      )}

    </div>
  );
}
