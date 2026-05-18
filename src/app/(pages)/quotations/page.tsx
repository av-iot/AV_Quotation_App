"use client";

import { useEffect, useState } from "react";
import { collection, query, orderBy, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/auth-context";
import { motion, AnimatePresence } from "framer-motion";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { Input } from "@/components/ui/input";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Receipt, Search, Download, Eye, Loader2, Trash2, ArrowRight } from "lucide-react";
import type { Quotation, QuotationStatus } from "@/types";

const STATUS_CONFIG: Record<QuotationStatus, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  pending_payment: { label: "Pending payment", variant: "outline" },
  partial_payment: { label: "Partial payment", variant: "secondary" },
  fully_paid: { label: "Fully paid", variant: "default" },
  scheduled: { label: "Scheduled", variant: "default" },
  installed: { label: "Installed", variant: "default" },
  commissioned: { label: "Commissioned", variant: "default" },
};

const fmtRs = (n: number) =>
  "Rs. " + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function QuotationsPage() {
  const { firebaseUser, user } = useAuth();
  const [quotations, setQuotations] = useState<Quotation[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const canViewMoney = !user?.role || ["superadmin", "admin", "authorized", "stakeholder"].includes(user.role);
  const canCRUD = user?.role && ["superadmin", "admin", "authorized"].includes(user.role);

  useEffect(() => {
    if (!firebaseUser) return;
    const q = query(
      collection(db, "quotations"),
      orderBy("createdAt", "desc")
    );
    const unsub = onSnapshot(q, (snap) => {
      setQuotations(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Quotation));
      setLoading(false);
    });
    return unsub;
  }, [firebaseUser]);

  const filtered = quotations.filter(
    (q) =>
      q.qtnNo?.toLowerCase().includes(search.toLowerCase()) ||
      q.customer.name?.toLowerCase().includes(search.toLowerCase())
  );

  const stats = {
    total: quotations.length,
    pending: quotations.filter((q) => q.paymentStatus === "pending_payment").length,
    paid: quotations.filter((q) => q.paymentStatus === "fully_paid").length,
    installed: quotations.filter((q) => ["installed", "commissioned"].includes(q.paymentStatus)).length,
  };

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-6 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
          <Receipt className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-xl font-bold">Quotations</h1>
          <p className="text-sm text-muted-foreground">Confirmed customer orders</p>
        </div>
      </div>

      {/* Stats */}
      <div className="mb-6 grid gap-4 sm:grid-cols-4">
        {[
          { label: "Total", value: stats.total },
          { label: "Pending payment", value: stats.pending },
          { label: "Fully paid", value: stats.paid },
          { label: "Installed / commissioned", value: stats.installed },
        ].map(({ label, value }, i) => (
          <motion.div
            key={label}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.06 }}
          >
            <Card>
              <CardContent className="pt-4">
                <p className="text-sm text-muted-foreground">{label}</p>
                <p className="mt-1 text-2xl font-bold tabular-nums">{value}</p>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      {/* Search + table */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4 pb-4">
          <CardTitle className="text-base">All quotations</CardTitle>
          <div className="relative w-64">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-8 h-9 text-sm"
              placeholder="Search by name or QTN…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex h-32 items-center justify-center gap-2 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="text-sm">Loading…</span>
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex h-32 items-center justify-center">
              <p className="text-sm text-muted-foreground">
                {search ? "No results found." : "No quotations yet."}
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Ref. No.</TableHead>
                  <TableHead className="text-xs">Customer</TableHead>
                  <TableHead className="text-xs">Date</TableHead>
                  {canViewMoney && <TableHead className="text-xs text-right">Total</TableHead>}
                  <TableHead className="text-xs">Status</TableHead>
                  <TableHead className="text-xs" />
                </TableRow>
              </TableHeader>
              <TableBody>
                <AnimatePresence>
                  {filtered.map((qtn, i) => (
                    <motion.tr
                      key={qtn.id}
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.03 }}
                      className="border-b last:border-0 hover:bg-muted/40 transition-colors"
                    >
                      <TableCell className="py-3 text-sm font-mono font-medium text-primary">
                        {qtn.qtnNo || "No Reference"}
                      </TableCell>
                      <TableCell className="py-3 text-sm">{qtn.customer.name}</TableCell>
                      <TableCell className="py-3 text-sm text-muted-foreground">{qtn.date}</TableCell>
                      {canViewMoney && (
                        <TableCell className="py-3 text-right text-sm font-medium tabular-nums">
                          {fmtRs(qtn.total)}
                        </TableCell>
                      )}
                      <TableCell className="py-3">
                        <Badge variant={STATUS_CONFIG[qtn.paymentStatus]?.variant || "outline"} className="text-xs">
                          {STATUS_CONFIG[qtn.paymentStatus]?.label || qtn.paymentStatus}
                        </Badge>
                      </TableCell>
                      <TableCell className="py-3">
                        <div className="flex gap-1 justify-end">
                          {canCRUD && qtn.proposalId && qtn.balanceAfter !== undefined && qtn.balanceAfter > 0 && (
                            <Button variant="outline" size="sm" className="h-7 text-xs border-primary/20 text-primary hover:bg-primary/5 mr-1" asChild>
                              <Link href={`/proposals/${qtn.proposalId}`}>
                                Next Installment
                              </Link>
                            </Button>
                          )}
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-blue-500" title="View PDF" asChild>
                            <Link href={`/quotations/${qtn.id}`}>
                              <Eye className="h-3.5 w-3.5" />
                            </Link>
                          </Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-primary" title="Next Step / Details" asChild>
                            <Link href={`/quotations/${qtn.id}`}>
                              <ArrowRight className="h-3.5 w-3.5" />
                            </Link>
                          </Button>
                          {qtn.docxUrl && (
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-green-500" title="Download Word" asChild>
                              <a href={qtn.docxUrl} target="_blank" rel="noreferrer">
                                <Download className="h-3.5 w-3.5" />
                              </a>
                            </Button>
                          )}
                          {canCRUD && (
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              className="h-7 w-7 text-muted-foreground hover:text-destructive"
                              title="Delete"
                              onClick={async () => {
                                if (window.confirm("Are you really sure ?")) {
                                  try {
                                    const { deleteDoc, doc } = await import("firebase/firestore");
                                    await deleteDoc(doc(db, "quotations", qtn.id));
                                    
                                    const { logActivityClient } = await import("@/lib/audit-logger-client");
                                    await logActivityClient(user, "QUOTATION_DELETE", {
                                      quotationId: qtn.id,
                                      qtnNo: qtn.qtnNo,
                                      customerName: qtn.customer?.name || "",
                                    });
                                  } catch (error) {
                                    console.error("Failed to delete quotation:", error);
                                  }
                                }
                              }}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>
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
