"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { doc, getDoc, collection, getDocs, query, where, addDoc, updateDoc, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Button } from "@/components/ui/button";
import { Loader2, ArrowLeft, Printer, Landmark, Send, Receipt } from "lucide-react";
import Link from "next/link";
import { numberToWords } from "@/lib/project-utils";
import { formatQtnNo } from "@/lib/format-qtn";
import { useAuth } from "@/lib/auth-context";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import ShareModal from "@/components/proposals/ShareModal";

const fmtRs = (n: number) =>
  "Rs. " + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const fmtDate = (dStr: string) => {
  if (!dStr) return "";
  try {
    const d = new Date(dStr);
    return d.toLocaleDateString("en-GB", {
      day: "numeric",
      month: "long",
      year: "numeric"
    });
  } catch (e) {
    return dStr;
  }
};

export default function ReceiptPrintPage() {
  const { id } = useParams() as { id: string };

  const { user } = useAuth();
  const { toast } = useToast();

  const [receipt, setReceipt] = useState<any>(null);
  const [project, setProject] = useState<any>(null);
  const [quotation, setQuotation] = useState<any>(null);
  const [proposal, setProposal] = useState<any>(null);
  const [sysSettings, setSysSettings] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [shareOpen, setShareOpen] = useState(false);

  useEffect(() => {
    async function loadData() {
      try {
        // 1. Fetch Receipt
        const recSnap = await getDoc(doc(db, "receipts", id));
        if (!recSnap.exists()) {
          toast({ title: "Not Found", description: "Receipt not found.", variant: "destructive" });
          setLoading(false);
          return;
        }
        const recData = recSnap.data();
        setReceipt({ id: recSnap.id, ...recData });

        // 2. Fetch Quotation
        if (recData.quotationId) {
          const qSnap = await getDoc(doc(db, "quotations", recData.quotationId));
          if (qSnap.exists()) {
            setQuotation(qSnap.data());
          }
        }

        // 3. Fetch Proposal (for VAT info and company address)
        if (recData.proposalId) {
          const propSnap = await getDoc(doc(db, "proposals", recData.proposalId));
          if (propSnap.exists()) {
            setProposal(propSnap.data());
          }
        }

        // 4. Fetch Project
        if (recData.proposalId) {
          const projSnap = await getDocs(
            query(collection(db, "projects"), where("proposalId", "==", recData.proposalId))
          );
          if (!projSnap.empty) {
            const pDoc = projSnap.docs[0];
            setProject({ id: pDoc.id, ...pDoc.data() });
          }
        }

        // 4. Fetch System settings for company details & badges
        const settingsSnap = await getDoc(doc(db, "settings", "engineers"));
        const dataSettings = settingsSnap.exists() ? settingsSnap.data() : {};
        setSysSettings(dataSettings);
      } catch (err: any) {
        console.error(err);
        toast({ title: "Error loading", description: err.message, variant: "destructive" });
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [id]);

  const handlePrint = async () => {
    let version = 1;
    try {
      const printSnap = await getDocs(
        query(collection(db, "pdf_prints"), where("receiptId", "==", id))
      );
      version = printSnap.size + 1;

      // Write versioned print record
      await addDoc(collection(db, "pdf_prints"), {
        receiptId: id,
        receiptNo: receipt.receiptNo,
        version,
        printedBy: user?.uid || "dev_user",
        printedByEmail: user?.email || "dev@altavision.lk",
        printedByName: user?.displayName || "Dev User",
        timestamp: serverTimestamp(),
      });

      // Audit log
      const { logActivityClient } = await import("@/lib/audit-logger-client");
      await logActivityClient(user, "RECEIPT_PRINT", {
        receiptId: id,
        receiptNo: receipt.receiptNo,
        customerName: quotation?.customer?.name || project?.customer?.name,
        version,
      });
    } catch (e) {
      console.error("PDF print log failed:", e);
    }

    const originalTitle = document.title;
    const cleanNo = receipt.receiptNo.replace(/[\/\\?%*:|"<>\s]/g, "_");
    document.title = `${cleanNo}_v${version}`;

    window.print();

    setTimeout(() => {
      document.title = originalTitle;
    }, 1000);
  };

  const handleToggleVat = async () => {
    if (!receipt || !user) return;
    const currentVatStatus = receipt.vatInvoice ?? quotation?.vatInvoice ?? proposal?.vatInvoice ?? false;
    const newVatStatus = !currentVatStatus;
    try {
      await updateDoc(doc(db, "receipts", id), {
        vatInvoice: newVatStatus,
        updatedAt: serverTimestamp(),
      });
      setReceipt((prev: any) => ({ ...prev, vatInvoice: newVatStatus }));
      
      const { logActivityClient } = await import("@/lib/audit-logger-client");
      await logActivityClient(user, "RECEIPT_UPDATE", {
        receiptId: id,
        receiptNo: receipt.receiptNo,
        updatedFields: { vatInvoice: newVatStatus }
      });
      toast({
        title: "VAT Updated",
        description: `VAT Invoice is now ${newVatStatus ? "ENABLED" : "DISABLED"} for this receipt.`,
      });
    } catch (err: any) {
      toast({
        title: "Failed to update VAT",
        description: err.message,
        variant: "destructive",
      });
    }
  };

  if (loading) {
    return (
      <div className="flex h-[80vh] items-center justify-center gap-2 text-muted-foreground bg-zinc-50 dark:bg-zinc-950">
        <Loader2 className="h-5 w-5 animate-spin text-emerald-600" />
        <span className="text-sm font-semibold">Generating receipt document...</span>
      </div>
    );
  }

  if (!receipt) {
    return (
      <div className="flex h-[80vh] flex-col items-center justify-center gap-4 text-muted-foreground bg-zinc-50 dark:bg-zinc-950">
        <p className="font-semibold text-lg">Payment receipt could not be resolved.</p>
        <Button variant="outline" asChild>
          <Link href="/projects">Back to Registry</Link>
        </Button>
      </div>
    );
  }

  const customer = quotation?.customer || project?.customer || {};

  const _qtnRaw = quotation?.qtnNo || receipt?.qtnNo || "";
  const _isPaid = quotation?.paymentStatus === "fully_paid";
  const qtnNoFormatted = formatQtnNo(_qtnRaw, _isPaid, quotation?.installmentNo, quotation?.installmentPercent, quotation?.siteNo, project?.propNo || quotation?.propNo);

  // Proposal reference — stored on project/quotation, or derived from the invoice number
  const propNoFormatted = project?.propNo || quotation?.propNo ||
    (_qtnRaw.startsWith("P_Inv_") ? _qtnRaw.replace("P_Inv_", "Prop_") :
     /^[Qq][Tt][Nn]_/.test(_qtnRaw) ? `Prop_${_qtnRaw.replace(/^[Qq][Tt][Nn]_/, "")}` : "");

  return (
    <div className="bg-zinc-100 dark:bg-zinc-950 min-h-screen pb-12 font-sans select-text">
      
      <style dangerouslySetInnerHTML={{ __html: `
        @media print {
          /* Hide all screen-only elements */
          .no-print { display: none !important; }
          
          /* Force white background on ALL elements to save ink */
          html, body, div, main, section, article {
            background-color: white !important;
            background: white !important;
          }

          html, body {
            margin: 0 !important;
            padding: 0 !important;
            height: 100% !important;
            overflow: hidden !important;
          }

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
            height: 100% !important;
            min-height: 100% !important;
            max-height: 100% !important;
            overflow: hidden !important;
            display: flex !important;
            flex-direction: column !important;
            justify-content: space-between !important;
            box-sizing: border-box !important;
          }

          .qtn-a4-body {
            height: 100% !important;
            display: flex !important;
            flex-direction: column !important;
            justify-content: space-between !important;
            box-sizing: border-box !important;
          }

          * {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }

          @page {
            size: A4 portrait;
            margin: 12mm 15mm !important;
          }
        }
      `}} />

      {/* STICKY TOP ACTION BAR (no-print) */}
      <div className="sticky top-0 z-50 w-full border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 no-print mb-6 shadow-sm">
        <div className="max-w-[210mm] mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="sm" className="gap-2 text-muted-foreground hover:text-foreground font-semibold" asChild>
              <Link href={project?.id ? `/projects/${project.id}` : "/projects"}>
                <ArrowLeft className="h-4 w-4" />
                <span>Back to Project Workspace</span>
              </Link>
            </Button>
          </div>
          
          <div className="flex items-center gap-2">
            {(user?.role === "superadmin" || user?.role === "admin") && (
              <Button 
                type="button"
                variant={(receipt?.vatInvoice ?? quotation?.vatInvoice ?? proposal?.vatInvoice ?? false) ? "default" : "outline"}
                size="sm" 
                className={cn("gap-2 font-bold", (receipt?.vatInvoice ?? quotation?.vatInvoice ?? proposal?.vatInvoice ?? false) ? "bg-amber-600 hover:bg-amber-700 text-white" : "border-amber-600/25 hover:bg-amber-50 text-amber-600 dark:hover:bg-amber-950/20")}
                onClick={handleToggleVat}
              >
                <Receipt className="h-4 w-4" />
                {(receipt?.vatInvoice ?? quotation?.vatInvoice ?? proposal?.vatInvoice ?? false) ? "VAT Invoice" : "Non-VAT"}
              </Button>
            )}
            <Button variant="outline" size="sm" className="gap-2 font-bold border-emerald-600/25 hover:bg-emerald-50 text-emerald-600 hover:text-emerald-700 dark:hover:bg-emerald-950/20" onClick={() => setShareOpen(true)}>
              <Send className="h-4 w-4" />
              <span>Send / Share</span>
            </Button>
            <Button size="sm" className="gap-2 bg-primary hover:bg-primary/95 text-white font-bold" onClick={handlePrint}>
              <Printer className="h-4 w-4" />
              <span>Print / Save Receipt PDF</span>
            </Button>
          </div>
        </div>
      </div>

      {/* HIGH-FIDELITY PRINTABLE A4 CONTAINER */}
      <div id="print-root" className="max-w-[210mm] mx-auto bg-white text-zinc-900 border border-zinc-200 shadow-lg print:shadow-none print:border-none rounded-xl print:rounded-none overflow-hidden duration-300 relative print:flex print:flex-col print:h-full print:w-full theme-force-light">
        <div className="qtn-a4-body p-8 sm:p-12 flex flex-col min-h-[297mm] print:min-h-0 print:h-full justify-between relative select-text gap-8 print:gap-4">
          
          {/* PAID Seal Stamp Overlay */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 -rotate-12 pointer-events-none select-none z-10">
            <div className="border-4 border-double border-emerald-600 text-emerald-600 font-sans font-black px-6 py-3 uppercase rounded-xl shadow-sm flex flex-col items-center justify-center bg-white/90 backdrop-blur-[1px] print:bg-transparent print:shadow-none mix-blend-multiply opacity-80 scale-110">
              <span className="text-[11px] font-bold tracking-wider leading-none">ALTA VISION</span>
              <span className="text-4xl font-black leading-none my-1.5 tracking-widest border-y-2 border-emerald-600 py-1 px-5">RECEIVED</span>
              <span className="text-[10px] font-mono leading-none font-bold">
                {fmtDate(receipt.date)}
              </span>
            </div>
          </div>
          
          {/* 1. DOCUMENT HEADER */}
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
              <span className="text-xl font-black tracking-tight text-primary uppercase select-none hidden brand-text-fallback">
                ALTA VISION
              </span>
              <div className="text-[10px] text-muted-foreground leading-normal font-semibold">
                <p>{quotation?.companyAddress || sysSettings?.companyAddress || "No 23D, Sri Rathanapala Mawatha, Nupe, Matara"}</p>
                <p>{sysSettings?.companyEmail || "info@altavision.lk"}</p>
              </div>
            </div>
            
            <div className="text-right space-y-1.5">
              <h1 className="text-2xl font-black text-slate-900 tracking-tight uppercase">
                Payment Receipt
              </h1>
              <div className="flex flex-row justify-end items-center gap-1.5 text-xs">
                <span className="font-bold text-muted-foreground">Receipt No:</span>
                <span className="font-mono font-extrabold text-foreground">{receipt.receiptNo}</span>
              </div>
              <div className="flex flex-row justify-end items-center gap-1.5 text-xs">
                <span className="font-bold text-muted-foreground">Date Received:</span>
                <span className="font-semibold text-foreground">{fmtDate(receipt.date)}</span>
              </div>
            </div>
          </div>

          {/* 2. RECEIVED FROM + PROJECT INFO */}
          <div className="grid grid-cols-2 gap-0 border-b border-border pb-4 print:pb-2">
            {/* Left: Received From */}
            <div className="border-r border-border pr-6 space-y-1.5">
              <div className="text-[10px] font-black text-primary uppercase tracking-widest font-sans">RECEIVED FROM</div>
              <p className="font-extrabold text-base text-foreground leading-tight">{customer.name}</p>
              <p className="text-xs text-muted-foreground whitespace-pre-line leading-relaxed max-w-sm">{customer.address}</p>
              <p className="text-xs text-muted-foreground font-semibold">
                Contact: {customer.phone} {customer.phone2 ? `/ ${customer.phone2}` : ""}
              </p>
            </div>
            
            {/* Right: Project Reference */}
            <div className="pl-6 space-y-1.5 self-start">
              <div className="text-[10px] font-black text-primary uppercase tracking-widest font-sans">PROJECT REFERENCE</div>
              <div className="grid grid-cols-12 gap-x-2 gap-y-1 text-xs print:text-[11px]">
                <span className="col-span-5 text-muted-foreground font-bold uppercase tracking-wider text-[9px]">Site No:</span>
                <span className="col-span-7 font-mono font-bold text-foreground">
                  {project?.siteNo && project?.siteNo !== "Pending" ? `#${project.siteNo}` : "Awaiting Assignment"}
                </span>

                <span className="col-span-5 text-muted-foreground font-bold uppercase tracking-wider text-[9px]">Proposal Ref:</span>
                <span className="col-span-7 font-mono font-bold text-foreground">{propNoFormatted || "—"}</span>

                <span className="col-span-5 text-muted-foreground font-bold uppercase tracking-wider text-[9px]">Invoice Ref:</span>
                <span className="col-span-7 font-mono font-bold text-foreground">{qtnNoFormatted}</span>

                <span className="col-span-5 text-muted-foreground font-bold uppercase tracking-wider text-[9px]">System Type:</span>
                <span className="col-span-7 font-semibold text-foreground uppercase">{project?.systemType || quotation?.systemType || "Solar installation"}</span>
              </div>
            </div>
          </div>

          {/* 3. RECEIPT BODY DETAILS */}
          <div className="flex-grow space-y-6 pt-4">
            <div className="bg-zinc-50 p-6 rounded-xl border border-zinc-200 space-y-4">
              <div className="flex justify-between items-center pb-3 border-b border-zinc-200">
                <span className="text-xs font-black uppercase text-zinc-500 tracking-wider">Description of Payment</span>
                <span className="text-xs font-black uppercase text-zinc-500 tracking-wider">Amount Received</span>
              </div>
              
              <div className="flex justify-between items-start text-sm">
                <div className="space-y-1 max-w-lg">
                  <p className="font-black text-zinc-800">
                    {quotation?.installmentNo === 1
                      ? quotation.installmentPercent === 100
                        ? "Full contract settlement payment (100%)"
                        : `First Advance Booking & Project Mobilization Payment (${quotation.installmentPercent}%)`
                      : `Progressive Installment #${quotation?.installmentNo || "—"} Payment (${quotation?.installmentPercent || "—"}%)`}
                  </p>
                  <p className="text-xs text-muted-foreground font-semibold leading-relaxed">
                    Method: {receipt.notes || "Bank Deposit / EFT Transfer"}
                  </p>
                </div>
                <span className="font-mono font-black text-lg text-emerald-600">{fmtRs(receipt.amount)}</span>
              </div>

              <div className="pt-3 border-t border-zinc-200 flex flex-col gap-1">
                <span className="text-[10px] font-black uppercase text-zinc-500 tracking-wider">Amount In Words:</span>
                <span className="text-xs font-bold text-zinc-800 italic bg-white px-3 py-1.5 rounded border border-zinc-200">
                  {numberToWords(receipt.amount)}
                </span>
              </div>

              {(receipt?.vatInvoice ?? quotation?.vatInvoice ?? proposal?.vatInvoice ?? false) && (() => {
                const vatRate = Number(proposal?.vatRate || quotation?.vatRate || 18);
                const gross = receipt.amount;
                const net = gross * 100 / (100 + vatRate);
                const vatAmt = gross - net;
                return (
                  <div className="pt-3 border-t border-zinc-200 space-y-2 text-xs">
                    <p className="text-[9px] font-black uppercase text-zinc-500 tracking-wider">VAT Breakdown</p>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground font-semibold">VAT Reg. No:</span>
                      <span className="font-mono font-bold">{sysSettings?.vatRegNo || "174909482 - 7000"}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground font-semibold">Net Amount (excl. VAT)</span>
                      <span className="font-mono font-semibold">{fmtRs(net)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-blue-700 font-semibold">VAT ({vatRate}%)</span>
                      <span className="font-mono text-blue-700 font-semibold">+ {fmtRs(vatAmt)}</span>
                    </div>
                    <div className="flex justify-between border-t border-zinc-200 pt-1.5">
                      <span className="font-bold text-zinc-800">Total (incl. VAT)</span>
                      <span className="font-mono font-black text-zinc-900">{fmtRs(gross)}</span>
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>

          {/* Financial Ledger Status */}
          {project && (
            <div className="grid grid-cols-3 gap-4 border border-zinc-250 p-4 rounded-xl text-xs bg-zinc-50/50">
              <div>
                <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider block mb-0.5">Total System Contract</span>
                <span className="font-mono font-black text-foreground">{fmtRs(project.systemTotal)}</span>
              </div>
              <div>
                <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider block mb-0.5">Total Paid To Date</span>
                <span className="font-mono font-black text-emerald-650">{fmtRs(project.totalPaid || receipt.amount)}</span>
              </div>
              <div>
                {(() => {
                  const totalPd = project.totalPaid || receipt.amount;
                  const overpd = Math.max(0, totalPd - project.systemTotal);
                  const balance = Math.max(0, project.systemTotal - totalPd);
                  if (overpd > 0 && proposal?.refundRecord) {
                    return (
                      <>
                        <span className="text-[9px] font-bold text-emerald-600 uppercase tracking-wider block mb-0.5">Refunded</span>
                        <span className="font-mono font-black text-emerald-600">{fmtRs(overpd)}</span>
                        <span className="text-[8px] text-emerald-500 font-semibold block mt-0.5">Refunded ✓</span>
                      </>
                    );
                  }
                  if (overpd > 0) {
                    return (
                      <>
                        <span className="text-[9px] font-bold text-red-600 uppercase tracking-wider block mb-0.5">Refund Due</span>
                        <span className="font-mono font-black text-red-600">{fmtRs(overpd)}</span>
                        <span className="text-[8px] text-red-500 font-semibold block mt-0.5">To be refunded</span>
                      </>
                    );
                  }
                  return (
                    <>
                      <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider block mb-0.5">Remaining Balance Due</span>
                      <span className="font-mono font-black text-amber-700">{fmtRs(balance)}</span>
                    </>
                  );
                })()}
              </div>
            </div>
          )}

          {/* 4. DIRECT DEPOSIT & CONFIRMATION SECTION */}
          <div className="bg-muted p-4 rounded-xl space-y-2">
            <div className="flex items-center gap-1.5 text-primary">
              <Landmark className="h-4 w-4" />
              <span className="text-[10px] font-black uppercase tracking-widest">OFFICIAL TRANSACTION RECORD</span>
            </div>
            <div className="text-[10px] text-muted-foreground/90 font-semibold leading-relaxed">
              This receipt confirms that the specified funds have been successfully deposited and credited towards the installation project for customer <strong className="font-extrabold text-foreground">{customer.name}</strong> under site reference <strong className="font-mono font-black text-foreground underline">#{project?.siteNo || "Pending"}</strong>. For any inquiries regarding account ledger statuses, please contact <strong className="font-extrabold text-foreground">{sysSettings?.companyEmail || "info@altavision.lk"}</strong> or call <strong className="font-extrabold text-foreground">{sysSettings?.companyWhatsapp || "0742681807"}</strong>.
            </div>
          </div>

          {/* 5. CERTIFICATIONS / BADGES FOOTER */}
          <div className="w-full mt-auto border-t border-border pt-4 flex flex-col items-center gap-3">
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
              ) : (
                <>
                  <div className="w-1/4 flex justify-start"><img src="/PC%20logo%20and%20QR.png" alt="Pearl Cluster" className="h-8 print:h-6 object-contain" /></div>
                  <div className="w-2/4 px-4 flex-grow flex justify-center"><img src="/all%20logos.png" alt="All Logos" className="h-8 print:h-6 w-full object-contain" /></div>
                  <div className="w-1/4 flex justify-end"><img src="/Certificates.png" alt="Certificates" className="h-8 print:h-6 object-contain" /></div>
                </>
              )}
            </div>
            
            <div className="text-center space-y-1">
              <p className="text-[10px] text-muted-foreground italic font-semibold leading-normal">
                This is a computer-generated official receipt. No signature is required.
              </p>
              <p className="text-[9px] text-muted-foreground font-mono font-bold leading-normal">
                Receipt: {receipt.receiptNo}
                {propNoFormatted ? ` · Proposal: ${propNoFormatted}` : ""}
                {" "}· Invoice: {qtnNoFormatted}
                {" "}— Generated on {new Date().toLocaleDateString("en-GB")} at {new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
              </p>
            </div>
          </div>

        </div>
      </div>
      {receipt && (
        <ShareModal
          isOpen={shareOpen}
          onClose={() => setShareOpen(false)}
          customerName={customer.name || ""}
          customerPhone={customer.phone || ""}
          customerEmail={customer.email || ""}
          customerAddress={customer.address || ""}
          docType="receipt"
          docNo={receipt.receiptNo || "No Ref"}
          docUrl={typeof window !== "undefined" ? `${window.location.origin}/receipts/${receipt.id}` : ""}
          preferredFormats={customer.sendFormat || []}
        />
      )}
    </div>
  );
}
