"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { doc, getDoc, updateDoc, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/auth-context";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  ArrowLeft, FileText, CheckCircle2,
  ExternalLink, User, Wrench, Wallet, PlayCircle, Loader2, Info, Lock, AlertCircle
} from "lucide-react";
import Link from "next/link";
import type { QuotationStatus, UserRole } from "@/types";

const STATUS_CONFIG: Record<QuotationStatus, { label: string; color: string; badge: "default" | "secondary" | "destructive" | "outline" }> = {
  pending_payment: { label: "Pending payment", color: "text-amber-500 bg-amber-500/10 border-amber-500/30", badge: "outline" },
  partial_payment: { label: "Partial payment", color: "text-blue-500 bg-blue-500/10 border-blue-500/30", badge: "secondary" },
  fully_paid: { label: "Fully paid", color: "text-emerald-500 bg-emerald-500/10 border-emerald-500/30", badge: "default" },
  scheduled: { label: "Scheduled", color: "text-purple-500 bg-purple-500/10 border-purple-500/30", badge: "default" },
  installed: { label: "Installed", color: "text-cyan-500 bg-cyan-500/10 border-cyan-500/30", badge: "default" },
  commissioned: { label: "Commissioned", color: "text-primary bg-primary/10 border-primary/30", badge: "default" },
};

