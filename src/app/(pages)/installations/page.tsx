"use client";

import { useEffect, useState, useMemo } from "react";
import { collection, onSnapshot, query, where, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/auth-context";
import { motion, AnimatePresence } from "framer-motion";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import Link from "next/link";
import {
  Search, Loader2, MapPin, Phone, Settings, AlertTriangle, Layers
} from "lucide-react";
import { Pagination } from "@/components/ui/pagination";

const STAGE_CONFIG: Record<string, { label: string; color: string }> = {
  confirmed:             { label: "Confirmed",           color: "text-blue-600 bg-blue-50 border-blue-250 dark:bg-blue-950/20 dark:text-blue-400 dark:border-blue-900/30" },
  installation:          { label: "Installation",        color: "text-purple-600 bg-purple-50 border-purple-250 dark:bg-purple-950/20 dark:text-purple-400 dark:border-purple-900/30" },
  installation_complete: { label: "Installed",           color: "text-indigo-600 bg-indigo-50 border-indigo-250 dark:bg-indigo-950/20 dark:text-indigo-400 dark:border-indigo-900/30" },
  commissioned:          { label: "Commissioned",        color: "text-emerald-600 bg-emerald-50 border-emerald-250 dark:bg-emerald-950/20 dark:text-emerald-400 dark:border-emerald-900/30" },
  monitoring:            { label: "Monitoring",          color: "text-cyan-600 bg-cyan-50 border-cyan-250 dark:bg-cyan-950/20 dark:text-cyan-400 dark:border-cyan-900/30" },
  legacy:                { label: "In Operation",        color: "text-teal-700 bg-teal-50 border-teal-200 dark:bg-teal-900/20 dark:text-teal-300 dark:border-teal-800/30" },
};

interface InstallationSite {
  id: string;
  projectNo: string;
  customerName: string;
  address: string;
  phone: string;
  solarCapacity: number;
  stage: string;
  engineer?: string;
  systemType?: string;
}

export default function InstallationsPage() {
  const { firebaseUser, user } = useAuth();
  const [sites, setSites] = useState<InstallationSite[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  // Fetch projects in installation pipeline stages
  useEffect(() => {
    if (!firebaseUser) return;

    const targetStages = ["confirmed", "installation", "installation_complete", "commissioned", "monitoring"];
    const q = query(
      collection(db, "projects"),
      where("stage", "in", targetStages)
    );

    const unsub = onSnapshot(q, (snap) => {
      const projects: InstallationSite[] = snap.docs.map((d) => ({
        id: d.id,
        projectNo: d.data().projectNo || "—",
        customerName: d.data().customer?.name || "—",
        address: d.data().customer?.address || "—",
        phone: d.data().customer?.phone || "—",
        solarCapacity: d.data().solarCapacity || 0,
        stage: d.data().stage || "confirmed",
        engineer: d.data().engineer,
        systemType: d.data().systemType,
      }));
      setSites(projects);
      setLoading(false);
    });

    return unsub;
  }, [firebaseUser]);

  // Group by stage
  const grouped = useMemo(() => {
    const groups: Record<string, InstallationSite[]> = {
      ready: [],
      progress: [],
    };

    const filtered = sites.filter(
      (s) =>
        s.projectNo?.toLowerCase().includes(search.toLowerCase()) ||
        s.customerName?.toLowerCase().includes(search.toLowerCase())
    );

    filtered.forEach((site) => {
      if (site.stage === "confirmed") {
        groups.ready.push(site);
      } else {
        groups.progress.push(site);
      }
    });

    return groups;
  }, [sites, search]);

  const readyPaginated = useMemo(() => {
    const start = (page - 1) * pageSize;
    return grouped.ready.slice(start, start + pageSize);
  }, [grouped.ready, page, pageSize]);

  const progressPaginated = useMemo(() => {
    const start = (page - 1) * pageSize;
    return grouped.progress.slice(start, start + pageSize);
  }, [grouped.progress, page, pageSize]);

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="p-6 mx-auto max-w-6xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-black text-foreground flex items-center gap-2">
            <Layers className="h-8 w-8 text-primary" />
            Installation Sites
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage installation and commissioning for sites from advance payment to operation
          </p>
        </div>
      </div>

      {/* Search */}
      <div className="mb-6 flex gap-2">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by site number or customer name..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="pl-9"
          />
        </div>
      </div>

      {/* Ready to Install */}
      <div className="mb-8">
        <h2 className="text-lg font-bold mb-3 text-foreground">
          🚀 Ready to Install
          <span className="text-sm font-normal text-muted-foreground ml-2">({grouped.ready.length})</span>
        </h2>
        <AnimatePresence>
          {readyPaginated.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {readyPaginated.map((site) => (
                <motion.div key={site.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                  <Link href={`/installations/${site.id}`}>
                    <Card className="h-full hover:shadow-lg hover:border-primary/50 transition-all cursor-pointer">
                      <CardHeader className="pb-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <CardTitle className="text-base truncate">
                              Site #{site.projectNo}
                            </CardTitle>
                            <p className="text-sm text-muted-foreground truncate">
                              {site.customerName}
                            </p>
                          </div>
                          <Badge className="shrink-0">
                            {STAGE_CONFIG[site.stage]?.label || site.stage}
                          </Badge>
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-2 text-sm">
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <Layers className="h-4 w-4" />
                          <span>{site.solarCapacity}kW {site.systemType || "Solar"}</span>
                        </div>
                        <div className="flex items-center gap-2 text-muted-foreground overflow-hidden">
                          <MapPin className="h-4 w-4 shrink-0" />
                          <span className="truncate">{site.address}</span>
                        </div>
                        {site.phone && (
                          <div className="flex items-center gap-2 text-muted-foreground">
                            <Phone className="h-4 w-4 shrink-0" />
                            <span>{site.phone}</span>
                          </div>
                        )}
                        {site.engineer && (
                          <div className="text-xs text-muted-foreground pt-1 border-t">
                            Engineer: <span className="font-medium">{site.engineer}</span>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  </Link>
                </motion.div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              {search ? "No sites match your search" : "No sites ready to install yet"}
            </div>
          )}
        </AnimatePresence>
        {grouped.ready.length > pageSize && (
          <div className="mt-4 flex justify-center">
            <Pagination
              page={page}
              pageSize={pageSize}
              total={grouped.ready.length}
              onPageChange={setPage}
            />
          </div>
        )}
      </div>

      {/* In Progress */}
      <div>
        <h2 className="text-lg font-bold mb-3 text-foreground">
          ⚙️ In Progress
          <span className="text-sm font-normal text-muted-foreground ml-2">({grouped.progress.length})</span>
        </h2>
        <AnimatePresence>
          {progressPaginated.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {progressPaginated.map((site) => (
                <motion.div key={site.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                  <Link href={`/installations/${site.id}`}>
                    <Card className="h-full hover:shadow-lg hover:border-primary/50 transition-all cursor-pointer">
                      <CardHeader className="pb-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <CardTitle className="text-base truncate">
                              Site #{site.projectNo}
                            </CardTitle>
                            <p className="text-sm text-muted-foreground truncate">
                              {site.customerName}
                            </p>
                          </div>
                          <Badge className="shrink-0">
                            {STAGE_CONFIG[site.stage]?.label || site.stage}
                          </Badge>
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-2 text-sm">
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <Layers className="h-4 w-4" />
                          <span>{site.solarCapacity}kW {site.systemType || "Solar"}</span>
                        </div>
                        <div className="flex items-center gap-2 text-muted-foreground overflow-hidden">
                          <MapPin className="h-4 w-4 shrink-0" />
                          <span className="truncate">{site.address}</span>
                        </div>
                        {site.phone && (
                          <div className="flex items-center gap-2 text-muted-foreground">
                            <Phone className="h-4 w-4 shrink-0" />
                            <span>{site.phone}</span>
                          </div>
                        )}
                        {site.engineer && (
                          <div className="text-xs text-muted-foreground pt-1 border-t">
                            Engineer: <span className="font-medium">{site.engineer}</span>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  </Link>
                </motion.div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              {search ? "No sites match your search" : "No installations in progress"}
            </div>
          )}
        </AnimatePresence>
        {grouped.progress.length > pageSize && (
          <div className="mt-4 flex justify-center">
            <Pagination
              page={page}
              pageSize={pageSize}
              total={grouped.progress.length}
              onPageChange={setPage}
            />
          </div>
        )}
      </div>
    </div>
  );
}
