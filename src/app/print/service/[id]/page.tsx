"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { doc, getDoc, updateDoc, collection, query, where, onSnapshot, serverTimestamp, addDoc, getDocs, orderBy, limit } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Printer, ArrowLeft, Receipt, CheckCircle2, Send, Link2, Check, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import Image from "next/image";

const fmtRs = (n: number) => "Rs. " + Math.round(n).toLocaleString("en-US");
const fmtDate = (s: string) => { try { return new Date(s).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }); } catch { return s; } };

export default function ServiceInvoicePrintPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const { toast } = useToast();

  const [invoice,  setInvoice]  = useState<any>(null);
  const [receipts, setReceipts] = useState<any[]>([]);
  const [loading,  setLoading]  = useState(true);

  // Payment form
  const [showPayment, setShowPayment] = useState(false);
  const [payAmount,   setPayAmount]   = useState("");
  const [payDate,     setPayDate]     = useState(new Date().toISOString().split("T")[0]);
  const [payMethod,   setPayMethod]   = useState("cash");
  const [payRef,      setPayRef]      = useState("");
  const [savingPay,   setSavingPay]   = useState(false);

  // Share dropdown
  const [shareOpen,  setShareOpen]  = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);

  useEffect(() => {
    if (!id) return;

    // One-time load for the invoice doc
    getDoc(doc(db, "serviceInvoices", id)).then(snap => {
      if (snap.exists()) setInvoice({ id: snap.id, ...snap.data() });
      setLoading(false);
    });

    // Real-time receipts — document transforms invoice→receipt live
    const unsub = onSnapshot(
      query(collection(db, "receipts"), where("serviceInvoiceId", "==", id)),
      snap => setReceipts(snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a: any, b: any) => (a.date > b.date ? 1 : -1)))
    );
    return () => unsub();
  }, [id]);

  const totalPaid = receipts.reduce((s: number, r: any) => s + (r.amount || 0), 0);
  const balance   = (invoice?.total || 0) - totalPaid;
  const isFullyPaid = balance === 0 && invoice?.total > 0;
  const isOverpaid  = balance < 0;
  const isFree     = invoice?.total === 0;

  async function handleLogPayment() {
    let amount = parseFloat(payAmount);
    if (isNaN(amount) || amount === 0) { toast({ title: "Enter a valid amount", variant: "destructive" }); return; }
    
    if (isOverpaid && amount > 0) {
      amount = -amount;
    }
    
    setSavingPay(true);
    try {
      // Sequential SREC- logic
      const recQuery = query(
        collection(db, "receipts"),
        where("receiptNo", ">=", "SREC-10000000"),
        where("receiptNo", "<=", "SREC-99999999"),
        orderBy("receiptNo", "desc"),
        limit(1)
      );
      const recSnap = await getDocs(recQuery);
      let nextNo = 10000001;
      if (!recSnap.empty) {
        const lastNoStr = recSnap.docs[0].data().receiptNo.replace("SREC-", "");
        const parsed = parseInt(lastNoStr, 10);
        if (!isNaN(parsed)) {
          nextNo = parsed + 1;
        }
      }
      const receiptNo = `SREC-${nextNo}`;
      await addDoc(collection(db, "receipts"), {
        receiptNo,
        serviceInvoiceId: id,
        serviceId:  invoice.serviceId,
        serviceNo:  invoice.serviceNo,
        projectNo:  invoice.projectNo,
        customer:   invoice.customer,
        amount,
        date:          payDate,
        paymentMethod: payMethod,
        referenceNo:   payRef,
        createdBy:     user?.uid || "",
        createdAt:     serverTimestamp(),
      });

      // Automatically mark service as completed if fully paid
      const newTotalPaid = totalPaid + amount;
      const newBalance = (invoice?.total || 0) - newTotalPaid;
      if (newBalance <= 0 && invoice.serviceId) {
        const { updateDoc } = await import("firebase/firestore");
        await updateDoc(doc(db, "services", invoice.serviceId), {
          status: "invoice_generated",
          paidAt: new Date().toISOString(),
          updatedAt: serverTimestamp(),
        });
      }

      toast({ title: `Receipt ${receiptNo} recorded` });
      setPayAmount(""); setPayRef(""); setShowPayment(false);
      // onSnapshot listener handles the receipts refresh automatically
    } catch (err: any) {
      toast({ title: "Failed to record payment", description: err.message, variant: "destructive" });
    } finally { setSavingPay(false); }
  }

  const handlePrint = async () => {
    let version = 1;
    try {
      const printSnap = await getDocs(
        query(collection(db, "pdf_prints"), where("serviceInvoiceId", "==", id))
      );
      version = printSnap.size + 1;

      await addDoc(collection(db, "pdf_prints"), {
        serviceInvoiceId: id,
        invoiceNo: invoice.invoiceNo,
        docType: (isFullyPaid || isFree) ? "service_receipt" : "service_invoice",
        version,
        printedBy: user?.uid || "dev_user",
        printedByEmail: user?.email || "dev@altavision.lk",
        printedByName: user?.displayName || "Dev User",
        timestamp: serverTimestamp(),
      });

      const { logActivityClient } = await import("@/lib/audit-logger-client");
      await logActivityClient(user, "SERVICE_INVOICE_PRINT", {
        serviceInvoiceId: id,
        invoiceNo: invoice.invoiceNo,
        customerName: invoice.customer?.name,
        docType: (isFullyPaid || isFree) ? "service_receipt" : "service_invoice",
        version,
      });
    } catch (e) {
      console.error("PDF print log failed:", e);
    }

    const prev = document.title;
    const cleanNo = invoice.invoiceNo.replace(/[\/\\?%*:|"<>\s]/g, "_");
    const baseName = (isFullyPaid || isFree) ? `${cleanNo}_RECEIPT` : `${cleanNo}_INVOICE`;
    document.title = `${baseName}_v${version}`;

    window.print();

    setTimeout(() => {
      document.title = prev;
    }, 1000);
  };

  if (loading) return <div className="flex h-screen items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  if (!invoice) return <div className="flex h-screen items-center justify-center"><p className="text-muted-foreground">Invoice not found.</p></div>;

  const docTitle  = isFullyPaid || isFree ? "SERVICE RECEIPT" : "SERVICE QUOTATION";
  const docNo     = invoice.invoiceNo;
  const custPhone = invoice.customer?.phone?.replace(/\D/g, "") || "";

  const waText = isFullyPaid
    ? `Dear ${invoice.customer?.name || "Customer"},\n\nThank you for your payment!\n\nService receipt ${docNo} has been issued.\nProject: #${invoice.projectNo}\nService: ${invoice.serviceType || ""}\nTotal Paid: ${fmtRs(totalPaid)}\n\nView receipt: ${typeof window !== "undefined" ? window.location.href : ""}\n\nAlta Vision (Pvt) Ltd\ninfo@altavision.lk`
    : `Dear ${invoice.customer?.name || "Customer"},\n\nPlease find your service quotation below.\n\nQuotation: ${docNo}\nProject: #${invoice.projectNo}\nService: ${invoice.serviceType || ""}\nTotal: ${fmtRs(invoice.total || 0)}\nBalance Due: ${fmtRs(balance)}\n\nView quotation: ${typeof window !== "undefined" ? window.location.href : ""}\n\nAlta Vision (Pvt) Ltd\ninfo@altavision.lk`;

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-zinc-950 print:bg-white">

      {/* ── Toolbar ── */}
      <div className="print:hidden sticky top-0 z-10 bg-white dark:bg-zinc-900 border-b border-border px-4 md:px-6 py-3 flex items-center gap-2 md:gap-3">
        <Button variant="ghost" size="icon" onClick={() => router.back()} className="shrink-0">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold truncate">{docNo}</p>
          <p className="text-xs text-muted-foreground truncate">{invoice.customer?.name} · #{invoice.projectNo}</p>
        </div>

        {/* Payment status chip */}
        <div className={`hidden sm:flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-full border shrink-0 ${
          isFree ? "bg-emerald-50 text-emerald-700 border-emerald-200"
          : isFullyPaid ? "bg-emerald-50 text-emerald-700 border-emerald-200"
          : isOverpaid ? "bg-red-50 text-red-700 border-red-200"
          : balance > 0 ? "bg-amber-50 text-amber-700 border-amber-200"
          : "bg-slate-50 text-slate-600 border-slate-200"
        }`}>
          <span className="h-1.5 w-1.5 rounded-full bg-current" />
          {isFree ? "Free" : isFullyPaid ? "Paid" : isOverpaid ? `Refund Due ${fmtRs(Math.abs(balance))}` : `Due ${fmtRs(balance)}`}
        </div>

        {/* Log Payment */}
        {(!isFullyPaid && !isFree) && (
          <Button variant="outline" size="sm" className="gap-1.5 shrink-0 text-xs"
            onClick={() => setShowPayment(v => !v)}>
            <Receipt className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">{isOverpaid ? "Log Refund" : "Log Payment"}</span>
          </Button>
        )}

        {/* Send / Share */}
        <div className="relative shrink-0">
          {shareOpen && <div className="fixed inset-0 z-40" onClick={() => setShareOpen(false)} />}
          <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={() => setShareOpen(v => !v)}>
            <Send className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">{linkCopied ? "Copied!" : "Send"}</span>
          </Button>
          {shareOpen && (
            <div className="absolute top-full mt-2 right-0 bg-background border border-border rounded-xl shadow-xl p-1.5 z-50 min-w-[175px] animate-in fade-in slide-in-from-top-2 duration-150">
              {custPhone && (
                <a
                  href={`https://wa.me/94${custPhone.slice(-9)}?text=${encodeURIComponent(waText)}`}
                  target="_blank" rel="noreferrer"
                  onClick={() => setShareOpen(false)}
                  className="flex items-center gap-2.5 px-3 py-2 text-sm font-semibold hover:bg-emerald-50 hover:text-emerald-700 dark:hover:bg-emerald-950/30 rounded-lg transition-colors w-full">
                  <svg className="h-4 w-4 text-emerald-500 shrink-0" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                  </svg>
                  WhatsApp
                </a>
              )}
              {!custPhone && (
                <div className="px-3 py-2 text-xs text-muted-foreground">No phone on record</div>
              )}
              <a
                href={`mailto:${invoice.customer?.email || ""}?subject=${encodeURIComponent(`${docTitle} – ${docNo} – Alta Vision`)}&body=${encodeURIComponent(waText)}`}
                onClick={() => setShareOpen(false)}
                className="flex items-center gap-2.5 px-3 py-2 text-sm font-semibold hover:bg-blue-50 hover:text-blue-700 dark:hover:bg-blue-950/30 rounded-lg transition-colors w-full">
                <svg className="h-4 w-4 text-blue-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
                Email
              </a>
              <div className="border-t border-border/60 my-1" />
              <button
                onClick={() => {
                  navigator.clipboard.writeText(window.location.href).then(() => {
                    setLinkCopied(true); setShareOpen(false);
                    setTimeout(() => setLinkCopied(false), 2500);
                  });
                }}
                className="flex items-center gap-2.5 px-3 py-2 text-sm font-semibold hover:bg-muted rounded-lg transition-colors w-full">
                {linkCopied ? <Check className="h-4 w-4 text-emerald-500 shrink-0" /> : <Link2 className="h-4 w-4 text-slate-500 shrink-0" />}
                {linkCopied ? "Copied!" : "Copy Link"}
              </button>
            </div>
          )}
        </div>

        <Button size="sm" className="gap-1.5 shrink-0 text-xs" onClick={handlePrint}>
          <Printer className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Save / Print</span>
        </Button>
      </div>

      {/* ── Payment Form ── */}
      {showPayment && (
        <div className="print:hidden bg-white dark:bg-zinc-900 border-b border-border shadow-sm px-4 md:px-6 py-4">
          <div className="max-w-3xl mx-auto">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-bold flex items-center gap-2"><Receipt className="h-4 w-4 text-primary" /> {isOverpaid ? "Log Refund" : "Log Payment"}</p>
              <button onClick={() => setShowPayment(false)} className="text-muted-foreground hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="space-y-1">
                <Label className="text-xs font-semibold text-muted-foreground">Amount (Rs.)</Label>
                <Input type="number" value={payAmount} onChange={e => setPayAmount(e.target.value)}
                  placeholder={fmtRs(Math.abs(balance))} className="h-9 text-sm" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-semibold text-muted-foreground">Date</Label>
                <Input type="date" value={payDate} onChange={e => setPayDate(e.target.value)} className="h-9 text-sm" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-semibold text-muted-foreground">Method</Label>
                <select value={payMethod} onChange={e => setPayMethod(e.target.value)}
                  className="h-9 w-full rounded-md border bg-background px-2 text-sm">
                  <option value="cash">Cash</option>
                  <option value="bank_transfer">Bank Transfer</option>
                  <option value="cheque">Cheque</option>
                  <option value="card">Card</option>
                </select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-semibold text-muted-foreground">Reference No.</Label>
                <Input value={payRef} onChange={e => setPayRef(e.target.value)} placeholder="optional" className="h-9 text-sm" />
              </div>
            </div>
            <div className="flex items-center justify-between mt-3">
              <p className="text-xs text-muted-foreground">Balance after: <span className="font-bold">{fmtRs(Math.max(0, balance - (isOverpaid ? -Math.abs(parseFloat(payAmount) || 0) : (parseFloat(payAmount) || 0))))}</span></p>
              <div className="flex gap-2">
                <Button size="sm" variant="ghost" onClick={() => setShowPayment(false)}>Cancel</Button>
                <Button size="sm" onClick={handleLogPayment} disabled={savingPay} className={`gap-1.5 ${isOverpaid ? "bg-red-600 hover:bg-red-700 text-white" : ""}`}>
                  {savingPay ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                  {isOverpaid ? "Record Refund" : "Record Payment"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Document ── */}
      <div className="w-[210mm] min-h-[297mm] mx-auto bg-white text-slate-900 shadow-md print:shadow-none p-12 my-8 print:my-0 flex flex-col gap-5 relative">

        {/* PAID stamp — shown when fully paid */}
        {(isFullyPaid || isFree) && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10 print:z-10" style={{ top: "38%" }}>
            <div className="border-[5px] border-emerald-500/30 rounded-xl px-8 py-3 rotate-[-18deg] select-none">
              <p className="text-5xl font-black text-emerald-500/25 tracking-[0.25em]">{isFree ? "FREE" : "PAID"}</p>
            </div>
          </div>
        )}

        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <Image src="/logo.png" alt="Alta Vision" width={150} height={24} className="object-contain mb-3" />
            <p className="text-[11px] text-slate-500">Alta Vision (Pvt) Ltd</p>
            <p className="text-[11px] text-slate-500">298A, Borella Road, Habarakada,</p>
            <p className="text-[11px] text-slate-500">Homagama, Sri Lanka</p>
            <p className="text-[11px] text-slate-500 mt-0.5">✉️ info@altavision.lk</p>
          </div>
          <div className="text-right">
            <p className={`text-2xl font-black tracking-tight ${isFullyPaid || isFree ? "text-emerald-700" : "text-slate-800"}`}>
              {docTitle}
            </p>
            <p className="text-sm font-mono font-bold text-primary mt-1">{docNo}</p>
            <p className="text-[11px] text-slate-500 mt-1">Date: {fmtDate(invoice.scheduledDate || new Date().toISOString().split("T")[0])}</p>
            <p className="text-[11px] text-slate-500">Project: #{invoice.projectNo}</p>
            {(isFullyPaid || isFree) && receipts.length > 0 && (
              <p className="text-[11px] text-slate-500">Receipt: {receipts[receipts.length - 1]?.receiptNo}</p>
            )}
          </div>
        </div>

        {/* Bill To */}
        <div className="border rounded-xl p-4">
          <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-2">Bill To</p>
          <p className="font-bold text-slate-800">{invoice.customer?.name}</p>
          {invoice.customer?.phone && <p className="text-sm text-slate-600">{invoice.customer.phone}</p>}
          {invoice.customer?.email && <p className="text-sm text-slate-600">{invoice.customer.email}</p>}
          {invoice.customer?.address && <p className="text-sm text-slate-600">{invoice.customer.address}</p>}
        </div>

        {/* Service Info chips */}
        <div className="flex gap-3 text-sm">
          <div className="flex-1 bg-slate-50 rounded-lg p-3">
            <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1">Service Type</p>
            <p className="font-semibold capitalize">{invoice.serviceType?.replace("_", " ")}</p>
          </div>
          <div className="flex-1 bg-slate-50 rounded-lg p-3">
            <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1">Service Ref</p>
            <p className="font-mono font-semibold text-sm">{invoice.serviceNo}</p>
          </div>
          <div className="flex-1 bg-slate-50 rounded-lg p-3">
            <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1">Date</p>
            <p className="font-semibold">{fmtDate(invoice.scheduledDate || "")}</p>
          </div>
        </div>

        {/* Line Items */}
        <div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b-2 border-slate-200">
                <th className="text-left py-2 text-[9px] font-black uppercase tracking-widest text-slate-400">Description</th>
                <th className="text-center py-2 text-[9px] font-black uppercase tracking-widest text-slate-400 w-10">Qty</th>
                <th className="text-right py-2 text-[9px] font-black uppercase tracking-widest text-slate-400 w-24">Unit Price</th>
                <th className="text-right py-2 text-[9px] font-black uppercase tracking-widest text-slate-400 w-24">Amount</th>
              </tr>
            </thead>
            <tbody>
              {(invoice.items || []).map((item: any, i: number) => (
                <tr key={i} className="border-b border-slate-100">
                  <td className="py-2.5 text-slate-700">
                    {/^Travel\s*[—-]/i.test(item.description) ? "Transport" : item.description}
                  </td>
                  <td className="py-2.5 text-center text-slate-500">{item.qty ?? 1}</td>
                  <td className="py-2.5 text-right text-slate-500">{item.unitPrice ? fmtRs(item.unitPrice) : "—"}</td>
                  <td className="py-2.5 text-right font-semibold">{fmtRs(item.amount || 0)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-slate-200 bg-slate-50">
                <td colSpan={3} className="py-3 text-right font-black text-slate-700 pr-4 text-sm">TOTAL</td>
                <td className={`py-3 text-right font-black text-lg whitespace-nowrap ${isFree ? "text-emerald-600" : "text-primary"}`}>
                  {isFree ? "Rs. 0" : fmtRs(invoice.total || 0)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>

        {/* Payment summary */}
        {isFree ? (
          <div className="rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-3 flex items-center gap-3">
            <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
            <div>
              <p className="font-bold text-emerald-800 text-sm">Free Service</p>
              <p className="text-xs text-emerald-700">No charge applied for this service visit.</p>
            </div>
          </div>
        ) : isFullyPaid ? (
          <div className="rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
              <div>
                <p className="font-bold text-emerald-800 text-sm">Payment Complete</p>
                <p className="text-xs text-emerald-700">Total received: {fmtRs(totalPaid)}</p>
              </div>
            </div>
            <p className="text-xl font-black text-emerald-700">Rs. 0</p>
          </div>
        ) : isOverpaid ? (
          <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="h-5 w-5 text-red-600 shrink-0" />
              <div>
                <p className="font-bold text-red-800 text-sm">Overpaid (Refund Due)</p>
                <p className="text-xs text-red-700">Total paid so far: {fmtRs(totalPaid)}</p>
              </div>
            </div>
            <p className="text-xl font-black text-red-700">{fmtRs(Math.abs(balance))}</p>
          </div>
        ) : (
          <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 flex items-center justify-between">
            <div>
              <p className="font-bold text-amber-800 text-sm">Balance Due</p>
              <p className="text-xs text-amber-700">Total paid so far: {fmtRs(totalPaid)}</p>
            </div>
            <p className="text-xl font-black text-amber-700">{fmtRs(balance)}</p>
          </div>
        )}

        {/* Receipts table — shown when payments exist */}
        {receipts.length > 0 && (
          <div>
            <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-2">Payment History</p>
            <table className="w-full text-xs border rounded-xl overflow-hidden">
              <thead>
                <tr className="bg-slate-50 border-b">
                  <th className="text-left py-2 px-3 font-semibold text-slate-500">Receipt No.</th>
                  <th className="text-left py-2 px-2 font-semibold text-slate-500">Date</th>
                  <th className="text-left py-2 px-2 font-semibold text-slate-500">Method</th>
                  <th className="text-left py-2 px-2 font-semibold text-slate-500">Ref</th>
                  <th className="text-right py-2 px-3 font-semibold text-slate-500">Amount</th>
                </tr>
              </thead>
              <tbody>
                {receipts.map((r: any) => (
                  <tr key={r.id} className="border-b last:border-0">
                    <td className="py-2 px-3 font-mono">{r.receiptNo}</td>
                    <td className="py-2 px-2">{r.date ? fmtDate(r.date) : "—"}</td>
                    <td className="py-2 px-2 capitalize">{(r.paymentMethod || "cash").replace("_", " ")}</td>
                    <td className="py-2 px-2 text-slate-400">{r.referenceNo || "—"}</td>
                    <td className="py-2 px-3 text-right font-semibold text-emerald-700">{fmtRs(r.amount || 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* ── End divider ── */}
        <div className="flex items-center gap-4 my-1">
          <div className="h-px bg-slate-200 flex-grow" />
          <span className="text-[9px] font-black text-slate-400 tracking-[0.2em] uppercase shrink-0">
            — END OF {isFullyPaid || isFree ? "RECEIPT" : "QUOTATION"} —
          </span>
          <div className="h-px bg-slate-200 flex-grow" />
        </div>

        {/* ── Brand Footer ── */}
        <div className="mt-auto space-y-2">
          <div className="border-t border-emerald-500/30 pt-3 flex items-center justify-between w-full">
            <div className="flex items-center justify-start shrink-0 w-1/4">
              <img src="/PC%20logo%20and%20QR.png" alt="Pearl Cluster" className="h-9 object-contain" />
            </div>
            <div className="flex items-center justify-center flex-grow w-2/4 px-4">
              <img src="/all%20logos.png" alt="Alta Vision Brand Family" className="h-11 w-full object-contain" />
            </div>
            <div className="flex items-center justify-end shrink-0 w-1/4">
              <img src="/Certificates.png" alt="Certificates" className="h-9 object-contain" />
            </div>
          </div>
          <div className="flex justify-between items-center text-[9px] text-slate-400 font-medium tracking-wide">
            <p>Alta Vision (Pvt) Ltd</p>
            <p>{docNo}</p>
            <p>This is a computer-generated document.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
