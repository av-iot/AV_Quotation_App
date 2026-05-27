"use client";

import { useEffect, useState, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  doc, getDoc, updateDoc, addDoc, collection,
  serverTimestamp, query, where, getDocs, deleteDoc,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Proposal } from "@/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  ArrowLeft, Download, Loader2, FileText, Check,
  Receipt, AlertTriangle, Plus, Pencil, Lock, Printer,
  CreditCard,
  Zap,
  Grid3X3,
  Battery,
  Sun,
  Settings2,
  User,
  BadgeCheck,
  Banknote,
} from "lucide-react";
import Link from "next/link";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { motion } from "framer-motion";
import { getFormattedWarranty } from "@/lib/warranty-utils";
import { cn } from "@/lib/utils";

const DEFAULT_BANKS = [
  {
    accountName: "Alta Vision (Pvt) Ltd",
    bankName: "Sampath Bank",
    branch: "Beliatta",
    accountNumber: "1180 1400 0782",
    isDefault: false
  },
  {
    accountName: "Alta Vision (Pvt) Ltd",
    bankName: "Bank Of Ceylon (Matara Super)",
    branch: "Matara Super",
    accountNumber: "822 393 94",
    isDefault: false
  },
  {
    accountName: "Alta Vision (Pvt) Ltd",
    bankName: "NTB",
    branch: "Tangalle",
    accountNumber: "100890008235",
    isDefault: true
  },
  {
    accountName: "Alta Vision (Pvt) Ltd",
    bankName: "NTB",
    branch: "Tangalle",
    accountNumber: "100890008572",
    isDefault: false
  },
  {
    accountName: "Altavision Pvt Ltd",
    bankName: "Commercial bank",
    branch: "Deniyaya",
    accountNumber: "1000 310 632",
    isDefault: false
  }
];

