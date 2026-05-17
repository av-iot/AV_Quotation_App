"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { doc, getDoc, updateDoc, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/auth-context";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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

  return (
    <div className="p-6 max-w-4xl mx-auto min-h-screen">
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
              <Button className="gap-2 bg-primary hover:bg-primary/95 text-white" onClick={() => window.print()}>
                <Printer className="h-4 w-4" />
                Print / Save PDF
              </Button>
            </>
          )}
        </div>
      </div>

      {/* ── Status Controller & Summary Panel (hidden on print) ── */}
      <Card className="print:hidden mb-8 border border-accent bg-accent/5 backdrop-blur-md shadow-sm">
        <CardContent className="py-4 px-6 flex flex-wrap items-center justify-between gap-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
              <Receipt className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Status Workflow</p>
              <div className="flex items-center gap-2 mt-0.5">
                <Badge variant={STATUS_CONFIG[qtn.paymentStatus as QuotationStatus]?.badge || "outline"} className="capitalize">
                  {STATUS_CONFIG[qtn.paymentStatus as QuotationStatus]?.label || qtn.paymentStatus}
                </Badge>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-muted-foreground mr-1">Update Status:</span>
            {updatingStatus ? (
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            ) : (
              <select
                className="text-xs font-semibold h-8 rounded-md border border-input bg-card px-2.5 py-1 focus:ring-1 focus:ring-primary shadow-sm outline-none cursor-pointer"
                value={qtn.paymentStatus}
                onChange={(e) => handleUpdateStatus(e.target.value as QuotationStatus)}
              >
                {Object.entries(STATUS_CONFIG).map(([key, value]) => (
                  <option key={key} value={key} className="font-sans font-medium text-foreground">
                    {value.label}
                  </option>
                ))}
              </select>
            )}
          </div>
        </CardContent>
      </Card>

      {/* ── High-Fidelity Printable A4 Quotation Card ── */}
      <Card className="bg-white text-black border shadow-lg print:shadow-none print:border-none rounded-xl print:rounded-none overflow-hidden duration-300 font-sans relative">
        <CardContent className="p-8 sm:p-12 print:p-0 space-y-8 select-text">
          
          {/* Header Block */}
          <div className="flex flex-row justify-between items-start border-b border-zinc-200 pb-6">
            <div className="space-y-1">
              <h1 className="text-3xl font-extrabold tracking-tight text-emerald-800 uppercase print:text-emerald-800">Alta Vision</h1>
              <p className="text-xs font-bold text-zinc-500 tracking-wider uppercase">Solar PV Energy Systems</p>
              <p className="text-[10px] text-zinc-400">Alta Vision (Pvt) Ltd | info@altavision.lk</p>
            </div>
            <div className="text-right space-y-1">
              <h2 className="text-2xl font-black text-zinc-800 tracking-tight uppercase">Quotation</h2>
              <div className="flex flex-row justify-end items-center gap-1 text-sm">
                <span className="font-bold text-zinc-500">No:</span>
                {isEditing ? (
                  <Input
                    className="h-7 w-28 text-right font-mono font-bold text-black border bg-zinc-50 focus:bg-white text-xs py-0"
                    value={editQtnNo}
                    onChange={(e) => setEditQtnNo(e.target.value)}
                  />
                ) : (
                  <span className="font-mono font-extrabold text-zinc-950">{qtn.qtnNo}</span>
                )}
              </div>
              <div className="flex flex-row justify-end items-center gap-1 text-xs">
                <span className="font-semibold text-zinc-500">Date:</span>
                {isEditing ? (
                  <Input
                    type="date"
                    className="h-7 w-32 text-right text-black border bg-zinc-50 focus:bg-white text-xs py-0"
                    value={editDate}
                    onChange={(e) => setEditDate(e.target.value)}
                  />
                ) : (
                  <span className="font-medium text-zinc-800">
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
          <div className="grid grid-cols-12 gap-1 border-b border-zinc-100 pb-6">
            <div className="col-span-2 text-xs font-bold text-zinc-500 uppercase self-start pt-1">Bill To</div>
            <div className="col-span-1 text-xs font-bold text-zinc-500 self-start pt-1">:</div>
            <div className="col-span-9 space-y-1.5">
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
                  <p className="font-bold text-sm text-zinc-900 leading-tight">{qtn.customer?.name}</p>
                  <p className="text-xs text-zinc-600 whitespace-pre-line leading-relaxed max-w-md">{qtn.customer?.address}</p>
                  <p className="text-xs text-zinc-500">Contact: {qtn.customer?.phone} {qtn.customer?.phone2 ? `/ ${qtn.customer.phone2}` : ""}</p>
                </>
              )}
            </div>
          </div>

          {/* Description & Pricing Table */}
          <div className="space-y-3">
            {/* Header row */}
            <div className="grid grid-cols-12 border-b-2 border-zinc-950 pb-2 text-[10px] font-black text-zinc-600 tracking-wider uppercase">
              <div className="col-span-9">Description</div>
              <div className="col-span-3 text-right">Amount (LKR)</div>
            </div>

            {/* Content row */}
            <div className="grid grid-cols-12 items-start py-4 text-xs min-h-[80px]">
              <div className="col-span-9 pr-6 leading-relaxed text-zinc-800 whitespace-pre-wrap">
                {isEditing ? (
                  <Textarea
                    className="min-h-[80px] text-black border bg-zinc-50 focus:bg-white text-xs font-sans"
                    value={editDescription}
                    onChange={(e) => setEditDescription(e.target.value)}
                  />
                ) : (
                  qtn.description || qtn.items?.map((i: any) => i.description).join(", ")
                )}
              </div>
              <div className="col-span-3 text-right font-mono font-bold text-zinc-950 self-start pt-1">
                {isEditing ? (
                  <Input
                    type="number"
                    className="h-8 text-right font-mono text-black border bg-zinc-50 focus:bg-white text-xs"
                    value={editTotal}
                    onChange={(e) => setEditTotal(e.target.value)}
                  />
                ) : (
                  formatCurrency(qtn.total)
                )}
              </div>
            </div>

            {/* Total Amount row */}
            <div className="grid grid-cols-12 border-t border-zinc-200 pt-3 text-sm">
              <div className="col-span-9 text-xs font-bold text-zinc-500 uppercase self-center">Total Amount</div>
              <div className="col-span-3 text-right font-mono font-extrabold text-base text-emerald-800 print:text-emerald-800 border-b-4 double border-double border-emerald-800 pb-1">
                {isEditing ? (
                  <span>LKR {Number(editTotal).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                ) : (
                  <span>LKR {formatCurrency(qtn.total)}</span>
                )}
              </div>
            </div>
          </div>

          {/* Warranties Block */}
          <div className="border-t border-zinc-100 pt-6 space-y-4">
            <h3 className="text-[11px] font-black text-zinc-400 uppercase tracking-widest flex items-center gap-1.5">
              <ShieldCheck className="h-3.5 w-3.5 text-zinc-500 print:text-zinc-500 shrink-0" />
              Warranty Clauses
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              
              {/* Inverter Warranty */}
              <div className="space-y-1">
                <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider block">Inverter Warranty</span>
                {isEditing ? (
                  <Input
                    className="h-8 text-black border bg-zinc-50 focus:bg-white text-xs"
                    value={editInverterWarranty}
                    onChange={(e) => setEditInverterWarranty(e.target.value)}
                  />
                ) : (
                  <p className="text-xs text-zinc-800 font-medium whitespace-pre-wrap leading-relaxed">{qtn.inverterWarranty || "• 5 years Warranty"}</p>
                )}
              </div>

              {/* Battery Warranty */}
              {((!isEditing && qtn.batteryWarranty) || isEditing) && (
                <div className="space-y-1">
                  <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider block">Battery Warranty</span>
                  {isEditing ? (
                    <Input
                      placeholder="Optional battery warranty"
                      className="h-8 text-black border bg-zinc-50 focus:bg-white text-xs"
                      value={editBatteryWarranty}
                      onChange={(e) => setEditBatteryWarranty(e.target.value)}
                    />
                  ) : (
                    <p className="text-xs text-zinc-800 font-medium whitespace-pre-wrap leading-relaxed">{qtn.batteryWarranty}</p>
                  )}
                </div>
              )}

              {/* Panel Warranty */}
              <div className="space-y-1">
                <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider block">Panel Warranty</span>
                {isEditing ? (
                  <Textarea
                    className="min-h-[50px] text-black border bg-zinc-50 focus:bg-white text-xs"
                    value={editPanelWarranty}
                    onChange={(e) => setEditPanelWarranty(e.target.value)}
                  />
                ) : (
                  <p className="text-xs text-zinc-800 font-medium whitespace-pre-line leading-relaxed">{qtn.panelWarranty || "• 12 years Product Warranty\n• 25 Years Performance Warranty"}</p>
                )}
              </div>

            </div>
          </div>

          {/* Terms Block */}
          <div className="border-t border-zinc-100 pt-6 grid grid-cols-1 md:grid-cols-2 gap-6">
            
            {/* Validity Period */}
            <div className="space-y-1">
              <h3 className="text-[11px] font-black text-zinc-400 uppercase tracking-widest flex items-center gap-1.5 mb-1">
                <CalendarRange className="h-3.5 w-3.5 text-zinc-500 print:text-zinc-500 shrink-0" />
                Validity Period
              </h3>
              {isEditing ? (
                <Input
                  className="h-8 text-black border bg-zinc-50 focus:bg-white text-xs"
                  value={editValidityPeriod}
                  onChange={(e) => setEditValidityPeriod(e.target.value)}
                />
              ) : (
                <p className="text-xs text-zinc-800 font-medium leading-relaxed whitespace-pre-wrap">{qtn.validityPeriod || "• Quotation Valid for 1 week."}</p>
              )}
            </div>

            {/* Payment Term */}
            <div className="space-y-1">
              <h3 className="text-[11px] font-black text-zinc-400 uppercase tracking-widest flex items-center gap-1.5 mb-1">
                <Scale className="h-3.5 w-3.5 text-zinc-500 print:text-zinc-500 shrink-0" />
                Payment Terms
              </h3>
              {isEditing ? (
                <Textarea
                  className="min-h-[50px] text-black border bg-zinc-50 focus:bg-white text-xs"
                  value={editPaymentTerm}
                  onChange={(e) => setEditPaymentTerm(e.target.value)}
                />
              ) : (
                <p className="text-xs text-zinc-800 font-medium leading-relaxed whitespace-pre-wrap">{qtn.paymentTerm || "• The job will be confirmed upon receipt of full payment."}</p>
              )}
            </div>

          </div>

          {/* Bank Details Block */}
          <div className="border-t border-zinc-100 pt-6 space-y-3">
            <h3 className="text-[11px] font-black text-zinc-400 uppercase tracking-widest flex items-center gap-1.5">
              <Landmark className="h-3.5 w-3.5 text-zinc-500 print:text-zinc-500 shrink-0" />
              Bank Details for Payments
            </h3>
            {isEditing ? (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 bg-zinc-50 p-3 rounded-lg border">
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
              <div className="grid grid-cols-2 md:grid-cols-4 gap-y-2 text-xs border border-zinc-100 bg-zinc-50/50 p-4 rounded-xl">
                <div>
                  <span className="text-[9px] font-bold text-zinc-400 uppercase block tracking-wider">Account Name</span>
                  <span className="font-semibold text-zinc-800">{qtn.bankDetails?.accountName || "Alta Vision (Pvt) Ltd"}</span>
                </div>
                <div>
                  <span className="text-[9px] font-bold text-zinc-400 uppercase block tracking-wider">Bank</span>
                  <span className="font-semibold text-zinc-800">{qtn.bankDetails?.bank || "NTB"}</span>
                </div>
                <div>
                  <span className="text-[9px] font-bold text-zinc-400 uppercase block tracking-wider">Branch</span>
                  <span className="font-semibold text-zinc-800">{qtn.bankDetails?.branch || "Tangalle"}</span>
                </div>
                <div>
                  <span className="text-[9px] font-bold text-zinc-400 uppercase block tracking-wider">Account No</span>
                  <span className="font-mono font-bold text-zinc-950">{qtn.bankDetails?.accountNo || "1008 9000 8235"}</span>
                </div>
              </div>
            )}
          </div>

          {/* Signature field at bottom */}
          <div className="pt-12 flex justify-between items-end">
            <div className="text-[10px] text-zinc-400 italic">
              * This is an official digital quotation compiled by Alta Vision.
            </div>
            <div className="text-right space-y-1">
              <div className="w-48 border-b border-zinc-900 mx-auto"></div>
              <p className="text-xs font-bold text-zinc-800 pt-1 tracking-tight text-center">Authorized Signature</p>
            </div>
          </div>

        </CardContent>
      </Card>
    </div>
  );
}
