"use client";

import { useEffect, useState, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  doc, getDoc, updateDoc, addDoc, collection,
  serverTimestamp, query, where, getDocs,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Proposal } from "@/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  ArrowLeft, Download, Loader2, FileText, Check,
  Receipt, AlertTriangle, Plus,
} from "lucide-react";
import Link from "next/link";
import { motion } from "framer-motion";
import { useAuth } from "@/lib/auth-context";
import { useToast } from "@/hooks/use-toast";

const fmtRs = (n: number) =>
  "Rs. " + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const STATUS_COLORS: Record<string, string> = {
  draft: "secondary",
  sent: "default",
  confirmed: "default",
  partial: "outline",
  converted: "default",
  expired: "destructive",
};

export default function ProposalDetailPage() {
  const { id } = useParams() as { id: string };
  const router = useRouter();
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [loading, setLoading] = useState(true);
  const [existingQtns, setExistingQtns] = useState<any[]>([]);
  const [productsMap, setProductsMap] = useState<Map<string, any>>(new Map());
  const { user } = useAuth();
  const { toast } = useToast();

  const [showModal, setShowModal] = useState(false);
  const [selectedOptionIdx, setSelectedOptionIdx] = useState(0);
  const [converting, setConverting] = useState(false);
  const [installmentPct, setInstallmentPct] = useState("");

  // ── Load proposal + its existing quotations ──────────────────────────────
  useEffect(() => {
    async function load() {
      try {
        const snap = await getDoc(doc(db, "proposals", id));
        if (snap.exists()) {
          setProposal({ id: snap.id, ...snap.data() } as Proposal);
        }
        const qtnsSnap = await getDocs(
          query(collection(db, "quotations"), where("proposalId", "==", id))
        );
        const qtns = qtnsSnap.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .sort((a: any, b: any) => (a.installmentNo ?? 0) - (b.installmentNo ?? 0));
        setExistingQtns(qtns);

        const prodsSnap = await getDocs(collection(db, "products"));
        const pMap = new Map();
        prodsSnap.forEach(d => pMap.set(d.id, d.data()));
        setProductsMap(pMap);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [id]);

  // ── Installment context (recomputed when option or existing qtns change) ──
  const ctx = useMemo(() => {
    if (!proposal) return null;
    const opt = proposal.options[selectedOptionIdx];
    const systemTotal = opt?.pricing?.totalPrice ?? 0;
    const totalInvoiced = existingQtns.reduce(
      (s: number, q: any) => s + (q.installmentAmount ?? q.total ?? 0), 0
    );
    const balanceRemaining = Math.max(0, systemTotal - totalInvoiced);
    const installmentNo = existingQtns.length + 1;

    // Build pay schedule from proposal (pay1/pay2/pay3 + any remaining)
    const paySchedule = [
      Number(proposal.pay1) || 0,
      Number(proposal.pay2) || 0,
      Number(proposal.pay3) || 0,
    ].filter((p) => p > 0);

    const suggestedPct =
      existingQtns.length < paySchedule.length
        ? paySchedule[existingQtns.length]
        : // Beyond the defined schedule → suggest exact remaining %
          Math.round((balanceRemaining / systemTotal) * 10000) / 100;

    return { systemTotal, totalInvoiced, balanceRemaining, installmentNo, suggestedPct };
  }, [proposal, selectedOptionIdx, existingQtns]);

  // Pre-fill % when modal opens
  useEffect(() => {
    if (showModal && ctx) setInstallmentPct(String(ctx.suggestedPct));
  }, [showModal, ctx]);

  const pctNum = Math.max(0, Math.min(100, Number(installmentPct) || 0));
  const thisAmount = ctx ? Math.round((ctx.systemTotal * pctNum) / 100) : 0;
  const wouldExceed = ctx ? ctx.totalInvoiced + thisAmount > ctx.systemTotal + 1 : false;

  // ── Convert / Generate installment ───────────────────────────────────────
  const handleConvert = async () => {
    if (!proposal || !user || !ctx) return;
    setConverting(true);
    try {
      const opt = proposal.options[selectedOptionIdx];
      const { systemTotal, totalInvoiced, installmentNo } = ctx;

      // ── Resolve product names from Firestore if brand/model look like IDs ──
      const isRawId = (s: string) => !!s && /^[A-Za-z0-9]{15,}$/.test(s) && !s.includes(" ");

      const resolveSpec = async (spec: any) => {
        const out = { ...spec };
        if (spec?.productId && (isRawId(spec.brand) || isRawId(spec.model))) {
          const snap = await getDoc(doc(db, "products", spec.productId));
          if (snap.exists()) {
            const p = snap.data();
            out.brand = p.brand ?? out.brand;
            out.model = p.model ?? out.model;
            if (!out.ratingLabel || isRawId(out.ratingLabel)) {
              out.ratingLabel =
                p.input_rated_power
                  ? `${p.input_rated_power / 1000}kW`
                  : p.max_panel_output_power
                  ? `${p.max_panel_output_power}W`
                  : p.usable_energy
                  ? `${p.usable_energy}kWh`
                  : out.ratingLabel;
            }
            if (out.warranty === undefined || out.warranty === null) {
              out.warranty = p.warranty ?? "";
            }
          }
        }
        return out;
      };

      const inv = await resolveSpec(opt.inverter);
      const pan = await resolveSpec(opt.panel);
      const bat = opt.battery ? await resolveSpec(opt.battery) : null;

      // ── Build description ──
      const panelStr = `${pan.qty}nos of ${pan.ratingLabel ?? ""} ${pan.brand ?? ""} ${pan.model ?? ""} Solar panels`
        .replace(/\s+/g, " ").trim();
      const inverterStr = `${inv.qty > 1 ? `${inv.qty}nos of ` : ""}${inv.ratingLabel ?? ""} ${inv.brand ?? ""} ${inv.model ?? ""} hybrid inverter`
        .replace(/\s+/g, " ").trim();
      const batteryStr = bat
        ? `, ${bat.qty > 1 ? `${bat.qty}nos of ` : ""}${bat.ratingLabel ?? ""} ${bat.brand ?? ""} ${bat.model ?? ""} batteries`
        : "";
      const description = `Supply and installation of ${inverterStr}${batteryStr} with ${panelStr}`
        .replace(/\s+/g, " ").trim();

      // ── Warranties ──
      const inverterWarranty = `• ${inv.warranty ?? "5 years"} Warranty`;
      const batteryWarranty = bat ? `• ${bat.warranty ?? "5 years"} Warranty` : "";
      
      const parseYears = (w: any) => {
        if (!w) return "12";
        const match = String(w).match(/\d+/);
        return match ? match[0] : "12";
      };
      const panelWarranty = `• ${parseYears(pan.warranty)} Years Product Warranty\n• 25 Years Performance Warranty`;

      // ── Installment amounts ──
      const installmentAmount = thisAmount;
      const newTotalInvoiced = totalInvoiced + installmentAmount;
      const balanceAfter = Math.max(0, systemTotal - newTotalInvoiced);
      const isLastInstallment = balanceAfter <= 1;

      const qtnNo = `${proposal.qtnNo}/${installmentNo}`;

      const quotation = {
        proposalId: id,
        qtnNo,
        date: new Date().toISOString().split("T")[0],
        customer: proposal.customer,
        description,
        subtotal: installmentAmount,
        total: installmentAmount,
        selectedOption: selectedOptionIdx,
        paymentStatus: "pending_payment",
        inverterWarranty,
        batteryWarranty,
        panelWarranty,
        validityPeriod: "• Quotation Valid for 1 week.",
        paymentTerm: "• The job will be confirmed upon receipt of full payment.",
        confirmedAt: new Date().toISOString(),
        confirmedBy: user.uid,
        bankDetails: {
          accountName: "Alta Vision (Pvt) Ltd",
          bank: "NTB",
          branch: "Tangalle",
          accountNo: "1008 9000 8235",
        },
        // Installment tracking
        installmentNo,
        installmentPercent: pctNum,
        installmentAmount,
        systemTotal,
        totalInvoiced: newTotalInvoiced,
        balanceAfter,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };

      const qtnRef = await addDoc(collection(db, "quotations"), quotation);

      await updateDoc(doc(db, "proposals", id), {
        status: isLastInstallment ? "converted" : "partial",
      });

      const { logActivityClient } = await import("@/lib/audit-logger-client");
      await logActivityClient(user, "QUOTATION_CREATE", {
        proposalId: id,
        qtnNo,
        quotationId: qtnRef.id,
        customerName: proposal.customer.name,
        installmentNo,
        installmentAmount,
        balanceAfter,
      });

      toast({
        title: `Installment ${installmentNo} Created`,
        description: `${qtnNo} — ${fmtRs(installmentAmount)}. Balance: ${fmtRs(balanceAfter)}`,
      });

      // Refresh existing quotations list
      const fresh = await getDocs(
        query(collection(db, "quotations"), where("proposalId", "==", id))
      );
      setExistingQtns(
        fresh.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .sort((a: any, b: any) => (a.installmentNo ?? 0) - (b.installmentNo ?? 0))
      );
      setProposal((prev) =>
        prev ? { ...prev, status: isLastInstallment ? "converted" : "partial" } : prev
      );
      setShowModal(false);
    } catch (err: any) {
      toast({ title: "Generation failed", description: err.message, variant: "destructive" });
    } finally {
      setConverting(false);
    }
  };

  // ── Render states ─────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex h-[80vh] items-center justify-center gap-2 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
        <span className="text-sm">Loading proposal…</span>
      </div>
    );
  }

  if (!proposal) {
    return (
      <div className="flex h-[80vh] flex-col items-center justify-center gap-4 text-muted-foreground">
        <p>Proposal not found.</p>
        <Button variant="outline" asChild>
          <Link href="/proposals">Back to Proposals</Link>
        </Button>
      </div>
    );
  }

  const canGenerate = proposal.status !== "converted" && proposal.status !== "expired";

  return (
    <div className="p-6 mx-auto max-w-4xl">
      <Button variant="ghost" className="mb-6 gap-2" asChild>
        <Link href="/proposals">
          <ArrowLeft className="h-4 w-4" />
          Back
        </Link>
      </Button>

      {/* ── Header ── */}
      <div className="mb-8 flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
            <FileText className="h-6 w-6 text-primary" />
          </div>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold">{proposal.propNo || proposal.qtnNo}</h1>
              <Badge variant={(STATUS_COLORS[proposal.status] as any) || "outline"} className="uppercase text-[10px]">
                {proposal.status}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              Created on {proposal.date} for {proposal.customer.name}
            </p>
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          {canGenerate && (
            <Button
              onClick={() => setShowModal(true)}
              className="gap-2 bg-green-600 hover:bg-green-700 text-white"
            >
              <Plus className="h-4 w-4" />
              {existingQtns.length === 0 ? "Confirm & Convert" : "Generate Next Installment"}
            </Button>
          )}
          {proposal.docxUrl && (
            <Button asChild className="gap-2 bg-primary hover:bg-primary/90">
              <a href={proposal.docxUrl} target="_blank" rel="noreferrer">
                <Download className="h-4 w-4" />
                Download Word
              </a>
            </Button>
          )}
        </div>
      </div>

      {/* ── Installment Progress Card (shown once any quotation exists) ── */}
      {existingQtns.length > 0 && ctx && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mb-6">
          <Card className="border-primary/20 bg-primary/5">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <Receipt className="h-4 w-4 text-primary" />
                Payment Installment Progress
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-4 text-sm mb-4">
                <div>
                  <p className="text-xs text-muted-foreground">System Total</p>
                  <p className="font-bold text-base">{fmtRs(ctx.systemTotal)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Total Invoiced</p>
                  <p className="font-bold text-base text-blue-600">{fmtRs(ctx.totalInvoiced)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Balance Remaining</p>
                  <p className={`font-bold text-base ${ctx.balanceRemaining > 0 ? "text-amber-600" : "text-emerald-600"}`}>
                    {fmtRs(ctx.balanceRemaining)}
                  </p>
                </div>
              </div>
              {/* Progress bar */}
              <div className="w-full bg-muted rounded-full h-2">
                <div
                  className="bg-primary rounded-full h-2 transition-all"
                  style={{ width: `${Math.min(100, (ctx.totalInvoiced / ctx.systemTotal) * 100)}%` }}
                />
              </div>
              <div className="mt-3 space-y-1">
                {existingQtns.map((q: any) => (
                  <div key={q.id} className="flex items-center justify-between text-xs text-muted-foreground">
                    <span className="font-mono font-medium text-primary">{q.qtnNo}</span>
                    <span>Installment {q.installmentNo} — {fmtRs(q.installmentAmount ?? q.total)}</span>
                    <Link href={`/quotations/${q.id}`} className="text-primary underline-offset-2 hover:underline">
                      View
                    </Link>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* ── Info Cards ── */}
      <div className="grid gap-6 md:grid-cols-2">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
          <Card>
            <CardHeader><CardTitle className="text-sm">Customer Details</CardTitle></CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div><span className="text-muted-foreground block text-xs">Name</span><span className="font-medium">{proposal.customer.name}</span></div>
              <div><span className="text-muted-foreground block text-xs">Address</span><span className="font-medium">{proposal.customer.address}</span></div>
              <div><span className="text-muted-foreground block text-xs">Contact</span><span className="font-medium">{proposal.customer.phone}{proposal.customer.phone2 ? ` / ${proposal.customer.phone2}` : ""}</span></div>
              <div><span className="text-muted-foreground block text-xs">Email</span><span className="font-medium">{proposal.customer.email || "—"}</span></div>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
          <Card>
            <CardHeader><CardTitle className="text-sm">Site & System</CardTitle></CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div><span className="text-muted-foreground block text-xs">System Type</span><span className="font-medium capitalize">{proposal.sysType}</span></div>
              <div><span className="text-muted-foreground block text-xs">Utility</span><span className="font-medium">{proposal.utility} ({proposal.phase} Phase)</span></div>
              <div><span className="text-muted-foreground block text-xs">Power Scheme</span><span className="font-medium">{proposal.powerScheme}</span></div>
              <div><span className="text-muted-foreground block text-xs">Payment Schedule</span><span className="font-medium">{proposal.pay1}% / {proposal.pay2}% / {proposal.pay3}%</span></div>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="md:col-span-2">
          <Card>
            <CardHeader><CardTitle className="text-sm">Options Included ({proposal.numOptions})</CardTitle></CardHeader>
            <CardContent>
              <div className="grid gap-6 sm:grid-cols-2">
                {proposal.options.map((opt, i) => (
                  <div key={i} className="rounded-lg border p-4">
                    <h3 className="mb-2 font-semibold text-primary">{opt.label}</h3>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between border-b pb-1">
                        <span className="text-muted-foreground text-xs">Inverter</span>
                        <span className="font-medium text-right text-xs max-w-[160px] truncate">
                          {opt.inverter.qty}× {productsMap.get(opt.inverter.productId || opt.inverter.model)?.brand || opt.inverter.brand} {productsMap.get(opt.inverter.productId || opt.inverter.model)?.model || opt.inverter.model}
                        </span>
                      </div>
                      <div className="flex justify-between border-b pb-1">
                        <span className="text-muted-foreground text-xs">Panels</span>
                        <span className="font-medium text-right text-xs max-w-[160px] truncate">
                          {opt.panel.qty}× {productsMap.get(opt.panel.productId || opt.panel.model)?.brand || opt.panel.brand} {productsMap.get(opt.panel.productId || opt.panel.model)?.model || opt.panel.model}
                        </span>
                      </div>
                      {opt.battery && (
                        <div className="flex justify-between border-b pb-1">
                          <span className="text-muted-foreground text-xs">Battery</span>
                          <span className="font-medium text-right text-xs max-w-[160px] truncate">
                            {opt.battery.qty}× {productsMap.get(opt.battery.productId || opt.battery.model)?.brand || opt.battery.brand} {productsMap.get(opt.battery.productId || opt.battery.model)?.model || opt.battery.model}
                          </span>
                        </div>
                      )}
                      <div className="flex justify-between pt-1">
                        <span className="text-muted-foreground font-semibold">Total Price</span>
                        <span className="font-bold">{fmtRs(opt.pricing.totalPrice)}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* ── Installment Modal ── */}
      {showModal && ctx && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in duration-200">
          <Card className="max-w-md w-full shadow-2xl border bg-card">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Receipt className="h-5 w-5 text-green-600" />
                {existingQtns.length === 0 ? "Confirm & Generate First Invoice" : `Generate Installment ${ctx.installmentNo}`}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">

              {/* Option selector (only if multiple options) */}
              {proposal.numOptions > 1 && (
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-muted-foreground uppercase">Select Option</label>
                  <div className="grid gap-2">
                    {proposal.options.map((opt, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => setSelectedOptionIdx(i)}
                        className={`flex flex-col text-left p-3 rounded-lg border-2 transition-all ${
                          selectedOptionIdx === i
                            ? "border-green-600 bg-green-50/20 dark:bg-green-950/20"
                            : "border-muted hover:border-muted-foreground"
                        }`}
                      >
                        <span className="font-bold text-sm text-primary">{opt.label || `Option ${i + 1}`}</span>
                        <span className="text-xs text-muted-foreground mt-0.5">
                          {opt.panel.qty}× {opt.panel.brand} / {opt.inverter.qty}× {opt.inverter.brand}
                        </span>
                        <span className="font-bold text-sm mt-1.5 text-green-600">{fmtRs(opt.pricing.totalPrice)}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Payment summary */}
              <div className="bg-muted/40 rounded-lg p-4 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">System Total</span>
                  <span className="font-bold">{fmtRs(ctx.systemTotal)}</span>
                </div>
                {ctx.totalInvoiced > 0 && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Already Invoiced ({existingQtns.length} invoice{existingQtns.length !== 1 ? "s" : ""})</span>
                    <span className="font-semibold text-blue-600">{fmtRs(ctx.totalInvoiced)}</span>
                  </div>
                )}
                <div className="flex justify-between border-t pt-2 mt-1">
                  <span className="font-semibold">Balance Remaining</span>
                  <span className={`font-bold ${ctx.balanceRemaining > 0 ? "text-amber-600" : "text-emerald-600"}`}>
                    {fmtRs(ctx.balanceRemaining)}
                  </span>
                </div>
              </div>

              {/* % input */}
              <div className="space-y-2">
                <label className="text-xs font-semibold text-muted-foreground uppercase">
                  This Installment (% of System Total)
                </label>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    min="0"
                    max="100"
                    step="0.01"
                    className="w-28 text-center font-mono font-bold"
                    value={installmentPct}
                    onChange={(e) => setInstallmentPct(e.target.value)}
                  />
                  <span className="text-sm text-muted-foreground font-semibold">%</span>
                  <span className="ml-auto font-bold text-base text-green-700">{fmtRs(thisAmount)}</span>
                </div>
                {wouldExceed && (
                  <div className="flex items-center gap-1.5 text-xs text-destructive">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    Amount exceeds the remaining balance. Reduce the percentage.
                  </div>
                )}
                {!wouldExceed && thisAmount > 0 && ctx.balanceRemaining - thisAmount === 0 && (
                  <p className="text-xs text-emerald-600 font-medium">✓ This will fully settle the balance.</p>
                )}
              </div>

              <div className="flex gap-3 justify-end pt-1">
                <Button variant="outline" onClick={() => setShowModal(false)} disabled={converting}>
                  Cancel
                </Button>
                <Button
                  onClick={handleConvert}
                  disabled={converting || wouldExceed || pctNum <= 0}
                  className="bg-green-600 hover:bg-green-700 text-white gap-2"
                >
                  {converting && <Loader2 className="h-4 w-4 animate-spin" />}
                  <Check className="h-4 w-4" />
                  Generate Invoice
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
