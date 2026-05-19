"use client";

import { useEffect, useState, useMemo } from "react";
import { useParams } from "next/navigation";
import Script from "next/script";
import { doc, getDoc, collection, getDocs, addDoc, query, where, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Proposal } from "@/types";
import { Loader2, Printer, Leaf, Zap, Sun, Battery, Activity, Banknote, ShieldCheck, HardDrive, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth-context";
import { calculateSolarMetrics } from "@/lib/solar-calculator";
import Image from "next/image";
import ReactMarkdown from "react-markdown";

function parseWatts(label: string | undefined): number {
  if (!label) return 0;
  const match = label.match(/(\d+(?:\.\d+)?)\s*(k?w)/i);
  if (match) {
    const num = parseFloat(match[1]);
    const unit = match[2].toLowerCase();
    if (unit === 'kw') return num * 1000;
    return num;
  }
  const fallbackMatch = label.match(/(\d+(?:\.\d+)?)/);
  if (fallbackMatch) return parseFloat(fallbackMatch[1]);
  return 0;
}

const fmtRs = (n: number) =>
  "Rs. " + Math.round(n).toLocaleString("en-US");

function BrandFooter({ pageNum, qtnNo, totalPages }: { pageNum: number; qtnNo: string; totalPages: number }) {
  const isLastPage = pageNum === totalPages;
  return (
    <div className="mt-auto pt-4 space-y-3">
      {isLastPage && (
        <div className="flex items-center justify-center gap-4 py-2 my-1">
          <div className="h-[1px] bg-slate-200 flex-grow"></div>
          <span className="text-[10px] font-black text-slate-400 tracking-[0.2em] uppercase shrink-0">— END OF PROPOSAL —</span>
          <div className="h-[1px] bg-slate-200 flex-grow"></div>
        </div>
      )}
      {/* Logo Banner */}
      <div className="border-t border-emerald-500/30 pt-4 flex items-center justify-between gap-6">
        {/* Left: Pearl Cluster QR */}
        <div className="flex items-center shrink-0">
          <img src="/PC%20logo%20and%20QR.png" alt="Pearl Cluster" className="h-10 object-contain" />
        </div>
        
        {/* Center: Brand Family */}
        <div className="flex items-center justify-center flex-grow">
          <img src="/all%20logos.png" alt="Alta Vision Brand Family" className="h-13 object-contain" />
        </div>
        
        {/* Right: Certificates */}
        <div className="flex items-center justify-end shrink-0">
          <img src="/Certificates.png" alt="Certificates" className="h-10 object-contain" />
        </div>
      </div>

      {/* Page & Copy info */}
      <div className="flex justify-between items-center text-[10px] text-slate-400 font-medium tracking-wide">
        <p>Alta Vision (Pvt) Ltd</p>
        <p>{qtnNo}</p>
        <p>Page {pageNum} of {totalPages}</p>
      </div>
    </div>
  );
}

function ImageDocumentPage({ fileUrl, qtnNo, pageNum, totalPages }: { fileUrl: string; qtnNo: string; pageNum: number; totalPages: number }) {
  const isLastPage = pageNum === totalPages;
  return (
    <div
      className="w-[210mm] min-h-[297mm] mx-auto bg-white shadow-md print:shadow-none p-12 flex flex-col mb-8 print:mb-0 relative"
      style={{ pageBreakAfter: "always" }}
    >
      <div className="flex-grow flex items-center justify-center overflow-hidden w-full h-full border border-zinc-100 rounded-lg p-2 bg-zinc-50">
        <img src={fileUrl} alt="Technical Datasheet" className="max-w-full max-h-[230mm] object-contain" />
      </div>
      
      {isLastPage && (
        <div className="flex items-center justify-center gap-4 py-2 mt-4">
          <div className="h-[1px] bg-slate-200 flex-grow"></div>
          <span className="text-[10px] font-black text-slate-400 tracking-[0.2em] uppercase shrink-0">— END OF PROPOSAL —</span>
          <div className="h-[1px] bg-slate-200 flex-grow"></div>
        </div>
      )}

      {/* Dynamic Brand Footer */}
      <div className="mt-4 pt-4 border-t border-slate-100 flex items-center justify-between text-[10px] text-slate-400 font-medium">
        <span>Alta Vision BRAND FAMILY</span>
        <span>Page {pageNum} of {totalPages}</span>
        <span>Ref: {qtnNo}</span>
      </div>
    </div>
  );
}

function PDFDocumentPages({
  fileUrl,
  qtnNo,
  startPageNum,
  onLoadPagesCount,
  totalPages
}: {
  fileUrl: string;
  qtnNo: string;
  startPageNum: number;
  onLoadPagesCount: (url: string, count: number) => void;
  totalPages: number;
}) {
  const [pagesCount, setPagesCount] = useState<number>(0);
  const [pdfLibReady, setPdfLibReady] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined" && (window as any).pdfjsLib) {
      setPdfLibReady(true);
    }
  }, []);

  useEffect(() => {
    if (!pdfLibReady) return;

    let active = true;
    const renderPDF = async () => {
      try {
        const pdfjsLib = (window as any).pdfjsLib;
        pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js`;

        const loadingTask = pdfjsLib.getDocument(fileUrl);
        const pdf = await loadingTask.promise;
        if (!active) return;

        setPagesCount(pdf.numPages);
        onLoadPagesCount(fileUrl, pdf.numPages);

        // Render pages sequentially to avoid CPU throttling
        for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
          const page = await pdf.getPage(pageNum);
          if (!active) return;

          const viewport = page.getViewport({ scale: 2.0 });
          const canvas = document.createElement("canvas");
          const context = canvas.getContext("2d");
          if (!context) {
            console.error("Failed to get 2D canvas context for PDF rendering");
            continue;
          }
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          canvas.className = "max-w-full max-h-[230mm] object-contain mx-auto my-auto shadow-sm rounded-md";

          const renderContext = {
            canvasContext: context,
            viewport: viewport,
          };
          await page.render(renderContext).promise;

          const pageDivId = `pdf-page-${fileUrl.replace(/[^a-zA-Z0-9]/g, "")}-${pageNum}`;
          const targetPlaceholder = document.getElementById(pageDivId);
          if (targetPlaceholder) {
            targetPlaceholder.innerHTML = "";
            targetPlaceholder.appendChild(canvas);
          }
        }
      } catch (err) {
        console.error("Error rendering PDF attachment:", err);
      }
    };

    renderPDF();

    return () => {
      active = false;
    };
  }, [pdfLibReady, fileUrl]);

  return (
    <>
      <Script
        src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js"
        strategy="afterInteractive"
        onLoad={() => setPdfLibReady(true)}
      />

      {pagesCount > 0 ? (
        Array.from({ length: pagesCount }).map((_, i) => {
          const pageNum = i + 1;
          const pageDivId = `pdf-page-${fileUrl.replace(/[^a-zA-Z0-9]/g, "")}-${pageNum}`;
          const isLastPage = (startPageNum + i) === totalPages;
          return (
            <div
              key={pageNum}
              className="w-[210mm] min-h-[297mm] mx-auto bg-white shadow-md print:shadow-none p-12 flex flex-col mb-8 print:mb-0 relative"
              style={{ pageBreakAfter: "always" }}
            >
              <div id={pageDivId} className="flex-grow flex items-center justify-center overflow-hidden w-full h-full bg-zinc-50 border border-zinc-100 rounded-lg">
                <div className="flex flex-col items-center gap-2 text-zinc-400 py-24">
                  <Loader2 className="h-6 w-6 animate-spin text-zinc-300" />
                  <p className="text-xs font-medium">Loading high-resolution attachment page...</p>
                </div>
              </div>

              {isLastPage && (
                <div className="flex items-center justify-center gap-4 py-2 mt-4">
                  <div className="h-[1px] bg-slate-200 flex-grow"></div>
                  <span className="text-[10px] font-black text-slate-400 tracking-[0.2em] uppercase shrink-0">— END OF PROPOSAL —</span>
                  <div className="h-[1px] bg-slate-200 flex-grow"></div>
                </div>
              )}

              {/* Dynamic Brand Footer */}
              <div className="mt-4 pt-4 border-t border-slate-100 flex items-center justify-between text-[10px] text-slate-400 font-medium">
                <span>Alta Vision BRAND FAMILY</span>
                <span>Page {startPageNum + i} of {totalPages}</span>
                <span>Ref: {qtnNo}</span>
              </div>
            </div>
          );
        })
      ) : (
        <div
          className="w-[210mm] min-h-[297mm] mx-auto bg-white shadow-md print:shadow-none p-12 flex flex-col items-center justify-center mb-8 print:mb-0"
          style={{ pageBreakAfter: "always" }}
        >
          <Loader2 className="h-8 w-8 animate-spin text-primary mb-4" />
          <p className="text-sm font-semibold text-zinc-700">Loading technical document attachment...</p>
          <p className="text-xs text-zinc-400 mt-1">Checking dimensions and pages...</p>
        </div>
      )}
    </>
  );
}

export default function PrintProposalPage() {
  const { id } = useParams() as { id: string };
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [legalDocs, setLegalDocs] = useState<{title: string, content: string}[]>([]);
  const [existingQtns, setExistingQtns] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [printVersion, setPrintVersion] = useState<number>(1);
  const { user } = useAuth();

  const [folderPdfs, setFolderPdfs] = useState<string[]>([]);
  const [pdfPageCounts, setPdfPageCounts] = useState<Record<string, number>>({});
  const [engineers, setEngineers] = useState<{
    engineer1: { name: string; designation: string; phone: string; email: string };
    engineer2: { name: string; designation: string; phone: string; email: string };
  }>({
    engineer1: {
      name: "Wikum Wijesinghe",
      designation: "B.Sc. Eng. (Hons), AMIESL",
      phone: "077 208 3894",
      email: "wikumw@altavision.lk"
    },
    engineer2: {
      name: "Oshada Ranawaka",
      designation: "B.Sc. Eng. (Hons), AMIESL",
      phone: "077 204 7891",
      email: "oshader@altavision.lk"
    }
  });

  useEffect(() => {
    async function load() {
      try {
        // Fetch engineers settings
        const settingsSnap = await getDoc(doc(db, "settings", "engineers"));
        if (settingsSnap.exists()) {
          setEngineers(settingsSnap.data() as any);
        }

        // Fetch Legal Docs
        fetch("/api/docs/legal")
          .then(res => res.json())
          .then(data => {
            if (data.documents) setLegalDocs(data.documents);
          })
          .catch(console.error);

        // Fetch PDF attachments
        fetch("/api/docs/attachments")
          .then(res => res.json())
          .then(data => {
            if (data.pdfs) setFolderPdfs(data.pdfs);
          })
          .catch(console.error);

        // Fetch existing quotations
        const qtnsSnap = await getDocs(
          query(collection(db, "quotations"), where("proposalId", "==", id))
        );
        const qtns = qtnsSnap.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .sort((a: any, b: any) => (a.installmentNo ?? 0) - (b.installmentNo ?? 0));
        setExistingQtns(qtns);

        const snap = await getDoc(doc(db, "proposals", id));
        if (snap.exists()) {
          const propData = { id: snap.id, ...snap.data() } as Proposal;
          
          // Resolve product names
          const prodSnap = await getDocs(collection(db, "products"));
          const productsMap = new Map();
          prodSnap.docs.forEach((d) => productsMap.set(d.id, d.data()));
          
          propData.options.forEach((opt) => {
            if (opt.inverter.productId && (!opt.inverter.brand || opt.inverter.model === opt.inverter.productId)) {
              const p = productsMap.get(opt.inverter.productId);
              if (p) {
                opt.inverter.brand = p.brand;
                opt.inverter.model = p.model;
              }
            }
            if (opt.panel.productId && (!opt.panel.brand || opt.panel.model === opt.panel.productId)) {
              const p = productsMap.get(opt.panel.productId);
              if (p) {
                opt.panel.brand = p.brand;
                opt.panel.model = p.model;
              }
            }
            if (opt.battery?.productId && (!opt.battery.brand || opt.battery.model === opt.battery.productId)) {
              const p = productsMap.get(opt.battery.productId);
              if (p) {
                opt.battery.brand = p.brand;
                opt.battery.model = p.model;
              }
            }
          });
          
          // Fetch count of existing prints to determine print version
          try {
            const printSnap = await getDocs(
              query(collection(db, "pdf_prints"), where("proposalId", "==", id))
            );
            setPrintVersion(printSnap.size + 1);
          } catch (printErr) {
            console.error("Failed fetching prints history:", printErr);
          }

          setProposal(propData);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [id]);

  const selectedIdx = useMemo(() => {
    if (existingQtns.length > 0) {
      const firstQtn = existingQtns[0];
      if (firstQtn && typeof firstQtn.selectedOption === "number") {
        return firstQtn.selectedOption;
      }
    }
    return 0; // Default to Option 1
  }, [existingQtns]);

  const cleanRef = useMemo(() => {
    if (!proposal) return "";
    const refNo = proposal.propNo || proposal.qtnNo;
    return refNo.replace(/[\/\\?%*:|"<>\s]/g, "_");
  }, [proposal]);

  useEffect(() => {
    if (proposal && cleanRef) {
      document.title = `${cleanRef}_v${printVersion}`;
    }
  }, [proposal, cleanRef, printVersion]);

  const metrics = useMemo(() => {
    if (!proposal || !proposal.options || proposal.options.length === 0) return null;
    const opt = proposal.options[selectedIdx] || proposal.options[0];
    const panelW = parseWatts(opt.panel.ratingLabel);
    return calculateSolarMetrics(opt.panel.qty || 0, panelW, opt.pricing.totalPrice || 0);
  }, [proposal, selectedIdx]);

  const systemTypeText = useMemo(() => {
    if (!proposal || !metrics) return "";
    const sysTypeMap: Record<string, string> = {
      "ongrid": "Ongrid",
      "hybrid": "Hybrid",
      "hybrid-offgrid": "Hybrid Offgrid",
      "offgrid": "Offgrid",
      "grid-backup": "Grid Backup"
    };
    const typeLabel = sysTypeMap[proposal.sysType.toLowerCase()] || proposal.sysType;
    return `System - ${metrics.totalCapacityKw}kW ${typeLabel}`;
  }, [proposal, metrics]);

  const handleLoadPagesCount = (url: string, count: number) => {
    setPdfPageCounts((prev) => {
      if (prev[url] === count) return prev;
      return { ...prev, [url]: count };
    });
  };

  const attachmentsList = useMemo(() => {
    const list: { type: "pdf" | "image"; url: string; name: string }[] = [];
    
    // 1. Folder PDFs
    folderPdfs.forEach((f) => {
      list.push({
        type: "pdf",
        url: `/api/docs/attachments?file=${encodeURIComponent(f)}`,
        name: f,
      });
    });

    // 2. Product Datasheets
    const opt = proposal?.options?.[selectedIdx] || proposal?.options?.[0];
    if (opt) {
      if (opt.inverter?.dataSheetUrl) {
        const isPdf = opt.inverter.dataSheetUrl.toLowerCase().includes(".pdf") || !opt.inverter.dataSheetUrl.toLowerCase().match(/\.(jpg|jpeg|png|webp|gif|svg)/);
        list.push({
          type: isPdf ? "pdf" : "image",
          url: opt.inverter.dataSheetUrl,
          name: `${opt.inverter.brand}_Inverter_Datasheet`,
        });
      }
      if (opt.battery?.dataSheetUrl) {
        const isPdf = opt.battery.dataSheetUrl.toLowerCase().includes(".pdf") || !opt.battery.dataSheetUrl.toLowerCase().match(/\.(jpg|jpeg|png|webp|gif|svg)/);
        list.push({
          type: isPdf ? "pdf" : "image",
          url: opt.battery.dataSheetUrl,
          name: `${opt.battery.brand}_Battery_Datasheet`,
        });
      }
      if (opt.panel?.dataSheetUrl) {
        const isPdf = opt.panel.dataSheetUrl.toLowerCase().includes(".pdf") || !opt.panel.dataSheetUrl.toLowerCase().match(/\.(jpg|jpeg|png|webp|gif|svg)/);
        list.push({
          type: isPdf ? "pdf" : "image",
          url: opt.panel.dataSheetUrl,
          name: `${opt.panel.brand}_Panel_Datasheet`,
        });
      }
    }
    return list;
  }, [folderPdfs, proposal, selectedIdx]);

  const attachmentStartPages = useMemo(() => {
    const starts: Record<string, number> = {};
    let currentStart = 7 + legalDocs.length;
    
    attachmentsList.forEach((att) => {
      starts[att.url] = currentStart;
      if (att.type === "pdf") {
        const count = pdfPageCounts[att.url] || 1;
        currentStart += count;
      } else {
        currentStart += 1;
      }
    });
    return starts;
  }, [attachmentsList, legalDocs.length, pdfPageCounts]);

  const totalPageCount = useMemo(() => {
    let count = 6 + legalDocs.length;
    attachmentsList.forEach((att) => {
      if (att.type === "pdf") {
        count += pdfPageCounts[att.url] || 1;
      } else {
        count += 1;
      }
    });
    return count;
  }, [attachmentsList, legalDocs.length, pdfPageCounts]);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center gap-2 text-muted-foreground bg-zinc-50">
        <Loader2 className="h-5 w-5 animate-spin" />
        <span className="text-sm">Generating High-Fidelity Proposal...</span>
      </div>
    );
  }

  if (!proposal || !metrics) {
    return <div className="p-8 text-center text-muted-foreground">Proposal data is incomplete or missing.</div>;
  }

  const primaryOption = proposal.options[selectedIdx] || proposal.options[0];

  return (
    <div className="bg-zinc-100 min-h-screen pb-12 font-sans print:bg-white print:p-0">
      
      {/* ── Control Bar (Hidden on Print) ── */}
      <div className="max-w-[210mm] mx-auto pt-8 pb-4 print:hidden flex justify-between items-center bg-white/40 backdrop-blur-md px-6 py-4 rounded-2xl border border-zinc-200/50 shadow-sm mb-6">
        <div>
          <h2 className="text-lg font-black text-slate-800">Proposal Document</h2>
          <div className="flex flex-col gap-1 mt-0.5">
            <p className="text-xs text-slate-500 font-medium">Optimized for A4 Printing</p>
            <div className="flex items-center gap-1.5 text-[10px] text-zinc-400 font-bold font-mono bg-zinc-200/40 px-2 py-0.5 rounded border border-zinc-200/30 w-fit mt-1">
              <span className="text-zinc-500">Filename:</span>
              <span className="text-emerald-700">{cleanRef}_v{printVersion}.pdf</span>
            </div>
          </div>
        </div>
        <Button onClick={async () => {
          // Trigger print immediately for 100% responsive, zero-delay print dialog popup
          window.print();

          // Write versioned print record & logs asynchronously in background if authenticated
          if (user) {
            try {
              await addDoc(collection(db, "pdf_prints"), {
                proposalId: id,
                qtnNo: proposal.qtnNo,
                propNo: proposal.propNo || "",
                version: printVersion,
                printedBy: user.uid,
                printedByEmail: user.email,
                printedByName: user.displayName || user.email || "User",
                timestamp: serverTimestamp(),
              });

              // Increment local printVersion count for subsequently opened prints in the same session
              setPrintVersion(prev => prev + 1);

              const { logActivityClient } = await import("@/lib/audit-logger-client");
              await logActivityClient(user, "PDF_GENERATE", {
                proposalId: id,
                qtnNo: proposal.qtnNo,
                propNo: proposal.propNo || "",
                customerName: proposal.customer.name,
                type: "proposal",
                version: printVersion,
                manualClick: true,
              });
            } catch (e) {
              console.error("Proposal print log failed:", e);
            }
          } else {
            console.warn("Skipping print logging: user is not authenticated.");
          }
        }} className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm font-semibold">
          <Printer className="h-4 w-4" />
          Print / Save PDF
        </Button>
      </div>

      {/* ── PAGE 1: COVER PAGE ── */}
      <div className="w-[210mm] min-h-[297mm] mx-auto bg-white shadow-md print:shadow-none relative overflow-hidden mb-8 print:mb-0" style={{ pageBreakAfter: "always" }}>
        
        {/* Decorative Top Banner */}
        <div className="absolute top-0 left-0 w-full h-[400px] bg-gradient-to-br from-emerald-950 via-slate-900 to-zinc-950 flex flex-col justify-between p-16 pb-12">
          {/* Subtle Grid Accent Pattern */}
          <div className="absolute inset-0 opacity-10 bg-[linear-gradient(to_right,#808080_1px,transparent_1px),linear-gradient(to_bottom,#808080_1px,transparent_1px)] bg-[size:24px_24px]"></div>
          
          <div className="relative z-10 flex justify-between items-start w-full">
            <Image src="/logo.png" alt="Alta Vision" width={220} height={80} className="object-contain brightness-0 invert opacity-95" priority />
            <div className="text-right">
              <span className="text-[10px] tracking-widest text-emerald-400 font-extrabold uppercase bg-emerald-950/60 border border-emerald-500/20 px-3 py-1 rounded-full">
                Energy Independence
              </span>
            </div>
          </div>
          
          <div className="relative z-10 space-y-3">
            <h1 className="text-5xl font-black text-white tracking-tight uppercase leading-[1.1]">
              Solar Energy<br/>
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-teal-300">System Proposal</span>
            </h1>
            <p className="text-slate-300 text-sm max-w-lg font-light leading-relaxed">
              Achieve absolute energy independence, offset utility inflation, and transition to world-class solar engineering.
            </p>
          </div>
          
          {/* Accent Line */}
          <div className="absolute bottom-0 left-0 w-full h-1.5 bg-gradient-to-r from-emerald-500 via-teal-400 to-emerald-500"></div>
        </div>

        <div className="pt-[440px] px-16 pb-12 h-full flex flex-col justify-between">
          
          <div className="space-y-6 flex-grow">
            {/* Grid details block */}
            <div className="grid grid-cols-2 gap-8">
              <div className="space-y-2">
                <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100 pb-1.5 flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500"></span> Prepared For
                </h3>
                <div className="space-y-1">
                  <p className="text-xl font-black text-slate-800 tracking-tight leading-tight">{proposal.customer.name}</p>
                  <p className="text-[11px] text-slate-500 whitespace-pre-wrap leading-relaxed max-w-[280px]">{proposal.customer.address}</p>
                  <div className="pt-1 text-[11px] text-slate-700 space-y-0.5">
                    {proposal.customer.phone && <p className="font-semibold text-slate-800 flex items-center gap-1">📞 {proposal.customer.phone}</p>}
                    {proposal.customer.phone2 && <p className="text-slate-500 ml-5">{proposal.customer.phone2}</p>}
                    {proposal.customer.email && <p className="text-slate-600 flex items-center gap-1">✉️ {proposal.customer.email}</p>}
                  </div>
                </div>
              </div>
              <div className="space-y-2">
                <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100 pb-1.5 flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500"></span> Proposal Details
                </h3>
                <div className="space-y-2 bg-slate-50/50 p-3.5 rounded-xl border border-slate-100/60">
                  <div className="flex justify-between items-center text-[11px]">
                    <span className="text-slate-400 font-medium">Proposal Ref:</span>
                    <span className="font-mono font-bold text-slate-800 bg-slate-200/50 px-2 py-0.5 rounded">{proposal.propNo || proposal.qtnNo}</span>
                  </div>
                  <div className="flex justify-between items-center text-[11px]">
                    <span className="text-slate-400 font-medium">Issue Date:</span>
                    <span className="font-bold text-slate-800">{proposal.date}</span>
                  </div>
                  <div className="flex justify-between items-center text-[11px]">
                    <span className="text-slate-400 font-medium">Valid Period:</span>
                    <span className="font-bold text-slate-800">
                      {proposal.validityPeriod
                        ? (proposal.validityPeriod.toLowerCase().includes("week") || proposal.validityPeriod.toLowerCase().includes("day")
                          ? proposal.validityPeriod
                          : `${proposal.validityPeriod} Days from Issue`)
                        : "14 Days from Issue"}
                    </span>
                  </div>
                  <div className="flex justify-between items-center text-[11px]">
                    <span className="text-slate-400 font-medium">System Type:</span>
                    <span className="font-extrabold text-emerald-600 bg-emerald-50 dark:bg-emerald-950/20 px-2 py-0.5 rounded border border-emerald-100/50">
                      {systemTypeText}
                    </span>
                  </div>
                </div>
              </div>
            </div>
 
            {/* Premium, Warm Cover Letter */}
            <div className="bg-gradient-to-r from-emerald-50/40 via-white to-slate-50/20 rounded-xl p-5 border-l-4 border-emerald-500 border-t border-r border-b border-slate-100 shadow-sm mt-4 space-y-2.5">
              <p className="text-[10px] font-black text-slate-800 uppercase tracking-widest mb-0.5 text-emerald-700">Cover Letter</p>
              <p className="text-[12px] text-slate-700 leading-relaxed font-semibold">
                Dear {proposal.customer.name.split(' ')[0] || 'Customer'},
              </p>
              <p className="text-[11.5px] text-slate-600 leading-relaxed text-justify">
                Thank you for giving Alta Vision Ltd the opportunity to present this customized Solar Energy System Proposal. We bring together the world's most trusted solar hardware with unparalleled engineering standards to deliver the finest energy solutions in Sri Lanka.
              </p>
              <p className="text-[11.5px] text-slate-600 leading-relaxed text-justify">
                In today's fast-changing economic climate, transitioning to sustainable energy represents one of the most reliable and immediate return-on-investment strategies for homes and businesses. We stand fully committed to powering your home with premium infrastructure built to last for generations.
              </p>
              <div className="pt-2 flex justify-between items-end">
                <div>
                  <p className="text-[11px] font-bold text-slate-800">Sincerely,</p>
                  <p className="text-[10px] font-medium text-slate-500 mt-0.5">The Alta Vision Engineering Team</p>
                  <p className="text-[9.5px] text-emerald-600 font-bold">Alta Vision Solar (Pvt) Ltd</p>
                </div>
                <div className="text-right">
                  {/* Subtle vector signature design or placeholder graphic */}
                  <div className="h-4 border-b border-slate-300 w-24 ml-auto opacity-40"></div>
                  <p className="text-[9.5px] text-slate-400 mt-0.5 uppercase tracking-widest font-mono">Approved Seal</p>
                </div>
              </div>
            </div>
          </div>
 
          <BrandFooter pageNum={1} qtnNo={proposal.propNo || proposal.qtnNo} totalPages={totalPageCount} />
        </div>
      </div>

      {/* ── PAGE 2: COMPANY ABOUT & CONTACT INFO ── */}
      <div className="w-[210mm] min-h-[297mm] mx-auto bg-white shadow-md print:shadow-none p-12 flex flex-col mb-8 print:mb-0 relative overflow-hidden" style={{ pageBreakAfter: "always" }}>
        
        {/* Curvy Premium Letterhead Accent with Integrated Icon */}
        <div className="absolute top-0 right-0 w-[200px] h-[52px] bg-emerald-500/10 rounded-bl-[45px] flex items-center justify-end pr-6 pb-1 gap-2">
          <Image src="/icon.png" alt="Alta Vision Icon" width={14} height={14} className="object-contain opacity-90" />
          <span className="text-[8px] font-bold text-emerald-800 tracking-widest uppercase">Alta Vision Solar</span>
        </div>

        {/* Company Header Block */}
        <div className="flex flex-col items-center justify-center mt-6 mb-8 text-center">
          <Image src="/logo.png" alt="Alta Vision Logo" width={220} height={80} className="object-contain opacity-95 mb-3" priority />
          <h2 className="text-2xl font-black text-slate-800 tracking-tight">Alta Vision (Pvt) Ltd</h2>
          <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mt-1.5">Business Reg. No: PV 90948</p>
          <p className="text-[10px] text-emerald-600 font-extrabold uppercase tracking-widest mt-0.5">Sustainable Energy Authority Reg No: S0058</p>
        </div>

        <div className="space-y-8 flex-grow">
          {/* Offices 3-Column Grid */}
          <div className="grid grid-cols-3 gap-5">
            <div className="bg-slate-50 border border-slate-200/60 rounded-xl p-5 space-y-2 shadow-sm flex flex-col justify-between min-h-[140px]">
              <div>
                <p className="font-black text-slate-800 uppercase tracking-widest text-[9px] text-emerald-700">Reg. Office</p>
                <p className="text-xs text-slate-600 mt-2 leading-relaxed font-medium">
                  42, Ruhunusiri Garden,<br />
                  Hakmana Road,<br />
                  Matara.
                </p>
              </div>
              <p className="font-bold text-slate-800 text-xs border-t border-slate-200/60 pt-2 flex items-center gap-1">📞 0717 666 555</p>
            </div>
            
            <div className="bg-slate-50 border border-slate-200/60 rounded-xl p-5 space-y-2 shadow-sm flex flex-col justify-between min-h-[140px]">
              <div>
                <p className="font-black text-slate-800 uppercase tracking-widest text-[9px] text-emerald-700">Main Office</p>
                <p className="text-xs text-slate-600 mt-2 leading-relaxed font-medium">
                  No 23D, Sri Rathanapala<br />
                  Mawatha,<br />
                  Nupe, Matara.
                </p>
              </div>
              <p className="font-bold text-slate-800 text-xs border-t border-slate-200/60 pt-2 flex items-center gap-1">📞 041 300 30 10</p>
            </div>
            
            <div className="bg-slate-50 border border-slate-200/60 rounded-xl p-5 space-y-2 shadow-sm flex flex-col justify-between min-h-[140px]">
              <div>
                <p className="font-black text-slate-800 uppercase tracking-widest text-[9px] text-emerald-700">Head Office</p>
                <p className="text-xs text-slate-600 mt-2 leading-relaxed font-medium">
                  298A, Borella Road,<br />
                  Habarakada,<br />
                  Homagama.
                </p>
              </div>
              <p className="font-bold text-slate-800 text-xs border-t border-slate-200/60 pt-2 flex items-center gap-1">📞 0113 601 100</p>
            </div>
          </div>

          {/* Social Links Row */}
          <div className="bg-gradient-to-r from-emerald-500 via-teal-600 to-emerald-500 rounded-xl p-3 flex justify-around items-center text-[10px] text-white font-black uppercase tracking-wider shadow-sm">
            <span className="flex items-center gap-1">📞 0717 666 555</span>
            <span className="flex items-center gap-1">✉️ info@altavision.lk</span>
            <span className="flex items-center gap-1">🌐 www.altavision.lk</span>
            <span className="flex items-center gap-1">👥 fb.com/altavision.solar</span>
          </div>

          {/* Contact Cards */}
          <div className="space-y-3.5">
            <h3 className="text-center font-black text-slate-400 uppercase tracking-widest text-[10px] letter-spacing-[0.1em]">Engineers / Contact Us</h3>
            <div className="grid grid-cols-2 gap-6">
              <div className="bg-white border border-slate-200 shadow-sm rounded-xl p-5 relative overflow-hidden flex flex-col justify-between min-h-[130px]">
                <div className="absolute top-0 left-0 w-full h-1 bg-emerald-500"></div>
                <div>
                  <p className="font-black text-slate-800 text-sm">{engineers.engineer1.name}</p>
                  <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wider mt-0.5">{engineers.engineer1.designation}</p>
                </div>
                <div className="mt-4 pt-3 border-t border-slate-100 text-xs text-slate-600 space-y-1 font-medium">
                  <p className="text-slate-800">📞 {engineers.engineer1.phone}</p>
                  <p className="text-[11px] text-slate-500">✉️ {engineers.engineer1.email}</p>
                </div>
              </div>
              
              <div className="bg-white border border-slate-200 shadow-sm rounded-xl p-5 relative overflow-hidden flex flex-col justify-between min-h-[130px]">
                <div className="absolute top-0 left-0 w-full h-1 bg-emerald-500"></div>
                <div>
                  <p className="font-black text-slate-800 text-sm">{engineers.engineer2.name}</p>
                  <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wider mt-0.5">{engineers.engineer2.designation}</p>
                </div>
                <div className="mt-4 pt-3 border-t border-slate-100 text-xs text-slate-600 space-y-1 font-medium">
                  <p className="text-slate-800">📞 {engineers.engineer2.phone}</p>
                  <p className="text-[11px] text-slate-500">✉️ {engineers.engineer2.email}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Legal Disclaimer / Confidentiality Notice */}
          <div className="bg-slate-50 border border-slate-200/60 rounded-xl p-5 shadow-sm">
            <h4 className="text-[9px] font-black text-slate-400 uppercase tracking-wider mb-2">Legal Disclaimer & Confidentiality Notice</h4>
            <p className="text-[10px] text-slate-500 text-justify leading-relaxed">
              The Client shall not disclose the information in this document to any other person or corporation other than those employed by Alta Vision (Pvt) Ltd. No part of this publication may be reproduced, transmitted, transcribed, stored in a retrieval system, or translated into any language, in any form or by any means, electronic, mechanical, photocopying, recording, or otherwise, without prior written permission from Alta Vision (Pvt) Ltd.
            </p>
          </div>
        </div>

        <BrandFooter pageNum={2} qtnNo={proposal.propNo || proposal.qtnNo} totalPages={totalPageCount} />
      </div>

      {/* ── PAGE 3: SYSTEM OVERVIEW & IMPACT ── */}
      <div className="w-[210mm] min-h-[297mm] mx-auto bg-white shadow-md print:shadow-none p-12 flex flex-col mb-8 print:mb-0 relative overflow-hidden" style={{ pageBreakAfter: "always" }}>
        
        {/* Curvy Premium Letterhead Accent with Integrated Icon */}
        <div className="absolute top-0 right-0 w-[200px] h-[52px] bg-emerald-500/10 rounded-bl-[45px] flex items-center justify-end pr-6 pb-1 gap-2">
          <Image src="/icon.png" alt="Alta Vision Icon" width={14} height={14} className="object-contain opacity-90" />
          <span className="text-[8px] font-bold text-emerald-800 tracking-widest uppercase">Alta Vision Solar</span>
        </div>

        <h2 className="text-3xl font-black text-slate-800 mb-4 border-b-2 border-emerald-500 pb-4 inline-block pr-12 mt-6">Selected System Option</h2>
        
        <div className="grid grid-cols-3 gap-5 mb-6">
          <div className="bg-slate-50 border border-slate-200/60 rounded-2xl p-5 shadow-sm flex flex-col justify-between min-h-[120px]">
            <div>
              <div className="flex items-center gap-1.5 text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">
                <Zap className="h-4 w-4 text-emerald-500 shrink-0" />
                <span>System Size</span>
              </div>
              <p className="text-2xl font-black text-slate-800 tracking-tight flex items-baseline mt-4">
                <span>{metrics.totalCapacityKw}</span>
                <span className="text-xs font-extrabold text-slate-400 ml-1">kWp</span>
              </p>
            </div>
          </div>
          
          <div className="bg-slate-50 border border-slate-200/60 rounded-2xl p-5 shadow-sm flex flex-col justify-between min-h-[120px]">
            <div>
              <div className="flex items-center gap-1.5 text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">
                <Banknote className="h-4 w-4 text-emerald-500 shrink-0" />
                <span>Annual Savings</span>
              </div>
              <p className="text-2xl font-black text-slate-800 tracking-tight flex items-baseline mt-4 whitespace-nowrap">
                <span className="text-xs font-bold text-slate-400 mr-0.5">Rs.</span>
                <span>{Math.round(metrics.financial.annualSavings).toLocaleString("en-US")}</span>
              </p>
            </div>
          </div>
          
          <div className="bg-emerald-50 border border-emerald-200/60 rounded-2xl p-5 shadow-sm flex flex-col justify-between min-h-[120px]">
            <div>
              <div className="flex items-center gap-1.5 text-[10px] font-black text-emerald-700 uppercase tracking-widest mb-2">
                <Activity className="h-4 w-4 text-emerald-600 shrink-0" />
                <span>Total Investment</span>
              </div>
              <p className="text-2xl font-black text-emerald-800 tracking-tight flex items-baseline mt-4 whitespace-nowrap">
                <span className="text-xs font-bold text-emerald-600/80 mr-0.5">Rs.</span>
                <span>{Math.round(primaryOption.pricing.totalPrice).toLocaleString("en-US")}</span>
              </p>
            </div>
          </div>
        </div>

        <h3 className="text-xl font-bold text-slate-800 mb-6">Your Solution Hardware</h3>
        
        <div className="space-y-4 mb-12 flex-grow">
          {/* Inverter */}
          <div className="flex items-start justify-between gap-4 p-5 rounded-xl border border-slate-100 bg-white shadow-sm">
            <div className="flex items-start gap-4">
              <div className="bg-slate-100 p-3 rounded-lg"><Activity className="h-6 w-6 text-slate-600" /></div>
              <div>
                <p className="text-lg font-bold text-slate-800">{primaryOption.inverter.brand} Hybrid Inverter</p>
                <p className="text-sm text-slate-500 mt-1">{primaryOption.inverter.qty} × {primaryOption.inverter.model}</p>
                <div className="flex gap-4 mt-3">
                  <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600 bg-emerald-50 px-2 py-1 rounded-md"><ShieldCheck className="h-3 w-3"/> {primaryOption.inverter.warranty || "5"} Yr Warranty</span>
                </div>
              </div>
            </div>
            {primaryOption.inverter.dataSheetUrl && (
              <a
                href={primaryOption.inverter.dataSheetUrl}
                target="_blank"
                rel="noreferrer"
                className="print:hidden shrink-0 inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-700 transition-all hover:bg-emerald-100 shadow-sm"
              >
                📥 Datasheet
              </a>
            )}
          </div>

          {/* Battery */}
          {primaryOption.battery && (
            <div className="flex items-start justify-between gap-4 p-5 rounded-xl border border-slate-100 bg-white shadow-sm">
              <div className="flex items-start gap-4">
                <div className="bg-slate-100 p-3 rounded-lg"><Battery className="h-6 w-6 text-slate-600" /></div>
                <div>
                  <p className="text-lg font-bold text-slate-800">{primaryOption.battery.brand} Energy Storage</p>
                  <p className="text-sm text-slate-500 mt-1">{primaryOption.battery.qty} × {primaryOption.battery.ratingLabel || primaryOption.battery.model}</p>
                  <div className="flex gap-4 mt-3">
                    <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600 bg-emerald-50 px-2 py-1 rounded-md"><ShieldCheck className="h-3 w-3"/> {primaryOption.battery.warranty || "5"} Yr Warranty</span>
                  </div>
                </div>
              </div>
              {primaryOption.battery.dataSheetUrl && (
                <a
                  href={primaryOption.battery.dataSheetUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="print:hidden shrink-0 inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-700 transition-all hover:bg-emerald-100 shadow-sm"
                >
                  📥 Datasheet
                </a>
              )}
            </div>
          )}

          {/* Panels */}
          <div className="flex items-start justify-between gap-4 p-5 rounded-xl border border-slate-100 bg-white shadow-sm">
            <div className="flex items-start gap-4">
              <div className="bg-slate-100 p-3 rounded-lg"><Sun className="h-6 w-6 text-slate-600" /></div>
              <div>
                <p className="text-lg font-bold text-slate-800">{primaryOption.panel.brand} Solar Panels</p>
                <p className="text-sm text-slate-500 mt-1">{primaryOption.panel.qty} × {primaryOption.panel.ratingLabel || primaryOption.panel.model}</p>
                <div className="flex gap-4 mt-3">
                  <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600 bg-emerald-50 px-2 py-1 rounded-md"><ShieldCheck className="h-3 w-3"/> 25 Yr Product Warranty</span>
                  <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600 bg-emerald-50 px-2 py-1 rounded-md"><CheckCircle2 className="h-3 w-3"/> Tier 1 Efficiency</span>
                </div>
              </div>
            </div>
            {primaryOption.panel.dataSheetUrl && (
              <a
                href={primaryOption.panel.dataSheetUrl}
                target="_blank"
                rel="noreferrer"
                className="print:hidden shrink-0 inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-700 transition-all hover:bg-emerald-100 shadow-sm"
              >
                📥 Datasheet
              </a>
            )}
          </div>
        </div>

        {/* Environmental Impact */}
        <div className="bg-slate-900 rounded-2xl p-8 text-white">
          <h3 className="text-lg font-bold mb-6 flex items-center gap-2"><Leaf className="h-5 w-5 text-emerald-400"/> Environmental Impact (Annual)</h3>
          <div className="grid grid-cols-3 gap-6">
            <div>
              <p className="text-3xl font-black text-emerald-400">{metrics.environmental.co2SavedKgPerYear.toLocaleString()} kg</p>
              <p className="text-xs text-slate-400 mt-1 uppercase tracking-wider">CO₂ Avoided</p>
            </div>
            <div>
              <p className="text-3xl font-black text-emerald-400">{metrics.environmental.treesPlanted.toLocaleString()}</p>
              <p className="text-xs text-slate-400 mt-1 uppercase tracking-wider">Trees Planted Eq.</p>
            </div>
            <div>
              <p className="text-3xl font-black text-emerald-400">{Math.round(metrics.environmental.co2SavedKgPerYear * 0.413).toLocaleString()} kg</p>
              <p className="text-xs text-slate-400 mt-1 uppercase tracking-wider">Coal Saved</p>
            </div>
          </div>
        </div>

        <BrandFooter pageNum={3} qtnNo={proposal.propNo || proposal.qtnNo} totalPages={totalPageCount} />
      </div>

      {/* ── PAGE 4: ANCILLARY & OTHER COMPONENTS ── */}
      <div className="w-[210mm] min-h-[297mm] mx-auto bg-white shadow-md print:shadow-none p-12 flex flex-col mb-8 print:mb-0 relative overflow-hidden" style={{ pageBreakAfter: "always" }}>
        
        {/* Curvy Premium Letterhead Accent with Integrated Icon */}
        <div className="absolute top-0 right-0 w-[200px] h-[52px] bg-emerald-500/10 rounded-bl-[45px] flex items-center justify-end pr-6 pb-1 gap-2">
          <Image src="/icon.png" alt="Alta Vision Icon" width={14} height={14} className="object-contain opacity-90" />
          <span className="text-[8px] font-bold text-emerald-800 tracking-widest uppercase">Alta Vision Solar</span>
        </div>

        <h2 className="text-3xl font-black text-slate-800 mb-2 border-b-2 border-emerald-500 pb-4 inline-block pr-12 mt-6">Ancillary & Other Components</h2>
        <p className="text-xs text-slate-500 mb-4 font-medium">High-quality cabling, protection switchgear, mounting kits, and installation materials engineered for your system.</p>

        <div className="space-y-4 flex-grow">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-slate-200 text-slate-400 font-bold uppercase tracking-wider text-[10px]">
                <th className="py-2.5 pr-4 font-black">Item Component</th>
                <th className="py-2.5 px-4 font-black">Technical Specifications</th>
                <th className="py-2.5 pl-4 text-right font-black">Warranty</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              
              {/* Category: Cabling Systems */}
              <tr className="bg-slate-50/50">
                <td colSpan={3} className="py-1.5 px-3 font-extrabold text-emerald-700 uppercase tracking-widest text-[9px]">Cables & Connection Systems</td>
              </tr>
              {primaryOption.panel && primaryOption.panel.qty > 0 && (
                <tr>
                  <td className="py-1.5 pr-4 font-bold text-slate-800 pl-3">Solar DC Cable</td>
                  <td className="py-1.5 px-4 text-slate-600">4mm² / 6mm² PV1-F UV-protected solar dedicated cables (German/Equivalent)</td>
                  <td className="py-1.5 pl-4 text-right text-emerald-600 font-extrabold">3 Years</td>
                </tr>
              )}
              {primaryOption.battery && primaryOption.battery.qty > 0 && (
                <tr>
                  <td className="py-1.5 pr-4 font-bold text-slate-800 pl-3">Battery Power Cable</td>
                  <td className="py-1.5 px-4 text-slate-600">25mm² / 35mm² Extra-flexible high-current pure copper battery connection cables</td>
                  <td className="py-1.5 pl-4 text-right text-emerald-600 font-extrabold">3 Years</td>
                </tr>
              )}
              <tr>
                <td className="py-1.5 pr-4 font-bold text-slate-800 pl-3">AC Cables</td>
                <td className="py-1.5 px-4 text-slate-600">Multi-core PVC insulated unarmoured/armoured copper cables for inverter-to-grid connection</td>
                <td className="py-1.5 pl-4 text-right text-emerald-600 font-extrabold">3 Years</td>
              </tr>
              <tr>
                <td className="py-1.5 pr-4 font-bold text-slate-800 pl-3">Earth Cables</td>
                <td className="py-1.5 px-4 text-slate-600">6mm² / 10mm² green-yellow standard grounding wire complete with copper-coated earth rod</td>
                <td className="py-1.5 pl-4 text-right text-emerald-600 font-extrabold">3 Years</td>
              </tr>

              {/* Category: Switch gears & Protection */}
              <tr className="bg-slate-50/50">
                <td colSpan={3} className="py-1.5 px-3 font-extrabold text-emerald-700 uppercase tracking-widest text-[9px]">Protection Switchgear & Isolation</td>
              </tr>
              <tr>
                <td className="py-1.5 pr-4 font-bold text-slate-800 pl-3">AC Breakers (MCB/MCCB)</td>
                <td className="py-1.5 px-4 text-slate-600">Miniature Circuit Breakers & RCD protection tailored for safe AC isolation</td>
                <td className="py-1.5 pl-4 text-right text-emerald-600 font-extrabold">3 Years</td>
              </tr>
              {primaryOption.panel && primaryOption.panel.qty > 0 && (
                <tr>
                  <td className="py-1.5 pr-4 font-bold text-slate-800 pl-3">DC Breakers & SPD</td>
                  <td className="py-1.5 px-4 text-slate-600">High-voltage 600V/1000V DC MCB and DC Surge Protection Device (SPD)</td>
                  <td className="py-1.5 pl-4 text-right text-emerald-600 font-extrabold">3 Years</td>
                </tr>
              )}
              {(proposal.sysType.toLowerCase() === "ongrid" || proposal.sysType.toLowerCase() === "hybrid") && (
                <tr>
                  <td className="py-1.5 pr-4 font-bold text-slate-800 pl-3">AC Lockable Isolator</td>
                  <td className="py-1.5 px-4 text-slate-600">Weatherproof IP66 external lockable isolator switch required by Utility Authorities (CEB/LECO)</td>
                  <td className="py-1.5 pl-4 text-right text-emerald-600 font-extrabold">3 Years</td>
                </tr>
              )}

              {/* Category: Structural Mounting */}
              {primaryOption.panel && primaryOption.panel.qty > 0 && (
                <>
                  <tr className="bg-slate-50/50">
                    <td colSpan={3} className="py-1.5 px-3 font-extrabold text-emerald-700 uppercase tracking-widest text-[9px]">Mounting Structure & Materials</td>
                  </tr>
                  <tr>
                    <td className="py-1.5 pr-4 font-bold text-slate-800 pl-3">Mounting Structure</td>
                    <td className="py-1.5 px-4 text-slate-600">Anodized aluminum rails, L-feet/hanger bolts, mid & end clamps matching panel dimensions</td>
                    <td className="py-1.5 pl-4 text-right text-emerald-600 font-extrabold">3 Years</td>
                  </tr>
                  <tr>
                    <td className="py-1.5 pr-4 font-bold text-slate-800 pl-3">Mounting Materials</td>
                    <td className="py-1.5 px-4 text-slate-600">SUS304 Stainless steel bolts, nuts, washers, concrete anchors and hardware fittings</td>
                    <td className="py-1.5 pl-4 text-right text-emerald-600 font-extrabold">3 Years</td>
                  </tr>
                </>
              )}

              {/* Category: Enclosures & Enclosure accessories */}
              <tr className="bg-slate-50/50">
                <td colSpan={3} className="py-1.5 px-3 font-extrabold text-emerald-700 uppercase tracking-widest text-[9px]">Distribution Enclosures & Routing</td>
              </tr>
              <tr>
                <td className="py-1.5 pr-4 font-bold text-slate-800 pl-3">Enclosure boxes, Conduits, etc.</td>
                <td className="py-1.5 px-4 text-slate-600">IP65 weatherproof ABS/Metal enclosures, heavy-duty PVC conduits, trunking, and layout fittings</td>
                <td className="py-1.5 pl-4 text-right text-emerald-600 font-extrabold">3 Years</td>
              </tr>

            </tbody>
          </table>

          {/* Dynamic Warranty Note & Terms Box */}
          <div className="bg-gradient-to-r from-emerald-50 via-white to-slate-50 border border-slate-200/80 rounded-2xl p-5 shadow-sm mt-8 space-y-4">
            <div className="flex items-center gap-2">
              <span className="bg-emerald-500 text-white rounded-full p-1 text-[10px] font-black shrink-0">✓</span>
              <p className="text-xs font-black text-slate-800 tracking-tight">Ancillary & Electrical Component Warranty Information</p>
            </div>
            <p className="text-[11px] text-slate-600 leading-relaxed pl-6">
              All the components offered in this proposal (cabling networks, protection isolators, switches, structural mounts and enclosures) carry a premium <strong className="font-black text-slate-800">3 Years Product Warranty</strong> against any manufacturing defect.
            </p>
            <div className="border-t border-slate-100 pt-3 pl-6 grid grid-cols-1 md:grid-cols-2 gap-3 text-[10px] text-slate-500 font-semibold">
              <div className="flex items-start gap-1.5">
                <span className="text-emerald-500 text-xs mt-0.5">•</span>
                <span>20+ years performance warranty </span>
              </div>
              <div className="flex items-start gap-1.5">
                <span className="text-emerald-500 text-xs mt-0.5">•</span>
                <span>Number of Panels depends on panel capacity.</span>
              </div>
            </div>
          </div>
        </div>

        <BrandFooter pageNum={4} qtnNo={proposal.propNo || proposal.qtnNo} totalPages={totalPageCount} />
      </div>

      {/* ── PAGE 5: PERFORMANCE & ROI ── */}
      <div className="w-[210mm] min-h-[297mm] mx-auto bg-white shadow-md print:shadow-none p-12 flex flex-col mb-8 print:mb-0 relative overflow-hidden" style={{ pageBreakAfter: "always" }}>
        
        {/* Curvy Premium Letterhead Accent with Integrated Icon */}
        <div className="absolute top-0 right-0 w-[200px] h-[52px] bg-emerald-500/10 rounded-bl-[45px] flex items-center justify-end pr-6 pb-1 gap-2">
          <Image src="/icon.png" alt="Alta Vision Icon" width={14} height={14} className="object-contain opacity-90" />
          <span className="text-[8px] font-bold text-emerald-800 tracking-widest uppercase">Alta Vision Solar</span>
        </div>

        <h2 className="text-3xl font-black text-slate-800 mb-4 border-b-2 border-emerald-500 pb-4 inline-block pr-12 mt-6">Performance & ROI</h2>

        <div className="grid grid-cols-4 gap-4 mb-6">
          {/* Card 1: Annual Output */}
          <div className="bg-slate-50 border border-slate-200/60 rounded-2xl p-5 shadow-sm flex flex-col justify-between min-h-[125px]">
            <div>
              <div className="flex items-center gap-1.5 text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">
                <Zap className="h-4 w-4 text-emerald-500 shrink-0" />
                <span>Annual Output</span>
              </div>
              <p className="text-2xl font-black text-slate-800 tracking-tight mt-1 flex items-baseline">
                <span>{metrics.annualGenerationKwh.toLocaleString()}</span>
                <span className="text-xs font-bold text-slate-400 ml-1">kWh</span>
              </p>
            </div>
            <p className="text-[10px] text-slate-400 font-bold mt-2">Projected yearly yield</p>
          </div>

          {/* Card 2: Lifetime Generation */}
          <div className="bg-slate-50 border border-slate-200/60 rounded-2xl p-5 shadow-sm flex flex-col justify-between min-h-[125px]">
            <div>
              <div className="flex items-center gap-1.5 text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">
                <Leaf className="h-4 w-4 text-emerald-500 shrink-0" />
                <span>25-Yr Lifetime</span>
              </div>
              <p className="text-2xl font-black text-slate-800 tracking-tight mt-1 flex items-baseline">
                <span>{metrics.financial.lifetimeGenerationMwh.toLocaleString()}</span>
                <span className="text-xs font-bold text-slate-400 ml-1">MWh</span>
              </p>
            </div>
            <p className="text-[10px] text-slate-400 font-bold mt-2">Clean energy production</p>
          </div>

          {/* Card 3: Break-Even Point */}
          <div className="bg-emerald-50/60 border border-emerald-200/55 rounded-2xl p-5 shadow-sm flex flex-col justify-between min-h-[125px]">
            <div>
              <div className="flex items-center gap-1.5 text-[10px] font-black text-emerald-700 uppercase tracking-widest mb-3">
                <Activity className="h-4 w-4 text-emerald-600 shrink-0" />
                <span>Payback Period</span>
              </div>
              <p className="text-2xl font-black text-emerald-800 tracking-tight mt-1 flex items-baseline">
                <span>{metrics.financial.breakEvenYears}</span>
                <span className="text-xs font-bold text-emerald-600/70 ml-1">Years</span>
              </p>
            </div>
            <p className="text-[10px] text-emerald-600/70 font-black mt-2">100% profit thereafter</p>
          </div>

          {/* Card 4: Net Profit */}
          <div className="bg-emerald-600 border border-emerald-500 rounded-2xl p-5 shadow-sm flex flex-col justify-between min-h-[125px] text-white">
            <div>
              <div className="flex items-center gap-1.5 text-[10px] font-black text-emerald-100 uppercase tracking-widest mb-3">
                <Banknote className="h-4 w-4 text-emerald-200 shrink-0" />
                <span>25-Yr Net Profit</span>
              </div>
              <p className="text-lg font-black tracking-tight mt-1 text-white leading-snug">
                Rs. {(metrics.financial.lifetimeProfit / 1000000).toFixed(2)} Million
              </p>
            </div>
            <p className="text-[10px] text-emerald-100/80 font-bold mt-2">Estimated total return</p>
          </div>
        </div>

        <h3 className="text-xl font-bold text-slate-800 mb-1">Monthly Generation & Savings</h3>
        <p className="text-xs text-slate-500 mb-4 font-medium">Estimated values based on historical solar irradiance averages for Sri Lanka. Actual performance may vary.</p>
        
        <div className="border border-slate-200/80 rounded-xl overflow-hidden flex-grow mb-4 shadow-sm">
          <table className="w-full text-[11px] text-left">
            <thead className="bg-slate-50 text-slate-600 font-bold uppercase text-[9px] tracking-wider border-b border-slate-200">
              <tr>
                <th className="px-6 py-1.5">Month</th>
                <th className="px-6 py-1.5 text-center">Avg Daily Sun</th>
                <th className="px-6 py-1.5 text-right">Generation</th>
                <th className="px-6 py-1.5 text-right">Est. Savings</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {metrics.monthlyData.map((m) => (
                <tr key={m.month} className="hover:bg-slate-50/50 even:bg-slate-50/20">
                  <td className="px-6 py-1 font-bold text-slate-800">{m.month}</td>
                  <td className="px-6 py-1">
                    <div className="flex items-center justify-center gap-2">
                      <span className="text-slate-600 font-bold w-10 text-center">{m.sunHours} hrs</span>
                      <div className="w-16 h-1 bg-slate-100 rounded-full overflow-hidden shrink-0">
                        <div className="bg-amber-400 h-full rounded-full" style={{ width: `${(m.sunHours / 6.5) * 100}%` }}></div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-1 text-right font-bold text-emerald-600">{m.generation.toLocaleString()} kWh</td>
                  <td className="px-6 py-1 text-right font-bold text-slate-800">{fmtRs(m.savings)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-slate-100/80 font-black border-t border-slate-200 text-slate-800 text-[11px]">
              <tr>
                <td className="px-6 py-2 text-slate-800">ANNUAL TOTAL</td>
                <td className="px-6 py-2 text-center text-slate-400">—</td>
                <td className="px-6 py-2 text-right text-emerald-600 font-black">{metrics.annualGenerationKwh.toLocaleString()} kWh</td>
                <td className="px-6 py-2 text-right text-slate-800 font-black">{fmtRs(metrics.financial.annualSavings)}</td>
              </tr>
            </tfoot>
          </table>
        </div>

        <BrandFooter pageNum={5} qtnNo={proposal.propNo || proposal.qtnNo} totalPages={totalPageCount} />
      </div>

      {/* ── PAGE 6: DETAILED OPTIONS PRICING ── */}
      <div className="w-[210mm] min-h-[297mm] mx-auto bg-white shadow-md print:shadow-none p-12 flex flex-col mb-8 print:mb-0 relative overflow-hidden" style={{ pageBreakAfter: "always" }}>
        
        {/* Curvy Premium Letterhead Accent with Integrated Icon */}
        <div className="absolute top-0 right-0 w-[200px] h-[52px] bg-emerald-500/10 rounded-bl-[45px] flex items-center justify-end pr-6 pb-1 gap-2">
          <Image src="/icon.png" alt="Alta Vision Icon" width={14} height={14} className="object-contain opacity-90" />
          <span className="text-[8px] font-bold text-emerald-800 tracking-widest uppercase">Alta Vision Solar</span>
        </div>

        <h2 className="text-3xl font-black text-slate-800 mb-3 border-b-2 border-emerald-500 pb-4 inline-block pr-12 mt-6">Detailed Cost Breakdown</h2>

        <div className="space-y-3 flex-grow">
          {proposal.options.map((opt, i) => {
            const isSelected = i === selectedIdx;
            return (
              <div key={i} className={`rounded-xl border ${isSelected ? 'border-emerald-500 shadow-sm bg-emerald-50/10' : 'border-slate-200 bg-white'}`}>
                <div className={`p-2.5 border-b ${isSelected ? 'bg-emerald-600 border-emerald-600 text-white rounded-t-xl' : 'bg-slate-50 border-slate-200 rounded-t-xl'} flex justify-between items-center`}>
                  <div className="flex items-center gap-2">
                    <h3 className={`font-black text-base ${isSelected ? 'text-white' : 'text-slate-800'}`}>{opt.label}</h3>
                    {isSelected ? (
                      <span className="text-[9px] font-black bg-emerald-500 text-white px-2 py-0.5 rounded-full uppercase tracking-wider inline-flex items-center gap-1 border border-emerald-400">
                        <CheckCircle2 className="h-2.5 w-2.5 shrink-0" /> Selected Option
                      </span>
                    ) : (
                      <span className="text-[9px] font-bold bg-slate-200/80 text-slate-600 px-2 py-0.5 rounded-full uppercase tracking-wider inline-flex items-center">
                        Available Choice
                      </span>
                    )}
                  </div>
                  <p className={`font-mono text-[10px] ${isSelected ? 'text-emerald-100 font-bold' : 'text-slate-500'}`}>
                    System Capacity: {((opt.panel.qty || 0) * parseWatts(opt.panel.ratingLabel) / 1000).toFixed(2)} kWp
                  </p>
                </div>
                <div className="p-3">
                  <table className="w-full text-[11px] text-left mb-2">
                    <thead className="text-[9px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100">
                      <tr>
                        <th className="pb-1">Component</th>
                        <th className="pb-1 text-center w-16">Qty</th>
                        <th className="pb-1 text-right">Details</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      <tr>
                        <td className="py-1.5 font-bold text-slate-800">Solar Panels</td>
                        <td className="py-1.5 text-center text-slate-600 font-semibold">{opt.panel.qty}</td>
                        <td className="py-1.5 text-right font-medium text-slate-600">{opt.panel.brand} {opt.panel.ratingLabel}</td>
                      </tr>
                      <tr>
                        <td className="py-1.5 font-bold text-slate-800">Hybrid Inverter</td>
                        <td className="py-1.5 text-center text-slate-600 font-semibold">{opt.inverter.qty}</td>
                        <td className="py-1.5 text-right font-medium text-slate-600">{opt.inverter.brand} {opt.inverter.model}</td>
                      </tr>
                      {opt.battery && opt.battery.qty > 0 && (
                        <tr>
                           <td className="py-1.5 font-bold text-slate-800">Energy Storage</td>
                           <td className="py-1.5 text-center text-slate-600 font-semibold">{opt.battery.qty}</td>
                           <td className="py-1.5 text-right font-medium text-slate-600">{opt.battery.brand} {opt.battery.ratingLabel || opt.battery.model}</td>
                        </tr>
                      )}
                      <tr>
                        <td className="py-1.5 font-bold text-slate-800">Installation & Mounting</td>
                        <td className="py-1.5 text-center text-slate-600 font-semibold">1</td>
                        <td className="py-1.5 text-right font-medium text-slate-600">Standard Roof Mounting Kit, AC/DC Cabling, Earthing</td>
                      </tr>
                    </tbody>
                  </table>
                  <div className={`p-2.5 rounded-lg flex justify-between items-center border ${isSelected ? 'bg-emerald-50 border-emerald-100' : 'bg-slate-50 border-slate-100'}`}>
                    <span className="font-extrabold text-slate-800 text-[10px] uppercase tracking-wider">Total System Investment</span>
                    <span className={`text-xl font-black ${isSelected ? 'text-emerald-700' : 'text-slate-800'}`}>{fmtRs(opt.pricing.totalPrice)}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Dynamic Actionable Custom Change Notice */}
        <div className="bg-gradient-to-r from-slate-50 via-white to-slate-50 border border-slate-200/80 rounded-xl p-3.5 shadow-sm mt-4 space-y-2">
          <div className="flex items-center gap-2">
            <span className="bg-emerald-500 text-white rounded-full h-4 w-4 flex items-center justify-center text-[9px] font-black shrink-0">i</span>
            <p className="text-xs font-black text-slate-800 tracking-tight">Need a custom capacity or alternative configuration?</p>
          </div>
          <p className="text-[11px] text-slate-600 leading-relaxed pl-6 font-semibold">
            The selected system option highlighted in green is optimized for your exact energy profile. If you wish to purchase one of the other <span className="text-slate-800 font-black">Available Choices</span> instead, or require a custom configuration, please <span className="text-emerald-600 font-black">contact us again</span>. We will immediately draft a brand new tailored proposal matching your updated requirements.
          </p>
        </div>

        <BrandFooter pageNum={6} qtnNo={proposal.propNo || proposal.qtnNo} totalPages={totalPageCount} />
      </div>

      {/* ── PAGE 7+: LEGAL DOCS ── */}
      {legalDocs.map((doc, idx) => {
        // Strip any H1 title lines to prevent duplicate title on printable pages
        let parsedContent = doc.content.replace(/^#\s+.*$/gm, "");
        
        if (proposal) {
          const activeOpt = proposal.options[selectedIdx] || proposal.options[0];
          const validityText = proposal.validityPeriod 
            ? `${proposal.validityPeriod} days` 
            : "14 days";
            
          parsedContent = parsedContent
            .replace(/{pay1}/g, proposal.pay1 || "50")
            .replace(/{pay2}/g, proposal.pay2 || "40")
            .replace(/{pay3}/g, proposal.pay3 || "10")
            .replace(/{afterSalesPeriod}/g, activeOpt?.afterSalesPeriod || "2")
            .replace(/{servicesPerYear}/g, activeOpt?.servicesPerYear || "1")
            .replace(/{validityPeriod}/g, validityText);
        }

        return (
          <div key={idx} className="w-[210mm] min-h-[297mm] mx-auto bg-white shadow-md print:shadow-none p-12 flex flex-col mb-8 print:mb-0 relative overflow-hidden" style={{ pageBreakAfter: "always" }}>
            
            {/* Curvy Premium Letterhead Accent with Integrated Icon */}
            <div className="absolute top-0 right-0 w-[200px] h-[52px] bg-emerald-500/10 rounded-bl-[45px] flex items-center justify-end pr-6 pb-1 gap-2">
              <Image src="/icon.png" alt="Alta Vision Icon" width={14} height={14} className="object-contain opacity-90" />
              <span className="text-[8px] font-bold text-emerald-800 tracking-widest uppercase">Alta Vision Solar</span>
            </div>

            <style>{`
              .legal-doc-content h3 {
                font-size: 0.95rem;
                font-weight: 700;
                color: #1e293b;
                margin-top: 0.75rem;
                margin-bottom: 0.25rem;
                border-bottom: 1px solid #e2e8f0;
                padding-bottom: 0.15rem;
                text-transform: uppercase;
                letter-spacing: 0.05em;
              }
              .legal-doc-content ul {
                list-style-type: disc;
                margin-left: 1.25rem;
                margin-top: 0.2rem;
                margin-bottom: 0.4rem;
                color: #475569;
              }
              .legal-doc-content li {
                margin-bottom: 0.2rem;
                line-height: 1.38;
                font-size: 0.81rem;
                text-align: justify;
              }
              .legal-doc-content li strong {
                color: #0f172a;
              }
              .legal-doc-content p {
                font-size: 0.81rem;
                line-height: 1.38;
                color: #475569;
                margin-bottom: 0.4rem;
                text-align: justify;
              }
            `}</style>
            
            <h2 className="text-2xl font-bold text-slate-800 mb-4 border-b-2 border-slate-200 pb-4 inline-block pr-12 mt-6">{doc.title}</h2>
            
            <div className="flex-grow legal-doc-content">
              <ReactMarkdown>{parsedContent}</ReactMarkdown>
            </div>

            <BrandFooter pageNum={7 + idx} qtnNo={proposal.propNo || proposal.qtnNo} totalPages={totalPageCount} />
          </div>
        );
      })}

      {/* ── PAGE 7+ (or after legal): TECHNICAL ATTACHMENTS & DATASHEETS ── */}
      {attachmentsList.map((att) => {
        const startPageNum = attachmentStartPages[att.url] || (7 + legalDocs.length);
        if (att.type === "pdf") {
          return (
            <PDFDocumentPages
              key={att.url}
              fileUrl={att.url}
              qtnNo={proposal.propNo || proposal.qtnNo}
              startPageNum={startPageNum}
              onLoadPagesCount={handleLoadPagesCount}
              totalPages={totalPageCount}
            />
          );
        } else {
          return (
            <ImageDocumentPage
              key={att.url}
              fileUrl={att.url}
              qtnNo={proposal.propNo || proposal.qtnNo}
              pageNum={startPageNum}
              totalPages={totalPageCount}
            />
          );
        }
      })}

    </div>
  );
}