const DEFAULT_ADDRESSES = [
  "No 23D, Sri Rathanapala Mawatha, Nupe, Matara",
  "42, Ruhunusiri Garden, Hakmana Road, Matara",
  "298A, Borella Road, Habarakada, Homagama"
];
import { useAuth } from "@/lib/auth-context";
import { useToast } from "@/hooks/use-toast";
import { computeOptionTotal } from "@/lib/pricing";
import { formatQtnNo } from "@/lib/format-qtn";

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
  const [project, setProject] = useState<any>(null);
  const [productsMap, setProductsMap] = useState<Map<string, any>>(new Map());
  const { user } = useAuth();
  const { toast } = useToast();

  const [showModal, setShowModal] = useState(false);
  const [showEditWarning, setShowEditWarning] = useState(false);
  const [deletingQtns, setDeletingQtns] = useState(false);
  const [selectedOptionIdx, setSelectedOptionIdx] = useState(0);
  const [converting, setConverting] = useState(false);
  const [installmentPct, setInstallmentPct] = useState("");
  const [sysSettings, setSysSettings] = useState<any>(null);
  const [selectedBank, setSelectedBank] = useState<any>(null);
  const [selectedCompanyAddress, setSelectedCompanyAddress] = useState("");
  const [validityPeriod, setValidityPeriod] = useState("• Quotation Valid for 1 week.");
  const [isExpired, setIsExpired] = useState(false);
  const [expiredLetters, setExpiredLetters] = useState<Array<{ name: string; expiryDate: string }>>([]);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [downloadDropdownOpen, setDownloadDropdownOpen] = useState(false);

  // ── Refund state ──────────────────────────────────────────────────────────
  const [showRefundModal, setShowRefundModal] = useState(false);
  const [refundAmount, setRefundAmount] = useState("");
  const [refundDate, setRefundDate] = useState(new Date().toISOString().split("T")[0]);
  const [refundMethod, setRefundMethod] = useState("Bank Transfer");
  const [refundReference, setRefundReference] = useState("");
  const [refundNotes, setRefundNotes] = useState("");
  const [savingRefund, setSavingRefund] = useState(false);

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

        const projSnap = await getDocs(
          query(collection(db, "projects"), where("proposalId", "==", id))
        );
        if (!projSnap.empty) setProject({ id: projSnap.docs[0].id, ...projSnap.docs[0].data() });

        const prodsSnap = await getDocs(collection(db, "products"));
        const pMap = new Map();
        prodsSnap.forEach(d => pMap.set(d.id, d.data()));
        setProductsMap(pMap);

        // Load Settings
        const settingsSnap = await getDoc(doc(db, "settings", "engineers"));
        const dataSettings = settingsSnap.exists() ? settingsSnap.data() : {};
        const s: any = {
          ...dataSettings,
          banks: dataSettings.banks && dataSettings.banks.length > 0 ? dataSettings.banks : DEFAULT_BANKS,
          addresses: dataSettings.addresses && dataSettings.addresses.length > 0 ? dataSettings.addresses : DEFAULT_ADDRESSES,
        };
        setSysSettings(s);

        // Initialize bank selection
        const defBank = s.banks.find((b: any) => b.isDefault) || s.banks[0];
        setSelectedBank(defBank);

        // Initialize address selection
        setSelectedCompanyAddress(s.addresses[0] || "No 23D, Sri Rathanapala Mawatha, Nupe, Matara");

          const expiredList: Array<{ name: string; expiryDate: string }> = [];
          const today = new Date();
          
          if (s.letters && Array.isArray(s.letters)) {
            s.letters.forEach((letObj: any) => {
              if (letObj.noExpiry) return;
              if (!letObj.expiryDate) return;
              const expiryDate = new Date(letObj.expiryDate);
              expiryDate.setHours(23, 59, 59, 999);
              if (today > expiryDate) {
                expiredList.push({ name: letObj.name || letObj.fileName || "Unnamed Letter", expiryDate: letObj.expiryDate });
              }
            });
          } else if (s.letterExpiryDate) {
            const expiryDate = new Date(s.letterExpiryDate);
            expiryDate.setHours(23, 59, 59, 999);
            if (today > expiryDate) {
              expiredList.push({ name: "Authorization Letters", expiryDate: s.letterExpiryDate });
            }
          }
          
          if (expiredList.length > 0) {
            setExpiredLetters(expiredList);
            setIsExpired(true);
          }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [id]);

  // Lock selected option to matching first generated quotation if any exist
  useEffect(() => {
    if (existingQtns.length > 0) {
      const firstQtn = existingQtns[0];
      if (firstQtn && typeof firstQtn.selectedOption === "number") {
        setSelectedOptionIdx(firstQtn.selectedOption);
      }
    }
  }, [existingQtns]);

  const handleToggleVat = async () => {
    if (!proposal || !user) return;
    const newVatStatus = !proposal.vatInvoice;
    try {
      await updateDoc(doc(db, "proposals", id), {
        vatInvoice: newVatStatus,
        updatedAt: serverTimestamp(),
      });
      setProposal((prev: any) => ({ ...prev, vatInvoice: newVatStatus }));
      
      const { logActivityClient } = await import("@/lib/audit-logger-client");
      await logActivityClient(user, "PROPOSAL_UPDATE", {
        proposalId: id,
        propNo: proposal.propNo,
        updatedFields: { vatInvoice: newVatStatus }
      });
      toast({
        title: "VAT Updated",
        description: `VAT Invoice is now ${newVatStatus ? "ENABLED" : "DISABLED"}.`,
      });
    } catch (err: any) {
      toast({
        title: "Failed to update VAT",
        description: err.message,
        variant: "destructive",
      });
    }
  };

  // ── Installment context (recomputed when option or existing qtns change) ──
  const ctx = useMemo(() => {
    if (!proposal) return null;
    const opt = proposal.options[selectedOptionIdx];
    const systemTotal = computeOptionTotal(opt, proposal);
    const optionQtns = existingQtns.filter((q: any) => q.selectedOption === selectedOptionIdx);
    const totalInvoiced = optionQtns.reduce(
      (s: number, q: any) => s + (q.installmentAmount ?? q.total ?? 0), 0
    );
    const balanceRemaining = Math.max(0, systemTotal - totalInvoiced);
    const installmentNo = optionQtns.length + 1;

    // Build pay schedule from proposal (pay1/pay2/pay3 + any remaining)
    const paySchedule = [
      Number(proposal.pay1) || 0,
      Number(proposal.pay2) || 0,
      Number(proposal.pay3) || 0,
    ].filter((p) => p > 0);

    const suggestedPct =
      optionQtns.length < paySchedule.length
        ? paySchedule[optionQtns.length]
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
      const cleanBrand = (brand: string) => {
        if (!brand) return "";
        const b = brand.trim();
        if (b.toLowerCase().replace(/\s+/g, "") === "trinasolar") return "Trina Solar";
        return b;
      };

      const getPanelType = (panModel: string, panBrand: string) => {
        const full = `${panBrand} ${panModel}`.toLowerCase();
        if (full.includes("bifacial") || full.includes("neg") || full.includes("dual glass")) {
          return "Bifacial";
        }
        return "Mono-facial";
      };

      const invType = inv.inverter_type || "hybrid";
      const inverterPoint = `- ${cleanBrand(inv.brand)} ${inv.ratingLabel ?? ""} ${inv.model ?? ""} ${invType} inverter * ${inv.qty}`.replace(/  +/g, " ").trim();
      const panType = getPanelType(pan.model ?? "", pan.brand ?? "");
      const panelPoint = `- ${cleanBrand(pan.brand)} ${pan.ratingLabel ?? ""} ${panType} Solar Panel * ${pan.qty}`.replace(/  +/g, " ").trim();
      // Extract leading kWh value from model (e.g. "16kWh-LFP-Series" → "16kWh"), fallback to first token of ratingLabel
      const batCapacity = bat?.model?.match(/^(\d+(?:\.\d+)?kWh)/i)?.[1] || bat?.ratingLabel?.split(/\s+/)[0] || "";
      const batteryPoint = bat ? `- ${cleanBrand(bat.brand)} ${batCapacity} Battery * ${bat.qty}`.replace(/  +/g, " ").trim() : "";
      
      const description = `Supply and installation of,\n${inverterPoint}${batteryPoint ? `\n${batteryPoint}` : ""}\n${panelPoint}`;

      // ── Warranties ──
      const hasGoodweBattery = !!(bat && (bat.brand || "").toLowerCase().includes("goodwe"));
      const rawInverterWarranty = getFormattedWarranty(
        "inverter",
        inv.brand,
        inv.model,
        inv.inverter_type || "",
        inv.warranty,
        hasGoodweBattery
      );
      const inverterWarranty = `• ${rawInverterWarranty}`;

      const batteryWarranty = bat
        ? `• ${getFormattedWarranty("battery", bat.brand, bat.model, "", bat.warranty)}`
        : "";

      const rawPanelWarranty = getFormattedWarranty(
        "panel",
        pan.brand,
        pan.model,
        pan.panel_type || "",
        pan.warranty
      );
      const panelWarranty = `• ${rawPanelWarranty}`;

      // ── Installment amounts ──
      const installmentAmount = thisAmount;
      const newTotalInvoiced = totalInvoiced + installmentAmount;
      const balanceAfter = Math.max(0, systemTotal - newTotalInvoiced);
      const isLastInstallment = balanceAfter <= 1;

      const qtnNo = `${proposal.qtnNo}/${installmentNo}`;
      const fallbackBank = sysSettings?.banks?.find((b: any) => b.isDefault) || sysSettings?.banks?.[0] || {};

      const quotation = {
        proposalId: id,
        qtnNo,
        propNo: proposal.propNo || null,
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
        validityPeriod: validityPeriod,
        paymentTerm: "• Equipment booking and project mobilization will be officially confirmed upon receipt of the payment specified in this invoice.",
        confirmedAt: new Date().toISOString(),
        confirmedBy: user.uid,
        bankDetails: {
          accountName: selectedBank?.accountName || fallbackBank?.accountName || "Alta Vision (Pvt) Ltd",
          bank: selectedBank?.bankName || fallbackBank?.bankName || "NTB",
          branch: selectedBank?.branch || fallbackBank?.branch || "Tangalle",
          accountNo: selectedBank?.accountNumber || fallbackBank?.accountNumber || "1008 9000 8235",
        },
        companyAddress: selectedCompanyAddress || sysSettings?.companyAddress || sysSettings?.address || "No 23D, Sri Rathanapala Mawatha, Nupe, Matara",
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
        selectedBank: selectedBank
          ? `${selectedBank.bankName} (${selectedBank.branch}) - ${selectedBank.accountNumber}`
          : `${fallbackBank.bankName || "NTB"} (${fallbackBank.branch || "Tangalle"}) - ${fallbackBank.accountNumber || "1008 9000 8235"}`,
        selectedCompanyAddress: selectedCompanyAddress || sysSettings?.companyAddress || sysSettings?.address || "No 23D, Sri Rathanapala Mawatha, Nupe, Matara",
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

  const handleEditClick = (e: React.MouseEvent) => {
    if (existingQtns.length > 0) {
      e.preventDefault();
      setShowEditWarning(true);
    }
  };

  const handleConfirmEdit = async () => {
    setDeletingQtns(true);
    try {
      for (const qtn of existingQtns) {
        await deleteDoc(doc(db, "quotations", qtn.id));
      }
      await updateDoc(doc(db, "proposals", id), {
        status: "draft"
      });
      router.push(`/proposals/${id}/edit`);
    } catch (err: any) {
      toast({ title: "Action failed", description: err.message, variant: "destructive" });
      setDeletingQtns(false);
    }
  };

  // ── Mark refund given ─────────────────────────────────────────────────────
  const handleMarkRefund = async () => {
    if (!user || !proposal) return;
    const amt = parseFloat(refundAmount);
    if (isNaN(amt) || amt <= 0) {
      toast({ title: "Invalid amount", description: "Enter a valid refund amount.", variant: "destructive" });
      return;
    }
    setSavingRefund(true);
    try {
      const refundRecord = {
        amount: amt,
        date: refundDate,
        method: refundMethod,
        reference: refundReference.trim() || undefined,
        notes: refundNotes.trim() || undefined,
        markedBy: user.uid,
        markedAt: new Date().toISOString(),
      };
      await updateDoc(doc(db, "proposals", id), { refundRecord });
      setProposal((prev) => prev ? { ...prev, refundRecord } : prev);
      setShowRefundModal(false);
      toast({ title: "Refund Recorded", description: `${fmtRs(amt)} marked as refunded to customer on ${refundDate}.` });
      const { logActivityClient } = await import("@/lib/audit-logger-client");
      await logActivityClient(user, "REFUND_MARKED", {
        proposalId: id,
        customerName: proposal.customer.name,
        amount: amt,
        method: refundMethod,
        reference: refundReference,
        date: refundDate,
      });
    } catch (err: any) {
      toast({ title: "Failed to save refund", description: err.message, variant: "destructive" });
    } finally {
      setSavingRefund(false);
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

  // Stage gate for next installment
  const nextInstallmentNo = (ctx?.installmentNo ?? 1);
  const projectStage = project?.stage || "";
  const INSTALLED_STAGES = ["installation_complete", "commissioned", "fully_settled"];
  const COMMISSIONED_STAGES = ["commissioned", "fully_settled"];
  const stageGateBlocked =
    nextInstallmentNo === 2 ? !INSTALLED_STAGES.includes(projectStage) :
    nextInstallmentNo >= 3 ? !COMMISSIONED_STAGES.includes(projectStage) :
    false;
  const stageGateMessage =
    nextInstallmentNo === 2 ? "Installment 2 can only be generated after the site is installed." :
    nextInstallmentNo >= 3 ? "Installment 3 can only be generated after the system is commissioned." :
    "";
  const canCRUD = user?.role && ["superadmin", "admin", "authorized"].includes(user.role);

  // Check if first installment payment has been received
  const firstPaymentDone = existingQtns.length > 0 && (existingQtns[0].paidAmount || 0) > 0;

  return (
    <div className="p-6 mx-auto max-w-4xl">
      <Button variant="ghost" className="mb-6 gap-2" asChild>
        <Link href="/proposals">
          <ArrowLeft className="h-4 w-4" />
          Back
        </Link>
      </Button>

      {/* Expiry Banner */}
      {isExpired && (
        <div className="mb-6 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/40 text-red-800 dark:text-red-300 p-4 rounded-xl text-sm flex items-start gap-3 shadow-sm">
          <AlertTriangle className="h-5 w-5 text-red-650 shrink-0 mt-0.5" />
          <div>
            <p className="font-bold text-red-900">Authorization Letters Expired</p>
            <div className="text-xs text-red-700 mt-1">
              <p>The attached authorization letters for generating proposals have passed their expiry date:</p>
              <ul className="list-disc pl-5 mt-1.5 space-y-1 font-semibold">
                {expiredLetters.map((l, i) => (
                  <li key={i}>
                    {l.name} <span className="text-slate-500 font-bold">(Expired: {l.expiryDate})</span>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-[10px] text-red-600">
                Confirming & Converting or printing this proposal is locked until the admin updates the settings.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ── Header ── */}
      <div className="mb-6 space-y-4">
        {/* Row 1: Identity */}
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 shrink-0">
            <FileText className="h-5 w-5 text-primary" />
          </div>
          <div>
            <div className="flex items-center gap-2.5 flex-wrap">
              <h1 className="text-xl font-extrabold tracking-tight">{proposal.propNo || proposal.qtnNo}</h1>
              <Badge variant={(STATUS_COLORS[proposal.status] as any) || "outline"} className="uppercase text-[9px] font-black tracking-wider">
                {proposal.status}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5 font-medium">
              Created {proposal.date} · {proposal.customer.name}
            </p>
          </div>
        </div>

        {/* Row 2: Action bar */}
        <div className="flex flex-wrap items-center gap-2 border-t border-border/50 pt-4">

          {/* Primary: Confirm/Generate */}
          {canGenerate && canCRUD && (
            <Button
              disabled={stageGateBlocked}
              onClick={() => {
                if (isExpired) {
                  toast({ title: "Action Blocked", description: "Authorization letters have expired. Please update them in settings.", variant: "destructive" });
                  return;
                }
                setShowModal(true);
              }}
              className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold shadow-sm hover:shadow-md transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {stageGateBlocked ? <Lock className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
              {existingQtns.length === 0 ? "Confirm & Convert" : "Generate Next Installment"}
            </Button>
          )}



          <div className="h-6 w-px bg-border/60" />

          {/* Edit */}
          {canCRUD && (
            <Button variant="outline" className="gap-2 font-semibold" asChild onClick={handleEditClick}>
              <Link href={`/proposals/${proposal.id}/edit`}>
                <Pencil className="h-4 w-4" />
                Edit
              </Link>
            </Button>
          )}

          {/* View */}
          <Button variant="outline" className="gap-2 font-semibold" asChild>
            <Link href={`/print/${proposal.id}`} target="_blank">
              <Printer className="h-4 w-4" />
              View
            </Link>
          </Button>

          {/* Download */}
          <div onMouseEnter={() => setDownloadDropdownOpen(true)} onMouseLeave={() => setDownloadDropdownOpen(false)} className="relative">
            <DropdownMenu open={downloadDropdownOpen} onOpenChange={setDownloadDropdownOpen}>
              <DropdownMenuTrigger asChild>
                <Button className="gap-2 bg-emerald-700 hover:bg-emerald-800 text-white font-bold shadow-sm cursor-pointer">
                  <Download className="h-4 w-4" />
                  Download
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44 border border-border rounded-xl shadow-lg p-1.5 z-50">
                <DropdownMenuItem asChild className="cursor-pointer font-semibold text-xs p-2.5 rounded-lg hover:bg-muted gap-2">
                  <a href={`/print/${proposal.id}`} target="_blank" rel="noreferrer">
                    <FileText className="h-4 w-4 text-emerald-600" /> Download PDF
                  </a>
                </DropdownMenuItem>
                <DropdownMenuItem asChild className="cursor-pointer font-semibold text-xs p-2.5 rounded-lg hover:bg-muted gap-2">
                  <a href={`/api/proposals/${proposal.id}/generate`} target="_blank" rel="noreferrer">
                    <FileText className="h-4 w-4 text-blue-600" /> Download Word
                  </a>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          <div className="h-6 w-px bg-border/60" />

          {/* Go to Project */}
          {(project || firstPaymentDone) && (
            <Button variant="outline" className="gap-2 font-semibold" asChild disabled={!project && firstPaymentDone}>
              <Link href={project ? `/projects/${project.id}` : "/projects"}>
                <Receipt className="h-4 w-4 text-blue-600" />
                {project ? `Project ${project.siteNo || ""}` : "Create Project"}
              </Link>
            </Button>
          )}

          {/* Quotation(s) */}
          {existingQtns.length === 1 ? (
            <Button variant="outline" className="gap-2 font-semibold" asChild>
              <Link href={`/quotations/${existingQtns[0].id}`}>
                <Receipt className="h-4 w-4 text-primary" />
                {formatQtnNo(existingQtns[0].qtnNo || "", ["fully_paid","scheduled","installed","commissioned"].includes(existingQtns[0].paymentStatus), existingQtns[0].installmentNo, existingQtns[0].installmentPercent, existingQtns[0].siteNo, proposal?.propNo)}
              </Link>
            </Button>
          ) : existingQtns.length > 1 ? (
            <div onMouseEnter={() => setDropdownOpen(true)} onMouseLeave={() => setDropdownOpen(false)} className="relative">
              <DropdownMenu open={dropdownOpen} onOpenChange={setDropdownOpen}>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" className="gap-2 font-semibold cursor-pointer">
                    <Receipt className="h-4 w-4 text-primary" />
                    Quotations ({existingQtns.length})
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56 bg-white border border-border rounded-xl shadow-lg p-1.5 z-50">
                  {existingQtns.map((q: any) => (
                    <DropdownMenuItem key={q.id} asChild className="cursor-pointer text-xs p-2.5 rounded-lg hover:bg-muted gap-2">
                      <Link href={`/quotations/${q.id}`}>
                        <span className="font-mono font-bold text-primary">
                          {formatQtnNo(q.qtnNo || "", ["fully_paid","scheduled","installed","commissioned"].includes(q.paymentStatus), q.installmentNo, q.installmentPercent, q.siteNo, proposal?.propNo)}
                        </span>
                        <span className="text-muted-foreground ml-auto">Inst. {q.installmentNo}</span>
                      </Link>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          ) : null}
        </div>

        {/* Stage gate notice — separate banner, never pushes buttons */}
        {stageGateBlocked && canGenerate && canCRUD && (
          <div className="flex items-center gap-2 text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/40 rounded-lg px-3 py-2 font-semibold w-fit">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
            {stageGateMessage}
          </div>
        )}
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
            <CardContent className="space-y-4">
              {/* Summary totals */}
              {(() => {
                const totalPaid = existingQtns.reduce((s: number, q: any) => s + (q.paidAmount || 0), 0);
                const contractBal = Math.max(0, ctx.systemTotal - totalPaid);
                const overpaidAmt = Math.max(0, totalPaid - ctx.systemTotal);
                const paidRatio = ctx.systemTotal > 0 ? Math.min(100, (totalPaid / ctx.systemTotal) * 100) : 0;
                return (
                  <>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      <div className="bg-muted/40 rounded-xl p-3 border border-border/60">
                        <p className="text-[9px] font-black text-muted-foreground uppercase tracking-widest mb-1">Contract Value</p>
                        <p className="font-mono font-black text-sm text-foreground">{fmtRs(ctx.systemTotal)}</p>
                      </div>
                      <div className="bg-blue-50 dark:bg-blue-950/30 rounded-xl p-3 border border-blue-100 dark:border-blue-900/40">
                        <p className="text-[9px] font-black text-blue-600 dark:text-blue-400 uppercase tracking-widest mb-1">Total Invoiced</p>
                        <p className="font-mono font-black text-sm text-blue-700 dark:text-blue-300">{fmtRs(ctx.totalInvoiced)}</p>
                      </div>
                      <div className="bg-emerald-50 dark:bg-emerald-950/30 rounded-xl p-3 border border-emerald-100 dark:border-emerald-900/40">
                        <p className="text-[9px] font-black text-emerald-600 dark:text-emerald-400 uppercase tracking-widest mb-1">Total Paid</p>
                        <p className="font-mono font-black text-sm text-emerald-700 dark:text-emerald-300">{fmtRs(totalPaid)}</p>
                      </div>
                      <div className={`rounded-xl p-3 border ${
                        contractBal > 0
                          ? "bg-amber-50 dark:bg-amber-950/30 border-amber-100 dark:border-amber-900/40"
                          : overpaidAmt > 0
                          ? "bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-900/40"
                          : "bg-emerald-50 dark:bg-emerald-950/30 border-emerald-100 dark:border-emerald-900/40"
                      }`}>
                        <p className={`text-[9px] font-black uppercase tracking-widest mb-1 ${
                          contractBal > 0 ? "text-amber-600 dark:text-amber-400"
                          : overpaidAmt > 0 ? "text-red-600 dark:text-red-400"
                          : "text-emerald-600 dark:text-emerald-400"
                        }`}>
                          {overpaidAmt > 0 ? "Refund Due" : "Balance"}
                        </p>
                        <p className={`font-mono font-black text-sm ${
                          contractBal > 0 ? "text-amber-700 dark:text-amber-300"
                          : overpaidAmt > 0 ? "text-red-700 dark:text-red-300"
                          : "text-emerald-700 dark:text-emerald-300"
                        }`}>
                          {overpaidAmt > 0 ? `+${fmtRs(overpaidAmt)}` : fmtRs(contractBal)}
                        </p>
                      </div>
                    </div>

                    {/* Refund notice */}
                    {overpaidAmt > 0 && (
                      proposal.refundRecord ? (
                        <div className="flex items-start gap-2.5 p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900/40 text-xs">
                          <BadgeCheck className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                          <div className="flex-1 min-w-0">
                            <p className="font-black text-emerald-700 dark:text-emerald-400 text-[11px] uppercase tracking-wide">Refund Given — {fmtRs(proposal.refundRecord.amount)}</p>
                            <p className="text-emerald-600 dark:text-emerald-400/80 font-semibold mt-0.5">
                              {proposal.refundRecord.method} · {proposal.refundRecord.date}
                              {proposal.refundRecord.reference && <> · Ref: {proposal.refundRecord.reference}</>}
                            </p>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-start gap-2.5 p-3 rounded-xl bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/40 text-xs">
                          <span className="text-red-500 dark:text-red-400 font-black text-base leading-none shrink-0">⚠</span>
                          <div className="flex-1 min-w-0">
                            <p className="font-black text-red-700 dark:text-red-400 text-[11px] uppercase tracking-wide">Customer Overpaid — Refund Required</p>
                            <p className="text-red-600 dark:text-red-400/80 font-semibold mt-0.5">
                              Total received ({fmtRs(totalPaid)}) exceeds contract value ({fmtRs(ctx.systemTotal)}) by <strong>{fmtRs(overpaidAmt)}</strong>.
                            </p>
                          </div>
                          {canCRUD && (
                            <Button
                              size="sm"
                              className="shrink-0 h-7 text-[10px] font-black bg-red-600 hover:bg-red-700 text-white px-2.5 gap-1"
                              onClick={() => {
                                setRefundAmount(String(overpaidAmt));
                                setRefundDate(new Date().toISOString().split("T")[0]);
                                setShowRefundModal(true);
                              }}
                            >
                              <Banknote className="h-3 w-3" />
                              Mark Refund Given
                            </Button>
                          )}
                        </div>
                      )
                    )}

                    {/* Contract progress bar */}
                    <div className="space-y-1">
                      <div className="flex justify-between text-[10px] font-bold text-muted-foreground">
                        <span>Payment Progress</span>
                        <span>{Math.min(100, paidRatio).toFixed(0)}% collected{overpaidAmt > 0 ? " (overpaid)" : ""}</span>
                      </div>
                      <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
                        <div className={`h-2 rounded-full transition-all ${overpaidAmt > 0 ? "bg-red-500" : "bg-emerald-500"}`} style={{ width: `${Math.min(100, paidRatio)}%` }} />
                      </div>
                    </div>
                  </>
                );
              })()}

              {/* Per-installment rows */}
              <div className="space-y-2 pt-1">
                {(() => {
                  let carryCredit = 0;
                  return existingQtns.map((q: any) => {
                    const isQtnPaid = ["fully_paid", "scheduled", "installed", "commissioned"].includes(q.paymentStatus);
                    const invoiced = q.installmentAmount ?? q.total ?? 0;
                    const paid = q.paidAmount || 0;
                    const isPartial = paid > 0 && paid < invoiced;

                    // Carry-credit: surplus from overpaid prior installments reduces this row's balance
                    const effectiveDue = invoiced - paid - carryCredit;
                    const rowSurplus = paid + carryCredit - invoiced;
                    carryCredit = rowSurplus > 0 ? rowSurplus : 0;
                    const shortfall = Math.max(0, effectiveDue);
                    const isSettled = effectiveDue <= 0;
                    const isOverpaid = paid > invoiced;
                    const overpaidBy = Math.max(0, paid - invoiced);

                    return (
                      <div key={q.id} className="rounded-xl border border-border/70 overflow-hidden">
                        {/* Top row: ref + status + view */}
                        <div className="flex items-center justify-between gap-2 px-3 py-2 bg-muted/30 border-b border-border/50">
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-bold text-[11px] text-primary">
                              {formatQtnNo(q.qtnNo || "", isQtnPaid, q.installmentNo, q.installmentPercent, q.siteNo, proposal?.propNo)}
                            </span>
                            <span className="text-[9px] text-muted-foreground font-semibold">
                              Installment {q.installmentNo}{q.installmentPercent ? ` (${q.installmentPercent}%)` : ""}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge
                              variant="outline"
                              className={`text-[8px] py-0 px-1.5 font-black uppercase ${
                                isSettled ? "bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800/40 text-emerald-700 dark:text-emerald-400"
                                : isPartial ? "bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800/40 text-amber-700 dark:text-amber-400"
                                : "bg-muted border-border text-muted-foreground"
                              }`}
                            >
                              {isSettled ? "Paid" : isPartial ? "Partial" : "Unpaid"}
                            </Badge>
                            <Link href={`/quotations/${q.id}`} className="text-[10px] text-primary font-bold hover:underline">
                              View →
                            </Link>
                          </div>
                        </div>

                        {/* Bottom row: invoiced / paid / outstanding */}
                        <div className="grid grid-cols-3 divide-x divide-border/50 text-xs">
                          <div className="px-3 py-2">
                            <p className="text-[9px] text-muted-foreground font-bold uppercase tracking-wider mb-0.5">Invoiced</p>
                            <p className="font-mono font-black text-foreground">{fmtRs(invoiced)}</p>
                          </div>
                          <div className="px-3 py-2">
                            <p className="text-[9px] text-emerald-600/80 font-bold uppercase tracking-wider mb-0.5">Paid</p>
                            <p className="font-mono font-black text-emerald-700">{fmtRs(paid)}</p>
                            {isOverpaid && (
                              <p className="text-[9px] text-blue-600 font-semibold">+{fmtRs(overpaidBy)} excess</p>
                            )}
                          </div>
                          <div className="px-3 py-2">
                            <p className={`text-[9px] font-bold uppercase tracking-wider mb-0.5 ${shortfall > 0 ? "text-red-500/80" : "text-emerald-600/80"}`}>
                              {shortfall > 0 ? "Outstanding" : "Settled"}
                            </p>
                            <p className={`font-mono font-black ${shortfall > 0 ? "text-red-500" : "text-emerald-600"}`}>
                              {shortfall > 0 ? fmtRs(shortfall) : "—"}
                            </p>
                          </div>
                        </div>
                      </div>
                    );
                  });
                })()}
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* ── Info Cards ── */}
      <div className="grid gap-6 md:grid-cols-2">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
          <Card className="border-border/50 shadow-sm overflow-hidden h-full">
            <div className="bg-muted/30 px-5 py-3.5 border-b flex items-center gap-2.5">
              <div className="p-1.5 rounded-md bg-blue-500/10 text-blue-600 dark:text-blue-400">
                <User className="h-4 w-4" />
              </div>
              <h3 className="text-sm font-semibold tracking-tight text-foreground">Customer Details</h3>
            </div>
            <CardContent className="p-5 space-y-4 text-sm">
              <div className="grid grid-cols-[100px_1fr] items-center gap-2">
                <span className="text-muted-foreground text-xs font-medium uppercase tracking-wider">Name</span>
                <span className="font-semibold text-foreground">{proposal.customer.name}</span>
              </div>
              <div className="grid grid-cols-[100px_1fr] items-start gap-2">
                <span className="text-muted-foreground text-xs font-medium uppercase tracking-wider mt-0.5">Address</span>
                <span className="font-medium text-foreground leading-relaxed">{proposal.customer.address}</span>
              </div>
              <div className="grid grid-cols-[100px_1fr] items-center gap-2">
                <span className="text-muted-foreground text-xs font-medium uppercase tracking-wider">Contact</span>
                <span className="font-medium text-foreground">{proposal.customer.phone}{proposal.customer.phone2 ? ` / ${proposal.customer.phone2}` : ""}</span>
              </div>
              <div className="grid grid-cols-[100px_1fr] items-center gap-2">
                <span className="text-muted-foreground text-xs font-medium uppercase tracking-wider">Email</span>
                <span className="font-medium text-foreground truncate">{proposal.customer.email || "—"}</span>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
          <Card className="border-border/50 shadow-sm overflow-hidden h-full">
            <div className="bg-muted/30 px-5 py-3.5 border-b flex items-center gap-2.5">
              <div className="p-1.5 rounded-md bg-amber-500/10 text-amber-600 dark:text-amber-400">
                <Zap className="h-4 w-4" />
              </div>
              <h3 className="text-sm font-semibold tracking-tight text-foreground">Site & System</h3>
            </div>
            <CardContent className="p-5 space-y-4 text-sm">
              <div className="grid grid-cols-[120px_1fr] items-center gap-2">
                <span className="text-muted-foreground text-xs font-medium uppercase tracking-wider">System Type</span>
                <span className="font-semibold text-foreground capitalize">{proposal.sysType}</span>
              </div>
              <div className="grid grid-cols-[120px_1fr] items-center gap-2">
                <span className="text-muted-foreground text-xs font-medium uppercase tracking-wider">Utility</span>
                <span className="font-medium text-foreground">{proposal.utility} <span className="text-muted-foreground">({proposal.phase} Phase)</span></span>
              </div>
              <div className="grid grid-cols-[120px_1fr] items-center gap-2">
                <span className="text-muted-foreground text-xs font-medium uppercase tracking-wider">Power Scheme</span>
                <span className="font-medium text-foreground">{proposal.powerScheme}</span>
              </div>
              <div className="grid grid-cols-[120px_1fr] items-center gap-2">
                <span className="text-muted-foreground text-xs font-medium uppercase tracking-wider">Payment Schedule</span>
                <span className="font-medium text-foreground bg-muted px-2 py-0.5 rounded-md text-xs">{proposal.pay1}% / {proposal.pay2}% / {proposal.pay3}%</span>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="md:col-span-2">
          <Card className="border-border/50 shadow-sm overflow-hidden">
            <div className="bg-muted/30 px-5 py-3.5 border-b flex items-center gap-2.5">
              <div className="p-1.5 rounded-md bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                <Settings2 className="h-4 w-4" />
              </div>
              <h3 className="text-sm font-semibold tracking-tight text-foreground">Options Included ({proposal.numOptions})</h3>
            </div>
            <CardContent className="p-5">
              <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3">
                {proposal.options.map((opt, i) => (
                  <div key={i} className="relative rounded-xl border border-border/60 bg-card p-5 shadow-sm transition-all hover:shadow-md hover:border-primary/30 group">
                    <div className="absolute top-0 right-0 p-3 opacity-10 pointer-events-none transition-opacity group-hover:opacity-20">
                      <Sun className="h-12 w-12 text-primary" />
                    </div>
                    <h3 className="mb-4 font-bold text-lg text-primary tracking-tight">{opt.label || `Option ${i + 1}`}</h3>
                    
                    <div className="space-y-3.5 text-sm relative z-10">
                      <div className="flex flex-col gap-1 border-b border-border/50 pb-3">
                        <span className="text-muted-foreground text-[10px] uppercase font-bold tracking-widest flex items-center gap-1.5">
                          <Settings2 className="h-3 w-3" /> Inverter
                        </span>
                        <span className="font-semibold text-foreground text-sm truncate pr-4">
                          {opt.inverter.qty}× {productsMap.get(opt.inverter.productId || opt.inverter.model)?.brand || opt.inverter.brand} {productsMap.get(opt.inverter.productId || opt.inverter.model)?.model || opt.inverter.model}
                        </span>
                      </div>
                      
                      <div className="flex flex-col gap-1 border-b border-border/50 pb-3">
                        <span className="text-muted-foreground text-[10px] uppercase font-bold tracking-widest flex items-center gap-1.5">
                          <Grid3X3 className="h-3 w-3" /> Panels
                        </span>
                        <span className="font-semibold text-foreground text-sm truncate pr-4">
                          {opt.panel.qty}× {productsMap.get(opt.panel.productId || opt.panel.model)?.brand || opt.panel.brand} {productsMap.get(opt.panel.productId || opt.panel.model)?.model || opt.panel.model}
                        </span>
                      </div>
                      
                      {opt.battery && (
                        <div className="flex flex-col gap-1 border-b border-border/50 pb-3">
                          <span className="text-muted-foreground text-[10px] uppercase font-bold tracking-widest flex items-center gap-1.5">
                            <Battery className="h-3 w-3" /> Battery
                          </span>
                          <span className="font-semibold text-foreground text-sm truncate pr-4">
                            {opt.battery.qty}× {productsMap.get(opt.battery.productId || opt.battery.model)?.brand || opt.battery.brand} {productsMap.get(opt.battery.productId || opt.battery.model)?.model || opt.battery.model}
                          </span>
                        </div>
                      )}
                      
                      <div className="pt-2 flex flex-col gap-1.5">
                        <span className="text-muted-foreground text-[10px] uppercase font-bold tracking-widest">Total System Investment</span>
                        <span className="font-black text-2xl text-emerald-600 dark:text-emerald-500 tabular-nums">
                          {fmtRs(computeOptionTotal(opt, proposal))}
                        </span>
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
          <Card className="max-w-3xl w-full shadow-2xl border bg-card max-h-[90vh] flex flex-col">
            <CardHeader className="pb-4 border-b border-border/50 shrink-0">
              <CardTitle className="text-base flex items-center gap-2">
                <Receipt className="h-5 w-5 text-green-600" />
                {existingQtns.length === 0 ? "Confirm & Generate First Invoice" : `Generate Installment ${ctx.installmentNo}`}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6 overflow-y-auto">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

                {/* LEFT: Payment summary + Option selector */}
                <div className="space-y-5">

                  {/* Payment summary */}
                  <div className="space-y-2">
                    <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Payment Summary</p>
                    <div className="bg-muted/40 rounded-xl border border-border/60 p-4 space-y-2.5 text-sm">
                      <div className="flex justify-between items-center">
                        <span className="text-muted-foreground">System Total</span>
                        <span className="font-bold font-mono">{fmtRs(ctx.systemTotal)}</span>
                      </div>
                      {ctx.totalInvoiced > 0 && (
                        <div className="flex justify-between items-center">
                          <span className="text-muted-foreground">Already Invoiced ({existingQtns.length} invoice{existingQtns.length !== 1 ? "s" : ""})</span>
                          <span className="font-semibold text-blue-600 font-mono">{fmtRs(ctx.totalInvoiced)}</span>
                        </div>
                      )}
                      {(() => {
                        // Use carry-credit logic for accurate outstanding
                        let carry = 0;
                        let netOutstanding = 0;
                        existingQtns.forEach((q: any) => {
                          const invoiced = q.installmentAmount ?? q.total ?? 0;
                          const paid = q.paidAmount || 0;
                          const due = invoiced - paid - carry;
                          carry = Math.max(0, paid + carry - invoiced);
                          netOutstanding += Math.max(0, due);
                        });
                        const totalPaidSum = existingQtns.reduce((s: number, q: any) => s + (q.paidAmount || 0), 0);
                        const overpaidAmt = Math.max(0, totalPaidSum - ctx.systemTotal);
                        if (overpaidAmt > 0) return (
                          <div className="flex justify-between items-center rounded-lg bg-red-50 dark:bg-red-950/20 border border-red-200/60 dark:border-red-800/40 px-3 py-2">
                            <span className="text-xs font-semibold text-red-600 flex items-center gap-1.5">
                              <span className="h-1.5 w-1.5 rounded-full bg-red-500 shrink-0 inline-block" />
                              Customer overpaid — refund {fmtRs(overpaidAmt)}
                            </span>
                          </div>
                        );
                        return netOutstanding > 0 ? (
                          <div className="flex justify-between items-center rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200/60 dark:border-amber-800/40 px-3 py-2">
                            <span className="text-xs font-semibold text-amber-700 flex items-center gap-1.5">
                              <span className="h-1.5 w-1.5 rounded-full bg-amber-500 shrink-0 inline-block" />
                              Net outstanding on prior invoices
                            </span>
                            <span className="font-bold font-mono text-amber-700 text-xs">{fmtRs(netOutstanding)}</span>
                          </div>
                        ) : null;
                      })()}
                      <div className="flex justify-between items-center border-t border-border/60 pt-2.5">
                        <span className="font-semibold">Balance to Invoice</span>
                        <span className={`font-bold font-mono ${ctx.balanceRemaining > 0 ? "text-amber-600" : "text-emerald-600"}`}>
                          {fmtRs(ctx.balanceRemaining)}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Option selector (only if multiple options) */}
                  {proposal.numOptions > 1 && (() => {
                    const firstQtn = existingQtns[0];
                    const isOptionLocked = existingQtns.length > 0 && firstQtn && typeof firstQtn.selectedOption === "number";
                    const lockedIdx = isOptionLocked ? firstQtn.selectedOption : null;
                    return (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Select Option</p>
                          {isOptionLocked && (
                            <span className="text-[10px] text-amber-600 font-bold bg-amber-50 dark:bg-amber-950/30 px-2 py-0.5 rounded-full border border-amber-200/50 flex items-center gap-1">
                              <Lock className="h-2.5 w-2.5" /> Option Locked (Invoiced)
                            </span>
                          )}
                        </div>
                        <div className="grid gap-2">
                          {proposal.options.map((opt, i) => {
                            const isDisabled = isOptionLocked && lockedIdx !== i;
                            return (
                              <button
                                key={i}
                                type="button"
                                disabled={isDisabled}
                                onClick={() => setSelectedOptionIdx(i)}
                                className={`flex flex-col text-left p-3 rounded-xl border-2 transition-all relative ${
                                  selectedOptionIdx === i
                                    ? "border-green-600 bg-green-50/20 dark:bg-green-950/20"
                                    : isDisabled
                                    ? "border-zinc-100 bg-zinc-50/40 opacity-40 cursor-not-allowed dark:border-zinc-800 dark:bg-zinc-900/40"
                                    : "border-muted hover:border-muted-foreground"
                                }`}
                              >
                                <div className="flex justify-between items-center w-full">
                                  <span className="font-bold text-sm text-primary">{opt.label || `Option ${i + 1}`}</span>
                                  {isOptionLocked && lockedIdx === i && (
                                    <span className="text-[10px] text-green-700 bg-green-50 dark:bg-green-950/40 px-1.5 py-0.5 rounded font-bold border border-green-200 flex items-center gap-0.5">
                                      <Check className="h-2.5 w-2.5" /> Selected Option
                                    </span>
                                  )}
                                </div>
                                <span className="text-xs text-muted-foreground mt-0.5">
                                  {opt.panel.qty}× {opt.panel.brand} / {opt.inverter.qty}× {opt.inverter.brand}
                                </span>
                                <span className="font-bold text-sm mt-1.5 text-green-600">
                                  {fmtRs(computeOptionTotal(opt, proposal))}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })()}
                </div>

                {/* RIGHT: Form inputs + actions */}
                <div className="space-y-4">

                  {/* % input */}
                  <div className="space-y-2">
                    <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">
                      This Installment (% of System Total)
                    </p>
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
                      {(() => {
                        let carry = 0;
                        let netUnpaid = 0;
                        existingQtns.forEach((q: any) => {
                          const inv = q.installmentAmount ?? q.total ?? 0;
                          const pd = q.paidAmount || 0;
                          const due = inv - pd - carry;
                          carry = Math.max(0, pd + carry - inv);
                          netUnpaid += Math.max(0, due);
                        });
                        return (
                          <div className="ml-auto text-right">
                            <span className="font-bold text-base text-green-700 font-mono block">{fmtRs(thisAmount)}</span>
                            {netUnpaid > 0 && thisAmount > 0 && (
                              <>
                                <span className="text-[10px] text-amber-600 font-semibold block">+ {fmtRs(netUnpaid)} still due</span>
                                <span className="text-[11px] font-black text-foreground font-mono block border-t border-border/50 mt-0.5 pt-0.5">= {fmtRs(thisAmount + netUnpaid)}</span>
                              </>
                            )}
                          </div>
                        );
                      })()}
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

                  {/* Bank account selector */}
                  <div className="space-y-1.5">
                    <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Bank Account</p>
                    <Select
                      value={(() => {
                        if (!sysSettings?.banks || !selectedBank) return "0";
                        const selectedNoClean = (selectedBank.accountNumber || "").replace(/\s+/g, "");
                        const idx = sysSettings.banks.findIndex((b: any) =>
                          (b.bankName || "").toLowerCase() === (selectedBank.bankName || "").toLowerCase() &&
                          (b.accountNumber || "").replace(/\s+/g, "") === selectedNoClean
                        );
                        return idx >= 0 ? idx.toString() : "0";
                      })()}
                      onValueChange={(val) => {
                        const idx = parseInt(val);
                        const bank = sysSettings?.banks?.[idx];
                        if (bank) setSelectedBank(bank);
                      }}
                    >
                      <SelectTrigger className="w-full text-xs font-semibold bg-white border border-slate-200">
                        <SelectValue placeholder="Select bank account..." />
                      </SelectTrigger>
                      <SelectContent className="bg-white">
                        {(sysSettings?.banks || []).map((b: any, idx: number) => (
                          <SelectItem key={idx} value={idx.toString()} className="text-xs font-semibold cursor-pointer">
                            {b.bankName} ({b.branch}) - {b.accountNumber}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Company address selector */}
                  <div className="space-y-1.5">
                    <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Company Address</p>
                    <Select
                      value={(() => {
                        if (!sysSettings?.addresses || !selectedCompanyAddress) return "0";
                        const idx = sysSettings.addresses.indexOf(selectedCompanyAddress);
                        return idx >= 0 ? idx.toString() : "0";
                      })()}
                      onValueChange={(val) => {
                        const idx = parseInt(val);
                        const addr = sysSettings?.addresses?.[idx];
                        if (addr) setSelectedCompanyAddress(addr);
                      }}
                    >
                      <SelectTrigger className="w-full text-xs font-semibold bg-white border border-slate-200">
                        <SelectValue placeholder="Select company address..." />
                      </SelectTrigger>
                      <SelectContent className="bg-white">
                        {(sysSettings?.addresses || []).map((addr: string, idx: number) => (
                          <SelectItem key={idx} value={idx.toString()} className="text-xs">
                            {addr}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Quotation validity */}
                  <div className="space-y-1.5">
                    <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Quotation Validity</p>
                    <Select
                      value={(() => {
                        if (validityPeriod.includes("3 days")) return "3_days";
                        if (validityPeriod.includes("14 days")) return "14_days";
                        if (validityPeriod.includes("30 days")) return "30_days";
                        return "1_week";
                      })()}
                      onValueChange={(val) => {
                        if (val === "3_days") setValidityPeriod("• Quotation Valid for 3 days.");
                        else if (val === "1_week") setValidityPeriod("• Quotation Valid for 1 week.");
                        else if (val === "14_days") setValidityPeriod("• Quotation Valid for 14 days.");
                        else if (val === "30_days") setValidityPeriod("• Quotation Valid for 30 days.");
                      }}
                    >
                      <SelectTrigger className="w-full text-xs font-semibold bg-white border border-slate-200">
                        <SelectValue placeholder="Select validity period..." />
                      </SelectTrigger>
                      <SelectContent className="bg-white">
                        <SelectItem value="3_days" className="text-xs">3 Days</SelectItem>
                        <SelectItem value="1_week" className="text-xs">7 Days (1 Week)</SelectItem>
                        <SelectItem value="14_days" className="text-xs">14 Days</SelectItem>
                        <SelectItem value="30_days" className="text-xs">30 Days</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Actions */}
                  <div className="flex gap-3 justify-end pt-3 border-t border-border/50">
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

                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── Refund Modal ── */}
      {showRefundModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in duration-200">
          <Card className="max-w-md w-full shadow-2xl border bg-card">
            <CardHeader className="pb-4 border-b border-border/50">
              <CardTitle className="text-base flex items-center gap-2">
                <Banknote className="h-5 w-5 text-emerald-600" />
                Record Refund to Customer
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6 space-y-4">
              <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/40 rounded-lg px-3 py-2 text-xs text-amber-700 dark:text-amber-400 font-semibold">
                Record that you have transferred the overpaid amount back to the customer. This does not modify any payment records — it only marks the refund as completed.
              </div>

              <div className="space-y-1.5">
                <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Refund Amount</p>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  className="font-mono font-bold"
                  value={refundAmount}
                  onChange={(e) => setRefundAmount(e.target.value)}
                  placeholder="0.00"
                />
              </div>

              <div className="space-y-1.5">
                <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Date Refunded</p>
                <Input
                  type="date"
                  value={refundDate}
                  onChange={(e) => setRefundDate(e.target.value)}
                />
              </div>

              <div className="space-y-1.5">
                <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Payment Method</p>
                <Select value={refundMethod} onValueChange={setRefundMethod}>
                  <SelectTrigger className="w-full text-xs font-semibold">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Bank Transfer">Bank Transfer</SelectItem>
                    <SelectItem value="Cash">Cash</SelectItem>
                    <SelectItem value="Cheque">Cheque</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Reference / Transaction No. <span className="normal-case font-normal">(optional)</span></p>
                <Input
                  value={refundReference}
                  onChange={(e) => setRefundReference(e.target.value)}
                  placeholder="e.g. TXN-123456 or cheque no."
                />
              </div>

              <div className="space-y-1.5">
                <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Notes <span className="normal-case font-normal">(optional)</span></p>
                <textarea
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-none"
                  rows={2}
                  value={refundNotes}
                  onChange={(e) => setRefundNotes(e.target.value)}
                  placeholder="Any additional notes about this refund…"
                />
              </div>

              <div className="flex gap-3 justify-end pt-2 border-t border-border/50">
                <Button variant="outline" onClick={() => setShowRefundModal(false)} disabled={savingRefund}>
                  Cancel
                </Button>
                <Button
                  onClick={handleMarkRefund}
                  disabled={savingRefund || !refundAmount || parseFloat(refundAmount) <= 0}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2"
                >
                  {savingRefund && <Loader2 className="h-4 w-4 animate-spin" />}
                  <Check className="h-4 w-4" />
                  Mark Refund Given
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── Edit Warning Modal ── */}
      {showEditWarning && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in duration-200">
          <Card className="max-w-md w-full shadow-2xl border-destructive/20 bg-card">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2 text-destructive">
                <AlertTriangle className="h-5 w-5" />
                Warning: Quotations Exist
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground leading-relaxed">
                This proposal already has <strong className="text-foreground">{existingQtns.length}</strong> generated quotation(s). 
              </p>
              <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-3 text-sm text-destructive font-medium">
                If you proceed to edit this proposal, all existing quotations will be permanently deleted and you will need to generate them again. 
              </div>
              <p className="text-xs text-muted-foreground">
                Only proceed if you haven't sent them to the customer yet, or if you need to completely recreate them.
              </p>
              <div className="flex gap-3 justify-end pt-4">
                <Button variant="outline" onClick={() => setShowEditWarning(false)} disabled={deletingQtns}>
                  Cancel
                </Button>
                <Button
                  onClick={handleConfirmEdit}
                  disabled={deletingQtns}
                  className="bg-destructive hover:bg-destructive/90 text-destructive-foreground gap-2"
                >
                  {deletingQtns && <Loader2 className="h-4 w-4 animate-spin" />}
                  Delete & Edit Proposal
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
