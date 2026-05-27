"use client";

import { useEffect, useState, useMemo } from "react";
import { collection, getDocs, query, orderBy } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/auth-context";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  ArrowLeft, BarChart3, Users, CheckCircle2, Clock,
  AlertTriangle, Loader2, Calendar, ChevronDown, ChevronUp,
  MapPin, Timer, Zap,
} from "lucide-react";

// ── constants ─────────────────────────────────────────────────────────────────
const MAX_ITEM_GAP_MS = 20 * 60 * 1000; // cap per-item delta at 20 min (excludes breaks)

// ── helpers ───────────────────────────────────────────────────────────────────
function fmtDuration(ms: number | null | undefined): string {
  if (!ms || ms <= 0) return "—";
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m`;
  return `${s}s`;
}

function mean(nums: number[]): number {
  return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : 0;
}

// ── types ─────────────────────────────────────────────────────────────────────
interface ItemTiming {
  label: string;
  times: number[];   // measured delta-times in ms
  checked: number;
  total: number;
}

interface SiteTiming {
  projectNo: string;
  ms: number;
}

interface PlanRow {
  planId: string;
  planNo: string;
  date: string;
  totalSites: number;
  completedSites: number;
  skippedSites: number;
  siteDurations: SiteTiming[];
}

interface TeamStat {
  leader: string;
  latestMembers: string[];
  planCount: number;
  completedPlanCount: number;
  totalSites: number;
  completedSites: number;
  skippedSites: number;
  siteDurations: number[];
  lastDate: string | null;
  planRows: PlanRow[];
  itemTimings: ItemTiming[];
}

// ── component ─────────────────────────────────────────────────────────────────
export default function ServiceKpiPage() {
  const router = useRouter();
  const { user } = useAuth();

  const [plans,      setPlans]      = useState<any[]>([]);
  const [checklists, setChecklists] = useState<any[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [expanded,   setExpanded]   = useState<Record<string, "plans" | "items" | null>>({});

  const isViewAll = user?.role && ["superadmin", "admin", "authorized", "stakeholder"].includes(user.role);
  const myName    = user?.displayName || user?.email || "";

  useEffect(() => {
    Promise.all([
      getDocs(query(collection(db, "servicePlans"), orderBy("createdAt", "desc"))),
      getDocs(query(collection(db, "service_checklists"))),
    ]).then(([planSnap, clSnap]) => {
      setPlans(planSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      setChecklists(clSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  // ── Aggregate per-team stats ──────────────────────────────────────────────
  const teamStats = useMemo<TeamStat[]>(() => {
    // planId → checklists
    const clByPlan = new Map<string, any[]>();
    for (const cl of checklists) {
      if (!clByPlan.has(cl.planId)) clByPlan.set(cl.planId, []);
      clByPlan.get(cl.planId)!.push(cl);
    }

    const map = new Map<string, TeamStat>();

    for (const plan of plans) {
      const leader: string = plan.teamLeader?.trim() || "Unassigned";
      const members: string[] = (plan.members || []).filter(Boolean);

      if (!map.has(leader)) {
        map.set(leader, {
          leader,
          latestMembers: members,
          planCount: 0,
          completedPlanCount: 0,
          totalSites: 0,
          completedSites: 0,
          skippedSites: 0,
          siteDurations: [],
          lastDate: null,
          planRows: [],
          itemTimings: [],
        });
      }

      const team = map.get(leader)!;

      // Track most-recent members
      if (plan.date && (!team.lastDate || plan.date > team.lastDate)) {
        team.lastDate = plan.date;
        team.latestMembers = members;
      }

      team.planCount++;
      if (plan.status === "completed") team.completedPlanCount++;

      const sites: any[] = plan.sites || [];
      const done    = sites.filter((s: any) => s.siteStatus === "completed").length;
      const skipped = sites.filter((s: any) => s.siteStatus === "skipped").length;
      team.totalSites    += sites.length;
      team.completedSites += done;
      team.skippedSites   += skipped;

      // Per-plan timing row
      const planCls = clByPlan.get(plan.id) || [];
      const siteDurations: SiteTiming[] = [];

      for (const cl of planCls) {
        // Site-level duration
        if (cl.siteDurationMs > 0) {
          team.siteDurations.push(cl.siteDurationMs);
          siteDurations.push({ projectNo: cl.projectNo, ms: cl.siteDurationMs });
        }

        // Per-item: count hit-rates across all items in checklist
        for (const item of (cl.items || [])) {
          const existing = team.itemTimings.find(it => it.label === item.label);
          if (existing) {
            existing.total++;
            if (item.checked) existing.checked++;
          } else {
            team.itemTimings.push({
              label: item.label,
              times: [],
              checked: item.checked ? 1 : 0,
              total: 1,
            });
          }
        }

        // Per-item timing: delta between consecutive checked items (sorted by checkedAt)
        const startMs = cl.siteStartedAt ? new Date(cl.siteStartedAt).getTime() : null;
        const checkedItems = (cl.items || [])
          .filter((it: any) => it.checked && it.checkedAt)
          .sort((a: any, b: any) => new Date(a.checkedAt).getTime() - new Date(b.checkedAt).getTime());

        let prevMs = startMs;
        for (const item of checkedItems) {
          const itemMs = new Date(item.checkedAt).getTime();
          if (prevMs !== null && itemMs > prevMs) {
            const delta = itemMs - prevMs;
            if (delta < MAX_ITEM_GAP_MS) {
              const it = team.itemTimings.find(it => it.label === item.label);
              if (it) it.times.push(delta);
            }
          }
          prevMs = itemMs;
        }
      }

      team.planRows.push({
        planId: plan.id,
        planNo: plan.planNo || plan.id,
        date: plan.date || "",
        totalSites: sites.length,
        completedSites: done,
        skippedSites: skipped,
        siteDurations,
      });
    }

    // Sort plan rows inside each team by date desc
    for (const team of map.values()) {
      team.planRows.sort((a, b) => b.date.localeCompare(a.date));
    }

    let all = Array.from(map.values()).sort(
      (a, b) => b.completedSites - a.completedSites
    );

    if (!isViewAll) {
      all = all.filter(t => t.leader === myName || t.latestMembers.includes(myName));
    }

    return all;
  }, [plans, checklists, isViewAll, myName]);

  // ── Global totals ─────────────────────────────────────────────────────────
  const totals = useMemo(() => {
    const allSites   = plans.flatMap(p => p.sites || []);
    const withTiming = checklists.filter(cl => cl.siteDurationMs > 0);
    return {
      plans:          plans.length,
      completedPlans: plans.filter(p => p.status === "completed").length,
      sites:          allSites.length,
      completedSites: allSites.filter((s: any) => s.siteStatus === "completed").length,
      skippedSites:   allSites.filter((s: any) => s.siteStatus === "skipped").length,
      avgDurationMs:  withTiming.length ? mean(withTiming.map(cl => cl.siteDurationMs)) : null,
    };
  }, [plans, checklists]);

  const toggleExpand = (leader: string, section: "plans" | "items") => {
    setExpanded(prev => ({
      ...prev,
      [leader]: prev[leader] === section ? null : section,
    }));
  };

  // ── Loading ───────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-6 pb-16">

      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => router.push("/services")}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1">
          <h1 className="text-lg font-black flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-primary" /> Team KPIs
          </h1>
          <p className="text-xs text-muted-foreground">Time &amp; performance — one card per service team</p>
        </div>
        {!isViewAll && (
          <Badge variant="outline" className="text-[10px] font-bold">My Team Only</Badge>
        )}
      </div>

      {/* Global summary */}
      {isViewAll && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "Total Plans",      value: totals.plans,                         icon: Calendar,     color: "text-blue-600   bg-blue-50   dark:bg-blue-950/30"   },
            { label: "Completed Plans",  value: totals.completedPlans,                icon: CheckCircle2, color: "text-emerald-600 bg-emerald-50 dark:bg-emerald-950/30" },
            { label: "Sites Completed",  value: `${totals.completedSites}/${totals.sites}`, icon: MapPin, color: "text-violet-600  bg-violet-50  dark:bg-violet-950/30"  },
            { label: "Avg Visit Time",   value: fmtDuration(totals.avgDurationMs) || "—", icon: Timer,   color: "text-amber-600  bg-amber-50   dark:bg-amber-950/30"   },
          ].map(c => (
            <div key={c.label} className="rounded-xl border bg-card p-4 flex items-start gap-3">
              <div className={`p-2 rounded-lg shrink-0 ${c.color}`}>
                <c.icon className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <p className="text-xl font-black leading-none">{c.value}</p>
                <p className="text-[10px] text-muted-foreground mt-1 font-medium">{c.label}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Team cards */}
      <div className="space-y-2">
        <h2 className="text-[11px] font-black uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
          <Users className="h-3.5 w-3.5" /> {isViewAll ? "All Teams" : "My Team"}
        </h2>

        {teamStats.length === 0 ? (
          <div className="rounded-xl border bg-card p-10 text-center text-muted-foreground">
            <BarChart3 className="h-8 w-8 opacity-20 mx-auto mb-2" />
            <p className="text-sm font-semibold">No data yet</p>
          </div>
        ) : (
          <div className="space-y-4">
            {teamStats.map((team, idx) => {
              const completionRate = team.totalSites > 0
                ? Math.round((team.completedSites / team.totalSites) * 100)
                : 0;
              const avgMs  = team.siteDurations.length > 0 ? mean(team.siteDurations) : null;
              const fastMs = team.siteDurations.length > 0 ? Math.min(...team.siteDurations) : null;
              const isExp  = expanded[team.leader];

              const rateColor =
                completionRate >= 90 ? "text-emerald-700 bg-emerald-100 dark:bg-emerald-950/40 dark:text-emerald-300" :
                completionRate >= 70 ? "text-amber-700 bg-amber-100 dark:bg-amber-950/40 dark:text-amber-300" :
                                       "text-red-700 bg-red-100 dark:bg-red-950/40 dark:text-red-300";
              const barColor =
                completionRate >= 90 ? "from-emerald-400 to-emerald-500" :
                completionRate >= 70 ? "from-amber-400 to-amber-500" :
                                       "from-red-400 to-red-500";

              return (
                <div key={team.leader} className="rounded-2xl border bg-card overflow-hidden shadow-sm">

                  {/* ── Team header ── */}
                  <div className="flex items-center gap-3 px-4 py-3.5">
                    <div className="h-9 w-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center font-black text-sm shrink-0">
                      {idx + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-black text-sm">{team.leader}</p>
                        <span className="text-[10px] text-muted-foreground/60 font-semibold">Team Leader</span>
                        {team.latestMembers.length > 0 && (
                          <span className="text-[10px] bg-muted text-muted-foreground px-2 py-0.5 rounded-full font-medium">
                            {team.latestMembers.length} member{team.latestMembers.length !== 1 ? "s" : ""}
                          </span>
                        )}
                      </div>
                      {team.lastDate && (
                        <p className="text-[10px] text-muted-foreground mt-0.5 flex items-center gap-1">
                          <Calendar className="h-3 w-3" /> Last plan: {team.lastDate}
                        </p>
                      )}
                    </div>
                    <span className={`text-xs font-black px-2.5 py-1 rounded-full ${rateColor}`}>
                      {completionRate}%
                    </span>
                  </div>

                  {/* Members pill row */}
                  {team.latestMembers.length > 0 && (
                    <div className="px-4 pb-3 flex items-center gap-1.5 flex-wrap">
                      <span className="text-[9px] font-black uppercase tracking-widest text-muted-foreground/50 mr-1">Members</span>
                      {team.latestMembers.map((m, i) => (
                        <span key={i} className="text-[10px] bg-muted/60 border border-border/40 px-2 py-0.5 rounded-full text-foreground/70 font-medium">{m}</span>
                      ))}
                    </div>
                  )}

                  {/* ── KPI stat grid ── */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 border-t border-border/40 divide-x divide-y sm:divide-y-0 divide-border/40">
                    {[
                      { label: "Plans",       value: `${team.completedPlanCount}/${team.planCount}`, sub: "completed",              icon: Calendar },
                      { label: "Sites Done",  value: `${team.completedSites}/${team.totalSites}`,   sub: team.skippedSites > 0 ? `${team.skippedSites} skipped` : "no skips", icon: CheckCircle2 },
                      { label: "Avg / Site",  value: avgMs  ? fmtDuration(avgMs)  : "—",            sub: `${team.siteDurations.length} timed`,                               icon: Clock },
                      { label: "Fastest",     value: fastMs ? fmtDuration(fastMs) : "—",            sub: "single site",                                                       icon: Zap },
                    ].map(m => (
                      <div key={m.label} className="px-4 py-3.5 flex items-start gap-2.5">
                        <m.icon className="h-4 w-4 text-muted-foreground/40 shrink-0 mt-0.5" />
                        <div>
                          <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground/60 mb-1">{m.label}</p>
                          <p className="text-base font-black leading-none">{m.value}</p>
                          <p className="text-[9px] text-muted-foreground/50 mt-0.5">{m.sub}</p>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Progress bar */}
                  {team.totalSites > 0 && (
                    <div className="h-1 w-full bg-muted overflow-hidden">
                      <div className={`h-full bg-gradient-to-r ${barColor} transition-all`} style={{ width: `${completionRate}%` }} />
                    </div>
                  )}

                  {/* ── Expand toggles ── */}
                  <div className="border-t border-border/40 flex divide-x divide-border/40">
                    <button
                      onClick={() => toggleExpand(team.leader, "plans")}
                      className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-[11px] font-bold transition-colors ${isExp === "plans" ? "bg-primary/5 text-primary" : "text-muted-foreground hover:text-foreground hover:bg-muted/30"}`}
                    >
                      <Calendar className="h-3.5 w-3.5" />
                      Time per Plan
                      {isExp === "plans" ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                    </button>
                    <button
                      onClick={() => toggleExpand(team.leader, "items")}
                      className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-[11px] font-bold transition-colors ${isExp === "items" ? "bg-primary/5 text-primary" : "text-muted-foreground hover:text-foreground hover:bg-muted/30"}`}
                    >
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      Time per Task
                      {isExp === "items" ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                    </button>
                  </div>

                  {/* ── Plan timing detail ── */}
                  {isExp === "plans" && (
                    <div className="border-t border-border/40 bg-muted/10 divide-y divide-border/30 max-h-80 overflow-y-auto">
                      {team.planRows.map(pt => {
                        const ptTotal = pt.siteDurations.reduce((a, b) => a + b.ms, 0);
                        const ptAvg   = pt.siteDurations.length > 0 ? ptTotal / pt.siteDurations.length : 0;
                        return (
                          <div key={pt.planId} className="px-4 py-3">
                            <div className="flex items-center justify-between gap-2 mb-1.5 flex-wrap">
                              <div className="flex items-center gap-2">
                                <span className="text-[11px] font-black font-mono">{pt.planNo}</span>
                                <span className="text-[10px] text-muted-foreground">{pt.date}</span>
                                <span className="text-[10px] text-muted-foreground">
                                  {pt.completedSites}/{pt.totalSites} sites
                                  {pt.skippedSites > 0 && <span className="text-amber-600 ml-1">({pt.skippedSites} skip)</span>}
                                </span>
                              </div>
                              {ptAvg > 0 && (
                                <span className="text-[11px] font-black text-primary bg-primary/10 px-2 py-0.5 rounded border border-primary/20">
                                  avg {fmtDuration(ptAvg)} / site
                                </span>
                              )}
                            </div>
                            {pt.siteDurations.length > 0 ? (
                              <div className="flex flex-wrap gap-1">
                                {pt.siteDurations.map((sd, i) => (
                                  <span key={i} className="text-[9px] font-mono bg-background border border-border/50 px-1.5 py-0.5 rounded">
                                    <span className="text-muted-foreground">#{sd.projectNo}</span>{" "}
                                    <span className="font-black text-foreground">{fmtDuration(sd.ms)}</span>
                                  </span>
                                ))}
                              </div>
                            ) : (
                              <p className="text-[10px] text-muted-foreground/40 italic">No timing recorded for this plan</p>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* ── Item timing detail ── */}
                  {isExp === "items" && (
                    <div className="border-t border-border/40 bg-muted/10 divide-y divide-border/30 max-h-80 overflow-y-auto">
                      {team.itemTimings.length === 0 ? (
                        <div className="px-4 py-8 text-center text-muted-foreground">
                          <Clock className="h-6 w-6 opacity-20 mx-auto mb-2" />
                          <p className="text-xs">No checklist data recorded yet</p>
                        </div>
                      ) : (
                        [...team.itemTimings]
                          .sort((a, b) => {
                            const aAvg = a.times.length > 0 ? mean(a.times) : -1;
                            const bAvg = b.times.length > 0 ? mean(b.times) : -1;
                            return bAvg - aAvg;
                          })
                          .map((item, i) => {
                            const avgItemMs = item.times.length > 0 ? mean(item.times) : null;
                            const rate = item.total > 0 ? Math.round((item.checked / item.total) * 100) : 0;
                            const rateBarColor = rate >= 90 ? "bg-emerald-500" : rate >= 70 ? "bg-amber-400" : "bg-red-400";
                            return (
                              <div key={item.label} className="flex items-center gap-3 px-4 py-2.5">
                                <span className="text-[9px] font-black text-muted-foreground/30 w-4 shrink-0 text-right">{i + 1}</span>
                                <div className="flex-1 min-w-0">
                                  <p className="text-[11px] font-semibold text-foreground leading-tight">{item.label}</p>
                                  <div className="flex items-center gap-2 mt-1">
                                    <div className="w-24 h-1.5 bg-muted rounded-full overflow-hidden">
                                      <div className={`h-full rounded-full ${rateBarColor}`} style={{ width: `${rate}%` }} />
                                    </div>
                                    <span className="text-[9px] text-muted-foreground/60">
                                      {rate}% ({item.checked}/{item.total})
                                    </span>
                                  </div>
                                </div>
                                <div className="shrink-0 text-right">
                                  {avgItemMs != null ? (
                                    <div>
                                      <span className="text-xs font-black text-primary bg-primary/10 px-2 py-0.5 rounded border border-primary/20">
                                        {fmtDuration(avgItemMs)}
                                      </span>
                                      {item.times.length > 1 && (
                                        <p className="text-[9px] text-muted-foreground/40 mt-0.5 text-right">
                                          {item.times.length} samples
                                        </p>
                                      )}
                                    </div>
                                  ) : (
                                    <span className="text-[10px] text-muted-foreground/30">no timing</span>
                                  )}
                                </div>
                              </div>
                            );
                          })
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Skipped sites alert */}
      {isViewAll && totals.skippedSites > 0 && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-xl border border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-900">
          <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
          <p className="text-sm font-semibold text-amber-700 dark:text-amber-400">
            {totals.skippedSites} site{totals.skippedSites !== 1 ? "s" : ""} skipped across all plans — follow up recommended
          </p>
        </div>
      )}
    </div>
  );
}
