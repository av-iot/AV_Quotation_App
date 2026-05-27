"use client";

import { useEffect, useState, useMemo } from "react";
import { collection, query, orderBy, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/auth-context";
import { motion, AnimatePresence } from "framer-motion";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator, DropdownMenuLabel } from "@/components/ui/dropdown-menu";
import { Receipt, Search, Eye, Loader2, Trash2, ArrowRight, Pencil, Send, Mail, MessageCircle, Printer, MoreVertical, CreditCard, CheckCircle } from "lucide-react";
import type { Quotation, QuotationStatus } from "@/types";
import ShareModal from "@/components/proposals/ShareModal";
import { Pagination } from "@/components/ui/pagination";
import { formatQtnNo } from "@/lib/format-qtn";

const STATUS_CONFIG: Record<QuotationStatus, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  pending_payment: { label: "Pending Payment", variant: "outline" },
  partial_payment: { label: "Partial Payment", variant: "secondary" },
  fully_paid: { label: "Fully Paid", variant: "default" },
  scheduled: { label: "Scheduled", variant: "default" },
  installed: { label: "Installed", variant: "default" },
  commissioned: { label: "Commissioned", variant: "default" },
};

const fmtRs = (n: number) =>
  "Rs. " + n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 });


export default function QuotationsPage() {
  const { firebaseUser, user } = useAuth();
  const [quotations, setQuotations] = useState<Quotation[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [shareOpen, setShareOpen] = useState(false);
  const [shareDoc, setShareDoc] = useState<any>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

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

  // Compute carry-cascade effective status for every quotation so installments
  // covered by an upstream overpayment display correctly without a Firestore write.
  const effectiveStatusMap = useMemo(() => {
    const map = new Map<string, QuotationStatus>();
    const byProposal = new Map<string, Quotation[]>();
    quotations.forEach(q => {
      const key = (q as any).proposalId || q.id;
      if (!byProposal.has(key)) byProposal.set(key, []);
      byProposal.get(key)!.push(q);
    });
    byProposal.forEach(group => {
      const sorted = [...group].sort((a, b) => ((a as any).installmentNo ?? 0) - ((b as any).installmentNo ?? 0));
      let carry = 0;
      for (const q of sorted) {
        const target = ((q as any).installmentAmount ?? q.total ?? 0) as number;
        const rawPaid = ((q as any).paidAmount ?? 0) as number;
        const effectivePaid = Math.min(rawPaid + carry, target);
        const surplus = rawPaid + carry - target;
        carry = surplus > 0 ? surplus : 0;
        if (effectivePaid >= target - 1 && target > 0) {
          map.set(q.id, "fully_paid");
        } else if (effectivePaid > 0) {
          map.set(q.id, "partial_payment");
        } else {
          map.set(q.id, (q.paymentStatus as QuotationStatus) || "pending_payment");
        }
      }
    });
    return map;
  }, [quotations]);

  const getStatus = (q: Quotation) => effectiveStatusMap.get(q.id) || q.paymentStatus;

  const filtered = quotations.filter(
    (q) =>
      q.qtnNo?.toLowerCase().includes(search.toLowerCase()) ||
      q.customer.name?.toLowerCase().includes(search.toLowerCase())
  );

  // Reset to page 1 when search changes
  useMemo(() => { setPage(1); }, [search]);

  const pagedQuotations = filtered.slice((page - 1) * pageSize, page * pageSize);

  const stats = {
    total: quotations.length,
    pending: quotations.filter((q) => getStatus(q) === "pending_payment").length,
    paid: quotations.filter((q) => getStatus(q) === "fully_paid").length,
    installed: quotations.filter((q) => ["installed", "commissioned"].includes(getStatus(q))).length,
  };

  return (
    <div className="p-4 md:p-8 max-w-[1400px] mx-auto space-y-8 animate-in fade-in duration-500">
      
      {/* Header */}
      <div className="flex flex-col md:flex-row items-start justify-between gap-6 mb-2">
        <div>
          <div className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-600 dark:text-emerald-500 mb-3 bg-emerald-500/10 px-3 py-1.5 rounded-full border border-emerald-500/20">
            <Receipt className="h-3.5 w-3.5" />
            Quotations
          </div>
          <h1 className="text-3xl md:text-4xl font-black tracking-tight text-foreground">
            Manage Invoices
          </h1>
          <p className="text-muted-foreground mt-2 text-sm md:text-base font-medium">Track confirmed orders and payments.</p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: "Total Orders", value: stats.total, icon: Receipt, color: "text-blue-500" },
          { label: "Pending Payment", value: stats.pending, icon: CreditCard, color: "text-amber-500" },
          { label: "Fully Paid", value: stats.paid, icon: CheckCircle, color: "text-emerald-500" },
          { label: "Installed / Done", value: stats.installed, icon: CheckCircle, color: "text-indigo-500" },
        ].map(({ label, value, icon: Icon, color }, i) => (
          <motion.div
            key={label}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
          >
            <Card className="shadow-sm border-border/60 hover:border-border transition-colors h-full">
              <CardContent className="p-5 flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">{label}</p>
                  <p className="text-2xl font-black tabular-nums tracking-tight">{value}</p>
                </div>
                <div className={`p-3 rounded-full bg-muted/50 border border-border/50 ${color}`}>
                  <Icon className="h-5 w-5" />
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      {/* Main List */}
      <Card className="shadow-sm border-border/60">
        <CardHeader className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 border-b border-border/50">
          <CardTitle className="text-lg font-semibold">Confirmed Orders</CardTitle>
          <div className="relative w-full sm:w-72">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-9 h-9 text-sm bg-muted/30 border-border/50 focus-visible:ring-primary/20"
              placeholder="Search by customer or QTN..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex flex-col h-48 items-center justify-center gap-3 text-muted-foreground bg-muted/10">
              <Loader2 className="h-6 w-6 animate-spin text-emerald-500" />
              <span className="text-sm font-medium">Loading quotations...</span>
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col h-48 items-center justify-center gap-3 bg-muted/10">
              <Receipt className="h-8 w-8 text-muted-foreground/50" />
              <p className="text-sm font-medium text-muted-foreground">
                {search ? "No results found." : "No quotations yet."}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader className="bg-muted/30">
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="text-xs font-semibold uppercase tracking-wider h-10">Ref. No.</TableHead>
                    <TableHead className="text-xs font-semibold uppercase tracking-wider h-10">Customer</TableHead>
                    <TableHead className="text-xs font-semibold uppercase tracking-wider h-10">Date</TableHead>
                    {canViewMoney && <TableHead className="text-xs font-semibold uppercase tracking-wider h-10 text-right">Total</TableHead>}
                    <TableHead className="text-xs font-semibold uppercase tracking-wider h-10">Status</TableHead>
                    <TableHead className="text-xs font-semibold uppercase tracking-wider h-10 text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <AnimatePresence>
                    {pagedQuotations.map((qtn, i) => {
                      const docUrl = typeof window !== "undefined" ? `${window.location.origin}/quotations/${qtn.id}` : "";

                      return (
                        <motion.tr
                          key={qtn.id}
                          initial={{ opacity: 0, y: 5 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: i * 0.02 }}
                          className="border-b border-border/50 last:border-0 hover:bg-muted/30 transition-colors group"
                        >
                          <TableCell className="py-3 text-sm font-mono font-semibold text-primary">
                            <Link href={`/quotations/${qtn.id}`} className="hover:underline">
                              {formatQtnNo(
                qtn.qtnNo,
                ["fully_paid", "scheduled", "installed", "commissioned"].includes(getStatus(qtn)),
                (qtn as any).installmentNo,
                (qtn as any).installmentPercent,
                (qtn as any).siteNo,
                (qtn as any).propNo
              )}
                            </Link>
                          </TableCell>
                          <TableCell className="py-3">
                            <Link href={`/quotations/${qtn.id}`} className="hover:underline font-semibold text-foreground hover:text-primary transition-colors text-sm">
                              {qtn.customer?.name || "Unnamed Customer"}
                            </Link>
                          </TableCell>
                          <TableCell className="py-3 text-sm text-muted-foreground">
                            {qtn.date || new Date((qtn.createdAt as any)?.seconds * 1000).toLocaleDateString()}
                          </TableCell>
                          {canViewMoney && (
                            <TableCell className="py-3 text-right text-sm font-semibold tabular-nums tracking-tight">
                              {fmtRs(qtn.total || 0)}
                            </TableCell>
                          )}
                           <TableCell className="py-3">
                            <div className="flex items-center gap-2">
                              <Badge variant={STATUS_CONFIG[getStatus(qtn)]?.variant || "outline"} className="text-[10px] uppercase font-bold tracking-wider shadow-none whitespace-nowrap">
                                {STATUS_CONFIG[getStatus(qtn)]?.label || getStatus(qtn)}
                              </Badge>
                            </div>
                          </TableCell>
                          <TableCell className="py-3">
                            <div className="flex items-center justify-end gap-2 opacity-90 group-hover:opacity-100 transition-opacity">
                              
                              {/* Quick Receipt Print Button */}
                              {["partial_payment", "fully_paid"].includes(getStatus(qtn)) && (
                                <Button size="sm" variant="outline" className="h-8 w-8 p-0 text-emerald-600 border-emerald-500/20 hover:bg-emerald-50 hover:text-emerald-700 dark:hover:bg-emerald-950/20" asChild>
                                  <Link href={`/quotations/${qtn.id}`} title="Print Receipts">
                                    <Printer className="h-3.5 w-3.5" />
                                  </Link>
                                </Button>
                              )}

                              {/* Next Step */}
                              {canCRUD && (
                                <Button size="sm" className="h-8 text-xs font-semibold shadow-sm bg-emerald-600 hover:bg-emerald-700 text-white pr-2.5" asChild>
                                  <Link href={`/quotations/${qtn.id}/order`}>
                                    Manage Order <ArrowRight className="h-3.5 w-3.5 ml-1.5" />
                                  </Link>
                                </Button>
                              )}

                              {/* Send Button */}
                              <Button 
                                variant="outline" 
                                size="sm" 
                                className="h-8 gap-1.5 text-xs font-medium border-border/60 hover:bg-muted/50"
                                onClick={() => {
                                  setShareDoc({
                                    customerName: qtn.customer?.name || "",
                                    customerPhone: qtn.customer?.phone || "",
                                    customerEmail: qtn.customer?.email || "",
                                    customerAddress: qtn.customer?.address || "",
                                    docType: "quotation",
                                    docNo: qtn.qtnNo || "No Ref",
                                    docUrl,
                                    preferredFormats: qtn.customer?.sendFormat || []
                                  });
                                  setShareOpen(true);
                                }}
                              >
                                <Send className="h-3.5 w-3.5" /> Send
                              </Button>

                              {/* More Actions Dropdown */}
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground">
                                    <MoreVertical className="h-4 w-4" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="w-40">
                                  {canCRUD && qtn.proposalId && qtn.balanceAfter !== undefined && qtn.balanceAfter > 0 && (
                                    <DropdownMenuItem asChild className="cursor-pointer">
                                      <Link href={`/proposals/${qtn.proposalId}`}><CreditCard className="h-4 w-4 mr-2 text-primary" /> Next Installment</Link>
                                    </DropdownMenuItem>
                                  )}
                                  <DropdownMenuItem asChild className="cursor-pointer">
                                    <Link href={`/quotations/${qtn.id}`}><Eye className="h-4 w-4 mr-2 text-muted-foreground" /> View PDF</Link>
                                  </DropdownMenuItem>
                                  {canCRUD && (
                                    <DropdownMenuItem asChild className="cursor-pointer">
                                      <Link href={`/quotations/${qtn.id}?edit=true`}><Pencil className="h-4 w-4 mr-2 text-muted-foreground" /> Edit</Link>
                                    </DropdownMenuItem>
                                  )}
                                  {canCRUD && (
                                    <>
                                      <DropdownMenuSeparator />
                                      <DropdownMenuItem 
                                        className="cursor-pointer text-destructive focus:text-destructive focus:bg-destructive/10"
                                        onClick={async () => {
                                          if (window.confirm("Are you sure you want to delete this quotation?")) {
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
                                        <Trash2 className="h-4 w-4 mr-2" /> Delete
                                      </DropdownMenuItem>
                                    </>
                                  )}
                                </DropdownMenuContent>
                              </DropdownMenu>

                            </div>
                          </TableCell>
                        </motion.tr>
                      );
                    })}
                  </AnimatePresence>
                </TableBody>
              </Table>
            </div>
          )}
          <Pagination
            page={page}
            pageSize={pageSize}
            total={filtered.length}
            pageSizeOptions={[25, 50, 100]}
            onPageChange={setPage}
            onPageSizeChange={(s) => { setPageSize(s); setPage(1); }}
          />
        </CardContent>
      </Card>
      {shareDoc && (
        <ShareModal
          isOpen={shareOpen}
          onClose={() => setShareOpen(false)}
          customerName={shareDoc.customerName}
          customerPhone={shareDoc.customerPhone}
          customerEmail={shareDoc.customerEmail}
          customerAddress={shareDoc.customerAddress}
          docType={shareDoc.docType}
          docNo={shareDoc.docNo}
          docUrl={shareDoc.docUrl}
          preferredFormats={shareDoc.preferredFormats}
        />
      )}
    </div>
  );
}
