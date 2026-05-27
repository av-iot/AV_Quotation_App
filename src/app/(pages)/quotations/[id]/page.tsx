"use client";

import Image from "next/image";
import { useEffect, useState, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import { doc, getDoc, updateDoc, addDoc, collection, getDocs, query, where, serverTimestamp, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/auth-context";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import {
  ArrowLeft, Printer, Edit2, Save, X, Loader2, CheckCircle2, Clock,
  Receipt, Landmark, ShieldCheck, CalendarRange, Scale, CreditCard, MapPin,
  Send, Hash, AlertTriangle, BadgeCheck, ArrowRight, Banknote,
} from "lucide-react";
import Link from "next/link";
import type { Quotation, QuotationStatus } from "@/types";
import { generateSiteNumber } from "@/lib/project-utils";
import { formatQtnNo } from "@/lib/format-qtn";
import ShareModal from "@/components/proposals/ShareModal";
import { getFormattedWarranty } from "@/lib/warranty-utils";

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

const STATUS_CONFIG: Record<QuotationStatus, { label: string; color: string; badge: "default" | "secondary" | "destructive" | "outline" }> = {
  pending_payment: { label: "Pending payment", color: "text-amber-500 bg-amber-500/10 border-amber-500/30", badge: "outline" },
  partial_payment: { label: "Partial payment", color: "text-blue-500 bg-blue-500/10 border-blue-500/30", badge: "secondary" },
  fully_paid: { label: "Fully paid", color: "text-emerald-500 bg-emerald-500/10 border-emerald-500/30", badge: "default" },
  scheduled: { label: "Scheduled", color: "text-purple-500 bg-purple-500/10 border-purple-500/30", badge: "default" },
  installed: { label: "Installed", color: "text-cyan-500 bg-cyan-500/10 border-cyan-500/30", badge: "default" },
  commissioned: { label: "Commissioned", color: "text-primary bg-primary/10 border-primary/30", badge: "default" },
};

// Currency
const fmtRs = (n: number) =>
  "Rs. " + n.toLocaleString("en-US", { 
    minimumFractionDigits: 2, 
    maximumFractionDigits: 2 
  });

// Date  
const fmtDate = (iso: string) => {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("en-GB", { 
      day: "numeric", month: "long", year: "numeric" 
    });
  } catch (e) {
    return iso || "—";
  }
};



