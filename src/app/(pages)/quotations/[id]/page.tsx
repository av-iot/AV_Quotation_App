"use client";
import Image from "next/image";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { doc, getDoc, updateDoc, addDoc, collection, getDocs, query, where, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/auth-context";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  ArrowLeft, Printer, Edit2, Save, X, Loader2, CheckCircle2,
  Receipt, Landmark, ShieldCheck, CalendarRange, Scale
} from "lucide-react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import type { Quotation, QuotationStatus } from "@/types";

const STATUS_CONFIG: Record<QuotationStatus, { label: string; color: string; badge: "default" | "secondary" | "destructive" | "outline" }> = {
  pending_payment: { label: "Pending payment", color: "text-amber-500 bg-amber-500/10 border-amber-500/30", badge: "outline" },
  partial_payment: { label: "Partial payment", color: "text-blue-500 bg-blue-500/10 border-blue-500/30", badge: "secondary" },
  fully_paid: { label: "Fully paid", color: "text-emerald-500 bg-emerald-500/10 border-emerald-500/30", badge: "default" },
  scheduled: { label: "Scheduled", color: "text-purple-500 bg-purple-500/10 border-purple-500/30", badge: "default" },
  installed: { label: "Installed", color: "text-cyan-500 bg-cyan-500/10 border-cyan-500/30", badge: "default" },
  commissioned: { label: "Commissioned", color: "text-primary bg-primary/10 border-primary/30", badge: "default" },
};

const formatCurrency = (amount: number) => {
  return amount.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
};

const renderDescription = (desc: string | undefined | null) => {
  if (!desc) return null;
  const delimiters = [
    "Supply and installation of ",
    " hybrid inverter",
    " batteries",
    " with ",
    " Solar panels",
    ", ",
    "nos of ",
    "nos "
  ];
  const parts = desc.split(/(Supply and installation of | hybrid inverter| batteries| with | Solar panels|, |nos of |nos )/g);
  return parts.map((part, index) => {
    if (delimiters.includes(part)) return part;
    if (part.trim().length > 0) return <strong key={index} className="font-bold text-black">{part}</strong>;
    return part;
  });
};

