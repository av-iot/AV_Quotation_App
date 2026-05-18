"use client";

import { useEffect, useState, useMemo } from "react";
import { collection, query, orderBy, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/auth-context";
import { motion } from "framer-motion";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FileText, Receipt, TrendingUp, TrendingDown, Clock, Plus, ArrowRight, Zap, Banknote, Activity, CalendarDays } from "lucide-react";
import Link from "next/link";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { Proposal, Quotation } from "@/types";

const fadeUp = (delay = 0) => ({
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.4, delay, ease: [0.22, 1, 0.36, 1] } },
});

type TimeFilter = "MONTH" | "YEAR" | "LIFETIME";

export default function DashboardPage() {
  const { user } = useAuth();
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [quotations, setQuotations] = useState<Quotation[]>([]);
  const [loading, setLoading] = useState(true);
  const [timeFilter, setTimeFilter] = useState<TimeFilter>("MONTH");

  useEffect(() => {
    const pq = query(collection(db, "proposals"), orderBy("createdAt", "desc"));
    const unsubP = onSnapshot(pq, (s) => setProposals(s.docs.map((d) => ({ id: d.id, ...d.data() }) as Proposal)));
    
    const qq = query(collection(db, "quotations"), orderBy("createdAt", "desc"));
    const unsubQ = onSnapshot(qq, (s) => {
      setQuotations(s.docs.map((d) => ({ id: d.id, ...d.data() }) as Quotation));
      setLoading(false);
    });
    
    return () => { unsubP(); unsubQ(); };
  }, []);

  const filterData = (data: any[], type: "current" | "previous") => {
    return data.filter(item => {
      if (timeFilter === "LIFETIME") return type === "current"; // No previous for lifetime
      
      let d: Date;
      if (item.createdAt?.seconds) {
        d = new Date(item.createdAt.seconds * 1000);
      } else if (item.date) {
        d = new Date(item.date);
      } else {
        return false;
      }
      if (isNaN(d.getTime())) return false;

      const now = new Date();
      if (timeFilter === "MONTH") {
        const isCurrentMonth = d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
        const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const isPrevMonth = d.getMonth() === lastMonth.getMonth() && d.getFullYear() === lastMonth.getFullYear();
        return type === "current" ? isCurrentMonth : isPrevMonth;
      }
      
      if (timeFilter === "YEAR") {
        const isCurrentYear = d.getFullYear() === now.getFullYear();
        const isPrevYear = d.getFullYear() === now.getFullYear() - 1;
        return type === "current" ? isCurrentYear : isPrevYear;
      }
      return true;
    });
  };

  const currentProposals = useMemo(() => filterData(proposals, "current"), [proposals, timeFilter]);
  const prevProposals = useMemo(() => filterData(proposals, "previous"), [proposals, timeFilter]);
  
  const currentQuotations = useMemo(() => filterData(quotations, "current"), [quotations, timeFilter]);
  const prevQuotations = useMemo(() => filterData(quotations, "previous"), [quotations, timeFilter]);

  const currentRevenue = useMemo(() => currentQuotations.reduce((acc, curr) => acc + (curr.total || 0), 0), [currentQuotations]);
  const prevRevenue = useMemo(() => prevQuotations.reduce((acc, curr) => acc + (curr.total || 0), 0), [prevQuotations]);

  const calcTrend = (curr: number, prev: number) => {
    if (timeFilter === "LIFETIME") return null;
    if (prev === 0 && curr === 0) return { val: 0, isPos: true };
    if (prev === 0) return { val: 100, isPos: true };
    const diff = ((curr - prev) / prev) * 100;
    return { val: Math.abs(Math.round(diff)), isPos: diff >= 0 };
  };

  const getTrendText = (trend: {val: number, isPos: boolean} | null) => {
    if (!trend) return "All time";
    return trend.isPos ? `+${trend.val}% vs last ${timeFilter.toLowerCase()}` : `-${trend.val}% vs last ${timeFilter.toLowerCase()}`;
  };

  const recentProposals = proposals.slice(0, 5);
  const recentQuotations = quotations.slice(0, 5);

  const stats = [
    { 
      label: "Total Proposals", 
      value: currentProposals.length.toString(), 
      icon: FileText, 
      color: "bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400",
      trend: calcTrend(currentProposals.length, prevProposals.length)
    },
    { 
      label: "Confirmed Orders", 
      value: currentQuotations.length.toString(), 
      icon: CheckCircleIcon, 
      color: "bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400",
      trend: calcTrend(currentQuotations.length, prevQuotations.length)
    },
    { 
      label: "Revenue Pipeline", 
      value: `Rs. ${(currentRevenue / 1000000).toFixed(2)}M`, 
      icon: Banknote, 
      color: "bg-purple-50 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400",
      trend: calcTrend(currentRevenue, prevRevenue)
    },
    { 
      label: "Drafts / Pending", 
      value: currentProposals.filter((p) => p.status === "draft").length.toString(), 
      icon: Clock, 
      color: "bg-amber-50 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400",
      trend: calcTrend(
        currentProposals.filter((p) => p.status === "draft").length,
        prevProposals.filter((p) => p.status === "draft").length
      )
    },
  ];

  const canViewMoney = !user?.role || ["superadmin", "admin", "authorized", "stakeholder"].includes(user.role);
  const canCRUD = user?.role && ["superadmin", "admin", "authorized"].includes(user.role);

  const filteredStats = useMemo(() => {
    return stats.filter(s => s.label !== "Revenue Pipeline" || canViewMoney);
  }, [stats, canViewMoney]);

  if (loading) {
    return <div className="p-8 animate-pulse text-muted-foreground">Loading dashboard...</div>;
  }

  return (
    <div className="p-6 md:p-10 max-w-7xl mx-auto space-y-8">
      
      {/* ── Welcome Header ── */}
      <motion.div {...fadeUp(0)} className="flex flex-col lg:flex-row justify-between items-start lg:items-end gap-6 pb-6 border-b border-border/50">
        <div className="relative z-10">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-muted/50 border border-border text-xs font-semibold text-muted-foreground mb-4">
            <CalendarDays className="h-3.5 w-3.5" />
            {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
          </div>
          <h1 className="text-4xl font-black text-foreground tracking-tight mb-2">Good {getGreeting()}, {user?.displayName?.split(" ")[0] || "there"} 👋</h1>
          <p className="text-base text-muted-foreground">Here is your solar sales pipeline overview.</p>
        </div>
        
        <div className="flex flex-col sm:flex-row gap-3 relative z-10 w-full lg:w-auto">
          <div className="bg-card border border-border rounded-xl p-1 flex items-center shadow-sm">
            {(["MONTH", "YEAR", "LIFETIME"] as TimeFilter[]).map((tf) => (
              <button
                key={tf}
                onClick={() => setTimeFilter(tf)}
                className={`px-4 py-1.5 text-xs font-bold rounded-lg transition-all ${timeFilter === tf ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground hover:bg-muted'}`}
              >
                {tf === "MONTH" ? "This Month" : tf === "YEAR" ? "This Year" : "Lifetime"}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <Button asChild variant="outline" className="gap-2 h-10 rounded-xl border-border bg-card hover:bg-muted shadow-sm">
              <Link href="/quotations">
                <Receipt className="h-4 w-4 text-muted-foreground" />
                Quotations
              </Link>
            </Button>
            {canCRUD && (
              <Button asChild className="gap-2 h-10 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm border-0">
                <Link href="/proposals/new">
                  <Plus className="h-4 w-4" />
                  New Proposal
                </Link>
              </Button>
            )}
          </div>
        </div>
      </motion.div>

      {/* ── KPI Cards ── */}
      <div className={`grid gap-6 sm:grid-cols-2 ${canViewMoney ? "lg:grid-cols-4" : "lg:grid-cols-3"}`}>
        {filteredStats.map(({ label, value, icon: Icon, color, trend }, i) => (
          <motion.div key={label} {...fadeUp(i * 0.1)}>
            <Card className="border-border shadow-sm bg-card overflow-hidden group">
              <CardContent className="p-6">
                <div className="flex items-center gap-4 mb-4">
                  <div className={`flex h-12 w-12 items-center justify-center rounded-2xl ${color} transition-transform group-hover:scale-110 duration-300`}>
                    <Icon className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{label}</p>
                    <p className="text-2xl font-black text-foreground tracking-tight">{value}</p>
                  </div>
                </div>
                <div className="pt-4 border-t border-border/50">
                  <p className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                    {!trend ? (
                      <span className="text-muted-foreground">All time metrics</span>
                    ) : (
                      <>
                        {trend.isPos ? (
                          <TrendingUp className="h-3.5 w-3.5 text-emerald-500" />
                        ) : (
                          <TrendingDown className="h-3.5 w-3.5 text-red-500" />
                        )}
                        <span className={trend.isPos ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}>
                          {trend.isPos ? "+" : "-"}{trend.val}%
                        </span>
                        <span className="ml-1">vs last {timeFilter.toLowerCase()}</span>
                      </>
                    )}
                  </p>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      <div className="grid gap-8 lg:grid-cols-2">
        {/* ── Recent Proposals ── */}
        <motion.div {...fadeUp(0.4)} className="flex flex-col h-full">
          <div className="flex items-center justify-between mb-4 px-2">
            <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
              <Activity className="h-5 w-5 text-blue-500" /> Recent Proposals
            </h2>
            <Button variant="link" size="sm" asChild className="text-blue-500 hover:text-blue-600 p-0 h-auto">
              <Link href="/proposals">View all <ArrowRight className="h-3 w-3 ml-1" /></Link>
            </Button>
          </div>
          <Card className="border-border shadow-sm bg-card flex-grow">
            <CardContent className="p-0">
              {recentProposals.length === 0 ? (
                <div className="p-8 text-center text-sm text-muted-foreground">No proposals yet.</div>
              ) : (
                <ul className="divide-y divide-border/50">
                  {recentProposals.map((p, i) => (
                    <motion.li 
                      key={p.id} 
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.5 + (i * 0.1) }}
                      className="group flex items-center justify-between p-4 hover:bg-muted/50 transition-colors"
                    >
                      <div className="flex items-center gap-4">
                        <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center text-muted-foreground font-bold text-sm uppercase group-hover:bg-blue-500/10 group-hover:text-blue-500 transition-colors">
                          {p.customer?.name?.charAt(0) || "C"}
                        </div>
                        <div>
                          <p className="text-sm font-bold text-foreground group-hover:text-blue-500 transition-colors">{p.customer?.name}</p>
                          <p className="text-xs text-muted-foreground font-mono mt-0.5">{p.propNo || p.qtnNo || "No Ref"}</p>
                        </div>
                      </div>
                      <Badge variant={p.status === "sent" ? "default" : "secondary"} className="text-[10px] uppercase font-bold tracking-wider">
                        {p.status}
                      </Badge>
                    </motion.li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </motion.div>

        {/* ── Confirmed Quotations ── */}
        <motion.div {...fadeUp(0.5)} className="flex flex-col h-full">
          <div className="flex items-center justify-between mb-4 px-2">
            <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
              <Zap className="h-5 w-5 text-emerald-500" /> Active Quotations
            </h2>
            <Button variant="link" size="sm" asChild className="text-emerald-500 hover:text-emerald-600 p-0 h-auto">
              <Link href="/quotations">View all <ArrowRight className="h-3 w-3 ml-1" /></Link>
            </Button>
          </div>
          <Card className="border-border shadow-sm bg-card flex-grow">
            <CardContent className="p-0">
              {recentQuotations.length === 0 ? (
                <div className="p-8 text-center text-sm text-muted-foreground">No confirmed orders yet.</div>
              ) : (
                <ul className="divide-y divide-border/50">
                  {recentQuotations.map((q, i) => (
                    <motion.li 
                      key={q.id} 
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.6 + (i * 0.1) }}
                      className="group flex items-center justify-between p-4 hover:bg-muted/50 transition-colors"
                    >
                      <div className="flex items-center gap-4">
                        <div className="h-10 w-10 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-500 font-bold text-sm uppercase transition-colors">
                          <Receipt className="h-4 w-4" />
                        </div>
                        <div>
                          <p className="text-sm font-bold text-foreground group-hover:text-emerald-500 transition-colors">{q.customer?.name}</p>
                          <p className="text-xs text-muted-foreground font-mono mt-0.5">{q.qtnNo || "No Ref"}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        {canViewMoney && (
                          <p className="text-sm font-black text-foreground group-hover:text-emerald-500 transition-colors">
                            Rs. {(q.total || 0).toLocaleString("en-US")}
                          </p>
                        )}
                        <p className="text-[10px] text-muted-foreground font-bold uppercase mt-0.5 tracking-wider">{q.paymentStatus}</p>
                      </div>
                    </motion.li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </motion.div>
      </div>

    </div>
  );
}

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return "Morning";
  if (h < 18) return "Afternoon";
  return "Evening";
}

function CheckCircleIcon(props: any) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
      <polyline points="22 4 12 14.01 9 11.01" />
    </svg>
  );
}
