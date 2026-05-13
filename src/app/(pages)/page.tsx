"use client";

import { useEffect, useState } from "react";
import { collection, query, orderBy, limit, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/auth-context";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FileText, Receipt, TrendingUp, Clock, Plus, ArrowRight } from "lucide-react";
import Link from "next/link";
import type { Proposal, Quotation } from "@/types";

const fadeUp = (delay = 0) => ({
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.28, delay, ease: [0.22, 1, 0.36, 1] } },
});

export default function DashboardPage() {
  const { user } = useAuth();
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [quotations, setQuotations] = useState<Quotation[]>([]);

  useEffect(() => {
    const pq = query(collection(db, "proposals"), orderBy("createdAt", "desc"), limit(5));
    const unsubP = onSnapshot(pq, (s) => setProposals(s.docs.map((d) => ({ id: d.id, ...d.data() }) as Proposal)));
    const qq = query(collection(db, "quotations"), orderBy("createdAt", "desc"), limit(5));
    const unsubQ = onSnapshot(qq, (s) => setQuotations(s.docs.map((d) => ({ id: d.id, ...d.data() }) as Quotation)));
    return () => { unsubP(); unsubQ(); };
  }, []);

  const stats = [
    { label: "Total proposals", value: proposals.length, icon: FileText, color: "text-blue-500" },
    { label: "Confirmed quotations", value: quotations.length, icon: Receipt, color: "text-green-600" },
    { label: "Sent this week", value: proposals.filter((p) => p.status === "sent").length, icon: TrendingUp, color: "text-amber-500" },
    { label: "Drafts", value: proposals.filter((p) => p.status === "draft").length, icon: Clock, color: "text-muted-foreground" },
  ];

  return (
    <div className="p-6">
      <motion.div {...fadeUp(0)} className="mb-6">
        <h1 className="text-xl font-bold">Good {getGreeting()}, {user?.displayName?.split(" ")[0] || "there"} 👋</h1>
        <p className="text-sm text-muted-foreground">Here's what's happening with your proposals today.</p>
      </motion.div>

      {/* Stats */}
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map(({ label, value, icon: Icon, color }, i) => (
          <motion.div key={label} {...fadeUp(i * 0.06)}>
            <Card>
              <CardContent className="pt-5">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-muted-foreground">{label}</p>
                  <Icon className={`h-4 w-4 ${color}`} />
                </div>
                <p className="mt-2 text-3xl font-bold tabular-nums">{value}</p>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      {/* Quick actions */}
      <motion.div {...fadeUp(0.18)} className="mb-6 flex gap-3">
        <Button asChild className="gap-2 bg-primary hover:bg-primary/90">
          <Link href="/proposals/new">
            <Plus className="h-4 w-4" />
            New proposal
          </Link>
        </Button>
        <Button asChild variant="outline" className="gap-2">
          <Link href="/quotations">
            <Receipt className="h-4 w-4" />
            View quotations
          </Link>
        </Button>
      </motion.div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Recent proposals */}
        <motion.div {...fadeUp(0.22)}>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <CardTitle className="text-base">Recent proposals</CardTitle>
              <Button variant="ghost" size="sm" asChild className="gap-1 text-xs text-muted-foreground">
                <Link href="/proposals">View all <ArrowRight className="h-3 w-3" /></Link>
              </Button>
            </CardHeader>
            <CardContent className="p-0">
              {proposals.length === 0 ? (
                <p className="px-6 pb-4 text-sm text-muted-foreground">No proposals yet.</p>
              ) : (
                <ul className="divide-y">
                  {proposals.map((p) => (
                    <li key={p.id} className="flex items-center justify-between px-6 py-3 hover:bg-muted/40 transition-colors">
                      <div>
                        <p className="text-sm font-medium">{p.customer?.name}</p>
                        <p className="text-xs text-muted-foreground font-mono">{p.qtnNo}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant={p.status === "sent" ? "default" : "secondary"} className="text-xs capitalize">
                          {p.status}
                        </Badge>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </motion.div>

        {/* Recent quotations */}
        <motion.div {...fadeUp(0.28)}>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <CardTitle className="text-base">Confirmed quotations</CardTitle>
              <Button variant="ghost" size="sm" asChild className="gap-1 text-xs text-muted-foreground">
                <Link href="/quotations">View all <ArrowRight className="h-3 w-3" /></Link>
              </Button>
            </CardHeader>
            <CardContent className="p-0">
              {quotations.length === 0 ? (
                <p className="px-6 pb-4 text-sm text-muted-foreground">No confirmed orders yet.</p>
              ) : (
                <ul className="divide-y">
                  {quotations.map((q) => (
                    <li key={q.id} className="flex items-center justify-between px-6 py-3 hover:bg-muted/40 transition-colors">
                      <div>
                        <p className="text-sm font-medium">{q.customer?.name}</p>
                        <p className="text-xs text-muted-foreground font-mono">{q.qtnNo}</p>
                      </div>
                      <p className="text-sm font-semibold tabular-nums">
                        Rs. {q.total?.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                      </p>
                    </li>
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
  if (h < 12) return "morning";
  if (h < 18) return "afternoon";
  return "evening";
}