export default function QuotationDetailPage() {
  const { id } = useParams() as { id: string };
  const router = useRouter();
  const { user } = useAuth();
  const { toast } = useToast();

  const [qtn, setQtn] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);

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
  
  // Bank Details state
  const [editAccName, setEditAccName] = useState("");
  const [editBank, setEditBank] = useState("");
  const [editBranch, setEditBranch] = useState("");
  const [editAccNo, setEditAccNo] = useState("");

  useEffect(() => {
    async function loadQuotation() {
      try {
        const snap = await getDoc(doc(db, "quotations", id));
        if (snap.exists()) {
          const data = snap.data();
          setQtn({ id: snap.id, ...data });
          
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
          setEditInverterWarranty(data.inverterWarranty || "• 5 years Warranty");
          setEditBatteryWarranty(data.batteryWarranty || (data.items?.some((i: any) => i.description.toLowerCase().includes("battery")) ? "• 5 years Warranty" : ""));
          setEditPanelWarranty(data.panelWarranty || "• 12 years Product Warranty\n• 25 Years Performance Warranty");
          setEditValidityPeriod(data.validityPeriod || "• Quotation Valid for 1 week.");
          setEditPaymentTerm(data.paymentTerm || "• The job will be confirmed upon receipt of full payment.");
          
          // Bank details fallback
          setEditAccName(data.bankDetails?.accountName || "Alta Vision (Pvt) Ltd");
          setEditBank(data.bankDetails?.bank || "NTB");
          setEditBranch(data.bankDetails?.branch || "Tangalle");
          setEditAccNo(data.bankDetails?.accountNo || "1008 9000 8235");
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
      const qtnBase = qtn.qtnNo || "Quotation";
      const installmentSuffix = qtn.installmentNo ? `_Part_${qtn.installmentNo}` : "";
      const rawDate = qtn.confirmedAt || qtn.date || qtn.createdAt;
      const dateStr = rawDate ? new Date(rawDate).toLocaleDateString("en-GB").replace(/\//g, "-") : "";
      document.title = `${qtnBase}${installmentSuffix}_${dateStr}`;
    }
  }, [qtn]);

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
        bankDetails: {
          accountName: editAccName,
          bank: editBank,
          branch: editBranch,
          accountNo: editAccNo,
        },
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

  if (loading) {
    return (
      <div className="flex h-[80vh] items-center justify-center gap-2 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
        <span className="text-sm">Loading quotation...</span>
      </div>
    );
  }

  if (!qtn) {
    return (
      <div className="flex h-[80vh] flex-col items-center justify-center gap-4 text-muted-foreground">
        <p>Quotation details could not be resolved.</p>
        <Button variant="outline" asChild>
          <Link href="/quotations">Back to Quotations</Link>
        </Button>
      </div>
    );
  }

  const renderProfessionalList = (text: string, defaultText: string) => {
    const content = text || defaultText;
    const lines = content.split("\n").map(line => line.trim()).filter(Boolean);
    return (
      <ul className="list-disc pl-4 space-y-1 mt-1.5 marker:text-emerald-600 print:marker:text-emerald-700">
        {lines.map((line, idx) => {
          const cleanLine = line.replace(/^[•\-\*\s]+/, "").trim();
          return (
            <li key={idx} className="text-xs print:text-[13px] text-zinc-800 print:text-zinc-900 font-semibold leading-relaxed">
              {cleanLine}
            </li>
          );
        })}
      </ul>
    );
  };

  return (
    <div className="p-6 max-w-4xl mx-auto min-h-screen">
      <style>{`
        @media print {
          @page {
            size: A4 portrait;
            margin: 0 !important;
          }
          body {
            background: white !important;
            color: black !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          .qtn-a4-card {
            width: 210mm !important;
            height: 297mm !important;
            min-height: 297mm !important;
            max-height: 297mm !important;
            box-sizing: border-box !important;
            border: none !important;
            box-shadow: none !important;
            padding: 16mm 20mm 16mm 20mm !important;
            margin: 0 !important;
            display: flex !important;
            flex-direction: column !important;
            background: white !important;
            page-break-after: avoid !important;
            page-break-inside: avoid !important;
            overflow: hidden !important;
          }
          .qtn-a4-body {
            padding: 0 !important;
            display: flex !important;
            flex-direction: column !important;
            height: 100% !important;
            flex-grow: 1 !important;
          }
          
          /* Typography & Scaling for Print Mode */
          .qtn-a4-card p,
          .qtn-a4-card span,
          .qtn-a4-card td,
          .qtn-a4-card li {
            font-size: 13.5px !important;
            line-height: 1.55 !important;
          }
          
          .qtn-a4-card .text-zinc-400 {
            font-size: 11px !important;
          }
          
          /* Bill To Block print scaling */
          .qtn-a4-card .leading-tight {
            font-size: 19px !important;
            font-weight: 900 !important;
          }
          
          /* Description items print scaling */
          .qtn-a4-card .col-span-9.pr-6 {
            font-size: 14.5px !important;
            line-height: 1.6 !important;
          }
          .qtn-a4-card .col-span-3.text-right {
            font-size: 15.5px !important;
          }
          
          /* Grand Total text print scaling */
          .qtn-a4-card .col-span-3.text-emerald-800,
          .qtn-a4-card .text-emerald-900 {
            font-size: 20px !important;
          }
          
          /* Warranty cards title print scaling */
          .qtn-a4-card .tracking-wider {
            font-size: 12.5px !important;
            color: #065f46 !important; /* Emerald 800 */
          }
          
          /* EFT instruction print scaling */
          .qtn-a4-card .relative.overflow-hidden.border {
            padding: 18px !important;
          }
          .qtn-a4-card .relative.overflow-hidden.border span {
            font-size: 11.5px !important;
          }
          .qtn-a4-card .relative.overflow-hidden.border strong {
            font-size: 13.5px !important;
          }
          
          /* Keep end text and print footer beautifully aligned at the bottom */
          .qtn-a4-card .mt-auto {
            margin-top: auto !important;
          }
        }
      `}</style>
      {/* ── Action Navigation (hidden on print) ── */}
      <div className="print:hidden mb-6 flex flex-wrap items-center justify-between gap-4">
        <Button variant="ghost" className="gap-2 shrink-0" asChild>
          <Link href="/quotations">
            <ArrowLeft className="h-4 w-4" />
            Back to Quotations
          </Link>
        </Button>
        <div className="flex gap-2">
          {isEditing ? (
            <>
              <Button variant="outline" className="gap-2" onClick={() => setIsEditing(false)} disabled={saving}>
                <X className="h-4 w-4" />
                Cancel
              </Button>
              <Button className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white" onClick={handleSaveEdits} disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Save Changes
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" className="gap-2 border-primary/20 hover:bg-primary/5 hover:text-primary" onClick={() => setIsEditing(true)}>
                <Edit2 className="h-4 w-4" />
                Edit Quotation
              </Button>
              <Button
                className="gap-2 bg-primary hover:bg-primary/95 text-white"
                onClick={async () => {
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

                  // Temporarily set document title for PDF print filename
                  const originalTitle = document.title;
                  const cleanQtnNo = qtn.qtnNo.replace(/[\/\\?%*:|"<>\s]/g, "_");
                  document.title = `${cleanQtnNo}_v${version}`;

                  window.print();

                  // Restore original title shortly after
                  setTimeout(() => {
                    document.title = originalTitle;
                  }, 1000);
                }}
              >
                <Printer className="h-4 w-4" />
                Print / Save PDF
              </Button>
            </>
          )}
        </div>
      </div>

      {/* ── Status Controller & Summary Panel (hidden on print) ── */}
      <Card className="print:hidden mb-8 border-border bg-card shadow-sm overflow-hidden">
        <CardContent className="p-0">
          <div className="flex flex-wrap items-center justify-between gap-6 p-5">
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 border border-primary/20 shadow-sm">
                <Receipt className="h-6 w-6 text-primary" />
              </div>
              <div>
                <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-1">Status Workflow</p>
                <p className="text-xs font-medium text-foreground">Manage quotation lifecycle</p>
              </div>
            </div>
            <div className="flex items-center gap-3 bg-background p-2 rounded-xl border border-border shadow-sm">
              <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wide ml-2">Current Status:</span>
              {updatingStatus ? (
                <div className="flex items-center justify-center w-[180px] h-9">
                  <Loader2 className="h-4 w-4 animate-spin text-primary" />
                </div>
              ) : (
                <Select
                  value={qtn.paymentStatus}
                  onValueChange={(val) => handleUpdateStatus(val as QuotationStatus)}
                >
                  <SelectTrigger className="w-[180px] h-9 text-xs font-semibold bg-card border-border hover:bg-muted transition-colors focus:ring-1 focus:ring-primary">
                    <SelectValue placeholder="Select Status" />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(STATUS_CONFIG).map(([key, value]) => (
                      <SelectItem key={key} value={key} className="text-xs font-medium cursor-pointer">
                        {value.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── High-Fidelity Printable A4 Quotation Card ── */}
      <Card className="bg-white text-black border shadow-lg print:shadow-none print:border-none rounded-xl print:rounded-none overflow-hidden duration-300 font-sans relative qtn-a4-card print:flex print:flex-col">
        <CardContent className="p-8 sm:p-12 print:p-0 select-text qtn-a4-body print:h-full print:relative print:flex-grow print:flex print:flex-col">
          
          {/* Header Block */}
          <div className="flex flex-row justify-between items-start border-b border-zinc-200 pb-6 print:pb-8">
            <div className="space-y-1">
              <Image
                src="/logo.png"
                alt="Alta Vision"
                width={180}
                height={60}
                className="object-contain mb-1 print:block print:w-[210px] print:h-auto"
                priority
              />
              <p className="text-[10px] print:text-[11px] text-zinc-400 print:text-zinc-500 font-medium">Alta Vision (Pvt) Ltd | info@altavision.lk</p>
            </div>
            <div className="text-right space-y-1">
              <h2 className="text-2xl print:text-3.5xl font-black text-zinc-800 print:text-slate-900 tracking-tight uppercase">Quotation</h2>
              <div className="flex flex-row justify-end items-center gap-1 text-sm print:text-base">
                <span className="font-bold text-zinc-500 print:text-zinc-600">No:</span>
                {isEditing ? (
                  <Input
                    className="h-7 w-28 text-right font-mono font-bold text-black border bg-zinc-50 focus:bg-white text-xs py-0"
                    value={editQtnNo}
                    onChange={(e) => setEditQtnNo(e.target.value)}
                  />
                ) : (
                  <span className="font-mono font-extrabold text-zinc-950 print:text-black">{qtn.qtnNo}</span>
                )}
              </div>
              <div className="flex flex-row justify-end items-center gap-1 text-xs print:text-sm">
                <span className="font-semibold text-zinc-500 print:text-zinc-600">Date:</span>
                {isEditing ? (
                  <Input
                    type="date"
                    className="h-7 w-32 text-right text-black border bg-zinc-50 focus:bg-white text-xs py-0"
                    value={editDate}
                    onChange={(e) => setEditDate(e.target.value)}
                  />
                ) : (
                  <span className="font-medium text-zinc-800 print:text-zinc-900">
                    {new Date(qtn.date).toLocaleDateString("en-GB", {
                      day: "2-digit",
                      month: "long",
                      year: "numeric",
                    })}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Bill To Block */}
          <div className="grid grid-cols-12 gap-1 border-b border-zinc-100 pb-6 print:pb-8 print:pt-4">
            <div className="col-span-2 text-xs print:text-sm font-bold print:font-extrabold text-zinc-500 print:text-zinc-600 uppercase self-start pt-1">Bill To</div>
            <div className="col-span-1 text-xs print:text-sm font-bold text-zinc-500 self-start pt-1">:</div>
            <div className="col-span-9 space-y-1.5 print:space-y-2">
              {isEditing ? (
                <div className="space-y-2">
                  <Input
                    placeholder="Customer Name"
                    className="h-8 text-black border bg-zinc-50 focus:bg-white text-xs"
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
                  <p className="font-bold text-sm print:text-lg text-zinc-900 print:text-black leading-tight print:font-black">{qtn.customer?.name}</p>
                  <p className="text-xs print:text-sm text-zinc-600 print:text-zinc-800 whitespace-pre-line leading-relaxed max-w-md print:max-w-2xl">{qtn.customer?.address}</p>
                  <p className="text-xs print:text-sm text-zinc-500 print:text-zinc-700">Contact: {qtn.customer?.phone} {qtn.customer?.phone2 ? `/ ${qtn.customer.phone2}` : ""}</p>
                </>
              )}
            </div>
          </div>

          {/* Description & Pricing Table */}
          <div className="space-y-3 print:space-y-4 print:pt-4">
            {/* Header row */}
            <div className="grid grid-cols-12 border-b-2 border-zinc-950 print:border-emerald-800 pb-2 print:pb-3 text-[10px] print:text-xs font-black text-zinc-600 print:text-emerald-800 tracking-wider uppercase">
              <div className="col-span-9">Description</div>
              <div className="col-span-3 text-right">Amount (LKR)</div>
            </div>

            {/* Content row */}
            <div className="grid grid-cols-12 items-start py-4 print:py-6 text-xs print:text-sm min-h-[80px] print:min-h-[100px]">
              <div className="col-span-9 pr-6 leading-relaxed text-zinc-800 print:text-black whitespace-pre-wrap print:leading-relaxed">
                {isEditing ? (
                  <Textarea
                    className="min-h-[80px] text-black border bg-zinc-50 focus:bg-white text-xs font-sans"
                    value={editDescription}
                    onChange={(e) => setEditDescription(e.target.value)}
                  />
                ) : (
                  renderDescription(qtn.description || qtn.items?.map((i: any) => i.description).join(", "))
                )}
              </div>
              <div className="col-span-3 text-right font-mono font-bold print:font-extrabold text-zinc-950 print:text-black self-start pt-1 print:text-sm">
                {isEditing ? (
                  <Input
                    type="number"
                    className="h-8 text-right font-mono text-black border bg-zinc-50 focus:bg-white text-xs"
                    value={editTotal}
                    onChange={(e) => setEditTotal(e.target.value)}
                  />
                ) : (
                  formatCurrency(qtn.systemTotal ?? qtn.total)
                )}
              </div>
            </div>

            {/* Total Amount row */}
            <div className="grid grid-cols-12 border-t border-zinc-200 pt-3 print:pt-4 text-sm print:text-base">
              <div className="col-span-9 text-xs print:text-sm font-bold print:font-black text-zinc-500 print:text-zinc-700 uppercase self-center">
                {qtn.installmentNo ? `This Invoice Amount (${qtn.installmentPercent}%) - Installment ${qtn.installmentNo}` : "Total Amount"}
              </div>
              <div className="col-span-3 text-right font-mono font-extrabold text-base print:text-xl text-emerald-800 print:text-emerald-900 border-b-4 double border-double border-emerald-800 print:border-emerald-900 pb-1">
                {isEditing ? (
                  <span>LKR {Number(editTotal).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                ) : (
                  <span>LKR {formatCurrency(qtn.installmentAmount ?? qtn.total)}</span>
                )}
              </div>
            </div>

            {/* Installment Payment Summary Band */}
            {qtn.installmentNo && (
              <div className="mt-4 border border-amber-200/70 bg-amber-50/40 rounded-xl p-4 space-y-3 print:hidden">
                <p className="text-[10px] font-black text-amber-700 uppercase tracking-widest">
                  Payment Installment {qtn.installmentNo} of {Math.ceil((qtn.systemTotal ?? 0) / (qtn.installmentAmount ?? 1))}
                </p>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-y-3 text-xs">
                  <div>
                    <span className="text-[9px] font-bold text-zinc-400 uppercase block tracking-wider">System Total</span>
                    <span className="font-semibold text-zinc-800 font-mono">LKR {formatCurrency(qtn.systemTotal ?? 0)}</span>
                  </div>
                  <div>
                    <span className="text-[9px] font-bold text-zinc-400 uppercase block tracking-wider">This Invoice ({qtn.installmentPercent ?? 0}%)</span>
                    <span className="font-bold text-emerald-700 font-mono">LKR {formatCurrency(qtn.installmentAmount ?? qtn.total)}</span>
                  </div>
                  <div>
                    <span className="text-[9px] font-bold text-zinc-400 uppercase block tracking-wider">Total Invoiced</span>
                    <span className="font-semibold text-blue-700 font-mono">LKR {formatCurrency(qtn.totalInvoiced ?? qtn.total)}</span>
                  </div>
                  <div>
                    <span className="text-[9px] font-bold uppercase block tracking-wider" style={{color: (qtn.balanceAfter ?? 0) > 0 ? '#b45309' : '#047857'}}>Balance Remaining</span>
                    <span className={`font-bold font-mono text-sm ${(qtn.balanceAfter ?? 0) > 0 ? 'text-amber-700' : 'text-emerald-700'}`}>
                      LKR {formatCurrency(qtn.balanceAfter ?? 0)}
                    </span>
                    {(qtn.balanceAfter ?? 0) === 0 && (
                      <span className="block text-[9px] text-emerald-600 font-bold mt-0.5">✓ Fully Settled</span>
                    )}
                  </div>
                </div>
                {/* Mini progress bar */}
                <div className="w-full bg-zinc-200 rounded-full h-1.5">
                  <div
                    className="bg-emerald-600 rounded-full h-1.5 transition-all print:bg-emerald-600"
                    style={{ width: `${Math.min(100, ((qtn.totalInvoiced ?? qtn.total) / (qtn.systemTotal ?? 1)) * 100)}%` }}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Warranties Block */}
          <div className="border-t border-zinc-100 pt-6 print:pt-8 space-y-4">
            <h3 className="text-[11px] print:text-xs font-black text-zinc-400 print:text-emerald-800 uppercase tracking-widest flex items-center gap-1.5 print:border-b print:border-emerald-100 print:pb-1.5 print:mb-2">
              <ShieldCheck className="h-3.5 w-3.5 text-zinc-500 print:text-emerald-800 shrink-0 print:h-4 print:w-4" />
              Warranty Clauses & Coverage Agreements
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 print:grid-cols-3 gap-6">
              
              {/* Inverter Warranty Card */}
              <div className="bg-zinc-50/40 border border-zinc-150 p-4 rounded-xl print:bg-zinc-50/15 print:border-zinc-200 print:p-4 print:rounded-lg shadow-sm print:shadow-none">
                <span className="text-[10px] print:text-[11.5px] font-black text-emerald-800 uppercase tracking-wider block mb-2 border-b border-emerald-500/10 pb-1.5">Inverter Warranty</span>
                {isEditing ? (
                  <Input
                    className="h-8 text-black border bg-zinc-50 focus:bg-white text-xs"
                    value={editInverterWarranty}
                    onChange={(e) => setEditInverterWarranty(e.target.value)}
                  />
                ) : (
                  renderProfessionalList(qtn.inverterWarranty, "• 5-Year Comprehensive Manufacturer Warranty on GoodWe Hybrid Inverter.")
                )}
              </div>

              {/* Battery Warranty Card */}
              {((!isEditing && qtn.batteryWarranty) || isEditing) && (
                <div className="bg-zinc-50/40 border border-zinc-150 p-4 rounded-xl print:bg-zinc-50/15 print:border-zinc-200 print:p-4 print:rounded-lg shadow-sm print:shadow-none">
                  <span className="text-[10px] print:text-[11.5px] font-black text-emerald-800 uppercase tracking-wider block mb-2 border-b border-emerald-500/10 pb-1.5">Battery Warranty</span>
                  {isEditing ? (
                    <Input
                      placeholder="Optional battery warranty"
                      className="h-8 text-black border bg-zinc-50 focus:bg-white text-xs"
                      value={editBatteryWarranty}
                      onChange={(e) => setEditBatteryWarranty(e.target.value)}
                    />
                  ) : (
                    renderProfessionalList(qtn.batteryWarranty, "")
                  )}
                </div>
              )}

              {/* Panel Warranty Card */}
              <div className="bg-zinc-50/40 border border-zinc-150 p-4 rounded-xl print:bg-zinc-50/15 print:border-zinc-200 print:p-4 print:rounded-lg shadow-sm print:shadow-none">
                <span className="text-[10px] print:text-[11.5px] font-black text-emerald-800 uppercase tracking-wider block mb-2 border-b border-emerald-500/10 pb-1.5">Panel Warranty</span>
                {isEditing ? (
                  <Textarea
                    className="min-h-[50px] text-black border bg-zinc-50 focus:bg-white text-xs"
                    value={editPanelWarranty}
                    onChange={(e) => setEditPanelWarranty(e.target.value)}
                  />
                ) : (
                  renderProfessionalList(qtn.panelWarranty, "• 12-Year Premium Manufacturer Product Warranty\n• 25-Year Linear Power Output Performance Guarantee")
                )}
              </div>

            </div>
          </div>

          {/* Terms Block */}
          <div className="border-t border-zinc-100 pt-6 print:pt-8 grid grid-cols-1 md:grid-cols-2 print:grid-cols-2 gap-6">
            
            {/* Validity Period Card */}
            <div className="bg-zinc-50/40 border border-zinc-150 p-4 rounded-xl print:bg-zinc-50/15 print:border-zinc-200 print:p-4 print:rounded-lg shadow-sm print:shadow-none">
              <h3 className="text-[11px] print:text-[12px] font-black text-emerald-800 uppercase tracking-widest flex items-center gap-1.5 mb-2 border-b border-emerald-500/10 pb-1.5">
                <CalendarRange className="h-3.5 w-3.5 text-emerald-650 print:text-emerald-800 shrink-0" />
                Validity Period
              </h3>
              {isEditing ? (
                <Input
                  className="h-8 text-black border bg-zinc-50 focus:bg-white text-xs"
                  value={editValidityPeriod}
                  onChange={(e) => setEditValidityPeriod(e.target.value)}
                />
              ) : (
                renderProfessionalList(qtn.validityPeriod, "• This quotation is valid for 7 calendar days from the date of issue due to solar market price and exchange rate fluctuations.")
              )}
            </div>

            {/* Payment Terms Card */}
            <div className="bg-zinc-50/40 border border-zinc-150 p-4 rounded-xl print:bg-zinc-50/15 print:border-zinc-200 print:p-4 print:rounded-lg shadow-sm print:shadow-none">
              <h3 className="text-[11px] print:text-[12px] font-black text-emerald-800 uppercase tracking-widest flex items-center gap-1.5 mb-2 border-b border-emerald-500/10 pb-1.5">
                <Scale className="h-3.5 w-3.5 text-emerald-650 print:text-emerald-800 shrink-0" />
                Payment Terms & Conditions
              </h3>
              {isEditing ? (
                <Textarea
                  className="min-h-[50px] text-black border bg-zinc-50 focus:bg-white text-xs"
                  value={editPaymentTerm}
                  onChange={(e) => setEditPaymentTerm(e.target.value)}
                />
              ) : (
                renderProfessionalList(qtn.paymentTerm, "• Project mobilization and equipment booking will be initiated upon receipt of the invoice amount / agreed installment payment.")
              )}
            </div>

          </div>

          {/* Bank Details Block */}
          <div className="border-t border-zinc-100 pt-6 print:pt-8 space-y-3">
            <h3 className="text-[11px] print:text-xs font-black text-zinc-400 print:text-emerald-800 uppercase tracking-widest flex items-center gap-1.5 print:border-b print:border-emerald-100 print:pb-1.5 print:mb-2">
              <Landmark className="h-3.5 w-3.5 text-zinc-500 print:text-emerald-800 shrink-0 print:h-4 print:w-4" />
              DIRECT DEPOSIT / EFT INSTRUCTIONS
            </h3>
            {isEditing ? (
              <div className="grid grid-cols-2 md:grid-cols-4 print:grid-cols-4 gap-3 bg-zinc-50 p-3 rounded-lg border">
                <div>
                  <label className="text-[9px] font-bold text-zinc-500 uppercase block mb-0.5">Account Name</label>
                  <Input
                    className="h-7 text-black border bg-white text-xs py-0"
                    value={editAccName}
                    onChange={(e) => setEditAccName(e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-[9px] font-bold text-zinc-500 uppercase block mb-0.5">Bank Name</label>
                  <Input
                    className="h-7 text-black border bg-white text-xs py-0"
                    value={editBank}
                    onChange={(e) => setEditBank(e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-[9px] font-bold text-zinc-500 uppercase block mb-0.5">Branch</label>
                  <Input
                    className="h-7 text-black border bg-white text-xs py-0"
                    value={editBranch}
                    onChange={(e) => setEditBranch(e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-[9px] font-bold text-zinc-500 uppercase block mb-0.5">Account No</label>
                  <Input
                    className="h-7 text-black border bg-white text-xs py-0"
                    value={editAccNo}
                    onChange={(e) => setEditAccNo(e.target.value)}
                  />
                </div>
              </div>
            ) : (
              <div className="relative overflow-hidden border border-emerald-100 bg-emerald-50/10 p-5 rounded-xl print:p-5 shadow-sm space-y-4">
                <div className="grid grid-cols-2 md:grid-cols-4 print:grid-cols-4 gap-y-3 text-xs">
                  <div>
                    <span className="text-[9px] print:text-[10px] font-black text-emerald-800 uppercase block tracking-wider mb-0.5">Account Name</span>
                    <span className="font-semibold print:font-bold text-zinc-800 print:text-black print:text-sm">{qtn.bankDetails?.accountName || "Alta Vision (Pvt) Ltd"}</span>
                  </div>
                  <div>
                    <span className="text-[9px] print:text-[10px] font-black text-emerald-800 uppercase block tracking-wider mb-0.5">Bank Name</span>
                    <span className="font-semibold print:font-bold text-zinc-800 print:text-black print:text-sm">{qtn.bankDetails?.bank || "NTB"}</span>
                  </div>
                  <div>
                    <span className="text-[9px] print:text-[10px] font-black text-emerald-800 uppercase block tracking-wider mb-0.5">Branch</span>
                    <span className="font-semibold print:font-bold text-zinc-800 print:text-black print:text-sm">{qtn.bankDetails?.branch || "Tangalle"}</span>
                  </div>
                  <div>
                    <span className="text-[9px] print:text-[10px] font-black text-emerald-800 uppercase block tracking-wider mb-0.5">Account Number</span>
                    <span className="font-mono font-bold print:font-extrabold text-zinc-950 print:text-black print:text-sm">{qtn.bankDetails?.accountNo || "1008 9000 8235"}</span>
                  </div>
                </div>
                <div className="text-[10px] print:text-[11px] text-emerald-800/80 font-medium flex items-center gap-1.5 border-t border-emerald-500/10 pt-3">
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                  <span>Please email your deposit slip or transfer confirmation to <strong className="font-semibold">info@altavision.lk</strong> referencing the Quotation Number.</span>
                </div>
              </div>
            )}
          </div>

          {/* Print-Optimized Footer Container */}
          <div className="mt-auto pt-6 print:pt-4 space-y-4 print:space-y-2 pb-2 print:pb-0">
            {/* Logo Banner Footer */}
            <div className="border-t border-emerald-500/20 pt-6 print:pt-3 flex items-center justify-between gap-6">
              {/* Left: Pearl Cluster QR */}
              <div className="flex items-center shrink-0">
                <img src="/PC%20logo%20and%20QR.png" alt="Pearl Cluster" className="h-10 print:h-12 object-contain" />
              </div>
              
              {/* Center: Brand Family */}
              <div className="flex items-center justify-center flex-grow">
                <img src="/all%20logos.png" alt="Alta Vision Brand Family" className="h-13 print:h-15 object-contain" />
              </div>
              
              {/* Right: Certificates */}
              <div className="flex items-center justify-end shrink-0">
                <img src="/Certificates.png" alt="Certificates" className="h-10 print:h-12 object-contain" />
              </div>
            </div>

            {/* Auto-generated notice */}
            <div className="pt-4 print:pt-2 border-t border-zinc-100 text-center space-y-0.5">
              <p className="text-[10px] print:text-[11px] text-zinc-400 print:text-zinc-500 italic">
                This is a computer-generated quotation. No signature is required.
              </p>
              <p className="text-[10px] print:text-[11px] text-zinc-400 print:text-zinc-500">
                Ref: <span className="font-mono font-semibold">{qtn.qtnNo}</span>
                {" "}&#8212;{" "}
                Alta Vision (Pvt) Ltd &#8212; Generated on{" "}
                {new Date(qtn.confirmedAt || qtn.date).toLocaleDateString("en-GB", {
                  day: "2-digit",
                  month: "long",
                  year: "numeric",
                })}{" at "}
                {new Date(qtn.confirmedAt || qtn.date).toLocaleTimeString("en-GB", {
                  hour: "2-digit",
                  minute: "2-digit",
                  hour12: true,
                })}
              </p>
            </div>
          </div>

        </CardContent>
      </Card>
    </div>
  );
}