export default function QuotationDetailPage() {
  const { id } = useParams() as { id: string };
  const router = useRouter();
  const { user } = useAuth();
  const { toast } = useToast();

  const [allPriorQtns, setAllPriorQtns] = useState<any[]>([]);
  const [qtn, setQtn] = useState<any | null>(null);
  const isPaid = qtn ? ["fully_paid", "scheduled", "installed", "commissioned"].includes(qtn.paymentStatus) : false;
  const isInvoiceDoc = qtn ? ((qtn.installmentNo ?? 0) > 1 || (qtn.installmentPercent === 100 && isPaid)) : false;
  const [proposal, setProposal] = useState<any | null>(null);
  const [sysSettings, setSysSettings] = useState<any | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const fallbackBank = sysSettings?.banks?.find((b: any) => b.isDefault) || sysSettings?.banks?.[0] || {};

  const currentBankIndex = (() => {
    if (!sysSettings?.banks) return "0";
    if (!qtn?.bankDetails) {
      const defIdx = sysSettings.banks.findIndex((b: any) => b.isDefault);
      return defIdx >= 0 ? defIdx.toString() : "0";
    }
    const qtnAccNoClean = (qtn.bankDetails.accountNo || "").replace(/\s+/g, "");
    const idx = sysSettings.banks.findIndex((b: any) => 
      (b.bankName || "").toLowerCase() === (qtn.bankDetails.bank || "").toLowerCase() &&
      (b.accountNumber || "").replace(/\s+/g, "") === qtnAccNoClean
    );
    if (idx >= 0) return idx.toString();
    const idxByNo = sysSettings.banks.findIndex((b: any) => 
      (b.accountNumber || "").replace(/\s+/g, "") === qtnAccNoClean
    );
    if (idxByNo >= 0) return idxByNo.toString();
    const defIdx = sysSettings.banks.findIndex((b: any) => b.isDefault);
    return defIdx >= 0 ? defIdx.toString() : "0";
  })();

  const currentAddressIndex = (() => {
    const addresses = sysSettings?.addresses || [];
    if (!addresses.length) return "0";
    const currentAddr = qtn?.companyAddress || sysSettings?.companyAddress || sysSettings?.address || "";
    if (currentAddr) {
      const idx = addresses.findIndex((addr: string) =>
        (addr || "").trim().toLowerCase() === currentAddr.trim().toLowerCase()
      );
      if (idx >= 0) return idx.toString();
    }
    const homagamaIdx = addresses.findIndex((addr: string) =>
      addr.toLowerCase().includes("homagama")
    );
    return homagamaIdx >= 0 ? homagamaIdx.toString() : "0";
  })();

  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);

  // Payment recording states
  const [receipts, setReceipts] = useState<any[]>([]);
  const [payAmount, setPayAmount] = useState("");
  const [payDate, setPayDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [payNotes, setPayNotes] = useState("");
  const [recordingPayment, setRecordingPayment] = useState(false);

  // Refund modal states
  const [showRefundModal, setShowRefundModal] = useState(false);
  const [refundAmount, setRefundAmount] = useState("");
  const [refundDate, setRefundDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [refundMethod, setRefundMethod] = useState("Bank Transfer");
  const [refundReference, setRefundReference] = useState("");
  const [refundNotes, setRefundNotes] = useState("");
  const [savingRefund, setSavingRefund] = useState(false);

  // Carry-credit computation across all installments (used in lifecycle stepper + all-stages section)
  const stageRows = useMemo(() => {
    let carry = 0;
    return allPriorQtns.map((q: any) => {
      const inv = q.installmentAmount ?? q.total ?? 0;
      const pd = q.paidAmount || 0;
      const prevCarry = carry;
      const effectiveDue = inv - pd - carry;
      const surplus = pd + carry - inv;
      carry = surplus > 0 ? surplus : 0;
      return {
        ...q, inv, pd, effectiveDue,
        isSettled: effectiveDue <= 0,
        shortfall: Math.max(0, effectiveDue),
        carryApplied: prevCarry,
        surplus: Math.max(0, surplus),
      };
    });
  }, [allPriorQtns]);

  // Row for the current invoice — used outside the IIFE for status badge + progress
  const thisStageRow = stageRows.find(r => r.id === id);
  const isSettledByCarry = !!(thisStageRow?.isSettled && !isPaid);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      if (params.get("edit") === "true") {
        setIsEditing(true);
      }
    }
  }, []);

  // Edit fields state
  const [editQtnNo, setEditQtnNo] = useState("");
  const [editDate, setEditDate] = useState("");
  const [editCustName, setEditCustName] = useState("");
  const [editCustAddress, setEditCustAddress] = useState("");
  const [editCustPhone, setEditCustPhone] = useState("");
  const [editCustEmail, setEditCustEmail] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editTotal, setEditTotal] = useState("");
  const [editInverterWarranty, setEditInverterWarranty] = useState("");
  const [editBatteryWarranty, setEditBatteryWarranty] = useState("");
  const [editPanelWarranty, setEditPanelWarranty] = useState("");
  const [editValidityPeriod, setEditValidityPeriod] = useState("");
  const [editPaymentTerm, setEditPaymentTerm] = useState("");
  const [editNotes, setEditNotes] = useState("");
  
  // Bank Details state
  const [editAccName, setEditAccName] = useState("");
  const [editBank, setEditBank] = useState("");
  const [editBranch, setEditBranch] = useState("");
  const [editAccNo, setEditAccNo] = useState("");
  const getValidityKey = (val: string) => {
    if (val.includes("3 days")) return "3_days";
    if (val.includes("14 days")) return "14_days";
    if (val.includes("30 days")) return "30_days";
    return "1_week";
  };

  const [editCompanyAddress, setEditCompanyAddress] = useState("");

  useEffect(() => {
    async function loadQuotation() {
      try {
        const snap = await getDoc(doc(db, "quotations", id));
        if (snap.exists()) {
          const data = snap.data();
          setQtn({ id: snap.id, ...data });
          setEditCompanyAddress(data.companyAddress || "");
          
          // Pre-populate edit states
          setEditQtnNo(data.qtnNo || "");
          setEditDate(data.date || "");
          setEditCustName(data.customer?.name || "");
          setEditCustAddress(data.customer?.address || "");
          setEditCustPhone(data.customer?.phone || "");
          setEditCustEmail(data.customer?.email || "");
          
          // Support fallbacks for older quotes
          setEditDescription(data.description || data.items?.map((i: any) => i.description).join(", ") || "");
          setEditTotal(data.total?.toString() || "0");
          const hasBattery = (data.description || "").toLowerCase().includes("battery") ||
                             (data.description || "").toLowerCase().includes("lx u") ||
                             (data.batteryWarranty && data.batteryWarranty.trim().length > 0) ||
                             (data.items || []).some((i: any) => (i.description || "").toLowerCase().includes("battery"));
          const isHybrid = (data.description || "").toLowerCase().includes("hybrid") ||
                           (data.items || []).some((i: any) => (i.description || "").toLowerCase().includes("hybrid")) ||
                           hasBattery;
          const isGoodwe = (data.description || "").toLowerCase().includes("goodwe") ||
                           (data.items || []).some((i: any) => (i.description || "").toLowerCase().includes("goodwe"));
          
          let defaultInverterWarranty = "• 10 Year Product Warranty";
          if (isGoodwe) {
            if (isHybrid) {
              const hasGoodweBattery = (data.description || "").toLowerCase().includes("goodwe") && hasBattery;
              defaultInverterWarranty = hasGoodweBattery 
                ? "• 10 Year Product Warranty"
                : "• 5 Year Product Warranty + 5 Year Extended Warranty";
            } else {
              defaultInverterWarranty = "• 10 Year Product Warranty";
            }
          } else {
            if (isHybrid) {
              defaultInverterWarranty = "• 5 Year Product Warranty + 5 Year Extended Warranty";
            }
          }

          setEditInverterWarranty(data.inverterWarranty || defaultInverterWarranty);
          
          let defaultBatteryWarranty = "";
          if (hasBattery) {
            defaultBatteryWarranty = "• 5 Year Product Warranty + 5 Year Extended Warranty";
          }
          setEditBatteryWarranty(data.batteryWarranty || defaultBatteryWarranty);
          setEditPanelWarranty(data.panelWarranty || "• 12 Year Product Warranty\n• 25 Year Performance Warranty");
          setEditValidityPeriod(data.validityPeriod || "• Quotation Valid for 1 week.");
          setEditPaymentTerm(data.paymentTerm || "• Equipment booking and project mobilization will be officially confirmed upon receipt of the payment specified in this invoice.");
          setEditNotes(data.notes || "");
          
           // Load parent proposal if proposalId exists
          if (data.proposalId) {
            const propSnap = await getDoc(doc(db, "proposals", data.proposalId));
            if (propSnap.exists()) {
              setProposal({ id: propSnap.id, ...propSnap.data() });
            }

            const priorSnap = await getDocs(
              query(collection(db, "quotations"), where("proposalId", "==", data.proposalId))
            );
            const priors = priorSnap.docs
              .map((d) => ({ id: d.id, ...d.data() }))
              .sort((a: any, b: any) => (a.installmentNo ?? 0) - (b.installmentNo ?? 0));
            setAllPriorQtns(priors);
            // Load all receipts for this project (proposalId)
            const recSnap = await getDocs(
              query(collection(db, "receipts"), where("proposalId", "==", data.proposalId))
            );
            const rList = recSnap.docs
              .map((d) => ({ id: d.id, ...d.data() }))
              .sort((a: any, b: any) => (a.date && b.date ? a.date.localeCompare(b.date) : 0));
            setReceipts(rList);

            // Set up real-time listeners for quotations and receipts
            const qtnUnsub = onSnapshot(
              query(collection(db, "quotations"), where("proposalId", "==", data.proposalId)),
              (snapshot) => {
                const updatedQtns = snapshot.docs
                  .map((d) => ({ id: d.id, ...d.data() }))
                  .sort((a: any, b: any) => (a.installmentNo ?? 0) - (b.installmentNo ?? 0));
                setAllPriorQtns(updatedQtns);
              }
            );

            const recUnsub = onSnapshot(
              query(collection(db, "receipts"), where("proposalId", "==", data.proposalId)),
              (snapshot) => {
                const updatedRecs = snapshot.docs
                  .map((d) => ({ id: d.id, ...d.data() }))
                  .sort((a: any, b: any) => (a.date && b.date ? a.date.localeCompare(b.date) : 0));
                setReceipts(updatedRecs);
              }
            );
          }

          // Load settings/engineers for logo, address, bank, letters
          const settingsSnap = await getDoc(doc(db, "settings", "engineers"));
          const dataSettings = settingsSnap.exists() ? settingsSnap.data() : {};
          const mergedSettings: any = {
            ...dataSettings,
            banks: dataSettings.banks && dataSettings.banks.length > 0 ? dataSettings.banks : DEFAULT_BANKS,
            addresses: dataSettings.addresses && dataSettings.addresses.length > 0 ? dataSettings.addresses : DEFAULT_ADDRESSES,
          };
          setSysSettings(mergedSettings);

          // Bank details and company address fallback using merged settings
          const defBank = mergedSettings.banks.find((b: any) => b.isDefault) || mergedSettings.banks[0];
          setEditAccName(data.bankDetails?.accountName || defBank?.accountName || "Alta Vision (Pvt) Ltd");
          setEditBank(data.bankDetails?.bank || defBank?.bankName || "NTB");
          setEditBranch(data.bankDetails?.branch || defBank?.branch || "Tangalle");
          setEditAccNo(data.bankDetails?.accountNo || defBank?.accountNumber || "1008 9000 8235");

          setEditCompanyAddress(data.companyAddress || mergedSettings.addresses?.[0] || "No 23D, Sri Rathanapala Mawatha, Nupe, Matara");
        } else {
          toast({
            title: "Quotation not found",
            description: "The quotation could not be resolved in the database.",
            variant: "destructive",
          });
        }
      } catch (err: any) {
        console.error("Error loading quotation:", err);
      } finally {
        setLoading(false);
      }
    }
    loadQuotation();
  }, [id, toast]);

  // Set document title for PDF print filename
  useEffect(() => {
    if (qtn) {
      const qtnBase = formatQtnNo(qtn.qtnNo, isPaid, qtn.installmentNo, qtn.installmentPercent, qtn.siteNo, proposal?.propNo) || (isPaid ? "Invoice" : "Proforma_Invoice");
      const rawDate = qtn.confirmedAt || qtn.date || qtn.createdAt;
      const dateStr = rawDate ? new Date(rawDate).toLocaleDateString("en-GB").replace(/\//g, "-") : "";
      document.title = `${qtnBase}_${dateStr}`;
    }
  }, [qtn, isPaid, proposal]);

  const handleToggleVat = async () => {
    if (!qtn || !user) return;
    const currentVatStatus = qtn.vatInvoice ?? proposal?.vatInvoice ?? false;
    const newVatStatus = !currentVatStatus;
    try {
      await updateDoc(doc(db, "quotations", id), {
        vatInvoice: newVatStatus,
        updatedAt: serverTimestamp(),
      });
      setQtn((prev: any) => ({ ...prev, vatInvoice: newVatStatus }));
      const { logActivityClient } = await import("@/lib/audit-logger-client");
      await logActivityClient(user, "QUOTATION_UPDATE", {
        quotationId: id,
        qtnNo: qtn.qtnNo,
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

  const handleUpdateStatus = async (newStatus: QuotationStatus) => {
    if (!qtn || !user) return;
    setUpdatingStatus(true);
    try {
      await updateDoc(doc(db, "quotations", id), {
        paymentStatus: newStatus,
        updatedAt: serverTimestamp(),
      });

      // Update local state
      setQtn((prev: any) => ({ ...prev, paymentStatus: newStatus }));

      // Log status change
      const { logActivityClient } = await import("@/lib/audit-logger-client");
      await logActivityClient(user, "QUOTATION_STATUS_UPDATE", {
        quotationId: id,
        qtnNo: qtn.qtnNo,
        customerName: qtn.customer?.name,
        oldStatus: qtn.paymentStatus,
        newStatus,
      });

      toast({
        title: "Status Updated",
        description: `Quotation status updated to ${STATUS_CONFIG[newStatus].label}.`,
      });
    } catch (err: any) {
      toast({
        title: "Failed to update status",
        description: err.message,
        variant: "destructive",
      });
    } finally {
      setUpdatingStatus(false);
    }
  };

  const handleRecordPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!qtn || !user) return;

    const amt = parseFloat(payAmount);
    if (isNaN(amt) || amt <= 0) {
      toast({ title: "Invalid Amount", description: "Please enter a positive numeric payment amount.", variant: "destructive" });
      return;
    }

    const qtnTotal = qtn.installmentAmount || qtn.total || 0;
    // Overpayments are allowed — the excess carries forward to reduce the next installment's balance.
    // No hard block; we just record it and show the carry-credit on the proposal page.

    setRecordingPayment(true);
    try {
      // 1. Generate Receipt number: REC{YYYYMMDD}{counter}
      const pd = new Date(payDate);
      const dateStr = `${pd.getFullYear()}${String(pd.getMonth() + 1).padStart(2, "0")}${String(pd.getDate()).padStart(2, "0")}`;
      const dayPrefix = `REC${dateStr}`;
      const receiptsSnap = await getDocs(collection(db, "receipts"));
      let maxSerial = 0;
      receiptsSnap.forEach((docSnap) => {
        const data = docSnap.data();
        if (data.receiptNo && data.receiptNo.startsWith(dayPrefix)) {
          const counter = parseInt(data.receiptNo.replace(dayPrefix, ""), 10);
          if (!isNaN(counter) && counter > maxSerial) maxSerial = counter;
        }
      });
      const receiptNo = `${dayPrefix}${String(maxSerial + 1).padStart(2, "0")}`;

      const newReceipt: any = {
        receiptNo,
        quotationId: id,
        proposalId: qtn.proposalId,
        projectNo: "Pending",
        amount: amt,
        date: payDate,
        notes: payNotes.trim() || "Progress Payment received.",
        createdAt: serverTimestamp(),
      };

      // 2. Update Quotation paid amount & payment status
      const currentPaid = qtn.paidAmount || 0;
      const newPaid = currentPaid + amt;
      const isQtnFullyPaid = newPaid >= qtnTotal - 1;
      const newStatus = isQtnFullyPaid ? "fully_paid" : "partial_payment";

      await updateDoc(doc(db, "quotations", id), {
        paidAmount: newPaid,
        paymentStatus: newStatus,
        updatedAt: serverTimestamp()
      });

      // 3. Get or Create Project automatically
      let activeSiteNo = "Pending";
      const projSnap = await getDocs(query(collection(db, "projects"), where("proposalId", "==", qtn.proposalId)));
      
      if (projSnap.empty) {
        // Generate site number
        const sysType = qtn.systemType || proposal?.sysType || "ongrid";
        const mountType = proposal?.mountType || "roof";
        const generatedNo = await generateSiteNumber(sysType, mountType, false);
        activeSiteNo = generatedNo;

        // Extract equipment from proposal option
        const opt = proposal?.options?.[qtn.selectedOption || 0];
        const equipment = [];
        const isoNow = new Date().toISOString();
        if (opt?.inverter?.brand) {
          equipment.push({
            id: Math.random().toString(36).substring(2) + Date.now().toString(36),
            type: "inverter",
            brand: opt.inverter.brand || "",
            model: opt.inverter.model || "",
            capacity: parseFloat(opt.inverter.totalCapacity) || 0,
            qty: parseInt(opt.inverter.qty) || 1,
            addedAt: isoNow
          });
        }
        if (opt?.panel?.brand) {
          equipment.push({
            id: Math.random().toString(36).substring(2) + Date.now().toString(36),
            type: "panel",
            brand: opt.panel.brand || "",
            model: opt.panel.model || "",
            capacity: parseInt(opt.panel.model?.match(/\d+/)?.[0] || "575") || 0,
            qty: parseInt(opt.panel.qty) || 0,
            addedAt: isoNow
          });
        }
        if (opt?.battery?.brand) {
          equipment.push({
            id: Math.random().toString(36).substring(2) + Date.now().toString(36),
            type: "battery",
            brand: opt.battery.brand || "",
            model: opt.battery.model || "",
            capacity: parseFloat(opt.battery.totalCapacity) || 0,
            qty: parseInt(opt.battery.qty) || 1,
            addedAt: isoNow
          });
        }

        // Auto-create project
        const projectData = {
          proposalId: qtn.proposalId,
          siteNo: generatedNo,
          customer: {
            name: qtn.customer?.name || "—",
            phone: qtn.customer?.phone || "—",
            address: qtn.customer?.address || "—",
            email: qtn.customer?.email || "",
          },
          systemType: sysType,
          mountType: mountType,
          isOtherCompany: false,
          stage: "confirmed", // Confirmed stage
          systemTotal: qtn.systemTotal || qtn.total || 0,
          totalPaid: amt,
          balanceDue: Math.max(0, (qtn.systemTotal || qtn.total || 0) - amt),
          equipment,
          inverterBrand: opt?.inverter?.brand || "—",
          inverterModel: opt?.inverter?.model || "—",
          inverterCapacity: parseFloat(opt?.inverter?.totalCapacity) || 0,
          noOfPanels: parseInt(opt?.panel?.qty) || 0,
          panelWattage: parseInt(opt?.panel?.model?.match(/\d+/)?.[0] || "575") || 0,
          panelModel: opt?.panel?.model || "—",
          solarCapacity: parseFloat(opt?.panel?.totalCapacity) || 0,
          utilityProvider: proposal?.utility || "CEB",
          areaOffice: "—",
          siteEngineer: "—",
          wifiUsername: "",
          wifiPassword: "",
          invSerialNo: "",
          invCheckCode: "",
          latitude: null,
          longitude: null,
          installedAt: "—",
          commissionedAt: "—",
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        };

        await addDoc(collection(db, "projects"), projectData);

        // Update all quotations under the same proposal with the generated site number
        const otherQtnsSnap = await getDocs(
          query(collection(db, "quotations"), where("proposalId", "==", qtn.proposalId))
        );
        for (const oDoc of otherQtnsSnap.docs) {
          await updateDoc(doc(db, "quotations", oDoc.id), {
            siteNo: generatedNo,
            updatedAt: serverTimestamp()
          });
        }
      } else {
        // Project already exists! Just update the totals
        const projDoc = projSnap.docs[0];
        const projData = projDoc.data();
        activeSiteNo = projData.siteNo || "";
        const currentProjectPaid = projData.totalPaid || 0;
        const newProjectPaid = currentProjectPaid + amt;
        const newProjectBal = Math.max(0, (projData.systemTotal || qtn.systemTotal || qtn.total || 0) - newProjectPaid);
        const newStage = newProjectBal <= 1 ? "fully_settled" : (projData.stage === "advance_pending" ? "confirmed" : projData.stage);

        await updateDoc(doc(db, "projects", projDoc.id), {
          totalPaid: newProjectPaid,
          balanceDue: newProjectBal,
          stage: newStage,
          updatedAt: serverTimestamp()
        });
      }

      // 4. Save receipt with the actual project site number
      newReceipt.projectNo = activeSiteNo;
      await addDoc(collection(db, "receipts"), newReceipt);

      // 5. Audit Log
      const { logActivityClient } = await import("@/lib/audit-logger-client");
      await logActivityClient(user, "PAYMENT_RECORD", {
        quotationId: id,
        qtnNo: qtn.qtnNo,
        customerName: qtn.customer?.name,
        amount: amt,
        receiptNo,
        projectNo: activeSiteNo,
      });

      toast({
        title: "Payment Recorded",
        description: `Successfully logged Rs. ${amt.toLocaleString()} payment against receipt ${receiptNo}.`,
      });

      // Clear form
      setPayAmount("");
      setPayNotes("");
      
      // Reload states
      setQtn((prev: any) => ({ ...prev, paidAmount: newPaid, paymentStatus: newStatus }));

      // Reload all quotations for real-time payment allocation updates
      const allQtnsSnap = await getDocs(
        query(collection(db, "quotations"), where("proposalId", "==", qtn.proposalId))
      );
      const updatedQtns = allQtnsSnap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .sort((a: any, b: any) => (a.installmentNo ?? 0) - (b.installmentNo ?? 0));
      setAllPriorQtns(updatedQtns);

      // Reload receipts
      const recSnap = await getDocs(query(collection(db, "receipts"), where("quotationId", "==", id)));
      const rList = recSnap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .sort((a: any, b: any) => (a.date && b.date ? a.date.localeCompare(b.date) : 0));
      setReceipts(rList);
      
    } catch (err: any) {
      console.error(err);
      toast({
        title: "Logging Failed",
        description: err.message,
        variant: "destructive",
      });
    } finally {
      setRecordingPayment(false);
    }
  };

  const handleMarkRefund = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!proposal?.id) return;
    const amt = parseFloat(refundAmount);
    if (isNaN(amt) || amt <= 0) {
      toast({ title: "Invalid amount", variant: "destructive" });
      return;
    }
    setSavingRefund(true);
    try {
      const refundRecord = {
        amount: amt,
        date: refundDate,
        method: refundMethod,
        reference: refundReference || null,
        notes: refundNotes || null,
        markedBy: user?.uid || "",
        markedAt: new Date().toISOString(),
      };
      await updateDoc(doc(db, "proposals", proposal.id), { refundRecord });
      const { logActivityClient } = await import("@/lib/audit-logger-client");
      await logActivityClient(user, "REFUND_MARKED", {
        quotationId: id,
        proposalId: proposal.id,
        amount: amt,
        customerName: qtn.customer?.name,
      });
      setProposal((prev: any) => ({ ...prev, refundRecord }));
      setShowRefundModal(false);
      toast({ title: "Refund Recorded", description: `${fmtRs(amt)} refund marked as given.` });
    } catch (err: any) {
      toast({ title: "Failed", description: err.message, variant: "destructive" });
    } finally {
      setSavingRefund(false);
    }
  };

  const handleSaveEdits = async () => {
    if (!qtn || !user) return;
    setSaving(true);
    try {
      const updatedFields = {
        qtnNo: editQtnNo,
        date: editDate,
        customer: {
          ...qtn.customer,
          name: editCustName,
          address: editCustAddress,
          phone: editCustPhone,
          email: editCustEmail,
        },
        description: editDescription,
        total: Number(editTotal) || 0,
        subtotal: Number(editTotal) || 0,
        inverterWarranty: editInverterWarranty,
        batteryWarranty: editBatteryWarranty,
        panelWarranty: editPanelWarranty,
        validityPeriod: editValidityPeriod,
        paymentTerm: editPaymentTerm,
        notes: editNotes,
        bankDetails: {
          accountName: editAccName,
          bank: editBank,
          branch: editBranch,
          accountNo: editAccNo,
        },
        companyAddress: editCompanyAddress,
        updatedAt: serverTimestamp(),
      };

      await updateDoc(doc(db, "quotations", id), updatedFields);

      // Local state update
      setQtn((prev: any) => ({
        ...prev,
        ...updatedFields,
      }));

      // Log update activity
      const { logActivityClient } = await import("@/lib/audit-logger-client");
      await logActivityClient(user, "QUOTATION_UPDATE", {
        quotationId: id,
        qtnNo: editQtnNo,
        customerName: editCustName,
        updatedFields: {
          systemTotal: parseFloat(editTotal) || 0,
          bankDetails: {
            accountName: editAccName,
            bank: editBank,
            branch: editBranch,
            accountNo: editAccNo,
          },
          companyAddress: editCompanyAddress,
          paymentTerm: editPaymentTerm,
          description: editDescription,
        }
      });

      toast({
        title: "Quotation Saved",
        description: "All quotation modifications have been synchronized.",
      });
      setIsEditing(false);
    } catch (err: any) {
      toast({
        title: "Failed to save edits",
        description: err.message,
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const handlePrint = async () => {
    let version = 1;
    try {
      const printSnap = await getDocs(
        query(collection(db, "pdf_prints"), where("quotationId", "==", id))
      );
      version = printSnap.size + 1;

      // Write versioned print record
      await addDoc(collection(db, "pdf_prints"), {
        quotationId: id,
        qtnNo: qtn.qtnNo,
        version,
        printedBy: user?.uid || "dev_user",
        printedByEmail: user?.email || "dev@altavision.lk",
        printedByName: user?.displayName || "Dev User",
        timestamp: serverTimestamp(),
      });

      // Audit log
      const { logActivityClient } = await import("@/lib/audit-logger-client");
      await logActivityClient(user, "PDF_PRINT", {
        quotationId: id,
        qtnNo: qtn.qtnNo,
        customerName: qtn.customer?.name,
        version,
      });
    } catch (e) {
      console.error("PDF print log failed:", e);
    }

    const originalTitle = document.title;
    const formatted = formatQtnNo(qtn.qtnNo, isPaid, qtn.installmentNo, qtn.installmentPercent, qtn.siteNo, proposal?.propNo);
    const cleanQtnNo = formatted.replace(/[\/\\?%*:|"<>\s]/g, "_");
    document.title = `${cleanQtnNo}_v${version}`;

    window.print();

    // Restore original title shortly after
    setTimeout(() => {
      document.title = originalTitle;
    }, 1000);
  };

  if (loading) {
    return (
      <div className="flex h-[80vh] items-center justify-center gap-2 text-muted-foreground bg-zinc-50 dark:bg-zinc-950">
        <Loader2 className="h-5 w-5 animate-spin text-primary" />
        <span className="text-sm font-semibold">Loading quotation...</span>
      </div>
    );
  }

  if (!qtn) {
    return (
      <div className="flex h-[80vh] flex-col items-center justify-center gap-4 text-muted-foreground bg-zinc-50 dark:bg-zinc-950">
        <p className="font-medium">Quotation details could not be resolved.</p>
        <Button variant="outline" asChild>
          <Link href="/quotations">Back to Quotations</Link>
        </Button>
      </div>
    );
  }

  const parseLegacyDescription = (desc: string) => {
    if (!desc) return [];
    
    let rawLines: string[] = [];
    if (desc.includes("\n")) {
      rawLines = desc.split("\n").filter(Boolean);
    } else {
      const lowerDesc = desc.toLowerCase().trim();
      if (lowerDesc.startsWith("supply and") || lowerDesc.startsWith("supply,") || lowerDesc.startsWith("testing,")) {
        let header = "Supply and installation of,";
        if (desc.match(/^Supply[,\s]+installation[,\s]+testing[,\s]+and[,\s]+commissioning[,\s]+of/i)) {
          header = "Supply, installation, testing and commissioning of,";
        }
        
        const componentsText = desc.replace(/^(supply and installation of|supply, installation, testing, and commissioning of|supply, installation of|supply and installation)/i, "").trim();
        
        const parts = componentsText.split(/\s+with\s+|\s+and\s+/i);
        const bullets: string[] = [];
        
        parts.forEach(part => {
          let cleanPart = part.trim();
          if (!cleanPart) return;
          
          if (cleanPart.toLowerCase().includes("panel")) {
            const qtyMatch = cleanPart.match(/^(\d+)\s*(?:nos\s*of|nos|x)?\s*(.*)/i);
            if (qtyMatch) {
              const qty = qtyMatch[1];
              let panelDesc = qtyMatch[2].trim();
              
              panelDesc = panelDesc.replace(/trinasolar/i, "Trina Solar");
              panelDesc = panelDesc.replace(/^(\d+\w+)\s+(trina\s+solar)/i, "$2 $1");
              
              if (panelDesc.includes("TSM-620NEG19RC.20")) {
                panelDesc = panelDesc.replace("TSM-620NEG19RC.20", "Bifacial");
              }
              if (panelDesc.includes("NEG19RC.20")) {
                panelDesc = panelDesc.replace("NEG19RC.20", "Bifacial");
              }
              
              panelDesc = panelDesc.replace(/bifecail/i, "Bifacial");
              panelDesc = panelDesc.replace(/bifacial/i, "Bifacial");
              panelDesc = panelDesc.replace(/panels?/i, "Solar Panel");
              panelDesc = panelDesc.replace(/solar\s+solar/i, "Solar");
              
              bullets.push(`- ${panelDesc} * ${qty}`);
            } else {
              bullets.push(`- ${cleanPart}`);
            }
          } else if (cleanPart.toLowerCase().includes("inverter")) {
            let invDesc = cleanPart;
            const doubleKwMatch = invDesc.match(/^(\w+kW)\s+(\w+)\s+(\w+kW)(.*)/i);
            if (doubleKwMatch) {
              invDesc = `${doubleKwMatch[2]} ${doubleKwMatch[3]}${doubleKwMatch[4]}`;
            }
            
            const qtyMatch = invDesc.match(/^(\d+)\s*(?:nos\s*of|nos|x)?\s*(.*)/i);
            let qty = "1";
            if (qtyMatch) {
              qty = qtyMatch[1];
              invDesc = qtyMatch[2].trim();
            }
            
            bullets.push(`- ${invDesc} * ${qty}`);
          } else if (cleanPart.toLowerCase().includes("battery")) {
            let batDesc = cleanPart;
            const qtyMatch = batDesc.match(/^(\d+)\s*(?:nos\s*of|nos|x)?\s*(.*)/i);
            let qty = "1";
            if (qtyMatch) {
              qty = qtyMatch[1];
              batDesc = qtyMatch[2].trim();
            }
            
            bullets.push(`- ${batDesc} * ${qty}`);
          } else {
            bullets.push(`- ${cleanPart}`);
          }
        });
        
        rawLines = [header, ...bullets];
      } else {
        rawLines = [desc];
      }
    }

    return rawLines.filter(line => {
      const trimmed = line.trim().toLowerCase();
      if (trimmed.endsWith(",")) return true;
      if (/\*\s*0\s*$/.test(trimmed)) return false;
      if (/\bx\s*0\s*$/.test(trimmed)) return false;
      if (/^[•\-\*\s]*0\s*(?:nos\b|x\b|\*)/i.test(trimmed)) return false;
      if (/\*\s*0\b/.test(trimmed)) return false;
      if (/\bx\s*0\b/.test(trimmed)) return false;
      return true;
    });
  };

  const descLines = parseLegacyDescription(qtn.description || "");

  const renderWarrantyList = (text: string, defaultText: string) => {
    const content = text || defaultText;
    const lines = content.split("\n").map(line => line.trim()).filter(Boolean);
    return (
      <ul className="list-disc pl-4 space-y-1 mt-1 marker:text-primary">
        {lines.map((line, idx) => {
          const cleanLine = line.replace(/^[•\-\*\s]+/, "").trim();
          return (
            <li key={idx} className="text-xs text-muted-foreground font-semibold leading-normal">
              {cleanLine}
            </li>
          );
        })}
      </ul>
    );
  };

  const cleanDescLine = (line: string): string => {
    let s = line;
    // Replace "* N" quantity separator with " - N"
    s = s.replace(/\s*\*\s*(\d+)\s*$/, '  -  $1');
    // Remove inverter model codes like GW5000-ES-C10, SXK3000TL, etc.
    s = s.replace(/\s+[A-Z]{1,4}\d{3,}[A-Z0-9-]*/g, '');
    // Deduplicate exact capacity values: "5kW 5kW" → "5kW"
    s = s.replace(/(\b\d+(?:\.\d+)?(?:kW|W)\b)\s+\1/gi, '$1');
    // Deduplicate "NW Word MW Word" where descriptor repeats: "600W Bifacial 620W Bifacial" → "600W Bifacial"
    s = s.replace(/(\b\d+(?:\.\d+)?(?:kW|W)\b\s+(\w+))\s+\d+(?:\.\d+)?(?:kW|W)\b\s+\2\b/gi, '$1');
    // Pluralize "Solar Panel" → "Solar Panels"
    s = s.replace(/\bSolar Panel\b(?!s)/gi, 'Solar Panels');
    // Clean up excess spaces
    s = s.replace(/\s{3,}/g, '  ').trim();
    return s;
  };

  const enhanceDescriptionHeader = (header: string): string => {
    if (header.match(/\d+(?:\.\d+)?kW/i)) return header;
    const opt = proposal?.options?.[qtn?.selectedOption ?? 0] || proposal?.options?.[0];
    if (!opt) return header;
    const panelQty = opt.panel?.qty || 0;
    const ratingLabel = opt.panel?.ratingLabel || "";
    const wattsMatch = ratingLabel.match(/(\d+(?:\.\d+)?)/);
    if (!wattsMatch || panelQty === 0) return header;
    const watts = Number(wattsMatch[1]);
    const totalKw = ((panelQty * watts) / 1000).toFixed(2);
    const subtype = (opt.inverter?.productSubtype || "").toLowerCase();
    const isHybrid = subtype === "hybrid" || !!(opt.battery);
    const isOffgrid = subtype === "offgrid" || subtype === "off-grid";
    const sysType = isOffgrid ? "Off-Grid" : isHybrid ? "Hybrid" : "On-Grid";
    return header.replace(/^(Supply(?:[,\s]+(?:and\s+)?installation(?:[^,]*)?)of)[,\s]*/i, `$1 ${totalKw}kW ${sysType} Solar system with,`);
  };

  const getRefString = () => {
    const qtnNo = qtn.qtnNo || "—";
    const companyName = "Alta Vision (Pvt) Ltd";
    const rawDate = qtn.confirmedAt || qtn.date || qtn.createdAt;
    if (!rawDate) return `Ref: ${qtnNo} — ${companyName}`;
    const dateStr = new Date(rawDate).toLocaleDateString("en-GB", {
      day: "numeric",
      month: "long",
      year: "numeric"
    });
    const timeStr = new Date(rawDate).toLocaleTimeString("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true
    });
    return `Ref: ${qtnNo} — ${companyName} — Generated on ${dateStr} at ${timeStr}`;
  };

  return (
    <div className="bg-zinc-100 dark:bg-zinc-950 min-h-screen pb-12 font-sans select-text">
      
      <style dangerouslySetInnerHTML={{ __html: `
        @media print {
          /* Hide all screen-only elements */
          .no-print { display: none !important; }
          
          /* Force white background on ALL elements to save ink and prevent gray margins/backgrounds */
          html, body, div, main, section, article {
            background-color: white !important;
            background: white !important;
          }

          ${(!qtn?.installmentNo || qtn?.installmentNo <= 1) ? `
          html, body {
            margin: 0 !important;
            padding: 0 !important;
            height: 100% !important;
            overflow: hidden !important;
          }
          ` : `
          html, body {
            margin: 0 !important;
            padding: 0 !important;
          }
          `}

          /* Remove screen padding/shadows from the card and lock to A4 page height */
          #print-root {
            box-shadow: none !important;
            border-radius: 0 !important;
            margin: 0 !important;
            max-width: 100% !important;
            padding: 0 !important;
            background: white !important;
            border: none !important;
            width: 100% !important;
            ${(!qtn?.installmentNo || qtn?.installmentNo <= 1) ? `
            height: 100% !important;
            min-height: 100% !important;
            max-height: 100% !important;
            overflow: hidden !important;
            display: flex !important;
            flex-direction: column !important;
            justify-content: space-between !important;
            ` : `
            display: block !important;
            `}
            box-sizing: border-box !important;
          }

          ${(!qtn?.installmentNo || qtn?.installmentNo <= 1) ? `
          .qtn-a4-body {
            height: 100% !important;
            display: flex !important;
            flex-direction: column !important;
            justify-content: space-between !important;
            box-sizing: border-box !important;
          }
          ` : `
          .qtn-a4-body {
            display: flex !important;
            flex-direction: column !important;
            justify-content: space-between !important;
            box-sizing: border-box !important;
            page-break-after: always;
            break-after: page;
            height: 282mm !important;
            padding: 6mm 12mm !important;
          }
          .qtn-a4-body-p2 {
            display: flex !important;
            flex-direction: column !important;
            justify-content: space-between !important;
            box-sizing: border-box !important;
            height: 282mm !important;
            padding: 6mm 12mm !important;
          }
          `}

          /* Preserve background colors in print */
          * {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }

          @page {
            size: A4 portrait;
            margin: ${(!qtn?.installmentNo || qtn?.installmentNo <= 1) ? "8mm 10mm" : "0mm"} !important;
          }
        }
      `}} />

      {/* ── STICKY TOP ACTION BAR (no-print) ── */}
      <div className="sticky top-0 z-50 w-full border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 no-print mb-6 shadow-sm">
        <div className="max-w-4xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="sm" className="gap-2 text-muted-foreground hover:text-foreground font-semibold" asChild>
              <Link href={qtn.proposalId ? `/proposals/${qtn.proposalId}` : "/quotations"}>
                <ArrowLeft className="h-4 w-4" />
                <span>Back to Proposal</span>
              </Link>
            </Button>
          </div>
          
          <div className="flex items-center gap-2">
            {isEditing ? (
              <>
                <Button variant="outline" size="sm" className="gap-2 font-bold" onClick={() => setIsEditing(false)} disabled={saving}>
                  <X className="h-4 w-4" />
                  Cancel
                </Button>
                <Button size="sm" className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold" onClick={handleSaveEdits} disabled={saving}>
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  Save Changes
                </Button>
              </>
            ) : (
              <>
                {(user?.role === "superadmin" || user?.role === "admin") && (
                  <Button 
                    type="button"
                    variant={(qtn?.vatInvoice ?? proposal?.vatInvoice ?? false) ? "default" : "outline"}
                    size="sm" 
                    className={cn("gap-2 font-bold", (qtn?.vatInvoice ?? proposal?.vatInvoice ?? false) ? "bg-amber-600 hover:bg-amber-700 text-white" : "border-amber-600/25 hover:bg-amber-50 text-amber-600 dark:hover:bg-amber-950/20")}
                    onClick={handleToggleVat}
                  >
                    <Receipt className="h-4 w-4" />
                    {(qtn?.vatInvoice ?? proposal?.vatInvoice ?? false) ? "VAT Invoice" : "Non-VAT"}
                  </Button>
                )}
                <Button variant="outline" size="sm" className="gap-2 font-bold border-primary/20 hover:bg-primary/5 hover:text-primary" onClick={() => setIsEditing(true)}>
                  <Edit2 className="h-4 w-4" />
                  Edit Quotation
                </Button>
                <Button variant="outline" size="sm" className="gap-2 font-bold border-emerald-600/25 hover:bg-emerald-50 text-emerald-600 hover:text-emerald-700 dark:hover:bg-emerald-950/20" onClick={() => setShareOpen(true)}>
                  <Send className="h-4 w-4" />
                  Send / Share
                </Button>
                <Button size="sm" className="gap-2 bg-primary hover:bg-primary/95 text-white font-bold" onClick={handlePrint}>
                  <Printer className="h-4 w-4" />
                  Print / Save PDF
                </Button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* ── UNIFIED STATUS, LEDGER & PAYMENT CONTROL PANEL (no-print) ── */}
      <div className="no-print mb-8 max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left Columns: Status & Receipts */}
        <div className="lg:col-span-2 space-y-6">
          
          {/* Status and Progress Card */}
          <Card className="border-border bg-card shadow-sm overflow-hidden">
            <CardContent className="p-6 space-y-4">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 border border-primary/20 shadow-sm">
                    <Receipt className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <h3 className="text-sm font-black text-foreground uppercase tracking-wider">Status Workflow</h3>
                    <p className="text-xs text-muted-foreground font-semibold">Manage quotation lifecycle</p>
                  </div>
                </div>
                
                <div className="flex items-center">
                  <button
                    type="button"
                    onClick={() => handleUpdateStatus(isPaid ? "pending_payment" : "fully_paid")}
                    disabled={updatingStatus}
                    className={cn(
                      "relative inline-flex items-center justify-between gap-2.5 px-3.5 py-1.5 rounded-full border text-[10px] font-black uppercase tracking-wider transition-all duration-300 shadow-sm select-none",
                      isPaid || isSettledByCarry
                        ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/25 hover:bg-emerald-500/20"
                        : "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/25 hover:bg-amber-500/20"
                    )}
                  >
                    {updatingStatus ? (
                      <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
                    ) : (
                      <span className={cn(
                        "h-2.5 w-2.5 rounded-full relative flex shrink-0",
                        isPaid || isSettledByCarry ? "bg-emerald-500" : "bg-amber-500"
                      )}>
                        {(isPaid || isSettledByCarry) && (
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                        )}
                      </span>
                    )}
                    <span>{isPaid ? "Fully Paid" : isSettledByCarry ? "Settled (Credit)" : "Unpaid / Pending"}</span>
                  </button>
                </div>
              </div>
              
              {/* Installment Timeline Stepper */}
              {allPriorQtns.length > 1 && (
                <div className="border-t border-border/60 pt-4 pb-1 space-y-2">
                  <span className="text-[10px] font-black text-muted-foreground uppercase tracking-widest block">Quotation Installment Lifecycle</span>
                  <div className="flex flex-wrap gap-2.5 mt-2">
                    {stageRows.map((pQ) => {
                      const isActive = pQ.id === id;
                      // Only mark as paid if there's actual payment amount, not just status
                      const hasPayment = (pQ.paidAmount || 0) > 0;
                      const isCarrySettled = pQ.isSettled && !hasPayment;

                      let statusText = "Pending";
                      let statusBadgeColor = "text-amber-600 dark:text-amber-400 border-amber-500/25 bg-amber-500/5";

                      if (hasPayment) {
                        statusText = "Paid";
                        statusBadgeColor = "text-emerald-600 dark:text-emerald-400 border-emerald-500/25 bg-emerald-500/5";
                      } else if (isCarrySettled) {
                        statusText = "Settled";
                        statusBadgeColor = "text-emerald-600 dark:text-emerald-400 border-emerald-500/25 bg-emerald-500/5";
                      }

                      return (
                        <div
                          key={pQ.id}
                          onClick={() => {
                            if (!isActive) {
                              router.push(`/quotations/${pQ.id}`);
                            }
                          }}
                          className={cn(
                            "flex-1 min-w-[140px] rounded-xl p-3 border text-left cursor-pointer transition-all duration-300 relative overflow-hidden flex flex-col justify-between gap-1.5",
                            isActive 
                              ? "border-emerald-500/40 bg-emerald-500/5 dark:bg-emerald-950/15 shadow-sm ring-1 ring-emerald-500/25 scale-[1.01]" 
                              : "border-border/85 bg-card hover:bg-muted/40 hover:border-border hover:scale-[1.005]"
                          )}
                        >
                          {isActive && (
                            <div className="absolute top-0 right-0 h-1.5 w-1.5 bg-emerald-500 rounded-bl-lg animate-pulse" />
                          )}
                          <div className="flex items-center justify-between gap-1">
                            <span className="text-[10px] font-black uppercase text-muted-foreground tracking-wider">
                              Stage {pQ.installmentNo ?? "—"}
                            </span>
                            <span className={cn("text-[9px] font-black px-1.5 py-0.5 rounded border uppercase tracking-wider", statusBadgeColor)}>
                              {statusText}
                            </span>
                          </div>
                          <div className="mt-1 flex flex-col">
                            <span className="text-xs font-extrabold text-foreground truncate">
                              {pQ.installmentPercent ? `${pQ.installmentPercent}% Invoice` : "Full Invoice"}
                            </span>
                            <span className="text-[11px] font-mono font-bold text-muted-foreground mt-0.5">
                              {fmtRs(pQ.installmentAmount ?? pQ.total ?? 0)}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="border-t border-border/60 pt-4 space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-xs font-bold text-muted-foreground">Payment Progress Summary</span>
                  {qtn.installmentNo && (
                    <Badge variant="outline" className={cn(
                      "font-extrabold text-[10px] py-0.5 px-2 tracking-wide uppercase",
                      isPaid || isSettledByCarry
                        ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                        : "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400"
                    )}>
                      Payment Installment {qtn.installmentNo} of {allPriorQtns.length || qtn.installmentNo}
                    </Badge>
                  )}
                </div>

                {(() => {
                  const invoiceAmt     = qtn.installmentAmount ?? qtn.total ?? 0;
                  const totalPaid      = qtn.paidAmount ?? receipts.reduce((s: number, r: any) => s + (r.amount || 0), 0);
                  const invoiceOverpay = Math.max(0, totalPaid - invoiceAmt);
                  const isInvoicePaidOver = invoiceOverpay > 0;

                  // Use carry-credit-aware values for balance and progress
                  const effectiveBal   = thisStageRow ? Math.max(0, thisStageRow.effectiveDue) : Math.max(0, invoiceAmt - totalPaid);
                  const invoiceBal     = effectiveBal;
                  const isSettled      = thisStageRow ? thisStageRow.isSettled : effectiveBal <= 0;
                  const paidRatio      = isSettled ? 100 : (invoiceAmt > 0 ? Math.min(100, (totalPaid / invoiceAmt) * 100) : 0);

                  // ── All-stages carry-credit computation ──────────────────
                  const contractValue     = qtn.systemTotal ?? qtn.total ?? 0;
                  const totalPaidAll      = allPriorQtns.reduce((s: number, q: any) => s + (q.paidAmount || 0), 0);
                  const overallOverpaid   = Math.max(0, totalPaidAll - contractValue);
                  const overallUnderpaid  = Math.max(0, contractValue - totalPaidAll);

                  return (
                    <>
                      {/* ── 4 summary cards ── */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                        {/* System Total */}
                        <div className="bg-muted/40 border border-border/80 rounded-xl p-3.5 flex flex-col justify-between hover:bg-muted/65 transition-colors">
                          <span className="text-[9px] font-black text-muted-foreground uppercase tracking-widest block mb-1">System Total</span>
                          <span className="font-mono font-extrabold text-sm sm:text-base text-foreground">{fmtRs(contractValue)}</span>
                        </div>

                        {/* This Invoice */}
                        <div className="bg-amber-500/[0.03] border border-amber-500/20 rounded-xl p-3.5 flex flex-col justify-between hover:bg-amber-500/[0.05] transition-colors">
                          <span className="text-[9px] font-black text-amber-600/80 dark:text-amber-400/80 uppercase tracking-widest block mb-1">
                            {qtn.installmentPercent ? `This Invoice (${qtn.installmentPercent}%)` : "This Invoice"}
                          </span>
                          <span className="font-mono font-extrabold text-sm sm:text-base text-amber-600 dark:text-amber-400">{fmtRs(invoiceAmt)}</span>
                        </div>

                        {/* Total Paid on this invoice */}
                        <div className={cn(
                          "border rounded-xl p-3.5 flex flex-col justify-between transition-colors",
                          isInvoicePaidOver
                            ? "bg-blue-500/[0.04] border-blue-500/20 hover:bg-blue-500/[0.06]"
                            : "bg-emerald-500/[0.03] border-emerald-500/20 hover:bg-emerald-500/[0.05]"
                        )}>
                          <span className={cn(
                            "text-[9px] font-black uppercase tracking-widest block mb-1",
                            isInvoicePaidOver ? "text-blue-600/80 dark:text-blue-400/80" : "text-emerald-600/80"
                          )}>
                            Paid on This Invoice
                          </span>
                          <div className="space-y-0.5">
                            <span className={cn(
                              "font-mono font-extrabold text-sm sm:text-base block",
                              isInvoicePaidOver ? "text-blue-600 dark:text-blue-400" : "text-emerald-600 dark:text-emerald-400"
                            )}>{fmtRs(totalPaid)}</span>
                            {isInvoicePaidOver && (
                              <span className="text-[9px] text-blue-500 font-black">+{fmtRs(invoiceOverpay)} excess →</span>
                            )}
                            {isSettledByCarry && !isInvoicePaidOver && thisStageRow?.carryApplied > 0 && (
                              <span className="text-[9px] text-emerald-600 font-black">+{fmtRs(thisStageRow.carryApplied)} carry credit</span>
                            )}
                          </div>
                        </div>

                        {/* Invoice Balance */}
                        <div className={cn(
                          "border rounded-xl p-3.5 flex flex-col justify-between transition-colors",
                          isInvoicePaidOver
                            ? "bg-blue-500/[0.04] border-blue-500/20"
                            : isSettled
                            ? "bg-emerald-500/[0.03] border-emerald-500/20"
                            : "bg-red-500/[0.03] border-red-400/20"
                        )}>
                          <span className={cn(
                            "text-[9px] font-black uppercase tracking-widest block mb-1",
                            isInvoicePaidOver ? "text-blue-600/80 dark:text-blue-400/80" : isSettled ? "text-emerald-600/80" : "text-red-500/80"
                          )}>
                            Invoice Balance
                          </span>
                          <div className="flex flex-wrap items-baseline gap-1.5 justify-between">
                            <span className={cn(
                              "font-mono font-extrabold text-sm sm:text-base",
                              isInvoicePaidOver ? "text-blue-600 dark:text-blue-400" : isSettled ? "text-emerald-600 dark:text-emerald-400" : "text-red-500"
                            )}>
                              {isInvoicePaidOver ? `+${fmtRs(invoiceOverpay)}` : fmtRs(invoiceBal)}
                            </span>
                            {isInvoicePaidOver && (
                              <span className="text-[9px] text-blue-600 font-black uppercase bg-blue-500/10 px-1.5 py-0.5 rounded border border-blue-500/20">Carry →</span>
                            )}
                            {!isInvoicePaidOver && isSettledByCarry && (
                              <span className="text-[9px] text-emerald-600 font-black uppercase bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20">Credit Applied</span>
                            )}
                            {!isInvoicePaidOver && isSettled && !isSettledByCarry && (
                              <span className="text-[9px] text-emerald-600 font-black uppercase bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20">Settled</span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* ── Per-invoice progress bar ── */}
                      <div className="space-y-1.5 pt-1">
                        <div className="flex justify-between text-xs font-bold text-muted-foreground">
                          <span>Payment Progress on This Invoice</span>
                          <span className={isInvoicePaidOver ? "text-blue-600 dark:text-blue-400" : ""}>{paidRatio.toFixed(0)}%{isInvoicePaidOver ? " (overpaid)" : ""}</span>
                        </div>
                        <Progress
                          value={Math.min(100, paidRatio)}
                          className={cn("h-2 bg-muted transition-all", isInvoicePaidOver ? "[&>div]:bg-blue-500" : "")}
                        />
                      </div>

                      {/* ── All-stages carry-credit summary ── */}
                      {allPriorQtns.length > 0 && (
                        <div className="border-t border-border/60 pt-4 space-y-3">
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">All Stages — Contract Balance</span>
                            <span className="text-[9px] font-semibold text-muted-foreground">{allPriorQtns.length} installment{allPriorQtns.length !== 1 ? "s" : ""}</span>
                          </div>

                          {/* Overpayment / underpayment banner */}
                          {overallOverpaid > 0 ? (
                            proposal?.refundRecord ? (
                              <div className="flex items-start gap-2 p-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900/40 text-xs">
                                <BadgeCheck className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
                                <div>
                                  <p className="font-black text-emerald-700 dark:text-emerald-400 text-[11px] uppercase tracking-wide">Refund Given — Contract Cleared</p>
                                  <p className="text-emerald-600 dark:text-emerald-400/80 font-semibold mt-0.5">
                                    {fmtRs(proposal.refundRecord.amount)} refunded · {proposal.refundRecord.method} · {proposal.refundRecord.date}
                                  </p>
                                </div>
                              </div>
                            ) : (
                              <div className="flex items-start gap-2 p-2.5 rounded-xl bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/40 text-xs">
                                <AlertTriangle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
                                <div>
                                  <p className="font-black text-red-700 dark:text-red-400 text-[11px] uppercase tracking-wide">Customer Overpaid Contract — Refund Due</p>
                                  <p className="text-red-600 dark:text-red-400/80 font-semibold mt-0.5">
                                    Received {fmtRs(totalPaidAll)} vs contract {fmtRs(contractValue)}. Refund <strong>{fmtRs(overallOverpaid)}</strong> to customer.
                                  </p>
                                </div>
                              </div>
                            )
                          ) : overallUnderpaid === 0 && totalPaidAll > 0 ? (
                            <div className="flex items-center gap-2 p-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900/40 text-xs">
                              <BadgeCheck className="h-4 w-4 text-emerald-600 shrink-0" />
                              <p className="font-black text-emerald-700 dark:text-emerald-400 text-[11px] uppercase tracking-wide">Contract Fully Paid — No Balance</p>
                            </div>
                          ) : null}

                          {/* Per-stage carry-credit rows */}
                          <div className="space-y-1.5">
                            {stageRows.map((row: any) => {
                              const isThis = row.id === id;
                              const isOver = row.pd > row.inv;
                              return (
                                <div
                                  key={row.id}
                                  onClick={() => { if (!isThis) router.push(`/quotations/${row.id}`); }}
                                  className={cn(
                                    "flex items-center justify-between rounded-xl px-3 py-2 text-xs border transition-all cursor-pointer",
                                    isThis
                                      ? "bg-primary/5 border-primary/25 ring-1 ring-primary/15"
                                      : "bg-muted/30 border-border/50 hover:bg-muted/50"
                                  )}
                                >
                                  <div className="flex items-center gap-2 min-w-0">
                                    <span className="font-bold text-[10px] text-muted-foreground shrink-0">Stage {row.installmentNo}</span>
                                    {row.installmentPercent && (
                                      <span className="text-[9px] text-muted-foreground/70">({row.installmentPercent}%)</span>
                                    )}
                                    {row.isSettled && row.pd === 0 && row.carryApplied > 0 && (
                                      <span className="text-[8px] font-black text-blue-600 dark:text-blue-400 uppercase bg-blue-50 dark:bg-blue-950/30 px-1.5 py-0.5 rounded border border-blue-200 dark:border-blue-800/40">← Credit Applied</span>
                                    )}
                                    {isOver && (
                                      <span className="text-[8px] font-black text-blue-600 dark:text-blue-400 uppercase bg-blue-50 dark:bg-blue-950/30 px-1.5 py-0.5 rounded border border-blue-200 dark:border-blue-800/40">Carry →</span>
                                    )}
                                    {isThis && (
                                      <span className="text-[8px] font-black text-primary uppercase bg-primary/10 px-1.5 py-0.5 rounded border border-primary/20">Viewing</span>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-3 shrink-0">
                                    <span className="text-[10px] text-muted-foreground font-mono">{fmtRs(row.inv)}</span>
                                    <ArrowRight className="h-3 w-3 text-muted-foreground/40" />
                                    <span className={cn(
                                      "font-mono font-black text-xs",
                                      row.isSettled ? "text-emerald-600 dark:text-emerald-400" : "text-red-500"
                                    )}>
                                      {row.isSettled ? "Settled" : fmtRs(row.shortfall)}
                                    </span>
                                  </div>
                                </div>
                              );
                            })}
                          </div>

                          {/* All-stages totals */}
                          <div className="grid grid-cols-3 gap-2 pt-1">
                            <div className="bg-muted/40 rounded-xl px-3 py-2.5 border border-border/60">
                              <span className="text-[8px] uppercase font-black text-muted-foreground block mb-0.5">Contract</span>
                              <span className="font-mono font-black text-xs text-foreground">{fmtRs(contractValue)}</span>
                            </div>
                            <div className="bg-emerald-50 dark:bg-emerald-950/20 rounded-xl px-3 py-2.5 border border-emerald-200/60 dark:border-emerald-800/40">
                              <span className="text-[8px] uppercase font-black text-emerald-600 dark:text-emerald-400 block mb-0.5">Total Paid</span>
                              <span className="font-mono font-black text-xs text-emerald-700 dark:text-emerald-300">{fmtRs(totalPaidAll)}</span>
                            </div>
                            <div className={cn(
                              "rounded-xl px-3 py-2.5 border",
                              overallOverpaid > 0 && !proposal?.refundRecord ? "bg-red-50 dark:bg-red-950/20 border-red-200/60 dark:border-red-800/40"
                              : overallUnderpaid > 0 ? "bg-amber-50 dark:bg-amber-950/20 border-amber-200/60 dark:border-amber-800/40"
                              : "bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200/60 dark:border-emerald-800/40"
                            )}>
                              <span className={cn(
                                "text-[8px] uppercase font-black block mb-0.5",
                                overallOverpaid > 0 && !proposal?.refundRecord ? "text-red-600 dark:text-red-400"
                                : overallUnderpaid > 0 ? "text-amber-600 dark:text-amber-400"
                                : "text-emerald-600 dark:text-emerald-400"
                              )}>
                                {overallOverpaid > 0 && !proposal?.refundRecord ? "Refund Due" : overallOverpaid > 0 ? "Refunded" : overallUnderpaid > 0 ? "Balance" : "Cleared"}
                              </span>
                              <span className={cn(
                                "font-mono font-black text-xs",
                                overallOverpaid > 0 && !proposal?.refundRecord ? "text-red-700 dark:text-red-300"
                                : overallUnderpaid > 0 ? "text-amber-700 dark:text-amber-300"
                                : "text-emerald-700 dark:text-emerald-300"
                              )}>
                                {overallOverpaid > 0 && !proposal?.refundRecord ? `+${fmtRs(overallOverpaid)}` : overallUnderpaid > 0 ? fmtRs(overallUnderpaid) : fmtRs(0)}
                              </span>
                            </div>
                          </div>

                          {/* All-stages progress bar */}
                          <div className="space-y-1.5">
                            <div className="flex justify-between text-[10px] font-bold text-muted-foreground">
                              <span>Contract Collection Progress</span>
                              <span className={overallOverpaid > 0 && !proposal?.refundRecord ? "text-red-500" : ""}>
                                {contractValue > 0 ? Math.min(100, Math.round((totalPaidAll / contractValue) * 100)) : 0}%
                                {overallOverpaid > 0 && !proposal?.refundRecord ? " (overpaid)" : ""}
                              </span>
                            </div>
                            <Progress
                              value={contractValue > 0 ? Math.min(100, (totalPaidAll / contractValue) * 100) : 0}
                              className={cn("h-1.5 bg-muted transition-all", overallOverpaid > 0 && !proposal?.refundRecord ? "[&>div]:bg-red-500" : "[&>div]:bg-emerald-500")}
                            />
                          </div>
                        </div>
                      )}
                    </>
                  );
                })()}

                {/* Quick Bank, Address & Validity Selectors */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 border-t border-border/60 pt-4">
                  <div className="space-y-1">
                    <span className="text-[10px] font-black text-muted-foreground uppercase tracking-widest block">Selected Company Address</span>
                    <div className="flex items-center gap-2 mt-1">
                      <Select
                        value={currentAddressIndex}
                        onValueChange={async (val) => {
                          const idx = parseInt(val);
                          const selectedAddr = sysSettings?.addresses?.[idx];
                          if (selectedAddr) {
                            try {
                              await updateDoc(doc(db, "quotations", id), {
                                companyAddress: selectedAddr,
                                updatedAt: serverTimestamp(),
                              });
                              setQtn((prev: any) => ({ ...prev, companyAddress: selectedAddr }));
                              const { logActivityClient } = await import("@/lib/audit-logger-client");
                              await logActivityClient(user, "QUOTATION_UPDATE", {
                                quotationId: id,
                                qtnNo: qtn.qtnNo,
                                customerName: qtn.customer?.name,
                                updatedFields: { companyAddress: selectedAddr }
                              });
                              toast({ title: "Address Updated", description: "Company address updated successfully." });
                            } catch (err: any) {
                              toast({ title: "Failed to update address", description: err.message, variant: "destructive" });
                            }
                          }
                        }}
                      >
                        <SelectTrigger className="h-8 text-xs font-semibold bg-background border-slate-200 pl-2">
                          <div className="flex items-center gap-1.5 truncate">
                            <MapPin className="h-3.5 w-3.5 text-muted-foreground/70 shrink-0" />
                            <SelectValue placeholder="Select Company Address" />
                          </div>
                        </SelectTrigger>
                        <SelectContent>
                          {(sysSettings?.addresses || []).map((addr: string, idx: number) => (
                            <SelectItem key={idx} value={idx.toString()} className="text-xs">
                              {addr}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <span className="text-[10px] font-black text-muted-foreground uppercase tracking-widest block">Selected Bank Details</span>
                    <div className="flex items-center gap-2 mt-1">
                      <Select
                        value={currentBankIndex}
                        onValueChange={async (val) => {
                          const idx = parseInt(val);
                          const selectedBank = sysSettings?.banks?.[idx];
                          if (selectedBank) {
                            const newBankDetails = {
                              accountName: selectedBank.accountName || "",
                              bank: selectedBank.bankName || "",
                              branch: selectedBank.branch || "",
                              accountNo: selectedBank.accountNumber || "",
                            };
                            try {
                              await updateDoc(doc(db, "quotations", id), {
                                bankDetails: newBankDetails,
                                updatedAt: serverTimestamp(),
                              });
                              setQtn((prev: any) => ({ ...prev, bankDetails: newBankDetails }));
                              const { logActivityClient } = await import("@/lib/audit-logger-client");
                              await logActivityClient(user, "QUOTATION_UPDATE", {
                                quotationId: id,
                                qtnNo: qtn.qtnNo,
                                customerName: qtn.customer?.name,
                                updatedFields: { bankDetails: newBankDetails }
                              });
                              toast({ title: "Bank Details Updated", description: "Bank details updated successfully." });
                            } catch (err: any) {
                              toast({ title: "Failed to update bank details", description: err.message, variant: "destructive" });
                            }
                          }
                        }}
                      >
                        <SelectTrigger className="h-8 text-xs font-semibold bg-background border-slate-200 pl-2">
                          <div className="flex items-center gap-1.5 truncate">
                            <Landmark className="h-3.5 w-3.5 text-muted-foreground/70 shrink-0" />
                            <SelectValue placeholder="Select Payment Bank" />
                          </div>
                        </SelectTrigger>
                        <SelectContent>
                          {(sysSettings?.banks || []).map((b: any, idx: number) => (
                            <SelectItem key={idx} value={idx.toString()} className="text-xs">
                              {b.bankName} ({b.branch}) - {b.accountNumber}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <span className="text-[10px] font-black text-muted-foreground uppercase tracking-widest block">Quotation Validity</span>
                    <div className="flex items-center gap-2 mt-1">
                      <Select
                        value={getValidityKey(qtn.validityPeriod || "")}
                        onValueChange={async (val) => {
                          let newValidity = "• Quotation Valid for 1 week.";
                          if (val === "3_days") newValidity = "• Quotation Valid for 3 days.";
                          else if (val === "14_days") newValidity = "• Quotation Valid for 14 days.";
                          else if (val === "30_days") newValidity = "• Quotation Valid for 30 days.";

                          try {
                            await updateDoc(doc(db, "quotations", id), {
                              validityPeriod: newValidity,
                              updatedAt: serverTimestamp(),
                            });
                            setQtn((prev: any) => ({ ...prev, validityPeriod: newValidity }));
                            if (isEditing) {
                              setEditValidityPeriod(newValidity);
                            }
                            const { logActivityClient } = await import("@/lib/audit-logger-client");
                            await logActivityClient(user, "QUOTATION_UPDATE", {
                              quotationId: id,
                              qtnNo: qtn.qtnNo,
                              customerName: qtn.customer?.name,
                              updatedFields: { validityPeriod: newValidity }
                            });
                            toast({ title: "Validity Updated", description: "Quotation validity updated successfully." });
                          } catch (err: any) {
                            toast({ title: "Failed to update validity", description: err.message, variant: "destructive" });
                          }
                        }}
                      >
                        <SelectTrigger className="h-8 text-xs font-semibold bg-background border-slate-200 pl-2">
                          <div className="flex items-center gap-1.5 truncate">
                            <CalendarRange className="h-3.5 w-3.5 text-muted-foreground/70 shrink-0" />
                            <SelectValue placeholder="Select Validity Period" />
                          </div>
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="3_days" className="text-xs">3 Days</SelectItem>
                          <SelectItem value="1_week" className="text-xs">7 Days (1 Week)</SelectItem>
                          <SelectItem value="14_days" className="text-xs">14 Days</SelectItem>
                          <SelectItem value="30_days" className="text-xs">30 Days</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

        </div>

        {/* Right Column: Record Payment Panel */}
        <div className="space-y-6">
          <Card className="border-border shadow-sm h-fit">
            <CardHeader className="py-4 border-b border-border/50">
              <CardTitle className="text-xs font-black uppercase tracking-wider text-muted-foreground">Log New Payment</CardTitle>
            </CardHeader>
            <CardContent className="p-5">
              {(() => {
                const invoiceAmt = qtn.installmentAmount ?? qtn.total ?? 0;
                const alreadyPaid = qtn.paidAmount || 0;
                const remaining = Math.max(0, invoiceAmt - alreadyPaid);
                const enteredAmt = parseFloat(payAmount) || 0;
                const contractValue = qtn.systemTotal ?? qtn.total ?? 0;
                const isOverPayingInvoice = enteredAmt > 0 && enteredAmt > remaining;
                const isFullyPaidInvoice = alreadyPaid >= invoiceAmt && invoiceAmt > 0;

                if (isPaid || isSettledByCarry) {
                  return (
                    <div className="flex flex-col items-center justify-center gap-2.5 py-6 text-center">
                      <div className="h-10 w-10 rounded-full bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/40 flex items-center justify-center">
                        <BadgeCheck className="h-5 w-5 text-emerald-600" />
                      </div>
                      <div>
                        <p className="text-sm font-black text-emerald-700 dark:text-emerald-400">
                          {isSettledByCarry ? "Settled by Carry Credit" : "Invoice Fully Paid"}
                        </p>
                        <p className="text-[10px] text-muted-foreground mt-0.5 font-medium">
                          No further payments are required for this invoice.
                        </p>
                      </div>
                    </div>
                  );
                }

                return (
                  <form onSubmit={handleRecordPayment} className="space-y-4">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black uppercase text-muted-foreground tracking-wider block">Payment Date</label>
                      <Input
                        type="date"
                        required
                        value={payDate}
                        onChange={(e) => setPayDate(e.target.value)}
                        className="text-xs font-semibold focus-visible:ring-primary/20"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black uppercase text-muted-foreground tracking-wider block">Amount Received (LKR)</label>
                      <div className="relative">
                        <Input
                          type="number"
                          required
                          step="0.01"
                          min="0.01"
                          placeholder="0.00"
                          value={payAmount}
                          onChange={(e) => setPayAmount(e.target.value)}
                          className={cn(
                            "text-xs font-mono font-bold pl-8 focus-visible:ring-primary/20",
                            isOverPayingInvoice
                              ? "text-blue-600 bg-blue-50/10 dark:bg-blue-950/10 border-blue-300 dark:border-blue-700"
                              : "text-emerald-600 bg-emerald-50/10 dark:bg-emerald-950/10"
                          )}
                        />
                        <span className="absolute left-3 top-2.5 text-xs font-bold text-zinc-400 font-mono">Rs.</span>
                      </div>

                      {/* Overpayment warning */}
                      {isOverPayingInvoice && (
                        <div className="flex items-start gap-1.5 text-[10px] text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800/40 rounded-lg px-2.5 py-2 font-semibold">
                          <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                          <span>
                            <strong>Overpayment of {fmtRs(enteredAmt - remaining)}</strong> on this invoice.
                            The excess will automatically carry forward to reduce the next installment&apos;s balance.
                          </span>
                        </div>
                      )}

                      {/* Quick-fill buttons */}
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {remaining > 0 && (
                          <button
                            type="button"
                            onClick={() => setPayAmount(remaining.toFixed(2))}
                            className="text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded-lg bg-emerald-500/[0.04] text-emerald-600 dark:text-emerald-400 border border-emerald-500/15 hover:bg-emerald-500/10 transition-all duration-300"
                          >
                            Remaining ({fmtRs(remaining)})
                          </button>
                        )}
                        {invoiceAmt > 0 && (
                          <button
                            type="button"
                            onClick={() => setPayAmount(invoiceAmt.toFixed(2))}
                            className="text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded-lg bg-amber-500/[0.04] text-amber-600 dark:text-amber-400 border border-amber-500/15 hover:bg-amber-500/10 transition-all duration-300"
                          >
                            Full Invoice ({fmtRs(invoiceAmt)})
                          </button>
                        )}
                        {contractValue > 0 && contractValue !== invoiceAmt && (
                          <button
                            type="button"
                            onClick={() => setPayAmount(contractValue.toFixed(2))}
                            className="text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded-lg bg-violet-500/[0.04] text-violet-600 dark:text-violet-400 border border-violet-500/15 hover:bg-violet-500/10 transition-all duration-300"
                          >
                            Full Contract ({fmtRs(contractValue)})
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black uppercase text-muted-foreground tracking-wider block">Payment Notes / Reference</label>
                      <Input
                        type="text"
                        placeholder="e.g. Bank Deposit ref 12345"
                        value={payNotes}
                        onChange={(e) => setPayNotes(e.target.value)}
                        className="text-xs font-semibold focus-visible:ring-primary/20"
                      />
                    </div>

                    {/* Already settled notice */}
                    {isFullyPaidInvoice && (
                      <div className="flex items-center gap-1.5 text-[10px] text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800/40 rounded-lg px-2.5 py-2 font-semibold">
                        <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                        This invoice is already marked as paid. Recording a new payment will add to the overpaid amount and carry forward to the next installment.
                      </div>
                    )}

                    <Button
                      type="submit"
                      disabled={recordingPayment || enteredAmt <= 0}
                      className={cn(
                        "w-full font-extrabold text-xs tracking-wider uppercase h-9 shadow-sm text-white",
                        isOverPayingInvoice
                          ? "bg-blue-600 hover:bg-blue-700"
                          : "bg-emerald-600 hover:bg-emerald-700"
                      )}
                    >
                      {recordingPayment ? (
                        <><Loader2 className="h-3.5 w-3.5 animate-spin mr-2" /> Logging Payment...</>
                      ) : isOverPayingInvoice ? (
                        "Record Overpayment & Issue Receipt"
                      ) : (
                        "Record & Issue Receipt"
                      )}
                    </Button>
                  </form>
                );
              })()}
            </CardContent>
          </Card>

          {/* Refund UI — shown when contract is overpaid */}
          {(() => {
            const contractValue = qtn.systemTotal ?? qtn.total ?? 0;
            const totalPaidAll = allPriorQtns.reduce((s: number, q: any) => s + (q.paidAmount || 0), 0);
            const overallOverpaid = Math.max(0, totalPaidAll - contractValue);
            if (overallOverpaid <= 0) return null;
            const canRefund = user?.role && ["superadmin", "admin", "authorized"].includes(user.role);
            return (
              <Card className="border-red-200 dark:border-red-900/40 bg-red-50/50 dark:bg-red-950/10">
                <CardHeader className="py-3 border-b border-red-200/60 dark:border-red-900/30">
                  <CardTitle className="text-xs font-black uppercase tracking-wider text-red-700 dark:text-red-400 flex items-center gap-2">
                    <Banknote className="h-4 w-4" />
                    Refund Due — {fmtRs(overallOverpaid)}
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-4">
                  {proposal?.refundRecord ? (
                    <div className="flex items-start gap-2.5">
                      <BadgeCheck className="h-4 w-4 text-emerald-600 mt-0.5 shrink-0" />
                      <div className="text-xs space-y-0.5">
                        <p className="font-black text-emerald-700 dark:text-emerald-400">Refund Given</p>
                        <p className="font-bold text-emerald-600">{fmtRs(proposal.refundRecord.amount)} · {proposal.refundRecord.method}</p>
                        <p className="text-emerald-600/70">{proposal.refundRecord.date}</p>
                      </div>
                    </div>
                  ) : canRefund ? (
                    <Button
                      size="sm"
                      variant="outline"
                      className="w-full h-8 text-[11px] font-bold border-red-300 text-red-700 hover:bg-red-100 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950/40"
                      onClick={() => {
                        setRefundAmount(overallOverpaid.toFixed(2));
                        setShowRefundModal(true);
                      }}
                    >
                      <Banknote className="h-3.5 w-3.5 mr-1.5" />
                      Mark Refund Given
                    </Button>
                  ) : (
                    <p className="text-xs font-semibold text-red-600">Contact admin to record the refund.</p>
                  )}
                </CardContent>
              </Card>
            );
          })()}

          {/* Payment Receipts Sub-Ledger Card */}
          <Card className="border-border">
            <CardHeader className="py-4 border-b border-border/50 flex flex-row items-center gap-2">
              <CreditCard className="h-4.5 w-4.5 text-primary" />
              <CardTitle className="text-xs font-black uppercase tracking-wider text-muted-foreground flex items-center justify-between w-full">
                <span>Payment Receipts Sub-Ledger</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {receipts.length === 0 ? (
                <div className="p-8 text-center flex flex-col items-center justify-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-muted/65 flex items-center justify-center border border-border/40">
                    <Receipt className="h-5 w-5 text-muted-foreground/60" />
                  </div>
                  <div>
                    <h4 className="text-xs font-black uppercase text-foreground/80 tracking-wider">No receipts recorded yet</h4>
                    <p className="text-[11px] text-muted-foreground font-medium mt-0.5">Use the form above to log payments and issue receipts.</p>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-4">
                  {receipts.map((r) => (
                    <div
                      key={r.id}
                      className="bg-card border border-border/85 rounded-lg shadow-sm relative overflow-hidden group hover:shadow-md hover:border-emerald-500/30 transition-all duration-300 flex items-center justify-between p-3"
                    >
                      <div className="absolute left-0 top-0 bottom-0 w-1 bg-emerald-500" />
                      
                      <div className="flex flex-col gap-1 min-w-0 flex-1 pl-1">
                        <div className="flex items-center justify-between gap-2 pr-2">
                          <span className="font-mono font-bold text-[10px] text-muted-foreground tracking-tight truncate">{r.receiptNo}</span>
                          <span className="text-[9px] font-semibold text-muted-foreground shrink-0">{fmtDate(r.date)}</span>
                        </div>
                        
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-mono font-black text-[15px] text-emerald-600 dark:text-emerald-400 leading-none">{fmtRs(r.amount)}</span>
                        </div>
                        
                        {r.notes && (
                          <div className="mt-0.5 truncate text-[9px] font-medium text-muted-foreground bg-muted/70 px-1.5 py-0.5 rounded max-w-full">
                            {r.notes}
                          </div>
                        )}
                      </div>

                      <div className="pl-2 border-l border-border/50 flex items-center justify-center">
                        <Button size="icon" variant="ghost" className="h-8 w-8 rounded-full text-muted-foreground hover:bg-emerald-500/10 hover:text-emerald-600 transition-colors" asChild title="Print Receipt">
                          <Link href={`/receipts/${r.id}`} target="_blank">
                            <Printer className="h-4 w-4" />
                          </Link>
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

      </div>

      {/* Refund Modal */}
      {showRefundModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-background border border-border rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-black uppercase tracking-wider">Mark Refund Given</h3>
              <button onClick={() => setShowRefundModal(false)} className="text-muted-foreground hover:text-foreground text-lg leading-none">×</button>
            </div>
            <form onSubmit={handleMarkRefund} className="space-y-3">
              <div className="space-y-1">
                <label className="text-[9px] font-black uppercase text-muted-foreground block">Refund Amount (LKR)</label>
                <Input type="number" step="0.01" value={refundAmount} onChange={(e) => setRefundAmount(e.target.value)} className="h-9 font-mono font-black" required />
              </div>
              <div className="space-y-1">
                <label className="text-[9px] font-black uppercase text-muted-foreground block">Date Refunded</label>
                <Input type="date" value={refundDate} onChange={(e) => setRefundDate(e.target.value)} className="h-9" required />
              </div>
              <div className="space-y-1">
                <label className="text-[9px] font-black uppercase text-muted-foreground block">Method</label>
                <Select value={refundMethod} onValueChange={setRefundMethod}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Bank Transfer">Bank Transfer</SelectItem>
                    <SelectItem value="Cash">Cash</SelectItem>
                    <SelectItem value="Cheque">Cheque</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <label className="text-[9px] font-black uppercase text-muted-foreground block">Reference / Slip No.</label>
                <Input placeholder="Optional" value={refundReference} onChange={(e) => setRefundReference(e.target.value)} className="h-9 text-sm" />
              </div>
              <div className="space-y-1">
                <label className="text-[9px] font-black uppercase text-muted-foreground block">Notes</label>
                <Textarea placeholder="Optional" value={refundNotes} onChange={(e) => setRefundNotes(e.target.value)} className="text-sm resize-none h-16" />
              </div>
              <div className="flex gap-2 pt-1">
                <Button type="button" variant="outline" className="flex-1 text-xs font-bold" onClick={() => setShowRefundModal(false)}>Cancel</Button>
                <Button type="submit" disabled={savingRefund} className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-extrabold">
                  {savingRefund ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save Refund"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── HIGH-FIDELITY PRINTABLE A4 CONTAINER ── */}
      <div
        id="print-root"
        className={cn(
          "max-w-[210mm] mx-auto bg-white text-zinc-900 border border-zinc-200 shadow-lg print:border-none rounded-xl print:rounded-none overflow-hidden duration-300 relative theme-force-light",
          (!qtn?.installmentNo || qtn?.installmentNo <= 1)
            ? "qtn-a4-card print:shadow-none print:flex print:flex-col print:h-full print:w-full"
            : "print:shadow-none print:block print:h-auto print:w-full"
        )}
      >
        <div className="qtn-a4-body p-8 sm:p-12 flex flex-col min-h-[297mm] print:min-h-0 print:h-full justify-between relative select-text gap-6 print:gap-3">
          
          {/* PAID Seal Stamp Overlay */}
          {isPaid && (
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 -rotate-12 pointer-events-none select-none z-10 animate-in fade-in zoom-in duration-300">
              <div className="border-4 border-double border-red-600 text-red-600 font-sans font-black px-4 py-2 uppercase rounded-lg shadow-sm flex flex-col items-center justify-center bg-white/90 backdrop-blur-[1px] print:bg-transparent print:shadow-none mix-blend-multiply opacity-85 scale-90 sm:scale-100">
                <span className="text-[10px] font-bold tracking-wider leading-none">ALTA VISION</span>
                <span className="text-3xl font-black leading-none my-1.5 tracking-widest border-y-2 border-red-600 py-1 px-4">PAID</span>
                <span className="text-[9px] font-mono leading-none font-bold">
                  {fmtDate(qtn.confirmedAt || qtn.date || qtn.createdAt)}
                </span>
              </div>
            </div>
          )}
          
          {/* ── 1. DOCUMENT HEADER ── */}
          <div className="flex flex-row justify-between items-start border-b-2 border-primary pb-4 print:pb-2">
            <div className="space-y-1">
              {sysSettings?.logoUrl ? (
                <img
                  src={sysSettings.logoUrl}
                  alt="Alta Vision Logo"
                  className="h-10 w-auto object-contain print:h-11"
                />
              ) : (
                <img
                  src="/logo.png"
                  alt="Alta Vision Logo"
                  className="h-10 w-auto object-contain print:h-11"
                  onError={(e) => {
                    e.currentTarget.style.display = 'none';
                  }}
                />
              )}
              {/* Fallback Text in case image fails to load entirely */}
              <span className="text-xl font-black tracking-tight text-primary uppercase select-none hidden brand-text-fallback">
                ALTA VISION
              </span>
              <div className="text-[10px] text-muted-foreground leading-normal font-semibold">
                {isEditing ? (
                  <>
                    <div className="mb-1.5 no-print">
                      <Select
                        value={(() => {
                          const idx = sysSettings?.addresses?.findIndex((addr: string) => addr === editCompanyAddress);
                          return idx >= 0 ? idx.toString() : "0";
                        })()}
                        onValueChange={(val) => {
                          const idx = parseInt(val);
                          const selectedAddr = sysSettings?.addresses?.[idx];
                          if (selectedAddr) {
                            setEditCompanyAddress(selectedAddr);
                          }
                        }}
                      >
                        <SelectTrigger className="h-7 w-64 text-left border bg-zinc-50 text-xs py-0 text-black">
                          <SelectValue placeholder="Select Company Address" />
                        </SelectTrigger>
                        <SelectContent>
                          {(sysSettings?.addresses || []).map((addr: string, idx: number) => (
                            <SelectItem key={idx} value={idx.toString()} className="text-xs">
                              {addr}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <p className="hidden print:block">{editCompanyAddress || qtn?.companyAddress || sysSettings?.companyAddress || sysSettings?.address || "No 23D, Sri Rathanapala Mawatha, Nupe, Matara"}</p>
                  </>
                ) : (
                  <p>{qtn?.companyAddress || sysSettings?.companyAddress || sysSettings?.address || "No 23D, Sri Rathanapala Mawatha, Nupe, Matara"}</p>
                )}
                {isEditing && (
                  <p className="text-[9px] text-emerald-600 font-bold mb-1 leading-tight max-w-[250px] no-print">
                    Active selection: {editCompanyAddress || qtn?.companyAddress || sysSettings?.companyAddress || "No 23D, Sri Rathanapala Mawatha, Nupe, Matara"}
                  </p>
                )}
                <p>{sysSettings?.companyEmail || sysSettings?.email || "info@altavision.lk"}</p>
                {(proposal?.vatInvoice || qtn?.vatInvoice) && (
                  <p className="font-bold text-foreground mt-0.5">
                    VAT Reg. No: {sysSettings?.vatRegNo || "174909482 - 7000"}
                  </p>
                )}
              </div>
            </div>
            
            <div className="text-right space-y-1.5">
              <h1 className="text-3xl font-black text-slate-900 tracking-tight uppercase print:text-2xl">
                {isInvoiceDoc ? "Invoice" : "Proforma Invoice"}
              </h1>
              <div className="flex flex-row justify-end items-center gap-1.5 text-sm print:text-xs">
                <span className="font-bold text-muted-foreground">
                  {isInvoiceDoc ? "Invoice No:" : "Proforma Invoice No:"}
                </span>
                {isEditing ? (
                  <Input
                    className="h-7 w-28 text-right font-mono font-bold text-black border bg-zinc-50 focus:bg-white text-xs py-0"
                    value={editQtnNo}
                    onChange={(e) => setEditQtnNo(e.target.value)}
                  />
                ) : (
                  <span className="font-mono font-extrabold text-foreground">{formatQtnNo(qtn.qtnNo, isPaid, qtn.installmentNo, qtn.installmentPercent, qtn.siteNo, proposal?.propNo)}</span>
                )}
              </div>
              <div className="flex flex-row justify-end items-center gap-1.5 text-xs print:text-[11px]">
                <span className="font-bold text-muted-foreground">Date:</span>
                {isEditing ? (
                  <Input
                    type="date"
                    className="h-7 w-32 text-right text-black border bg-zinc-50 focus:bg-white text-xs py-0"
                    value={editDate}
                    onChange={(e) => setEditDate(e.target.value)}
                  />
                ) : (
                  <span className="font-semibold text-foreground">{fmtDate(qtn.date)}</span>
                )}
              </div>
            </div>
          </div>

          {/* ── 2. BILL TO + PROJECT STRIP ── */}
          <div className="grid grid-cols-2 gap-0 border-b border-border pb-4 print:pb-2">
            {/* Left column: BILL TO */}
            <div className="border-r border-border pr-6 space-y-1.5">
              <div className="text-[10px] font-black text-primary uppercase tracking-widest">BILL TO</div>
              {isEditing ? (
                <div className="space-y-2">
                  <Input
                    placeholder="Customer Name"
                    className="h-8 text-black border bg-zinc-50 focus:bg-white text-xs font-semibold"
                    value={editCustName}
                    onChange={(e) => setEditCustName(e.target.value)}
                  />
                  <Textarea
                    placeholder="Address"
                    className="min-h-[50px] text-black border bg-zinc-50 focus:bg-white text-xs"
                    value={editCustAddress}
                    onChange={(e) => setEditCustAddress(e.target.value)}
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <Input
                      placeholder="Phone"
                      className="h-8 text-black border bg-zinc-50 focus:bg-white text-xs"
                      value={editCustPhone}
                      onChange={(e) => setEditCustPhone(e.target.value)}
                    />
                    <Input
                      placeholder="Email"
                      className="h-8 text-black border bg-zinc-50 focus:bg-white text-xs"
                      value={editCustEmail}
                      onChange={(e) => setEditCustEmail(e.target.value)}
                    />
                  </div>
                </div>
              ) : (
                <>
                  <p className="font-extrabold text-base text-foreground leading-tight">
                    {(() => {
                      const sal = qtn.customer?.salutation || proposal?.customer?.salutation;
                      const prefix = sal && sal !== "none" ? `${sal} ` : "";
                      return `${prefix}${qtn.customer?.name || ""}`;
                    })()}
                  </p>
                  <p className="text-xs text-muted-foreground whitespace-pre-line leading-relaxed max-w-sm">{qtn.customer?.address}</p>
                  <p className="text-xs text-muted-foreground font-semibold">
                    Contact: {qtn.customer?.phone} {qtn.customer?.phone2 ? `/ ${qtn.customer.phone2}` : ""}
                  </p>
                  {qtn.customer?.email && (
                    <p className="text-xs text-muted-foreground font-semibold">Email: {qtn.customer.email}</p>
                  )}
                </>
              )}
            </div>
            
            {/* Right column: PROJECT */}
            <div className="pl-6 space-y-1.5 self-start">
              <div className="text-[10px] font-black text-primary uppercase tracking-widest">PROJECT</div>
              <div className="grid grid-cols-12 gap-x-2 gap-y-1.5 text-xs print:text-[11px] print:gap-y-1">
                <span className="col-span-5 text-muted-foreground font-bold uppercase tracking-wider text-[9px]">System:</span>
                <span className="col-span-7 font-semibold text-foreground uppercase">
                  {(() => {
                    const opt = proposal?.options?.[qtn.selectedOption ?? 0] || proposal?.options?.[0];
                    
                    // Check if inverter is hybrid
                    const isHybridInv = opt?.inverter ? (
                      (opt.inverter.productSubtype || "").toLowerCase() === "hybrid" ||
                      (opt.inverter.name || "").toLowerCase().includes("hybrid") ||
                      (opt.inverter.brand || "").toLowerCase().includes("hybrid") ||
                      (opt.inverter.model || "").toLowerCase().includes("hybrid")
                    ) : (
                      (qtn.description || "").toLowerCase().includes("hybrid") ||
                      qtn.items?.some((i: any) => (i.description || "").toLowerCase().includes("hybrid"))
                    );

                    const sysType = isHybridInv ? "hybrid" : (proposal?.sysType || (qtn.description?.toLowerCase().includes("hybrid") ? "hybrid" : "ongrid"));
                    
                    const sysTypeMap: Record<string, string> = {
                      "ongrid": "Ongrid",
                      "hybrid": "Hybrid",
                      "hybrid-offgrid": "Hybrid Offgrid",
                      "offgrid": "Offgrid",
                      "grid-backup": "Grid Backup"
                    };
                    const typeLabel = sysTypeMap[sysType.toLowerCase()] || sysType;
                    
                    // Parse capacity from panel
                    const panelQty = opt?.panel?.qty || 0;
                    const ratingLabel = opt?.panel?.ratingLabel || "";
                    const wattsMatch = ratingLabel.match(/\d+/);
                    const panelWatts = wattsMatch ? Number(wattsMatch[0]) : 0;
                    
                    const hasSolar = panelQty > 0 && panelWatts > 0;
                    
                    if (hasSolar) {
                      const calculatedCap = ((panelQty * panelWatts) / 1000).toFixed(2);
                      return `${calculatedCap}kW ${typeLabel}`;
                    }
                    
                    // Fallback for legacy manual quotations where proposal is null
                    if (!proposal && qtn.description) {
                      const descLower = qtn.description.toLowerCase();
                      const hasSolarKeyword = descLower.includes("panel") || descLower.includes("solar");
                      const kwMatch = qtn.description.match(/(\d+(?:\.\d+)?)\s*kW/i);
                      if (hasSolarKeyword && kwMatch) {
                        const cap = kwMatch[1];
                        return `${cap}kW ${typeLabel}`;
                      }
                    }
                    
                    // Since there is no solar, we get the battery capacity
                    let batteryCap = "";
                    if (opt?.battery) {
                      const qty = opt.battery.qty || 1;
                      const rating = opt.battery.ratingLabel || opt.battery.model || "";
                      const match = rating.match(/(\d+(?:\.\d+)?)\s*kWh/i);
                      if (match) {
                        batteryCap = `${parseFloat(match[1]) * qty}kWh `;
                      } else {
                        const matchAh = rating.match(/(\d+(?:\.\d+)?)\s*Ah/i);
                        if (matchAh) {
                          batteryCap = `${matchAh[1]}Ah `;
                        } else {
                          batteryCap = rating ? `${rating} ` : "";
                        }
                      }
                    } else if (qtn.items && Array.isArray(qtn.items)) {
                      const batItem = qtn.items.find((i: any) => (i.description || "").toLowerCase().includes("battery"));
                      if (batItem) {
                        const qty = batItem.qty || 1;
                        const desc = batItem.description || "";
                        const match = desc.match(/(\d+(?:\.\d+)?)\s*kWh/i);
                        if (match) {
                          batteryCap = `${parseFloat(match[1]) * qty}kWh `;
                        }
                      }
                    } else if (qtn.description) {
                      const match = qtn.description.match(/(\d+(?:\.\d+)?)\s*kWh/i);
                      if (match) {
                        batteryCap = `${match[0]} `;
                      }
                    }
                    
                    return `${batteryCap}Backup`.trim();
                  })()}
                </span>
                
                <span className="col-span-5 text-muted-foreground font-bold uppercase tracking-wider text-[9px]">Utility Provider:</span>
                <span className="col-span-7 font-semibold text-foreground uppercase">{proposal?.utility || "—"}</span>
                
                <span className="col-span-5 text-muted-foreground font-bold uppercase tracking-wider text-[9px]">Utility Phase:</span>
                <span className="col-span-7 font-semibold text-foreground uppercase">
                  {(() => {
                    const p = String(proposal?.phase || "").trim();
                    if (p === "1") return "Single Phase";
                    if (p === "3") return "Three Phase";
                    return p || "—";
                  })()}
                </span>
                
                <span className="col-span-5 text-muted-foreground font-bold uppercase tracking-wider text-[9px]">Power Scheme:</span>
                <span className="col-span-7 font-semibold text-foreground uppercase">{proposal?.powerScheme || "—"}</span>

                {qtn.siteNo && (
                  <>
                    <span className="col-span-5 text-muted-foreground font-bold uppercase tracking-wider text-[9px]">Site Number:</span>
                    <span className="col-span-7 font-semibold text-foreground font-mono">#{qtn.siteNo}</span>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* ── 3. LINE ITEMS (Full Width Description) ── */}
          <div className="w-full">
            <div className="border-b-2 border-primary pb-2 text-[10px] font-black text-primary uppercase tracking-widest mb-3 print:mb-2">
              Description
            </div>
            
            <div className="py-2 print:py-1">
              {isEditing ? (
                <div className="space-y-3 w-full">
                  <Textarea
                    className="min-h-[100px] w-full text-black border bg-zinc-50 focus:bg-white text-xs font-sans font-semibold"
                    value={editDescription}
                    onChange={(e) => setEditDescription(e.target.value)}
                  />
                  <div className="w-1/3">
                    <label className="text-[8px] font-black text-muted-foreground uppercase block mb-1">System Total (LKR)</label>
                    <Input
                      type="number"
                      className="h-8 font-mono text-black border bg-zinc-50 focus:bg-white text-xs font-semibold"
                      value={editTotal}
                      onChange={(e) => setEditTotal(e.target.value)}
                    />
                  </div>
                </div>
              ) : (
                <div className="space-y-1 text-xs text-zinc-800 font-semibold leading-relaxed w-full">
                  {descLines.map((line: string, idx: number) => {
                    const isBullet = line.trim().startsWith("-") || line.trim().startsWith("•") || line.trim().startsWith("*");
                    let cleanLine = line.replace(/^[•\-\*\s]+/, "").trim();
                    if (isBullet) {
                      cleanLine = cleanDescLine(cleanLine);
                      return (
                        <div key={idx} className="flex gap-2 items-start pl-4 leading-relaxed w-full">
                          <span className="text-primary font-bold select-none">•</span>
                          <span>{cleanLine}</span>
                        </div>
                      );
                    } else {
                      if (idx === 0) cleanLine = enhanceDescriptionHeader(cleanLine);
                      return (
                        <p key={idx} className="leading-relaxed font-black text-slate-900 w-full">
                          {cleanLine}
                        </p>
                      );
                    }
                  })}
                </div>
              )}
            </div>

            {/* Elegant Premium Billing Statement Card */}
            <div className="mt-4 print:mt-2 border border-border rounded-xl bg-zinc-50/40 overflow-hidden shadow-sm">
              <div className="bg-zinc-50 border-b border-border/80 px-4 py-2.5 print:py-1.5 flex items-center justify-between">
                <span className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Financial Summary</span>
                {isEditing ? (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-6 text-[9px] px-2 shadow-sm uppercase font-bold no-print"
                    onClick={async () => {
                      if (!qtn?.systemTotal && !qtn?.total) return;
                      const fullAmount = qtn.systemTotal ?? qtn.total;
                      try {
                        await updateDoc(doc(db, "quotations", id as string), {
                          installmentAmount: fullAmount,
                          installmentPercent: 100,
                          installmentNo: 1,
                          updatedAt: serverTimestamp(),
                        });
                        setQtn((prev: any) => ({
                          ...prev,
                          installmentAmount: fullAmount,
                          installmentPercent: 100,
                          installmentNo: 1,
                        }));
                        toast({ title: "Updated", description: "Converted to 100% full payment invoice." });
                      } catch(e: any) {
                        toast({ title: "Error", description: e.message, variant: "destructive" });
                      }
                    }}
                  >
                    Set as Full Payment (100%)
                  </Button>
                ) : (
                  <span className="text-[9px] bg-primary/10 text-primary px-2.5 py-0.5 rounded-full font-bold">
                    {qtn.installmentPercent === 100 ? "Full Payment" : "Installment Stage"}
                  </span>
                )}
              </div>
              
              <div className="p-4 print:p-2.5 space-y-3.5 print:space-y-2">
                {(() => {
                  const isVat = !!(proposal?.vatInvoice || qtn?.vatInvoice);
                  const vatRate = Number(proposal?.vatRate || qtn?.vatRate || 18);
                  const sysTotal = qtn.systemTotal ?? qtn.total ?? 0;
                  const instAmt = qtn.installmentAmount ?? qtn.total ?? 0;
                  const subTotal = isVat ? Math.round(sysTotal / (1 + vatRate / 100)) : sysTotal;
                  const vatAmt = isVat ? sysTotal - subTotal : 0;
                  const instBeforeVat = isVat ? Math.round(instAmt / (1 + vatRate / 100)) : instAmt;
                  const vatOnInst = isVat ? instAmt - instBeforeVat : 0;

                  return (
                    <>
                      {isVat ? (
                        /* VAT breakdown rows */
                        <div className="space-y-2 border border-blue-100 bg-blue-50/40 rounded-lg px-3.5 py-3 print:py-2">
                          <div className="mb-1">
                            <span className="text-[9px] font-black text-blue-700 uppercase tracking-widest">VAT Invoice</span>
                          </div>
                          <div className="flex justify-between items-center text-xs">
                            <span className="text-muted-foreground font-semibold">Sub-total (excl. VAT)</span>
                            <span className="font-mono text-foreground font-semibold">{fmtRs(subTotal)}</span>
                          </div>
                          <div className="flex justify-between items-center text-xs">
                            <span className="text-blue-700 font-semibold">VAT ({vatRate}%)</span>
                            <span className="font-mono text-blue-700 font-semibold">+ {fmtRs(vatAmt)}</span>
                          </div>
                          <div className="border-t border-blue-200 pt-2 flex justify-between items-center text-xs">
                            <span className="text-foreground font-black">Total (incl. VAT)</span>
                            <span className="font-mono text-foreground font-black text-sm">{fmtRs(sysTotal)}</span>
                          </div>
                        </div>
                      ) : (
                        /* Non-VAT: single system total row */
                        <div className="flex justify-between items-center text-xs">
                          <span className="text-muted-foreground font-semibold">System Total Value</span>
                          <span className="font-mono text-foreground font-black text-sm">{fmtRs(sysTotal)}</span>
                        </div>
                      )}

                      {/* Active Invoice Installment Highlighted */}
                      <div className="relative bg-gradient-to-r from-emerald-50 to-emerald-50/30 border border-emerald-200/80 p-3.5 print:p-2.5 rounded-lg overflow-hidden">
                        <div className="flex justify-between items-center">
                          <div className="space-y-0.5 z-10">
                            <div className="text-[10px] print:text-[9px] font-black text-emerald-800 uppercase tracking-wider flex items-center gap-1.5">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                              {(() => {
                                if (qtn.installmentPercent === 100) return `This Invoice — Full Payment (100%)`;
                                if (qtn.installmentNo === 1) return `This Invoice — Advance Payment (${qtn.installmentPercent || 60}%)`;
                                return `This Invoice — Due (${qtn.installmentPercent || 30}%)`;
                              })()}
                            </div>
                            <p className="text-[9px] print:text-[8px] text-emerald-600/80 font-bold">Amount payable for this specific billing stage</p>
                          </div>
                          <span className="font-mono text-lg print:text-base font-black text-emerald-700 z-10">
                            {fmtRs(instAmt)}
                          </span>
                        </div>
                        {isVat && (
                          <div className="mt-2 pt-2 border-t border-emerald-200/60 flex justify-between items-center text-[10px]">
                            <span className="text-emerald-700/70 font-semibold">of which VAT ({vatRate}%)</span>
                            <span className="font-mono text-emerald-700/70 font-semibold">{fmtRs(vatOnInst)}</span>
                          </div>
                        )}
                      </div>
                    </>
                  );
                })()}
              </div>
            </div>
          </div>

          {/* ── 4. SPECIAL NOTES (if any) ── */}
          {((!isEditing && qtn.notes) || isEditing) && (
            <div className="space-y-1.5 print:space-y-1">
              <div className="text-[10px] font-black text-primary uppercase tracking-widest">
                SPECIAL NOTES / TECHNICAL REMARKS
              </div>
              <div className="border-l-4 border-primary pl-4 py-2 bg-primary/5 rounded-r-lg">
                {isEditing ? (
                  <Textarea
                    placeholder="Add optional notes or custom instructions for this quotation..."
                    className="min-h-[70px] w-full text-black border bg-zinc-50 focus:bg-white text-xs font-sans"
                    value={editNotes}
                    onChange={(e) => setEditNotes(e.target.value)}
                  />
                ) : (
                  <p className="text-xs text-foreground whitespace-pre-line leading-relaxed font-semibold">
                    {qtn.notes}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* ── 5. WARRANTY SECTION (Full Width, Bullet Points) ── */}
          {(!qtn.installmentNo || qtn.installmentNo === 1) && (
            <div className="border-t border-border pt-4 pb-2 print:pt-2 print:pb-1 w-full">
              <div className="flex items-center gap-1.5 text-primary mb-2 print:mb-1">
                <ShieldCheck className="h-4 w-4 shrink-0" />
                <span className="text-[10px] font-black uppercase tracking-widest">WARRANTY INFORMATION</span>
              </div>
              
              {isEditing ? (
                <div className="grid grid-cols-3 gap-4 w-full">
                  {/* Inverter Warranty */}
                  <div className="space-y-1.5">
                    <label className="text-[8px] font-black text-muted-foreground uppercase block mb-1">Inverter Warranty (Years)</label>
                    <Select
                      value={(() => {
                        const m = editInverterWarranty.match(/(\d+)\s*[Yy]ear/);
                        return m ? m[1] : "5";
                      })()}
                      onValueChange={(val) => {
                        const text = val === "5"
                          ? `• 5 Year Product Warranty + 5 Year Extended Warranty`
                          : `• ${val} Year Product Warranty`;
                        setEditInverterWarranty(text);
                      }}
                    >
                      <SelectTrigger className="h-8 text-black border bg-zinc-50 focus:bg-white text-xs w-full font-semibold">
                        <SelectValue placeholder="Select years" />
                      </SelectTrigger>
                      <SelectContent className="bg-white">
                        <SelectItem value="5" className="text-xs">5 Years</SelectItem>
                        <SelectItem value="10" className="text-xs">10 Years</SelectItem>
                        <SelectItem value="12" className="text-xs">12 Years</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-[11px] text-foreground/70 bg-zinc-50 border border-zinc-200 rounded px-2 py-1.5 mt-1 font-medium leading-relaxed">
                      {(editInverterWarranty || "").replace(/^[•\-\*\s]+/, "").trim() || "—"}
                    </p>
                  </div>

                  {/* Panel Warranty */}
                  <div className="space-y-1.5">
                    <label className="text-[8px] font-black text-muted-foreground uppercase block mb-1">Panel Product Warranty (Years)</label>
                    <Select
                      value={(() => {
                        const m = editPanelWarranty.match(/(\d+)\s*[Yy]ear/);
                        return m ? m[1] : "12";
                      })()}
                      onValueChange={(val) => {
                        setEditPanelWarranty(`• ${val} Year Product Warranty\n• 25 Year Performance Warranty`);
                      }}
                    >
                      <SelectTrigger className="h-8 text-black border bg-zinc-50 focus:bg-white text-xs w-full font-semibold">
                        <SelectValue placeholder="Select years" />
                      </SelectTrigger>
                      <SelectContent className="bg-white">
                        <SelectItem value="10" className="text-xs">10 Years</SelectItem>
                        <SelectItem value="12" className="text-xs">12 Years</SelectItem>
                        <SelectItem value="15" className="text-xs">15 Years</SelectItem>
                        <SelectItem value="25" className="text-xs">25 Years</SelectItem>
                      </SelectContent>
                    </Select>
                    <div className="text-[11px] text-foreground/70 bg-zinc-50 border border-zinc-200 rounded px-2 py-1.5 mt-1 font-medium leading-relaxed space-y-0.5">
                      {(editPanelWarranty || "").split("\n").map(l => l.replace(/^[•\-\*\s]+/, "").trim()).filter(Boolean).map((l, i) => (
                        <p key={i}>• {l}</p>
                      ))}
                    </div>
                  </div>

                  {/* Battery Warranty */}
                  <div className="space-y-1.5">
                    <label className="text-[8px] font-black text-muted-foreground uppercase block mb-1">Battery Warranty (Years, Optional)</label>
                    <Select
                      value={(() => {
                        const m = editBatteryWarranty.match(/(\d+)\s*[Yy]ear/);
                        return m ? m[1] : "5";
                      })()}
                      onValueChange={(val) => {
                        const text = val === "5"
                          ? `• 5 Year Product Warranty + 5 Year Extended Warranty`
                          : `• ${val} Year Product Warranty`;
                        setEditBatteryWarranty(text);
                      }}
                    >
                      <SelectTrigger className="h-8 text-black border bg-zinc-50 focus:bg-white text-xs w-full font-semibold">
                        <SelectValue placeholder="Select years" />
                      </SelectTrigger>
                      <SelectContent className="bg-white">
                        <SelectItem value="5" className="text-xs">5 Years</SelectItem>
                        <SelectItem value="10" className="text-xs">10 Years</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-[11px] text-foreground/70 bg-zinc-50 border border-zinc-200 rounded px-2 py-1.5 mt-1 font-medium leading-relaxed">
                      {(editBatteryWarranty || "").replace(/^[•\-\*\s]+/, "").trim() || "No battery / not applicable"}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="space-y-1.5 print:space-y-0.5 text-xs print:text-[11px] text-muted-foreground font-semibold pl-4">
                  {(() => {
                    const optId = qtn.selectedOptionId || proposal?.options?.[0]?.id;
                    const opt = proposal?.options?.find((o: any) => o.id === optId) || proposal?.options?.[0];
                    const hasGoodweBat = !!(opt?.battery && (opt.battery.brand || "").toLowerCase().includes("goodwe"));

                    const normalizeWarranty = (raw: string, wtype: "inverter" | "panel" | "battery", brand = "", model = "", subtype = "") => {
                      const clean = (raw || "").replace(/^[•\-\*\s]+/, "").trim();
                      if (!clean) return "";
                      if (clean.toLowerCase().includes("product warranty") || clean.toLowerCase().includes("performance warranty")) return clean;
                      const yearsMatch = clean.match(/(\d+)/);
                      const years = yearsMatch ? parseInt(yearsMatch[1]) : 0;
                      return getFormattedWarranty(wtype, brand, model, subtype, years, hasGoodweBat);
                    };

                    return (
                      <>
                        {/* Inverter Bullet */}
                        <div className="flex gap-2 items-start leading-relaxed">
                          <span className="text-primary font-bold select-none">•</span>
                          <span>
                            <strong className="text-foreground font-extrabold">Inverter Warranty:</strong>{" "}
                            {(() => {
                              const rawVal = opt?.inverter?.warranty || qtn.inverterWarranty || (() => {
                                const desc = (qtn.description || "").toLowerCase();
                                const hasBat = desc.includes("battery") || (qtn.batteryWarranty && qtn.batteryWarranty.trim().length > 0);
                                const isHyb = desc.includes("hybrid") || hasBat;
                                return isHyb ? "5" : "10";
                              })();
                              return normalizeWarranty(String(rawVal), "inverter", opt?.inverter?.brand || "", opt?.inverter?.model || "", opt?.inverter?.productSubtype || "");
                            })()}
                          </span>
                        </div>

                        {/* Panel Bullet */}
                        {(() => {
                          let hasSolar = false;
                          if (opt) {
                            hasSolar = (opt.panel?.qty || 0) > 0;
                          } else if (qtn.items && Array.isArray(qtn.items)) {
                            hasSolar = qtn.items.some((i: any) => (i.description || "").toLowerCase().includes("panel") || (i.description || "").toLowerCase().includes("solar"));
                          } else if (qtn.description) {
                            hasSolar = qtn.description.toLowerCase().includes("panel") || qtn.description.toLowerCase().includes("solar");
                          } else {
                            hasSolar = true;
                          }
                          if (!hasSolar) return null;

                          const rawPanel = opt?.panel?.warranty || qtn.panelWarranty || "";
                          const cleanRaw = (rawPanel || "").replace(/^[•\-\*\s]+/, "").trim();
                          let displayLines: string[];
                          if (cleanRaw.toLowerCase().includes("product warranty") || cleanRaw.toLowerCase().includes("performance warranty")) {
                            displayLines = rawPanel.split("\n").map((l: string) => l.replace(/^[•\-\*\s]+/, "").trim()).filter(Boolean);
                          } else {
                            const prodYrs = cleanRaw.match(/(\d+)/) ? parseInt(cleanRaw.match(/(\d+)/)![1]) : (opt?.panel?.warranty ? parseInt(String(opt.panel.warranty)) : 12);
                            displayLines = [`${prodYrs || 12} Year Product Warranty`, "25 Year Performance Warranty"];
                          }
                          return (
                            <div className="flex gap-2 items-start leading-relaxed">
                              <span className="text-primary font-bold select-none">•</span>
                              <span>
                                <strong className="text-foreground font-extrabold">Panel Warranty:</strong>{" "}
                                {displayLines.join(" and ") || "—"}
                              </span>
                            </div>
                          );
                        })()}

                        {/* Battery Bullet */}
                        {(opt?.battery?.warranty || qtn.batteryWarranty) && (
                          <div className="flex gap-2 items-start leading-relaxed">
                            <span className="text-primary font-bold select-none">•</span>
                            <span>
                              <strong className="text-foreground font-extrabold">Battery:</strong>{" "}
                              {normalizeWarranty(String(opt?.battery?.warranty || qtn.batteryWarranty || ""), "battery", opt?.battery?.brand || "", opt?.battery?.model || "")}
                            </span>
                          </div>
                        )}
                      </>
                    );
                  })()}
                </div>
              )}
            </div>
          )}

          {/* ── 6. VALIDITY & TERMS SECTION (Full Width, No Border, Two Bullet Points) ── */}
          <div className="border-t border-border pt-4 pb-2 print:pt-2 print:pb-1 w-full">
            <div className="flex items-center gap-1.5 text-primary mb-2 print:mb-1">
              <Scale className="h-4 w-4 shrink-0" />
              <span className="text-[10px] font-black uppercase tracking-widest">VALIDITY & TERMS</span>
            </div>
            
            {isEditing ? (
              <div className="grid grid-cols-2 gap-4 w-full">
                <div>
                  <label className="text-[8px] font-black text-muted-foreground uppercase block mb-1">Validity Period</label>
                  <Select
                    value={getValidityKey(editValidityPeriod)}
                    onValueChange={(val) => {
                      if (val === "3_days") setEditValidityPeriod("• Quotation Valid for 3 days.");
                      else if (val === "1_week") setEditValidityPeriod("• Quotation Valid for 1 week.");
                      else if (val === "14_days") setEditValidityPeriod("• Quotation Valid for 14 days.");
                      else if (val === "30_days") setEditValidityPeriod("• Quotation Valid for 30 days.");
                    }}
                  >
                    <SelectTrigger className="h-8 text-black border bg-zinc-50 focus:bg-white text-xs w-full font-semibold">
                      <SelectValue placeholder="Select validity" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="3_days">3 Days</SelectItem>
                      <SelectItem value="1_week">7 Days (1 Week)</SelectItem>
                      <SelectItem value="14_days">14 Days</SelectItem>
                      <SelectItem value="30_days">30 Days</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-[8px] font-black text-muted-foreground uppercase block mb-1">Payment Term</label>
                  <Textarea
                    className="min-h-[50px] text-black border bg-zinc-50 focus:bg-white text-xs w-full font-sans font-semibold"
                    value={editPaymentTerm}
                    onChange={(e) => setEditPaymentTerm(e.target.value)}
                  />
                </div>
              </div>
            ) : (
              <div className="space-y-1.5 print:space-y-0.5 text-xs print:text-[11px] text-muted-foreground font-semibold pl-4">
                {(() => {
                  const vText = (qtn.validityPeriod || "• Quotation Valid for 1 week.").replace(/^[•\-\*\s]+/, "").trim();
                  const pText = (qtn.paymentTerm || "• Equipment booking and project mobilization will be officially confirmed upon receipt of the payment specified in this invoice.").replace(/^[•\-\*\s]+/, "").trim();
                  const showPaymentTerm = !qtn.installmentNo || qtn.installmentNo === 1;
                  return (
                    <>
                      <div className="flex gap-2 items-start leading-relaxed">
                        <span className="text-primary font-bold select-none">•</span>
                        <span>{vText}</span>
                      </div>
                      {showPaymentTerm && (
                        <div className="flex gap-2 items-start leading-relaxed">
                          <span className="text-primary font-bold select-none">•</span>
                          <span>{pText}</span>
                        </div>
                      )}
                    </>
                  );
                })()}
              </div>
            )}
          </div>

          {/* ── 6. BANK / EFT DETAILS ── */}
          <div className="bg-muted p-4 print:p-3 rounded-xl space-y-3 print:space-y-2 mt-1 print:mt-0">
            <div className="flex items-center gap-1.5 text-primary">
              <Landmark className="h-4 w-4" />
              <span className="text-[10px] font-black uppercase tracking-widest">DIRECT DEPOSIT / EFT INSTRUCTIONS</span>
            </div>
            
            {isEditing ? (
              <div className="space-y-3 bg-white p-3 rounded-lg border border-border/80">
                {sysSettings?.banks && sysSettings.banks.length > 0 && (
                  <div className="grid grid-cols-2 gap-4 w-full no-print">
                    <div>
                      <label className="text-[10px] font-black text-muted-foreground uppercase block mb-1">Choose Predefined Bank Account</label>
                      <Select
                        onValueChange={(val) => {
                          const idx = parseInt(val);
                          const selectedBank = sysSettings.banks[idx];
                          if (selectedBank) {
                            setEditAccName(selectedBank.accountName || "");
                            setEditBank(selectedBank.bankName || "");
                            setEditBranch(selectedBank.branch || "");
                            setEditAccNo(selectedBank.accountNumber || "");
                          }
                        }}
                      >
                        <SelectTrigger className="h-8 text-xs font-semibold bg-white border border-slate-200">
                          <SelectValue placeholder="Select bank account to auto-fill..." />
                        </SelectTrigger>
                        <SelectContent>
                          {sysSettings.banks.map((b: any, idx: number) => (
                            <SelectItem key={idx} value={idx.toString()} className="text-xs">
                              {b.bankName} ({b.branch}) - {b.accountNumber}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <label className="text-[10px] font-black text-muted-foreground uppercase block mb-1">Quotation Validity</label>
                      <Select
                        value={getValidityKey(editValidityPeriod)}
                        onValueChange={(val) => {
                          if (val === "3_days") setEditValidityPeriod("• Quotation Valid for 3 days.");
                          else if (val === "1_week") setEditValidityPeriod("• Quotation Valid for 1 week.");
                          else if (val === "14_days") setEditValidityPeriod("• Quotation Valid for 14 days.");
                          else if (val === "30_days") setEditValidityPeriod("• Quotation Valid for 30 days.");
                        }}
                      >
                        <SelectTrigger className="h-8 text-xs font-semibold bg-white border border-slate-200">
                          <SelectValue placeholder="Select validity period..." />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="3_days">3 Days</SelectItem>
                          <SelectItem value="1_week">7 Days (1 Week)</SelectItem>
                          <SelectItem value="14_days">14 Days</SelectItem>
                          <SelectItem value="30_days">30 Days</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                )}
                
                <div className="grid grid-cols-4 gap-3">
                  <div>
                    <label className="text-[9px] font-bold text-zinc-500 uppercase block mb-0.5">Account Name</label>
                    <Input
                      className="h-8 text-black border bg-white text-xs font-semibold"
                      value={editAccName}
                      onChange={(e) => setEditAccName(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="text-[9px] font-bold text-zinc-500 uppercase block mb-0.5">Bank Name</label>
                    <Input
                      className="h-8 text-black border bg-white text-xs font-semibold"
                      value={editBank}
                      onChange={(e) => setEditBank(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="text-[9px] font-bold text-zinc-500 uppercase block mb-0.5">Branch</label>
                    <Input
                      className="h-8 text-black border bg-white text-xs font-semibold"
                      value={editBranch}
                      onChange={(e) => setEditBranch(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="text-[9px] font-bold text-zinc-500 uppercase block mb-0.5">Account No</label>
                    <Input
                      className="h-8 text-black border bg-white text-xs font-semibold"
                      value={editAccNo}
                      onChange={(e) => setEditAccNo(e.target.value)}
                    />
                  </div>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-4 gap-4 text-xs font-medium">
                <div>
                  <div className="text-[9px] font-bold text-muted-foreground uppercase block tracking-wider mb-0.5">Account Name</div>
                  <div className="font-extrabold text-foreground">{qtn.bankDetails?.accountName || fallbackBank?.accountName || "Alta Vision (Pvt) Ltd"}</div>
                </div>
                <div>
                  <div className="text-[9px] font-bold text-muted-foreground uppercase block tracking-wider mb-0.5">Bank Name</div>
                  <div className="font-extrabold text-foreground">{qtn.bankDetails?.bank || fallbackBank?.bankName || "NTB"}</div>
                </div>
                <div>
                  <div className="text-[9px] font-bold text-muted-foreground uppercase block tracking-wider mb-0.5">Branch</div>
                  <div className="font-extrabold text-foreground">{qtn.bankDetails?.branch || fallbackBank?.branch || "Tangalle"}</div>
                </div>
                <div>
                  <div className="text-[9px] font-bold text-muted-foreground uppercase block tracking-wider mb-0.5">Account Number</div>
                  <div className="font-mono font-black text-foreground">{qtn.bankDetails?.accountNo || fallbackBank?.accountNumber || "1008 9000 8235"}</div>
                </div>
              </div>
            )}
            
            <div className="text-[10px] print:text-[9px] text-muted-foreground/90 font-semibold flex items-start gap-1.5 pt-1.5 border-t border-border/40">
              <CheckCircle2 className="h-3.5 w-3.5 text-primary shrink-0 mt-0.5" />
              <span>
                To confirm your booking, please email your deposit slip or transfer confirmation to{" "}
                <strong className="font-extrabold text-foreground">{sysSettings?.companyEmail || "quotations@altavision.lk"}</strong>{" "}
                referencing the {isPaid ? "Invoice Number" : "Proforma Invoice Number"} <strong className="font-mono font-black text-foreground underline">{formatQtnNo(qtn.qtnNo, isPaid, qtn.installmentNo, qtn.installmentPercent, qtn.siteNo, proposal?.propNo) || "—"}</strong>,
                or share it via WhatsApp to <strong className="font-extrabold text-foreground">{sysSettings?.companyWhatsapp || "0742681807"}</strong>.
              </span>
            </div>
          </div>

          {/* ── 7. CERTIFICATIONS / BADGES FOOTER ── */}
          <div className="w-full mt-auto border-t border-border pt-4 print:pt-2 flex flex-col items-center gap-3 print:gap-1.5">
            {/* Top: small logo badges */}
            <div className="flex flex-row items-center justify-between w-full shrink-0">
              {sysSettings?.letters && sysSettings.letters.length > 0 ? (
                sysSettings.letters.map((letter: any, idx: number) => (
                  letter.badgeUrl ? (
                    <div key={idx} className={idx === 1 ? "flex-grow px-4 w-2/4 flex justify-center" : "w-1/4 flex " + (idx === 0 ? "justify-start" : "justify-end")}>
                      <img src={letter.badgeUrl} alt={letter.name} className={`h-8 print:h-6 object-contain ${idx === 1 ? 'w-full' : ''}`} />
                    </div>
                  ) : null
                )).filter(Boolean).length > 0 ? (
                  sysSettings.letters.map((letter: any, idx: number) => (
                    letter.badgeUrl ? (
                      <div key={idx} className={idx === 1 ? "flex-grow px-4 w-2/4 flex justify-center" : "w-1/4 flex " + (idx === 0 ? "justify-start" : "justify-end")}>
                        <img src={letter.badgeUrl} alt={letter.name} className={`h-8 print:h-6 object-contain ${idx === 1 ? 'w-full' : ''}`} />
                      </div>
                    ) : null
                  ))
                ) : (
                  <>
                    <div className="w-1/4 flex justify-start"><img src="/PC%20logo%20and%20QR.png" alt="Pearl Cluster" className="h-8 print:h-6 object-contain" /></div>
                    <div className="w-2/4 px-4 flex-grow flex justify-center"><img src="/all%20logos.png" alt="All Logos" className="h-8 print:h-6 w-full object-contain" /></div>
                    <div className="w-1/4 flex justify-end"><img src="/Certificates.png" alt="Certificates" className="h-8 print:h-6 object-contain" /></div>
                  </>
                )
              ) : sysSettings?.badges && sysSettings.badges.length > 0 ? (
                sysSettings.badges.map((badgeUrl: string, idx: number) => (
                  <div key={idx} className={idx === 1 ? "flex-grow px-4 w-2/4 flex justify-center" : "w-1/4 flex " + (idx === 0 ? "justify-start" : "justify-end")}>
                    <img src={badgeUrl} alt="Badge" className={`h-8 print:h-6 object-contain ${idx === 1 ? 'w-full' : ''}`} />
                  </div>
                ))
              ) : (
                <>
                  <div className="w-1/4 flex justify-start"><img src="/PC%20logo%20and%20QR.png" alt="Pearl Cluster" className="h-8 print:h-6 object-contain" /></div>
                  <div className="w-2/4 px-4 flex-grow flex justify-center"><img src="/all%20logos.png" alt="All Logos" className="h-8 print:h-6 w-full object-contain" /></div>
                  <div className="w-1/4 flex justify-end"><img src="/Certificates.png" alt="Certificates" className="h-8 print:h-6 object-contain" /></div>
                </>
              )}
            </div>
            
            {/* Bottom: Two lines of centered text */}
            <div className="text-center space-y-1">
              <p className="text-[10px] text-muted-foreground italic font-semibold leading-normal">
                This is a computer-generated {isPaid ? "invoice" : "proforma invoice"}. No signature is required.
              </p>
              <p className="text-[9px] text-muted-foreground font-mono font-bold leading-normal">
                {getRefString()}
              </p>
            </div>
          </div>

        </div>

        {/* ── PAGE 2: STATEMENT OF ACCOUNT LEDGER (FOR INSTALLMENT 2+) ── */}
        {qtn && qtn.installmentNo > 1 && (
          <div className="qtn-a4-body-p2 p-8 sm:p-12 flex flex-col justify-between select-text border-t border-dashed border-zinc-200 print:border-none relative">
            
            {/* Header branding */}
            <div className="flex flex-row justify-between items-start border-b-2 border-zinc-300 pb-4">
              <div className="space-y-1">
                {sysSettings?.logoUrl ? (
                  <img
                    src={sysSettings.logoUrl}
                    alt="Alta Vision Logo"
                    className="h-10 w-auto object-contain print:h-11"
                  />
                ) : (
                  <img
                    src="/logo.png"
                    alt="Alta Vision Logo"
                    className="h-10 w-auto object-contain print:h-11"
                    onError={(e) => {
                      e.currentTarget.style.display = 'none';
                    }}
                  />
                )}
                <div className="text-[10px] text-muted-foreground leading-normal font-semibold">
                  <p>{sysSettings?.companyAddress || "No 23D, Sri Rathanapala Mawatha, Nupe, Matara"}</p>
                </div>
              </div>
              
              <div className="text-right space-y-1">
                <h2 className="text-lg font-black text-slate-900 tracking-tight uppercase">
                  Statement of Account
                </h2>
                <div className="text-xs">
                  <span className="font-bold text-muted-foreground">Invoice Reference: </span>
                  <span className="font-mono font-extrabold text-foreground">#{formatQtnNo(qtn.qtnNo, isPaid, qtn.installmentNo, qtn.installmentPercent, qtn.siteNo, proposal?.propNo)}</span>
                </div>
              </div>
            </div>

            {/* Bill to metadata strip */}
            <div className="grid grid-cols-2 gap-4 border-b border-zinc-200 py-3 text-xs">
              <div>
                <span className="text-[9px] font-black text-primary uppercase block tracking-wider mb-0.5">CUSTOMER</span>
                <span className="font-extrabold text-zinc-800">{qtn.customer?.name}</span>
                <p className="text-zinc-550 truncate max-w-sm">{qtn.customer?.address}</p>
              </div>
              <div className="text-right">
                <span className="text-[9px] font-black text-primary uppercase block tracking-wider mb-0.5">PROJECT SITE REFERENCE</span>
                <span className="font-mono font-bold text-zinc-800">
                  {qtn.siteNo && qtn.siteNo !== "Pending" ? `#${qtn.siteNo}` : `Proposal Ref: #${proposal?.propNo || proposal?.qtnNo || qtn.proposalId}`}
                </span>
                <p className="text-zinc-550 capitalize">{qtn.systemType || "Solar Installation"}</p>
              </div>
            </div>

            {/* Main table ledger */}
            <div className="flex-grow space-y-4 pt-4">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-black uppercase text-primary tracking-widest">Installment & Payment Allocation ledger</span>
                {qtn.siteNo && qtn.siteNo !== "Pending" && (
                  <Badge variant="outline" className="font-bold text-[9px] uppercase bg-emerald-50 border-emerald-200 text-emerald-700">
                    Active Site: {qtn.siteNo}
                  </Badge>
                )}
              </div>

              <div className="overflow-hidden border border-zinc-200 rounded-xl">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-zinc-50 border-b border-zinc-200 text-[9px] font-black uppercase text-zinc-550 tracking-wider">
                      <th className="p-3 pl-4">Billing Stage</th>
                      <th className="p-3">Reference Doc</th>
                      <th className="p-3 text-right">Stage Target</th>
                      <th className="p-3 text-right">Received Date</th>
                      <th className="p-3 text-right">Amount Paid</th>
                      <th className="p-3 text-right pr-4">Balance Due</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(() => {
                      let carryCredit = 0;
                      return allPriorQtns.map((pQ) => {
                        const isPFirst = pQ.installmentNo === 1;
                        const title = isPFirst
                          ? pQ.installmentPercent === 100
                            ? "Full Contract Value"
                            : `Advance Payment Booking (${pQ.installmentPercent}%)`
                          : `Progressive Due Stage (${pQ.installmentPercent}%)`;

                        const isPQFullyPaid = pQ.paymentStatus === "fully_paid";
                        const formattedNo = formatQtnNo(pQ.qtnNo || "", isPQFullyPaid, pQ.installmentNo, pQ.installmentPercent, qtn.siteNo, proposal?.propNo);

                        // Only count actual payments received, not status-based assumptions
                        const amtPaid = pQ.paidAmount || 0;
                        const target = pQ.installmentAmount || pQ.total;
                        // Apply any credit carried from overpayments on prior installments
                        const effectiveDue = target - amtPaid - carryCredit;
                        // Update carry-over for next row (positive = surplus credit)
                        const rowSurplus = amtPaid + carryCredit - target;
                        carryCredit = rowSurplus > 0 ? rowSurplus : 0;

                        const isOverpaid = amtPaid > target;
                        const overpaidBy = isOverpaid ? amtPaid - target : 0;
                        const rowBalanceDue = Math.max(0, effectiveDue);
                        const settled = effectiveDue <= 0;

                        return (
                          <tr key={pQ.id} className="border-b border-zinc-150 hover:bg-zinc-50/50 text-[11px]">
                            <td className="p-3 pl-4 font-semibold text-zinc-800">{title}</td>
                            <td className="p-3 font-mono text-zinc-500">#{formattedNo}</td>
                            <td className="p-3 text-right font-mono text-zinc-500">{fmtRs(target)}</td>
                            <td className="p-3 text-right text-zinc-500">
                              {amtPaid > 0 && pQ.updatedAt ? new Date(pQ.updatedAt.seconds ? pQ.updatedAt.seconds * 1000 : pQ.updatedAt).toLocaleDateString("en-GB") : amtPaid > 0 ? "Confirmed" : "—"}
                            </td>
                            <td className={`p-3 text-right font-mono font-bold ${amtPaid > 0 ? "text-emerald-650" : "text-zinc-400"}`}>
                              {amtPaid > 0 ? (
                                <span>
                                  {fmtRs(amtPaid)}
                                  {isOverpaid && (
                                    <span className="block text-[9px] font-black text-blue-600 leading-tight">+{fmtRs(overpaidBy)} excess</span>
                                  )}
                                </span>
                              ) : "—"}
                            </td>
                            <td className="p-3 text-right font-mono font-bold pr-4">
                              {settled ? (
                                <span className="text-[10px] font-black text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">Settled</span>
                              ) : (
                                <span className="text-amber-700">{fmtRs(rowBalanceDue)}</span>
                              )}
                            </td>
                          </tr>
                        );
                      });
                    })()}
                  </tbody>
                </table>
              </div>

              {/* Ledger Totals Summary */}
              {(() => {
                const totalContract = qtn.systemTotal || qtn.total;
                const totalReceived = receipts.reduce((sum, receipt) => {
                  return sum + (receipt.amount || 0);
                }, 0);
                const outstandingDue = Math.max(0, totalContract - totalReceived);
                const overpaidAmt = Math.max(0, totalReceived - totalContract);
                const vatRate = Number(qtn.vatRate || 18);

                return (
                  <div className="mt-4 space-y-3">
                    {qtn.vatInvoice && (
                      <div className="flex justify-between items-center text-xs bg-blue-50/50 border border-blue-100 rounded-xl px-4 py-2.5">
                        <span className="text-blue-700 font-semibold">VAT Reg. No:</span>
                        <span className="font-mono font-bold text-blue-700">{sysSettings?.vatRegNo || "174909482 - 7000"}</span>
                      </div>
                    )}
                    <div className="bg-zinc-50/50 p-4 rounded-xl border border-zinc-200 grid grid-cols-3 gap-4 text-xs">
                      <div>
                        <span className="text-[9px] font-bold text-zinc-400 uppercase tracking-wider block mb-0.5">Contract Valuation</span>
                        <span className="font-mono font-black text-foreground">{fmtRs(totalContract)}</span>
                        {qtn.vatInvoice && (
                          <span className="text-[8px] text-blue-600 font-semibold block mt-0.5">incl. {vatRate}% VAT</span>
                        )}
                      </div>
                      <div>
                        <span className="text-[9px] font-bold text-zinc-400 uppercase tracking-wider block mb-0.5">Total Paid To Date</span>
                        <span className="font-mono font-black text-emerald-650">{fmtRs(totalReceived)}</span>
                      </div>
                      <div>
                        <span className="text-[9px] font-bold text-zinc-400 uppercase tracking-wider block mb-0.5">
                          {overpaidAmt > 0 && !proposal?.refundRecord ? "Refund Due" : overpaidAmt > 0 ? "Refunded" : "Remaining Balance"}
                        </span>
                        <span className={`font-mono font-black ${overpaidAmt > 0 && !proposal?.refundRecord ? "text-red-600" : overpaidAmt > 0 ? "text-emerald-600" : "text-amber-700"}`}>
                          {overpaidAmt > 0 ? fmtRs(overpaidAmt) : fmtRs(outstandingDue)}
                        </span>
                        {overpaidAmt > 0 && !proposal?.refundRecord && (
                          <span className="text-[8px] text-red-500 font-semibold block mt-0.5">To be refunded</span>
                        )}
                        {overpaidAmt > 0 && proposal?.refundRecord && (
                          <span className="text-[8px] text-emerald-600 font-semibold block mt-0.5">Refunded ✓</span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })()}
            </div>

            {/* Page 2 Footer */}
            <div className="w-full mt-auto border-t border-zinc-250 pt-4 flex flex-col items-center gap-2">
              <div className="text-center space-y-1">
                <p className="text-[10px] text-muted-foreground italic font-semibold leading-normal">
                  This Statement of Account ledger represents an official audit transcript of payments logged for proposal #{proposal?.propNo || proposal?.qtnNo || qtn.proposalId}.
                </p>
                <p className="text-[9px] text-muted-foreground font-mono font-bold leading-normal">
                  {isInvoiceDoc ? "Invoice No" : "Proforma Invoice No"}: {formatQtnNo(qtn.qtnNo, isPaid, qtn.installmentNo, qtn.installmentPercent, qtn.siteNo, proposal?.propNo)}
                </p>
              </div>
            </div>

          </div>
        )}
      </div>
      {qtn && (
        <ShareModal
          isOpen={shareOpen}
          onClose={() => setShareOpen(false)}
          customerName={qtn.customer?.name || ""}
          customerSalutation={qtn.customer?.salutation || proposal?.customer?.salutation}
          customerPhone={qtn.customer?.phone || ""}
          customerEmail={qtn.customer?.email || ""}
          customerAddress={qtn.customer?.address || ""}
          docType="quotation"
          docNo={qtn.qtnNo || "No Ref"}
          docUrl={typeof window !== "undefined" ? `${window.location.origin}/quotations/${qtn.id}` : ""}
          preferredFormats={qtn.customer?.sendFormat || []}
        />
      )}
    </div>
  );
}
