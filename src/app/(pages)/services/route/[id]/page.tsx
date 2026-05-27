"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import {
  doc, setDoc, updateDoc, arrayUnion, getDoc,
  collection, query, where, getDocs, serverTimestamp, onSnapshot,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/auth-context";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Loader2, ArrowLeft, MapPin, CheckCircle2, ChevronDown, ChevronUp,
  Navigation, ShieldCheck, AlertTriangle, CornerDownRight, History,
  SkipForward, RotateCcw, Receipt, ArrowUp, ArrowDown, MessageSquare,
  Clock, Pencil, Check,
  Coffee, Timer, LogIn, LogOut, Truck, Home,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import type { AppUser, ServiceChecklist } from "@/types";
import Link from "next/link";

const RouteMap     = dynamic(() => import("@/components/services/RouteMap"),     { ssr: false });
const SiteChecklist = dynamic(() => import("@/components/services/SiteChecklist"), { ssr: false });

// ── helpers ──────────────────────────────────────────────────────────────────
function haversine(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLon/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

// ── Day break slots (fixed durations, immutable once started) ─────────────────
const DAY_BREAKS = [
  { slot: 0, label: "Tea",   durationMs: 30 * 60 * 1000 },
  { slot: 1, label: "Lunch", durationMs: 60 * 60 * 1000 },
  { slot: 2, label: "Tea",   durationMs: 30 * 60 * 1000 },
] as const;

function fmtCountdown(ms: number): string {
  if (ms <= 0) return "Done";
  const m = Math.floor(ms / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

const SITE_STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  pending:          { label: "Pending",          color: "text-slate-600",  bg: "bg-slate-100 border-slate-200 dark:bg-slate-800/40 dark:border-slate-700" },
  in_progress:      { label: "In Progress",      color: "text-amber-700",  bg: "bg-amber-50 border-amber-200 dark:bg-amber-950/30 dark:border-amber-900"   },
  completed:        { label: "Completed",        color: "text-emerald-700",bg: "bg-emerald-50 border-emerald-200 dark:bg-emerald-950/30 dark:border-emerald-900" },
  skipped:          { label: "Skipped",          color: "text-red-600",    bg: "bg-red-50 border-red-200 dark:bg-red-950/30 dark:border-red-900"           },
};

// ── Office stop card (start / end) ────────────────────────────────────────────
function OfficeStop({
  label, office, editing, offices, onEdit, onSelect, onCancel,
}: {
  label: "Start" | "End";
  office: { id: string; name: string; lat: number; lng: number } | undefined;
  editing: boolean;
  offices: { id: string; name: string; lat: number; lng: number }[];
  onEdit: () => void;
  onSelect: (id: string) => void;
  onCancel: () => void;
}) {
  const isStart = label === "Start";
  return (
    <div className={cn(
      "flex items-center gap-3 px-3 py-2.5 rounded-xl border-2 border-dashed",
      isStart ? "border-blue-300/60 bg-blue-50/50 dark:bg-blue-950/20" : "border-emerald-300/60 bg-emerald-50/50 dark:bg-emerald-950/20"
    )}>
      <div className={cn(
        "h-8 w-8 rounded-full border-2 flex items-center justify-center shrink-0 font-black text-xs",
        isStart ? "bg-blue-600 border-blue-700 text-white" : "bg-emerald-600 border-emerald-700 text-white"
      )}>
        {isStart ? "S" : "E"}
      </div>
      {editing ? (
        <div className="flex-1 flex items-center gap-2">
          <select
            autoFocus
            defaultValue={office?.id || ""}
            onChange={e => onSelect(e.target.value)}
            className="flex-1 h-8 rounded-md border border-input bg-background px-2 text-sm font-semibold"
          >
            {offices.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
          <button onClick={onCancel} className="text-[10px] text-muted-foreground hover:text-foreground font-bold shrink-0">Cancel</button>
        </div>
      ) : (
        <>
          <div className="flex-1 min-w-0">
            <p className={cn("text-[9px] font-black uppercase tracking-wider", isStart ? "text-blue-600" : "text-emerald-600")}>{label}</p>
            <p className="text-sm font-bold truncate">{office?.name || "—"}</p>
          </div>
          <button onClick={onEdit} className="shrink-0 h-6 w-6 flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-muted">
            <Pencil className="h-3 w-3" />
          </button>
        </>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
export default function ServiceRoutePage() {
  const { id } = useParams() as { id: string };
  const router  = useRouter();
  const { user } = useAuth();
  const { toast } = useToast();

  const [plan,        setPlan]        = useState<any>(null);
  const [loading,     setLoading]     = useState(true);
  const [engineers,   setEngineers]   = useState<AppUser[]>([]);
  const [checklists,  setChecklists]  = useState<Record<string, ServiceChecklist>>({});
  const [expandedSite, setExpandedSite] = useState<string | null>(null);
  const [submitting,   setSubmitting]  = useState<string | null>(null);

  // Draft checklist state
  const [draftEngineer, setDraftEngineer] = useState("");
  const [draftNotes,    setDraftNotes]    = useState("");
  const [siteOpenedAt,  setSiteOpenedAt]  = useState<Record<string, string>>({});

  // Route change UI
  const [showChangeLog,  setShowChangeLog]  = useState(false);
  const [showSkipForm,   setShowSkipForm]   = useState<string | null>(null);
  const [skipReason,     setSkipReason]     = useState("");
  const [rejectingFor,   setRejectingFor]   = useState<string | null>(null); // projectNo currently being rejected
  const [rejectFeedback, setRejectFeedback] = useState("");

  // Live clock for countdown display
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // Offices (loaded from localStorage settings)
  const [offices, setOffices] = useState<{ id: string; name: string; lat: number; lng: number }[]>([
    { id: "colombo", name: "Colombo Office", lat: 6.864488, lng: 80.009497 },
    { id: "matara",  name: "Charlie Mount Industrial Zone",  lat: 5.996394, lng: 80.461759 },
  ]);
  const [editingOffice, setEditingOffice] = useState<"start" | "end" | null>(null);

  // ── Load offices from localStorage ──
  useEffect(() => {
    try {
      const saved = localStorage.getItem("serviceOffices");
      if (saved) {
        let parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          let migrated = false;
          parsed = parsed.map(o => {
            if (o.id === "matara" && (o.name !== "Charlie Mount Industrial Zone" || o.lat !== 5.996394 || o.lng !== 80.461759)) {
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
      }
    } catch {}
  }, []);

  // ── Load data ──
  useEffect(() => {
    if (!id) return;
    const unsubPlan = onSnapshot(doc(db, "servicePlans", id), snap => {
      if (snap.exists()) setPlan({ id: snap.id, ...snap.data() });
      setLoading(false);
    });
    getDocs(query(collection(db, "users"), where("role", "in", ["engineer", "site_engineer"])))
      .then(snap => setEngineers(snap.docs.map(d => ({ uid: d.id, ...d.data() } as AppUser))));
    const unsubCL = onSnapshot(query(collection(db, "service_checklists"), where("planId", "==", id)), snap => {
      const map: Record<string, ServiceChecklist> = {};
      snap.docs.forEach(d => { const data = d.data() as ServiceChecklist; map[data.projectNo] = data; });
      setChecklists(map);
    });
    return () => { unsubPlan(); unsubCL(); };
  }, [id]);

  // ── Resolve start/end office from plan or auto-compute ──
  const startOffice = offices.find(o => o.id === (plan?.startOfficeId || plan?.officeId)) || offices[0];
  const endOffice = (() => {
    if (plan?.endOfficeId) return offices.find(o => o.id === plan.endOfficeId) || offices[0];
    const sorted = [...(plan?.sites || [])].sort((a: any, b: any) => (a.routeOrder||0)-(b.routeOrder||0));
    const last = sorted[sorted.length - 1];
    if (!last?.lat || !last?.lng || offices.length === 0) return offices[0];
    return offices.reduce((best, o) => haversine(last.lat, last.lng, o.lat, o.lng) < haversine(last.lat, last.lng, best.lat, best.lng) ? o : best);
  })();

  // ── Update start/end office in Firestore ──
  const updateOffice = async (type: "start" | "end", officeId: string) => {
    const field = type === "start" ? "startOfficeId" : "endOfficeId";
    await updateDoc(doc(db, "servicePlans", id), { [field]: officeId, updatedAt: serverTimestamp() });
    setEditingOffice(null);
  };

  // ── GPS route URL from site coords ──
  const buildRouteUrl = useCallback(() => {
    if (!plan || !startOffice) return "";
    const sites = (plan.sites || []).filter((s: any) => s.lat && s.lng && s.siteStatus !== "skipped");
    if (!sites.length) return plan.routeUrl || "";
    const stops = sites
      .sort((a: any, b: any) => (a.routeOrder || 0) - (b.routeOrder || 0))
      .map((s: any) => `${s.lat},${s.lng}`);
    const segments = [
      `${startOffice.lat},${startOffice.lng}`,
      ...stops,
      endOffice ? `${endOffice.lat},${endOffice.lng}` : "",
    ].filter(Boolean);
    const [origin, ...rest] = segments;
    const destination = rest.length > 0 ? rest[rest.length - 1] : origin;
    const waypoints = rest.length > 1 ? rest.slice(0, -1) : [];
    const params = new URLSearchParams({ api: "1", origin, destination, travelmode: "driving" });
    if (waypoints.length > 0) params.set("waypoints", waypoints.join("|"));
    return `https://www.google.com/maps/dir/?${params.toString()}`;
  }, [plan, startOffice, endOffice]);

  // ── Update site status in plan doc ──
  const updateSiteStatus = async (projectNo: string, siteStatus: string, changeNote?: string) => {
    if (!plan) return;
    const updatedSites = (plan.sites || []).map((s: any) =>
      s.projectNo === projectNo ? { ...s, siteStatus, updatedAt: new Date().toISOString() } : s
    );
    const changeEntry = {
      type: "status_change",
      projectNo,
      from: (plan.sites || []).find((s: any) => s.projectNo === projectNo)?.siteStatus || "pending",
      to: siteStatus,
      note: changeNote || "",
      by: user?.displayName || user?.email || "Unknown",
      at: new Date().toISOString(),
    };
    await updateDoc(doc(db, "servicePlans", id), {
      sites: updatedSites,
      routeChanges: arrayUnion(changeEntry),
      updatedAt: serverTimestamp(),
    });
  };

  // ── Reorder sites ──
  const moveSite = async (idx: number, dir: "up" | "down") => {
    if (!plan) return;
    const sites = [...(plan.sites || [])].sort((a: any, b: any) => (a.routeOrder||0) - (b.routeOrder||0));
    const swapIdx = dir === "up" ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= sites.length) return;
    const newSites = sites.map((s, i) => {
      if (i === idx) return { ...s, routeOrder: sites[swapIdx].routeOrder };
      if (i === swapIdx) return { ...s, routeOrder: sites[idx].routeOrder };
      return s;
    });
    const changeEntry = {
      type: "reorder",
      description: `Moved #${sites[idx].projectNo} ${dir}`,
      by: user?.displayName || user?.email || "Unknown",
      at: new Date().toISOString(),
    };
    await updateDoc(doc(db, "servicePlans", id), {
      sites: newSites,
      routeChanges: arrayUnion(changeEntry),
      updatedAt: serverTimestamp(),
    });
  };

  // ── Checklist helpers ──
  const initDraft = (projectNo: string) => {
    const existing = checklists[projectNo];
    setDraftEngineer(existing?.approvedBy || "");
    setDraftNotes(existing?.teamNotes || "");
  };

  const toggleSiteExpand = (projectNo: string) => {
    if (expandedSite === projectNo) { setExpandedSite(null); return; }
    initDraft(projectNo);
    setExpandedSite(projectNo);
    const now = new Date().toISOString();
    setSiteOpenedAt(prev => ({ ...prev, [projectNo]: prev[projectNo] || now }));
    // Auto-mark as in_progress when opened
    const site = (plan?.sites || []).find((s: any) => s.projectNo === projectNo);
    if (site?.siteStatus === "pending") updateSiteStatus(projectNo, "in_progress");
    // Persist siteStartedAt only once
    const cl = checklists[projectNo];
    if (!cl?.siteStartedAt) {
      const checklistId = `${id}_${projectNo}`;
      setDoc(doc(db, "service_checklists", checklistId), {
        id: checklistId, planId: id, projectNo, siteStartedAt: now,
      }, { merge: true }).catch(() => {});
    }
  };

  const submitChecklist = async (projectNo: string, selfApprove = false) => {
    if (!selfApprove && !draftEngineer) { toast({ title: "Select a site engineer", variant: "destructive" }); return; }
    setSubmitting(projectNo);
    try {
      const checklistId = `${id}_${projectNo}`;
      const isEngineer = user?.role === "engineer" || user?.role === "site_engineer";
      const now = new Date().toISOString();
      const startedAt = checklists[projectNo]?.siteStartedAt || siteOpenedAt[projectNo];
      const payload: Partial<ServiceChecklist> & Record<string, any> = {
        id: checklistId, planId: id, projectNo,
        teamNotes: draftNotes,
        status: (selfApprove || isEngineer) ? "approved" : "pending_approval",
        submittedBy: user?.uid || "",
        submittedByName: user?.displayName || user?.email || "",
        submittedAt: now,
        siteCompletedAt: now,
        siteDurationMs: startedAt ? netDurationMs(startedAt, now) : undefined,
        approvedBy: selfApprove || isEngineer ? (user?.uid || "") : draftEngineer,
        approvedByName: selfApprove || isEngineer ? (user?.displayName || user?.email || "") : (engineers.find(e => e.uid === draftEngineer)?.displayName || ""),
        ...(selfApprove || isEngineer ? { approvedAt: now } : {}),
        updatedAt: serverTimestamp(),
      };
      await setDoc(doc(db, "service_checklists", checklistId), payload, { merge: true });
      if (selfApprove || isEngineer) {
        await updateSiteStatus(projectNo, "completed", "Checklist approved");
      }
      toast({ title: "Checklist submitted" });
      setExpandedSite(null);
    } catch (err: any) {
      toast({ title: "Failed", description: err.message, variant: "destructive" });
    } finally { setSubmitting(null); }
  };

  const handleEngineerApproval = async (projectNo: string, approve: boolean, feedback = "") => {
    setSubmitting(projectNo);
    try {
      const checklistId = `${id}_${projectNo}`;
      await setDoc(doc(db, "service_checklists", checklistId), {
        status: approve ? "approved" : "rejected",
        approvedAt: new Date().toISOString(),
        approvedBy: user?.uid || "",
        approvedByName: user?.displayName || user?.email || "",
        engineerFeedback: feedback || (approve ? "Approved" : "Needs rework"),
        updatedAt: serverTimestamp(),
      }, { merge: true });
      if (approve) await updateSiteStatus(projectNo, "completed", "Approved by engineer");
      else await updateSiteStatus(projectNo, "pending", "Checklist rejected — needs rework");
      toast({ title: approve ? "Checklist approved" : "Checklist rejected" });
      setExpandedSite(null);
    } catch (err: any) {
      toast({ title: "Failed", description: err.message, variant: "destructive" });
    } finally { setSubmitting(null); }
  };

  // ── Skip site ──
  const handleSkipSite = async (projectNo: string) => {
    await updateSiteStatus(projectNo, "skipped", skipReason || "Skipped by team leader");
    setShowSkipForm(null); setSkipReason("");
    toast({ title: `Site #${projectNo} skipped`, description: "Will be recommended for next plan" });
  };

  // ── Day break: start one of the 3 fixed intervals ──
  const startBreak = async (slot: number) => {
    const existing: (string | null)[] = plan?.dayBreaks || [null, null, null];
    const updated = [...existing];
    while (updated.length < 3) updated.push(null);
    if (updated[slot]) return; // already started
    updated[slot] = new Date().toISOString();
    await updateDoc(doc(db, "servicePlans", id), {
      dayBreaks: updated,
      updatedAt: serverTimestamp(),
    });
  };

  // ── Subtract break overlap from a time window ──
  const netDurationMs = (startIso: string, endIso: string): number => {
    const start = new Date(startIso).getTime();
    const end   = new Date(endIso).getTime();
    let total   = end - start;
    const breakDurs = [30 * 60 * 1000, 60 * 60 * 1000, 30 * 60 * 1000];
    (plan?.dayBreaks || []).forEach((bs: string | null, i: number) => {
      if (!bs) return;
      const bStart = new Date(bs).getTime();
      const bEnd   = bStart + breakDurs[i];
      total -= Math.max(0, Math.min(end, bEnd) - Math.max(start, bStart));
    });
    return Math.max(0, total);
  };

  // ── Log site arrived time ──
  const logSiteArrived = async (projectNo: string) => {
    const checklistId = `${id}_${projectNo}`;
    await setDoc(doc(db, "service_checklists", checklistId), {
      id: checklistId, planId: id, projectNo,
      siteArrivedAt: new Date().toISOString(),
    }, { merge: true });
  };

  // ── Site Done: mark departed + completed + create draft service record ──
  const handleSiteDone = async (projectNo: string) => {
    try {
      const now = new Date().toISOString();
      const checklistId = `${id}_${projectNo}`;

      const checklistSnap = await getDoc(doc(db, "service_checklists", checklistId));
      const arrivedAt = checklistSnap.exists() && checklistSnap.data()?.siteArrivedAt ? checklistSnap.data().siteArrivedAt : now;

      // 1. Log departure (and arrival if they forgot to click it)
      await setDoc(doc(db, "service_checklists", checklistId), {
        id: checklistId, planId: id, projectNo,
        siteArrivedAt: arrivedAt,
        siteDepartedAt: now,
      }, { merge: true });

      // 2. Mark site completed in plan doc
      await updateSiteStatus(projectNo, "completed", "Site marked done");

      // 3. Auto-complete plan if all sites are now done/skipped
      const updatedSites = (plan?.sites || []).map((s: any) =>
        s.projectNo === projectNo ? { ...s, siteStatus: "completed" } : s
      );
      const remaining = updatedSites.filter((s: any) => s.siteStatus !== "completed" && s.siteStatus !== "skipped");
      if (remaining.length === 0 && plan?.status !== "completed") {
        await updateDoc(doc(db, "servicePlans", id), {
          status: "completed",
          serviceEndedAt: now,
          updatedAt: serverTimestamp(),
        });
      }

      // 4. Update the project's lastServiceDate so the site drops off the "due for service" map
      const site = (plan?.sites || []).find((s: any) => s.projectNo === projectNo);
      if (site?.projectId) {
        await updateDoc(doc(db, "projects", site.projectId), {
          lastServiceDate: now.split("T")[0],
        }).catch(() => {}); // non-critical — don't fail the whole action
      } else {
        // Legacy project — look up by siteNo
        const projSnap = await getDocs(query(collection(db, "projects"), where("siteNo", "==", projectNo)));
        if (!projSnap.empty) {
          await updateDoc(doc(db, "projects", projSnap.docs[0].id), {
            lastServiceDate: now.split("T")[0],
          }).catch(() => {});
        }
      }
      toast({ title: "Site Marked Done", description: "Successfully logged departure." });
    } catch (err: any) {
      console.error("Failed to mark site done:", err);
      toast({ title: "Action Failed", description: err.message, variant: "destructive" });
    }
  };

  // ── Log day-level departure / return ──
  const logDayTime = async (field: "serviceStartedAt" | "serviceEndedAt") => {
    await updateDoc(doc(db, "servicePlans", id), {
      [field]: new Date().toISOString(),
      ...(field === "serviceEndedAt" ? { status: "completed" } : { status: "in_progress" }),
      updatedAt: serverTimestamp(),
    });
  };

  if (loading) return <div className="flex justify-center p-10"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  if (!plan)   return <div className="p-10 text-center text-muted-foreground">Service plan not found.</div>;

  const sortedSites = [...(plan.sites || [])].sort((a: any, b: any) => (a.routeOrder||0) - (b.routeOrder||0));
  const totalSites  = sortedSites.length;
  const doneSites   = sortedSites.filter((s: any) => s.siteStatus === "completed").length;
  const skippedSites= sortedSites.filter((s: any) => s.siteStatus === "skipped").length;
  const allDone     = totalSites > 0 && doneSites + skippedSites === totalSites;

  const isEngineer = user?.role === "engineer" || user?.role === "site_engineer";
  const isAdmin    = !!user?.role && ["superadmin", "admin", "authorized"].includes(user.role);
  const routeUrl   = buildRouteUrl();

  return (
    <div className="px-3 py-4 sm:px-5 md:px-6 md:py-6 max-w-4xl mx-auto space-y-4 pb-28">

      {/* ── Header ── */}
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" onClick={() => router.push("/services")} className="shrink-0 h-9 w-9">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1 min-w-0">
          <h1 className="text-base sm:text-lg font-black truncate">{plan.planNo}</h1>
          <p className="text-[10px] sm:text-xs text-muted-foreground">{plan.date} · {plan.team}</p>
        </div>
        <Badge className={cn("text-[10px] font-black uppercase shrink-0", plan.status === "completed" ? "bg-emerald-100 text-emerald-700 border-emerald-200" : plan.status === "in_progress" ? "bg-amber-100 text-amber-700 border-amber-200" : "bg-blue-100 text-blue-700 border-blue-200")}>
          {plan.status?.replace("_", " ")}
        </Badge>
        <Link href="/services/kpi" className="shrink-0">
          <Button variant="outline" size="sm" className="gap-1 h-8 text-[10px] sm:text-[11px] font-bold px-2 sm:px-3">
            <Clock className="h-3.5 w-3.5" /> <span className="hidden sm:inline">KPIs</span>
          </Button>
        </Link>
      </div>

      {/* ── Progress ── */}
      <div className="rounded-xl border bg-card p-4 space-y-2">
        <div className="flex justify-between text-sm">
          <span className="font-bold">{doneSites} of {totalSites} sites completed</span>
          <span className="text-muted-foreground">{skippedSites > 0 ? `${skippedSites} skipped` : ""}</span>
        </div>
        <div className="h-2 bg-muted rounded-full overflow-hidden">
          <div className="h-full bg-emerald-500 rounded-full transition-all duration-500" style={{ width: `${totalSites > 0 ? (doneSites/totalSites)*100 : 0}%` }} />
        </div>
        {plan.teamLeader && (
          <p className="text-xs text-muted-foreground">
            <span className="font-bold">Leader:</span> {plan.teamLeader}
            {plan.members?.length > 0 && ` · ${plan.members.join(", ")}`}
          </p>
        )}
        {plan.notes?.trim() && (
          <div className="mt-3 p-3 bg-amber-500/10 border border-amber-500/20 text-amber-800 dark:text-amber-300 rounded-lg text-xs leading-relaxed">
            <span className="font-semibold flex items-center gap-1.5 mb-1 text-amber-900 dark:text-amber-200">
              📝 Dispatch Notes:
            </span>
            {plan.notes}
          </div>
        )}
      </div>

      {/* ── Route map ── */}
      <div className="rounded-xl overflow-hidden border border-border/50 shadow-sm" style={{ height: 260 }}>
        <RouteMap
          startOffice={startOffice}
          endOffice={endOffice}
          sites={sortedSites.filter((s: any) => s.lat && s.lng)}
        />
      </div>

      {/* ── Route button ── */}
      {routeUrl && (
        <Button onClick={() => window.open(routeUrl, "_blank", "noopener,noreferrer")}
          className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold h-11 gap-2 shadow">
          <Navigation className="h-4 w-4" /> Open Route in Google Maps
        </Button>
      )}

      {/* ── Day Breaks ── */}
      <div className="rounded-xl border bg-card overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border/40 bg-muted/20">
          <Coffee className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-[11px] font-black uppercase tracking-widest text-muted-foreground">Day Breaks</span>
          <span className="text-[10px] text-muted-foreground/50 font-medium">— fixed durations, cannot be changed once started</span>
        </div>
        {(() => {
          const brkStarts: (string | null)[] = plan?.dayBreaks || [null, null, null];

          // Is any break currently counting down?
          const anyActive = DAY_BREAKS.some(b => {
            const s = brkStarts[b.slot] ?? null;
            return s !== null && now < new Date(s).getTime() + b.durationMs;
          });

          // When did the most-recently completed break end?
          const lastDoneEndMs = DAY_BREAKS.reduce<number | null>((acc, b) => {
            const s = brkStarts[b.slot] ?? null;
            if (!s) return acc;
            const endMs = new Date(s).getTime() + b.durationMs;
            if (now < endMs) return acc; // still active
            return acc === null ? endMs : Math.max(acc, endMs);
          }, null);

          const TWO_HOURS = 2 * 60 * 60 * 1000;
          const cooldownMs = lastDoneEndMs !== null ? Math.max(0, lastDoneEndMs + TWO_HOURS - now) : 0;
          const inCooldown = cooldownMs > 0;
          const coolH = Math.floor(cooldownMs / 3600000);
          const coolM = Math.ceil((cooldownMs % 3600000) / 60000);
          const coolLabel = coolH > 0 ? `${coolH}h ${coolM}m` : `${coolM}m`;

          return (
            <div className="grid grid-cols-3 divide-x divide-border/40">
              {DAY_BREAKS.map(brk => {
                const startedAt: string | null = brkStarts[brk.slot] ?? null;
                const startMs = startedAt ? new Date(startedAt).getTime() : null;
                const endMs   = startMs ? startMs + brk.durationMs : null;
                const remaining = endMs ? Math.max(0, endMs - now) : null;
                const isActive  = remaining !== null && remaining > 0;
                const isDone    = remaining !== null && remaining <= 0;

                const blocked = !startedAt && (anyActive || inCooldown);
                const blockReason = anyActive ? "Break running" : `Wait ${coolLabel}`;

                return (
                  <div key={brk.slot} className={`p-3 flex flex-col items-center gap-1 text-center ${isActive ? "bg-amber-50/60 dark:bg-amber-950/20" : isDone ? "bg-emerald-50/60 dark:bg-emerald-950/20" : ""}`}>
                    <span className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">{brk.label}</span>
                    <span className="text-[10px] font-bold text-muted-foreground/60">{brk.durationMs / 60000}m</span>
                    {!startedAt && !blocked && (
                      <button
                        onClick={() => startBreak(brk.slot)}
                        className="mt-1 w-full text-[10px] font-black bg-primary text-primary-foreground px-2 py-1.5 rounded-lg hover:bg-primary/90 transition-colors flex items-center justify-center gap-1"
                      >
                        <Timer className="h-3 w-3" /> Start
                      </button>
                    )}
                    {!startedAt && blocked && (
                      <div className="mt-1 w-full px-2 py-1.5 rounded-lg bg-muted/60 flex flex-col items-center gap-0.5 opacity-60">
                        <span className="text-[9px] font-bold text-muted-foreground leading-none">{blockReason}</span>
                      </div>
                    )}
                    {startedAt && (
                      <div className="mt-1 space-y-0.5">
                        <p className="text-[9px] text-muted-foreground font-medium">
                          {new Date(startedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        </p>
                        {isActive && (
                          <p className="text-sm font-black text-amber-700 dark:text-amber-400 font-mono">
                            {fmtCountdown(remaining!)}
                          </p>
                        )}
                        {isDone && (
                          <p className="text-xs font-black text-emerald-600">
                            Done ✓
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })()}
      </div>

      {/* ── Sites list ── */}
      <div className="space-y-3">
        {/* ── Depart from office ── */}
        {!plan.serviceStartedAt ? (
          <button
            onClick={() => logDayTime("serviceStartedAt")}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border-2 border-blue-300 bg-blue-50 dark:bg-blue-950/20 text-blue-700 text-sm font-black hover:bg-blue-100 dark:hover:bg-blue-950/30 transition-colors"
          >
            <Truck className="h-4 w-4" /> Departed from Office
          </button>
        ) : (
          <div className="flex items-center gap-3 px-4 py-2.5 rounded-xl border border-blue-200 dark:border-blue-900/50 bg-blue-50/50 dark:bg-blue-950/20">
            <Truck className="h-4 w-4 text-blue-500 shrink-0" />
            <div className="flex-1">
              <span className="text-[9px] font-black uppercase tracking-widest text-blue-600">Departed Office</span>
              <span className="ml-2 text-sm font-black text-blue-700 dark:text-blue-400 font-mono">
                {new Date(plan.serviceStartedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </span>
            </div>
            {plan.serviceEndedAt && (() => {
              const ms = new Date(plan.serviceEndedAt).getTime() - new Date(plan.serviceStartedAt).getTime();
              const h = Math.floor(ms / 3600000);
              const m = Math.floor((ms % 3600000) / 60000);
              return <span className="text-[9px] font-bold text-blue-600/70">{h}h {m}m total day</span>;
            })()}
          </div>
        )}

        <div className="flex items-center justify-between">
          <h2 className="text-[11px] font-black uppercase tracking-widest text-muted-foreground">
            Sites ({totalSites})
          </h2>
          {(plan.routeChanges?.length || 0) > 0 && (
            <button onClick={() => setShowChangeLog(v => !v)}
              className="flex items-center gap-1 text-[10px] font-bold text-muted-foreground hover:text-foreground">
              <History className="h-3 w-3" /> Change Log ({plan.routeChanges.length})
            </button>
          )}
        </div>

        {/* Start office */}
        <OfficeStop
          label="Start"
          office={startOffice}
          editing={editingOffice === "start"}
          offices={offices}
          onEdit={() => setEditingOffice(editingOffice === "start" ? null : "start")}
          onSelect={officeId => updateOffice("start", officeId)}
          onCancel={() => setEditingOffice(null)}
        />

        {sortedSites.map((site: any, idx: number) => {
          const cl       = checklists[site.projectNo];
          const isExpanded = expandedSite === site.projectNo;
          const statusCfg  = SITE_STATUS_CONFIG[site.siteStatus || "pending"];
          const displayLabel = cl?.status === "pending_approval" ? "Waiting Approval" : statusCfg.label;
          const checklistReady = !!cl?.checklistV2;

          return (
            <Card key={site.projectNo} className={cn("overflow-hidden transition-all", isExpanded ? "border-primary shadow-md" : `border ${statusCfg.bg}`)}>
              {/* Site header row */}
              <div className="flex items-center gap-1 px-3 py-2.5">
                {/* Order + reorder arrows */}
                <div className="flex flex-col items-center shrink-0 mr-1">
                  <button onClick={() => moveSite(idx, "up")} disabled={idx === 0}
                    className="h-7 w-7 flex items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground active:bg-muted/80 disabled:opacity-20 transition-colors">
                    <ArrowUp className="h-4 w-4" />
                  </button>
                  <span className="text-[11px] font-black text-muted-foreground leading-none py-0.5">{idx + 1}</span>
                  <button onClick={() => moveSite(idx, "down")} disabled={idx === sortedSites.length - 1}
                    className="h-7 w-7 flex items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground active:bg-muted/80 disabled:opacity-20 transition-colors">
                    <ArrowDown className="h-4 w-4" />
                  </button>
                </div>

                <button onClick={() => toggleSiteExpand(site.projectNo)} className="flex-1 text-left min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-black text-sm">#{site.projectNo}</span>
                    <span className={cn("text-[9px] font-black uppercase px-1.5 py-0.5 rounded-full border", statusCfg.bg, statusCfg.color)}>
                      {displayLabel}
                    </span>
                    {cl?.status && (
                      <span className={cn("text-[9px] font-bold px-1 py-0.5 rounded border",
                        cl.status === "approved"         ? "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-400 dark:border-emerald-900/40" :
                        cl.status === "pending_approval" ? "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:text-amber-400 dark:border-amber-900/40" :
                                                           "bg-red-50 text-red-700 border-red-200 dark:bg-red-950/30 dark:text-red-400 dark:border-red-900/40"
                      )}>
                        {cl.status === "approved" ? "✓ checklist" : cl.status === "pending_approval" ? "⏳ approval" : "✗ rejected"}
                      </span>
                    )}
                  </div>
                  <p className="text-sm font-semibold truncate mt-0.5">{site.customerName}</p>
                  <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                    {site.address && (
                      <p className="text-[10px] text-muted-foreground truncate flex items-center gap-1">
                        <MapPin className="h-2.5 w-2.5 shrink-0" /> {site.address}
                      </p>
                    )}
                    {cl?.siteArrivedAt && (
                      <span className="text-[9px] font-bold text-blue-600 flex items-center gap-0.5 shrink-0">
                        <LogIn className="h-2.5 w-2.5" /> {new Date(cl.siteArrivedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </span>
                    )}
                    {cl?.siteDepartedAt && (
                      <span className="text-[9px] font-bold text-emerald-600 flex items-center gap-0.5 shrink-0">
                        <LogOut className="h-2.5 w-2.5" /> {new Date(cl.siteDepartedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </span>
                    )}
                  </div>
                </button>

                <div className="flex items-center gap-1 shrink-0">
                  {/* Quick arrive / site-done buttons */}
                  {!cl?.siteArrivedAt && site.siteStatus !== "completed" && site.siteStatus !== "skipped" && (
                    <button
                      onClick={e => { e.stopPropagation(); logSiteArrived(site.projectNo); }}
                      title="Mark arrived at site"
                      className="h-6 px-1.5 flex items-center justify-center gap-1 bg-blue-600 text-white rounded hover:bg-blue-700 text-[9px] font-black shrink-0"
                    >
                      <LogIn className="h-3 w-3" />
                    </button>
                  )}
                  {cl?.siteArrivedAt && !cl?.siteDepartedAt && site.siteStatus !== "completed" && (
                    <button
                      onClick={e => { e.stopPropagation(); handleSiteDone(site.projectNo); }}
                      title="Mark site done"
                      className="h-6 px-1.5 flex items-center justify-center gap-1 bg-emerald-600 text-white rounded hover:bg-emerald-700 text-[9px] font-black shrink-0"
                    >
                      <LogOut className="h-3 w-3" />
                    </button>
                  )}
                  {/* Quick approve — one tap for engineers/admins */}
                  {cl?.status === "pending_approval" && (isEngineer || isAdmin) && (
                    <button
                      onClick={e => { e.stopPropagation(); handleEngineerApproval(site.projectNo, true); }}
                      disabled={!!submitting}
                      title="Approve checklist"
                      className="h-6 w-6 flex items-center justify-center bg-emerald-600 text-white rounded hover:bg-emerald-700 shrink-0"
                    >
                      {submitting === site.projectNo
                        ? <Loader2 className="h-3 w-3 animate-spin" />
                        : <Check className="h-3 w-3" />}
                    </button>
                  )}
                  {site.lat && site.lng && (
                    <a href={`https://www.google.com/maps/search/?api=1&query=${site.lat},${site.lng}`}
                      target="_blank" rel="noopener noreferrer"
                      onClick={e => e.stopPropagation()}
                      className="h-6 w-6 flex items-center justify-center text-sky-600 hover:bg-sky-50 rounded">
                      <MapPin className="h-3.5 w-3.5" />
                    </a>
                  )}
                  {site.siteStatus !== "completed" && site.siteStatus !== "skipped" && (
                    <button onClick={e => { e.stopPropagation(); setShowSkipForm(site.projectNo); }}
                      className="h-6 w-6 flex items-center justify-center text-muted-foreground hover:text-amber-600 hover:bg-amber-50 rounded"
                      title="Skip this site">
                      <SkipForward className="h-3.5 w-3.5" />
                    </button>
                  )}
                  {site.siteStatus === "skipped" && (
                    <button onClick={() => updateSiteStatus(site.projectNo, "pending", "Restored from skip")}
                      className="h-6 w-6 flex items-center justify-center text-muted-foreground hover:text-primary hover:bg-primary/10 rounded"
                      title="Restore site">
                      <RotateCcw className="h-3.5 w-3.5" />
                    </button>
                  )}
                  <button onClick={() => toggleSiteExpand(site.projectNo)} className="h-6 w-6 flex items-center justify-center text-muted-foreground">
                    {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              {/* Skip form */}
              {showSkipForm === site.projectNo && (
                <div className="px-4 py-3 bg-amber-50 dark:bg-amber-950/20 border-t border-amber-200 space-y-2">
                  <p className="text-xs font-bold text-amber-700">Skip this site?</p>
                  <Input
                    value={skipReason}
                    onChange={e => setSkipReason(e.target.value)}
                    placeholder="Reason (customer unavailable, access denied…)"
                    className="h-8 text-xs"
                  />
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" className="flex-1 text-xs h-7"
                      onClick={() => { setShowSkipForm(null); setSkipReason(""); }}>Cancel</Button>
                    <Button size="sm" className="flex-1 text-xs h-7 bg-amber-600 hover:bg-amber-700 text-white"
                      onClick={() => handleSkipSite(site.projectNo)}>
                      <SkipForward className="h-3 w-3 mr-1" /> Skip & defer
                    </Button>
                  </div>
                </div>
              )}

              {/* Expanded checklist panel */}
              {isExpanded && (
                <div className="border-t border-border/50 bg-muted/5">
                  <div className="p-4 space-y-4">

                    {/* ── Arrived (top) ── */}
                    {!cl?.siteArrivedAt ? (
                      <button
                        onClick={() => logSiteArrived(site.projectNo)}
                        className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border-2 border-blue-300 bg-blue-50 dark:bg-blue-950/20 text-blue-700 text-xs font-black hover:bg-blue-100 transition-colors"
                      >
                        <LogIn className="h-4 w-4" /> Arrived
                      </button>
                    ) : (
                      <div className="flex items-center gap-3 px-4 py-2 rounded-xl border border-blue-200 bg-blue-50/50 dark:bg-blue-950/20">
                        <LogIn className="h-4 w-4 text-blue-500 shrink-0" />
                        <div className="flex-1">
                          <span className="text-[9px] font-black uppercase tracking-widest text-blue-600">Arrived</span>
                          <span className="ml-2 text-sm font-black text-blue-700 font-mono">
                            {new Date(cl.siteArrivedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                          </span>
                        </div>
                      </div>
                    )}

                    {/* V2 Checklist */}
                    <SiteChecklist
                      checklistId={`${id}_${site.projectNo}`}
                      planId={id}
                      projectNo={site.projectNo}
                      projectName={site.customerName || ""}
                      planNo={plan.planNo || ""}
                      serviceDate={plan.date || ""}
                      uploaderName={user?.displayName || ""}
                      uploadedBy={user?.uid || ""}
                      locked={cl?.status === "approved"}
                      readOnly={user?.role === "technician"}
                      siteNote={site.note || ""}
                      initialState={cl?.checklistV2 ?? {
                        systemType: site.systemType || "ongrid",
                        serviceScope: site.serviceScope || "full",
                        siteCategory: site.siteCategory || "standard",
                      }}
                    />

                    {/* ── Site Done (bottom) ── */}
                    {!cl?.siteDepartedAt ? (
                      <button
                        onClick={() => handleSiteDone(site.projectNo)}
                        className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border-2 border-emerald-300 bg-emerald-50 dark:bg-emerald-950/20 text-emerald-700 text-xs font-black hover:bg-emerald-100 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        <LogOut className="h-4 w-4" /> Site Done
                      </button>
                    ) : (
                      <div className="flex items-center gap-3 px-4 py-2 rounded-xl border border-emerald-200 bg-emerald-50/50 dark:bg-emerald-950/20">
                        <LogOut className="h-4 w-4 text-emerald-500 shrink-0" />
                        <div className="flex-1">
                          <span className="text-[9px] font-black uppercase tracking-widest text-emerald-600">Site Done</span>
                          <span className="ml-2 text-sm font-black text-emerald-700 font-mono">
                            {new Date(cl.siteDepartedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                          </span>
                          {cl.siteArrivedAt && (() => {
                            const ms = new Date(cl.siteDepartedAt).getTime() - new Date(cl.siteArrivedAt).getTime();
                            const h = Math.floor(ms / 3600000);
                            const m = Math.floor((ms % 3600000) / 60000);
                            return <span className="ml-2 text-[9px] text-emerald-600/70 font-bold">{h > 0 ? `${h}h ${m}m` : `${m}m`} at site</span>;
                          })()}
                        </div>
                      </div>
                    )}

                    {/* Team notes */}
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-muted-foreground flex items-center gap-1.5">
                        <MessageSquare className="h-3.5 w-3.5" /> Team Notes
                      </label>
                      <Textarea value={draftNotes} onChange={e => setDraftNotes(e.target.value)}
                        placeholder="Observations, issues found, parts used…" rows={2}
                        disabled={cl?.status === "approved"} className="text-sm resize-none" />
                    </div>

                    {/* Approval section */}
                    <div className="space-y-3 pt-3 border-t border-border/50">
                      <h3 className="text-xs font-black uppercase text-muted-foreground flex items-center gap-1.5">
                        <ShieldCheck className="h-3.5 w-3.5" /> Approval
                      </h3>

                      {/* Approved state */}
                      {cl?.status === "approved" && (
                        <div className="p-3 bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900/40 rounded-lg flex items-center gap-2">
                          <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                          <div>
                            <p className="text-xs font-bold text-emerald-700">Approved</p>
                            <p className="text-[10px] text-muted-foreground">{cl.approvedByName || cl.approvedBy} · {cl.approvedAt ? new Date(cl.approvedAt).toLocaleDateString() : ""}</p>
                          </div>
                        </div>
                      )}

                      {/* Pending approval — engineer OR admin can approve/reject */}
                      {cl?.status === "pending_approval" && (isEngineer || isAdmin) && (
                        <div className="space-y-2">
                          <div className="p-2 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 rounded-lg">
                            <p className="text-xs font-bold text-amber-700 flex items-center gap-1">
                              <Clock className="h-3.5 w-3.5" /> Submitted by {cl.submittedByName || "team leader"} — pending approval
                            </p>
                          </div>
                          {rejectingFor === site.projectNo ? (
                            <div className="space-y-2">
                              <textarea
                                value={rejectFeedback}
                                onChange={e => setRejectFeedback(e.target.value)}
                                placeholder="Reason for rejection (required)…"
                                rows={2}
                                className="w-full rounded-md border border-red-300 bg-background px-3 py-2 text-xs resize-none focus:outline-none focus:ring-2 focus:ring-red-400"
                              />
                              <div className="flex gap-2">
                                <Button size="sm" variant="outline" className="flex-1 text-xs h-8"
                                  onClick={() => { setRejectingFor(null); setRejectFeedback(""); }}>
                                  Cancel
                                </Button>
                                <Button size="sm" variant="outline"
                                  className="flex-1 text-red-600 border-red-200 hover:bg-red-50 text-xs h-8"
                                  disabled={!!submitting || !rejectFeedback.trim()}
                                  onClick={() => { handleEngineerApproval(site.projectNo, false, rejectFeedback.trim()); setRejectingFor(null); setRejectFeedback(""); }}>
                                  {submitting === site.projectNo ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                                  Confirm Reject
                                </Button>
                              </div>
                            </div>
                          ) : (
                            <div className="flex gap-2">
                              <Button size="sm" variant="outline"
                                className="flex-1 text-red-600 border-red-200 hover:bg-red-50 text-xs h-8"
                                disabled={!!submitting}
                                onClick={() => setRejectingFor(site.projectNo)}>
                                Reject
                              </Button>
                              <Button size="sm"
                                className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white text-xs h-8 gap-1"
                                disabled={!!submitting}
                                onClick={() => handleEngineerApproval(site.projectNo, true)}>
                                {submitting === site.projectNo ? <Loader2 className="h-3 w-3 animate-spin" /> : <ShieldCheck className="h-3 w-3" />}
                                Approve
                              </Button>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Pending approval — non-engineer, non-admin just sees status */}
                      {cl?.status === "pending_approval" && !isEngineer && !isAdmin && (
                        <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-center">
                          <p className="text-xs font-bold text-amber-700">Waiting for engineer approval</p>
                        </div>
                      )}

                      {/* Rejected — admin can override-approve directly */}
                      {cl?.status === "rejected" && isAdmin && (
                        <div className="space-y-2">
                          <div className="p-2 bg-red-50 border border-red-200 rounded-lg">
                            <p className="text-xs font-bold text-red-700">Rejected</p>
                            {cl.engineerFeedback && <p className="text-[10px] text-red-600 mt-0.5">{cl.engineerFeedback}</p>}
                          </div>
                          <div className="flex gap-2">
                            <Button size="sm" variant="outline"
                              className="flex-1 text-amber-600 border-amber-200 hover:bg-amber-50 text-xs h-8"
                              disabled={!!submitting}
                              onClick={async () => {
                                const checklistId = `${id}_${site.projectNo}`;
                                await setDoc(doc(db, "service_checklists", checklistId), {
                                  status: "pending_approval",
                                }, { merge: true });
                              }}>
                              Reset to Pending
                            </Button>
                            <Button size="sm"
                              className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white text-xs h-8 gap-1"
                              disabled={!!submitting}
                              onClick={() => handleEngineerApproval(site.projectNo, true)}>
                              {submitting === site.projectNo ? <Loader2 className="h-3 w-3 animate-spin" /> : <ShieldCheck className="h-3 w-3" />}
                              Override & Approve
                            </Button>
                          </div>
                        </div>
                      )}

                      {/* Not yet submitted — team leader submits to engineer */}
                      {(!cl || cl.status === "rejected") && !isEngineer && !isAdmin && (
                        <div className="space-y-2">
                          {cl?.status === "rejected" && (
                            <div className="p-2 bg-red-50 border border-red-200 rounded-lg">
                              <p className="text-xs font-bold text-red-700">Rejected — please revise and resubmit</p>
                              {cl.engineerFeedback && <p className="text-[10px] text-red-600 mt-0.5">{cl.engineerFeedback}</p>}
                            </div>
                          )}
                          <div className="space-y-1">
                            <label className="text-xs font-bold">Select Site Engineer for Approval</label>
                            <select value={draftEngineer} onChange={e => setDraftEngineer(e.target.value)}
                              className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm">
                              <option value="" disabled>— Choose Engineer —</option>
                              {engineers.map(e => (
                                <option key={e.uid} value={e.uid}>{e.displayName || e.email}</option>
                              ))}
                            </select>
                          </div>
                          <Button
                            onClick={() => submitChecklist(site.projectNo, false)}
                            disabled={!!submitting || !draftEngineer || !checklistReady}
                            className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold h-10 gap-2">
                            {submitting === site.projectNo ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                            Submit for Approval
                          </Button>
                          {!checklistReady && <p className="text-[10px] text-muted-foreground text-center">Save the checklist draft first</p>}
                        </div>
                      )}

                      {/* Engineer self-fill + approve */}
                      {(!cl || cl.status === "rejected") && isEngineer && (
                        <Button
                          onClick={() => submitChecklist(site.projectNo, true)}
                          disabled={!!submitting || !checklistReady}
                          className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold h-10 gap-2">
                          {submitting === site.projectNo ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
                          Fill & Approve (Site Engineer)
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </Card>
          );
        })}

        {/* End office */}
        <OfficeStop
          label="End"
          office={endOffice}
          editing={editingOffice === "end"}
          offices={offices}
          onEdit={() => setEditingOffice(editingOffice === "end" ? null : "end")}
          onSelect={officeId => updateOffice("end", officeId)}
          onCancel={() => setEditingOffice(null)}
        />
      </div>

      {/* ── Deferred sites ── */}
      {(plan.deferredSites?.length || 0) > 0 && (
        <div className="space-y-2">
          <h2 className="text-[11px] font-black uppercase tracking-widest text-amber-600 flex items-center gap-1.5">
            <AlertTriangle className="h-3.5 w-3.5" /> Deferred Sites ({plan.deferredSites.length})
          </h2>
          <div className="space-y-1">
            {plan.deferredSites.map((d: any) => (
              <div key={d.projectNo} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/40 text-sm">
                <AlertTriangle className="h-3.5 w-3.5 text-amber-600 shrink-0" />
                <span className="font-mono font-bold text-amber-700 shrink-0">#{d.projectNo}</span>
                <span className="text-xs text-muted-foreground truncate">{d.customerName || ""}</span>
                {d.reason && <span className="text-[10px] italic text-amber-600 truncate ml-auto shrink-0">{d.reason}</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Route change log ── */}
      {showChangeLog && (plan.routeChanges?.length || 0) > 0 && (
        <div className="space-y-2">
          <h2 className="text-[11px] font-black uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
            <History className="h-3.5 w-3.5" /> Route Change Log
          </h2>
          <div className="space-y-1 max-h-48 overflow-y-auto">
            {[...plan.routeChanges].reverse().map((c: any, i: number) => (
              <div key={i} className="px-3 py-1.5 rounded-lg bg-muted/30 border border-border/40 text-xs flex items-start gap-2">
                <CornerDownRight className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <span className="font-semibold">{c.type?.replace("_", " ")}</span>
                  {c.description && <span className="text-muted-foreground ml-1">{c.description}</span>}
                  {c.projectNo && <span className="font-mono text-primary ml-1">#{c.projectNo}</span>}
                  {c.from && c.to && <span className="text-muted-foreground ml-1">{c.from} → {c.to}</span>}
                  {c.note && <span className="italic text-muted-foreground ml-1">"{c.note}"</span>}
                </div>
                <span className="text-muted-foreground/60 shrink-0">{c.by?.split(" ")[0]} · {c.at ? new Date(c.at).toLocaleDateString() : ""}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Day timing: Return to office ── */}
      {plan.serviceStartedAt && (
        !plan.serviceEndedAt ? (
          <button
            onClick={() => logDayTime("serviceEndedAt")}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border-2 border-emerald-300 bg-emerald-50 dark:bg-emerald-950/20 text-emerald-700 text-sm font-black hover:bg-emerald-100 transition-colors"
          >
            <Home className="h-4 w-4" /> Returned to Office — End Service Day
          </button>
        ) : (
          <div className="flex items-center gap-3 px-4 py-2.5 rounded-xl border border-emerald-200 bg-emerald-50/50 dark:bg-emerald-950/20">
            <Home className="h-4 w-4 text-emerald-500 shrink-0" />
            <div className="flex-1">
              <span className="text-[9px] font-black uppercase tracking-widest text-emerald-600">Returned to Office</span>
              <span className="ml-2 text-sm font-black text-emerald-700 font-mono">
                {new Date(plan.serviceEndedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </span>
            </div>
            <span className="text-[9px] font-black px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">Service Ended</span>
          </div>
        )
      )}

      {/* ── All done: generate invoices ── */}
      {allDone && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 dark:bg-emerald-950/20 dark:border-emerald-900 p-5 space-y-3">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
            <div>
              <p className="font-bold text-emerald-700">All sites completed!</p>
              <p className="text-xs text-muted-foreground">Create service invoices for each completed site.</p>
            </div>
          </div>
          <div className="flex flex-col gap-2">
            {sortedSites.filter((s: any) => s.siteStatus === "completed").map((s: any) => (
              <Link
                key={s.projectNo}
                href={`/services/new?projectNo=${s.projectNo}&planId=${id}`}
                className="flex items-center justify-between px-3 py-2 rounded-lg bg-white dark:bg-card border border-emerald-200 hover:border-emerald-400 transition-colors group">
                <span className="text-sm font-semibold">#{s.projectNo} <span className="text-muted-foreground font-normal">{s.customerName}</span></span>
                <span className="text-[10px] font-bold text-emerald-600 group-hover:underline flex items-center gap-1">
                  <Receipt className="h-3 w-3" /> Create Invoice
                </span>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