export default function ManageOrderPage() {
  const { id } = useParams() as { id: string };
  const { user } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [qtn, setQtn] = useState<any>(null);
  const [userRole, setUserRole] = useState<UserRole | null>(null);

  // Form states
  const [projectNumber, setProjectNumber] = useState("");
  const [fixedDate, setFixedDate] = useState("");
  const [paidDate, setPaidDate] = useState("");
  const [commissionedDate, setCommissionedDate] = useState("");
  const [paymentStatus, setPaymentStatus] = useState<QuotationStatus>("pending_payment");
  const [notes, setNotes] = useState("");

  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");

  // Only superadmin and payment_approver can modify payment status
  const canApprovePayments = userRole === "superadmin" || userRole === "payment_approver";

  useEffect(() => {
    async function loadQuotation() {
      try {
        // Load user role
        if (user?.uid) {
          const userSnap = await getDoc(doc(db, "users", user.uid));
          if (userSnap.exists()) {
            setUserRole(userSnap.data()?.role);
          }
        }

        // Load quotation
        const docSnap = await getDoc(doc(db, "quotations", id));
        if (docSnap.exists()) {
          const data = docSnap.data();
          setQtn(data);
          setProjectNumber(data.projectNumber || "");
          setFixedDate(data.fixedDate || "");
          setPaidDate(data.paidDate || "");
          setCommissionedDate(data.commissionedDate || "");
          setPaymentStatus(data.paymentStatus || "pending_payment");
          setNotes(data.notes || "");
        } else {
          toast({
            title: "Order not found",
            description: "Could not resolve order/quotation details.",
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
  }, [id, toast, user?.uid]);

  const handleAutoSave = async (updates: Record<string, any>) => {
    if (!user) return;
    setSaveStatus("saving");
    try {
      // CRITICAL: Handle payment status updates through secure API
      if (updates.paymentStatus !== undefined) {
        if (!canApprovePayments) {
          toast({
            title: "Permission Denied",
            description: "Only superadmin and payment_approver can modify payment status.",
            variant: "destructive",
          });
          setSaveStatus("error");
          return;
        }

        const token = await (user as any).getIdToken?.();
        const response = await fetch("/api/payments/update-status", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${token}`,
          },
          body: JSON.stringify({
            quotationId: id,
            paymentStatus: updates.paymentStatus,
            paidDate: paidDate,
          }),
        });

        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.error || "Failed to update payment status");
        }

        setPaymentStatus(updates.paymentStatus);
      }

      // Handle non-payment updates directly
      const nonPaymentUpdates: Record<string, any> = {};
      if (updates.projectNumber !== undefined) {
        nonPaymentUpdates.projectNumber = updates.projectNumber;
        setProjectNumber(updates.projectNumber);
      }
      if (updates.fixedDate !== undefined) {
        nonPaymentUpdates.fixedDate = updates.fixedDate;
        setFixedDate(updates.fixedDate);
      }
      if (updates.paidDate !== undefined) {
        nonPaymentUpdates.paidDate = updates.paidDate;
        setPaidDate(updates.paidDate);
      }
      if (updates.commissionedDate !== undefined) {
        nonPaymentUpdates.commissionedDate = updates.commissionedDate;
        setCommissionedDate(updates.commissionedDate);
      }
      if (updates.notes !== undefined) {
        nonPaymentUpdates.notes = updates.notes;
        setNotes(updates.notes);
      }

      if (Object.keys(nonPaymentUpdates).length > 0) {
        await updateDoc(doc(db, "quotations", id), {
          ...nonPaymentUpdates,
          updatedAt: serverTimestamp(),
        });
      }

      // Log activity
      const { logActivityClient } = await import("@/lib/audit-logger-client");
      await logActivityClient(user, "ORDER_UPDATE", {
        quotationId: id,
        qtnNo: qtn.qtnNo,
        updates: Object.keys(updates),
      });

      setSaveStatus("saved");
      setTimeout(() => setSaveStatus("idle"), 2500);
    } catch (err: any) {
      setSaveStatus("error");
      toast({
        title: "Auto-save failed",
        description: err.message,
        variant: "destructive",
      });
    }
  };

  if (loading) {
    return (
      <div className="flex h-[80vh] items-center justify-center gap-2 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
        <span className="text-sm">Loading order details...</span>
      </div>
    );
  }

  if (!qtn) {
    return (
      <div className="flex h-[80vh] flex-col items-center justify-center gap-4 text-muted-foreground">
        <p>Order details could not be resolved.</p>
        <Button variant="outline" asChild>
          <Link href="/quotations">Back to Quotations</Link>
        </Button>
      </div>
    );
  }

  const hasGoodWe = qtn.description?.toLowerCase().includes("goodwe") || qtn.inverterWarranty?.toLowerCase().includes("goodwe");

  return (
    <div className="p-6 max-w-4xl mx-auto min-h-screen space-y-6">
      {/* Action Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <Button variant="ghost" className="gap-2" asChild>
          <Link href="/quotations">
            <ArrowLeft className="h-4 w-4" />
            Back to Orders
          </Link>
        </Button>
        <div className="flex items-center gap-3">
          {/* Real-time autosave status indicator */}
          <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 px-3 py-1.5 rounded-lg select-none">
            {saveStatus === "saving" && (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-500" />
                <span className="text-blue-600 font-bold">Saving...</span>
              </>
            )}
            {saveStatus === "saved" && (
              <>
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 animate-bounce" />
                <span className="text-emerald-600 font-bold">Saved!</span>
              </>
            )}
            {saveStatus === "error" && (
              <>
                <span className="text-red-500 font-bold">Auto-save error</span>
              </>
            )}
            {saveStatus === "idle" && (
              <>
                <CheckCircle2 className="h-3.5 w-3.5 text-slate-400" />
                <span className="text-slate-500 dark:text-slate-400 font-bold">Auto-saved</span>
              </>
            )}
          </div>

          <Button variant="outline" className="gap-2 border-emerald-600 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 bg-white dark:bg-slate-900" asChild>
            <Link href={`/quotations/${id}`} target="_blank">
              <FileText className="h-4 w-4" />
              View Invoice / Print A4
            </Link>
          </Button>
        </div>
      </div>

      {/* Main Order Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Customer & Info Card */}
        <Card className="md:col-span-2 border-slate-200 dark:border-slate-800 shadow-sm rounded-2xl overflow-hidden bg-white dark:bg-slate-900">
          <CardHeader className="bg-slate-50 dark:bg-slate-950/30 border-b border-slate-100 dark:border-slate-800 p-6 flex flex-row items-center gap-4">
            <div className="bg-emerald-500/10 p-3 rounded-xl"><User className="h-6 w-6 text-emerald-600" /></div>
            <div>
              <CardTitle className="text-lg font-black text-slate-800 dark:text-slate-100">Customer Details</CardTitle>
              <CardDescription className="text-xs mt-0.5">Order Ref: {qtn.qtnNo}</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="p-6 space-y-5">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1">Customer Name</Label>
                <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">{qtn.customer?.name}</p>
              </div>
              <div>
                <Label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1">Status</Label>
                <Badge className="uppercase text-[10px] tracking-wider mt-0.5">{paymentStatus.replace("_", " ")}</Badge>
              </div>
            </div>

            <div>
              <Label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1">Site Address</Label>
              <p className="text-sm font-semibold text-slate-800 dark:text-slate-200 whitespace-pre-line leading-relaxed">{qtn.customer?.address}</p>
            </div>

            <div className="grid grid-cols-2 gap-4 border-t border-slate-100 dark:border-slate-800 pt-4">
              <div>
                <Label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1">Phone Number</Label>
                <p className="text-sm font-mono font-semibold text-slate-800 dark:text-slate-200">{qtn.customer?.phone}</p>
              </div>
              <div>
                <Label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1">Email Address</Label>
                <p className="text-sm font-mono font-semibold text-slate-800 dark:text-slate-200">{qtn.customer?.email || "—"}</p>
              </div>
            </div>

            {hasGoodWe && (
              <div className="bg-blue-50 dark:bg-blue-950/40 border border-blue-150 dark:border-blue-900/40 rounded-xl p-4 flex items-center justify-between mt-4">
                <div>
                  <h4 className="text-xs font-black text-blue-900 dark:text-blue-200 uppercase tracking-wider">GoodWe Inverter Detected</h4>
                  <p className="text-[11px] text-blue-700 dark:text-blue-300 mt-1">This installation supports GoodWe SEMS+ Cloud Portal tracking.</p>
                </div>
                <Button className="bg-blue-600 hover:bg-blue-700 text-white text-xs gap-1.5 h-9 rounded-lg" asChild>
                  <a href="https://semsplus.goodwe.com/#/login" target="_blank" rel="noreferrer">
                    SEMS+ Portal <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                </Button>
              </div>
            )}

            {/* Optional notes block inside Customer details card */}
            <div className="border-t border-slate-100 dark:border-slate-800 pt-4 space-y-2">
              <Label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1">Special Notes / Technical Remarks</Label>
              <Textarea
                placeholder="Optional notes or custom instructions for this quotation (e.g. key technical remarks, custom modifications)..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                onBlur={(e) => handleAutoSave({ notes: e.target.value })}
                className="rounded-xl border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-xs font-medium"
              />
              <p className="text-[10px] text-slate-400 flex items-center gap-1 font-semibold">
                <Info className="h-3 w-3 text-slate-400 shrink-0" />
                These remarks appear directly on the printed A4 quotation sheet.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Order Tracker / Settings */}
        <Card className="border-slate-200 dark:border-slate-800 shadow-sm rounded-2xl overflow-hidden bg-white dark:bg-slate-900">
          <CardHeader className="bg-slate-50 dark:bg-slate-950/30 border-b border-slate-100 dark:border-slate-800 p-6 flex flex-row items-center gap-4">
            <div className="bg-blue-500/10 p-3 rounded-xl"><Wrench className="h-6 w-6 text-blue-600" /></div>
            <div>
              <CardTitle className="text-lg font-black text-slate-800 dark:text-slate-100">Order Tracker</CardTitle>
              <CardDescription className="text-xs mt-0.5">Project schedule dates</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="p-6 space-y-5">
            {/* Current Status Dropdown - PAYMENT APPROVAL RESTRICTED */}
            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
                Current Status {canApprovePayments && <span className="text-xs bg-emerald-500/20 text-emerald-700 px-1.5 py-0.5 rounded font-bold">Can Approve</span>}
              </Label>
              {canApprovePayments ? (
                <Select
                  value={paymentStatus}
                  onValueChange={(val) => handleAutoSave({ paymentStatus: val as QuotationStatus })}
                >
                  <SelectTrigger className="w-full rounded-xl border-slate-200 focus:ring-blue-500 font-bold text-xs">
                    <SelectValue placeholder="Select Status" />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(STATUS_CONFIG).map(([key, value]) => (
                      <SelectItem key={key} value={key} className="text-xs font-semibold cursor-pointer">
                        {value.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <div className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2.5 flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">{STATUS_CONFIG[paymentStatus]?.label}</span>
                  <Lock className="h-4 w-4 text-amber-600" />
                </div>
              )}
              {!canApprovePayments && (
                <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/50 rounded-lg p-3 flex gap-2">
                  <AlertCircle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                  <p className="text-xs text-amber-700 dark:text-amber-200">
                    Only <span className="font-bold">superadmin</span> and <span className="font-bold">finance manager</span> can modify payment status.
                  </p>
                </div>
              )}
            </div>

            {/* Project Number */}
            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
                Project Number
              </Label>
              <Input
                value={projectNumber}
                onChange={(e) => setProjectNumber(e.target.value)}
                onBlur={(e) => handleAutoSave({ projectNumber: e.target.value })}
                placeholder="e.g. AV-2026-0501"
                className="rounded-xl border-slate-200 focus:ring-blue-500 font-mono font-bold"
              />
            </div>

            {/* When Paid */}
            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
                <Wallet className="h-3.5 w-3.5 text-blue-500" /> Paid Date
              </Label>
              <Input
                type="date"
                value={paidDate}
                onChange={(e) => {
                  setPaidDate(e.target.value);
                  handleAutoSave({ paidDate: e.target.value });
                }}
                className="rounded-xl border-slate-200 focus:ring-blue-500"
              />
            </div>

            {/* When Fixed (Installed) */}
            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
                <Wrench className="h-3.5 w-3.5 text-emerald-600" /> Installed Date
              </Label>
              <Input
                type="date"
                value={fixedDate}
                onChange={(e) => {
                  setFixedDate(e.target.value);
                  handleAutoSave({ fixedDate: e.target.value });
                }}
                className="rounded-xl border-slate-200 focus:ring-blue-500"
              />
            </div>

            {/* When Commissioned */}
            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
                <PlayCircle className="h-3.5 w-3.5 text-purple-600" /> Commissioned Date
              </Label>
              <Input
                type="date"
                value={commissionedDate}
                onChange={(e) => {
                  setCommissionedDate(e.target.value);
                  handleAutoSave({ commissionedDate: e.target.value });
                }}
                className="rounded-xl border-slate-200 focus:ring-blue-500"
              />
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
