"use client";

import { useEffect, useState, useMemo, Suspense, useCallback } from "react";
import { useParams, useSearchParams } from "next/navigation";
import Script from "next/script";
import { doc, getDoc, collection, getDocs, addDoc, query, where, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Proposal } from "@/types";
import { computeOptionTotal, computeFinalBeforeVat, computeVatAmount } from "@/lib/pricing";
import { Loader2, Printer, Leaf, Zap, Sun, Battery, Activity, Banknote, ShieldCheck, HardDrive, CheckCircle2, Send, Link2, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth-context";
import { calculateSolarMetrics } from "@/lib/solar-calculator";
import Image from "next/image";
import ReactMarkdown from "react-markdown";
import { getFormattedWarranty } from "@/lib/warranty-utils";

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
      <div className="border-t border-emerald-500/30 pt-4 flex items-center justify-between w-full">
        {/* Left: Pearl Cluster QR */}
        <div className="flex items-center justify-start shrink-0 w-1/4">
          <img src="/PC%20logo%20and%20QR.png" alt="Pearl Cluster" className="h-10 object-contain" />
        </div>
        
        {/* Center: Brand Family */}
        <div className="flex items-center justify-center flex-grow w-2/4 px-4">
          <img src="/all%20logos.png" alt="Alta Vision Brand Family" className="h-12 w-full object-contain" />
        </div>
        
        {/* Right: Certificates */}
        <div className="flex items-center justify-end shrink-0 w-1/4">
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
      className="w-[210mm] min-h-[297mm] mx-auto bg-white shadow-md rounded-2xl print:shadow-none print:rounded-none p-12 flex flex-col mb-8 print:mb-0 relative"
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
  onRenderComplete,
  onUnmount,
  totalPages
}: {
  fileUrl: string;
  qtnNo: string;
  startPageNum: number;
  onLoadPagesCount: (url: string, count: number) => void;
  onRenderComplete?: (url: string) => void;
  onUnmount?: (url: string) => void;
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
        
        if (active && onRenderComplete) {
          onRenderComplete(fileUrl);
        }
      } catch (err) {
        console.error("Error rendering PDF attachment:", err);
        if (active && onRenderComplete) {
          onRenderComplete(fileUrl);
        }
      }
    };

    renderPDF();

    return () => {
      active = false;
      // eslint-disable-next-line react-hooks/exhaustive-deps
      if (onUnmount) onUnmount(fileUrl);
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
              className="w-[210mm] min-h-[297mm] mx-auto bg-white shadow-md rounded-2xl print:shadow-none print:rounded-none p-12 flex flex-col mb-8 print:mb-0 relative"
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
          className="w-[210mm] min-h-[297mm] mx-auto bg-white shadow-md rounded-2xl print:shadow-none print:rounded-none p-12 flex flex-col items-center justify-center mb-8 print:mb-0"
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

function PrintProposalContent() {
  const { id } = useParams() as { id: string };
  const searchParams = useSearchParams();
  const mode = searchParams.get("mode");
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [legalDocs, setLegalDocs] = useState<{title: string, content: string}[]>([]);
  const [existingQtns, setExistingQtns] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [printVersion, setPrintVersion] = useState<number>(1);
  const [includeDatasheets, setIncludeDatasheets] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [fullyRenderedPdfs, setFullyRenderedPdfs] = useState<Set<string>>(new Set());
  const { user } = useAuth();

  const [folderPdfs, setFolderPdfs] = useState<string[]>([]);
  const [pdfPageCounts, setPdfPageCounts] = useState<Record<string, number>>({});
  const [isExpired, setIsExpired] = useState(false);
  const [expiredLetters, setExpiredLetters] = useState<Array<{ name: string; expiryDate: string }>>([]);
  const [lettersList, setLettersList] = useState<Array<{ id: string; name: string; expiryDate: string; fileName?: string; attachToProposal?: boolean; sendViaEmailWhatsapp?: boolean }>>([]);
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
          const s = settingsSnap.data() as any;
          setEngineers(s);
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
          if (s.letters) {
            setLettersList(s.letters);
          }
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
    const systemTotal = computeOptionTotal(opt, proposal);
    const panelW = parseWatts(opt.panel.ratingLabel);
    return calculateSolarMetrics(opt.panel.qty || 0, panelW, systemTotal);
  }, [proposal, selectedIdx]);

  const systemTypeText = useMemo(() => {
    if (!proposal) return "";
    const sysTypeMap: Record<string, string> = {
      "ongrid": "Ongrid",
      "hybrid": "Hybrid",
      "hybrid-offgrid": "Hybrid Offgrid",
      "offgrid": "Offgrid",
      "grid-backup": "Grid Backup"
    };
    
    const opt = proposal.options?.[selectedIdx] || proposal.options?.[0];
    
    const isHybridInv = opt?.inverter ? (
      (opt.inverter.productSubtype || "").toLowerCase() === "hybrid" ||
      (opt.inverter.brand || "").toLowerCase().includes("hybrid") ||
      (opt.inverter.model || "").toLowerCase().includes("hybrid")
    ) : false;

    const actualSysType = isHybridInv ? "hybrid" : (proposal.sysType || "ongrid");
    const typeLabel = sysTypeMap[actualSysType.toLowerCase()] || actualSysType;
    
    const panelQty = opt?.panel?.qty || 0;
    
    if (panelQty === 0) {
      // System has no solar, show battery capacity instead
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
      }
      return `${batteryCap}Backup`.trim();
    }
    
    const capacityStr = metrics ? `${metrics.totalCapacityKw}kW ` : "";
    return `${capacityStr}${typeLabel}`.trim();
  }, [proposal, metrics, selectedIdx]);

  const handleLoadPagesCount = (url: string, count: number) => {
    setPdfPageCounts((prev) => {
      if (prev[url] === count) return prev;
      return { ...prev, [url]: count };
    });
  };

  const attachmentsList = useMemo(() => {
    const list: { type: "pdf" | "image"; url: string; name: string }[] = [];
    
    const getProxyUrl = (url: string) => {
      if (url.startsWith("http://") || url.startsWith("https://")) {
        return `/api/proxy?url=${encodeURIComponent(url)}`;
      }
      return url;
    };

    // 1. Folder PDFs (Get letters from this folder)
    folderPdfs.forEach((f) => {
      const configuredLetter = lettersList.find(l => l.fileName === f);
      if (configuredLetter && configuredLetter.attachToProposal === false) {
        return;
      }
      list.push({
        type: "pdf",
        url: `/api/docs/attachments?file=${encodeURIComponent(f)}`,
        name: configuredLetter ? configuredLetter.name : f,
      });
    });

    // 2. Product Datasheets
    const opt = proposal?.options?.[selectedIdx] || proposal?.options?.[0];
    if (includeDatasheets && opt) {
      if (opt.inverter?.dataSheetUrl) {
        const isPdf = opt.inverter.dataSheetUrl.toLowerCase().includes(".pdf") || !opt.inverter.dataSheetUrl.toLowerCase().match(/\.(jpg|jpeg|png|webp|gif|svg)/);
        list.push({
          type: isPdf ? "pdf" : "image",
          url: getProxyUrl(opt.inverter.dataSheetUrl),
          name: `${opt.inverter.brand}_Inverter_Datasheet`,
        });
      }
      if (opt.battery?.dataSheetUrl) {
        const isPdf = opt.battery.dataSheetUrl.toLowerCase().includes(".pdf") || !opt.battery.dataSheetUrl.toLowerCase().match(/\.(jpg|jpeg|png|webp|gif|svg)/);
        list.push({
          type: isPdf ? "pdf" : "image",
          url: getProxyUrl(opt.battery.dataSheetUrl),
          name: `${opt.battery.brand}_Battery_Datasheet`,
        });
      }
      if (opt.panel?.dataSheetUrl) {
        const isPdf = opt.panel.dataSheetUrl.toLowerCase().includes(".pdf") || !opt.panel.dataSheetUrl.toLowerCase().match(/\.(jpg|jpeg|png|webp|gif|svg)/);
        list.push({
          type: isPdf ? "pdf" : "image",
          url: getProxyUrl(opt.panel.dataSheetUrl),
          name: `${opt.panel.brand}_Panel_Datasheet`,
        });
      }
    }
    return list;
  }, [lettersList, folderPdfs, proposal, selectedIdx, includeDatasheets]);

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

  const handleRenderComplete = useCallback((url: string) => {
    setFullyRenderedPdfs((prev) => {
      const next = new Set(prev);
      next.add(url);
      return next;
    });
  }, []);

  const handleUnmountPdf = useCallback((url: string) => {
    setFullyRenderedPdfs((prev) => {
      const next = new Set(prev);
      next.delete(url);
      return next;
    });
  }, []);

  const totalPdfsToRender = attachmentsList.filter(a => a.type === "pdf").length;
  const isFullyLoaded = fullyRenderedPdfs.size >= totalPdfsToRender;

  const missingDatasheets = useMemo(() => {
    const missing: { name: string; type: string }[] = [];
    if (!proposal || !proposal.options) return missing;
    const opt = proposal.options[selectedIdx] || proposal.options[0];
    if (opt) {
      if (!opt.inverter?.dataSheetUrl) {
        missing.push({ name: `${opt.inverter?.brand || ""} Hybrid Inverter`, type: "inverter" });
      }
      if (opt.battery && opt.battery.qty > 0 && !opt.battery.dataSheetUrl) {
        missing.push({ name: `${opt.battery?.brand || ""} Energy Storage`, type: "battery" });
      }
      if (opt.panel && opt.panel.qty > 0 && !opt.panel.dataSheetUrl) {
        missing.push({ name: `${opt.panel?.brand || ""} Solar Panel`, type: "panel" });
      }
    }
    return missing;
  }, [proposal, selectedIdx]);

  const hasMissingDatasheets = missingDatasheets.length > 0;

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center gap-2 text-muted-foreground bg-zinc-50">
        <Loader2 className="h-5 w-5 animate-spin" />
        <span className="text-sm">Generating High-Fidelity Proposal...</span>
      </div>
    );
  }

  if (isExpired) {
    return (
      <div className="flex h-screen items-center justify-center bg-zinc-100 flex-col gap-6 text-center px-4">
        <div className="h-20 w-20 bg-red-100 text-red-600 rounded-full flex items-center justify-center shadow-sm">
          <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"></path><path d="M12 9v4"></path><path d="M12 17h.01"></path></svg>
        </div>
        <div>
          <h1 className="text-2xl font-black text-slate-800 tracking-tight">Authorization Letters Expired</h1>
          <div className="text-muted-foreground font-medium max-w-md mx-auto mt-3 bg-white p-4 rounded-xl border border-slate-200 text-left text-xs space-y-2 shadow-sm">
            <p className="font-semibold text-slate-700">The following attached letters have passed their expiry date:</p>
            <ul className="list-disc pl-5 space-y-1">
              {expiredLetters.map((l, i) => (
                <li key={i} className="text-red-600 font-medium">
                  {l.name} <span className="font-bold text-slate-500">(Expired: {l.expiryDate})</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
        <div className="bg-white border border-slate-200 text-slate-700 p-4 rounded-xl text-sm max-w-md mx-auto shadow-sm">
          Please contact a system administrator to update the authorization PDFs in the system and update the expiry dates in the Settings page to resume proposal generation.
        </div>
        <Button variant="outline" className="mt-2 border-slate-300" onClick={() => window.close()}>
          Close Window
        </Button>
      </div>
    );
  }

  if (!proposal || !metrics) {
    return <div className="p-8 text-center text-muted-foreground">Proposal data is incomplete or missing.</div>;
  }

  const primaryOption = proposal.options[selectedIdx] || proposal.options[0];

  const hasGoodweBattery = !!(primaryOption.battery && (primaryOption.battery.brand || "").toLowerCase().includes("goodwe"));

  const inverterWarrantyText = getFormattedWarranty(
    "inverter",
    primaryOption.inverter.brand,
    primaryOption.inverter.model,
    primaryOption.inverter.productSubtype || "",
    primaryOption.inverter.warranty,
    hasGoodweBattery
  );

  const batteryWarrantyText = primaryOption.battery
    ? getFormattedWarranty(
        "battery",
        primaryOption.battery.brand,
        primaryOption.battery.model,
        "",
        primaryOption.battery.warranty
      )
    : "";

  const panelProductWarrantyText = `${parseInt(String(primaryOption.panel.warranty)) || 12} Year Product Warranty`;
  const panelPerformanceWarrantyText = "25 Year Performance Warranty";

  return (
    <div className="notranslate bg-zinc-100 dark:bg-zinc-950 min-h-screen pb-12 font-sans print:bg-white print:p-0">

      {/* ── Control Bar (Hidden on Print) ── */}
      <div className="max-w-[210mm] mx-auto pt-8 pb-4 print:hidden flex justify-between items-center bg-white dark:bg-zinc-800 px-6 py-4 rounded-2xl border border-zinc-200 dark:border-zinc-700 shadow-md mb-6 flex-wrap gap-4">
        <div>
          <h2 className="text-lg font-black text-zinc-900 dark:text-zinc-100">Proposal Document</h2>
          <div className="flex flex-col gap-1 mt-0.5">
            <p className="text-xs text-zinc-500 dark:text-zinc-400 font-medium">Optimized for A4 Printing</p>
            <a
              href={`/proposals/${id}`}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1.5 text-[10px] font-bold font-mono bg-zinc-100 dark:bg-zinc-700/60 hover:bg-emerald-50 dark:hover:bg-emerald-900/30 hover:border-emerald-300 hover:text-emerald-600 dark:hover:text-emerald-400 px-2 py-0.5 rounded border border-zinc-200 dark:border-zinc-600 w-fit mt-1 transition-colors cursor-pointer group text-zinc-500 dark:text-zinc-400"
              title="Open in Proposals table"
            >
              <span className="group-hover:text-emerald-600 dark:group-hover:text-emerald-400">Ref:</span>
              <span className="text-emerald-600 dark:text-emerald-400 underline">{proposal.propNo || proposal.qtnNo}</span>
              <svg xmlns="http://www.w3.org/2000/svg" className="h-2.5 w-2.5 text-emerald-500 opacity-0 group-hover:opacity-100 transition-opacity" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
            </a>
            <div className="flex items-center gap-1.5 text-[10px] font-bold font-mono bg-zinc-100 dark:bg-zinc-700/60 px-2 py-0.5 rounded border border-zinc-200 dark:border-zinc-600 w-fit text-zinc-500 dark:text-zinc-400">
              <span>Filename:</span>
              <span className="text-emerald-600 dark:text-emerald-400">{cleanRef}_v{printVersion}.pdf</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-4 flex-wrap">
          <label className="flex items-center gap-2 text-sm font-medium text-zinc-700 dark:text-zinc-200 cursor-pointer">
            <input
              type="checkbox"
              checked={includeDatasheets}
              onChange={(e) => setIncludeDatasheets(e.target.checked)}
              className="rounded text-emerald-600 focus:ring-emerald-500 w-4 h-4"
            />
            Include Datasheets
          </label>

          {/* Send / Share Dropdown */}
          <div className="relative">
            {shareOpen && <div className="fixed inset-0 z-40" onClick={() => setShareOpen(false)} />}
            <Button
              variant="outline"
              onClick={() => setShareOpen(!shareOpen)}
              className="gap-2 font-semibold"
            >
              <Send className="h-4 w-4" />
              {linkCopied ? "Copied!" : "Send / Share"}
            </Button>
            {shareOpen && (
              <div className="absolute top-full mt-2 right-0 bg-background border border-border rounded-xl shadow-xl p-1.5 z-50 min-w-[180px] animate-in fade-in slide-in-from-top-2 duration-150">
                <a
                  href={`https://wa.me/?text=${encodeURIComponent(`${proposal?.propNo || proposal?.qtnNo} – Solar Proposal from Alta Vision\n${window.location.href}`)}`}
                  target="_blank"
                  rel="noreferrer"
                  onClick={() => setShareOpen(false)}
                  className="flex items-center gap-2.5 px-3 py-2 text-sm font-semibold hover:bg-emerald-50 hover:text-emerald-700 dark:hover:bg-emerald-950/30 rounded-lg transition-colors w-full"
                >
                  <svg className="h-4 w-4 text-emerald-500 shrink-0" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                  </svg>
                  WhatsApp
                </a>
                <a
                  href={`mailto:?subject=Solar Proposal – ${proposal?.propNo || proposal?.qtnNo || 'Alta Vision'}&body=${encodeURIComponent(`Dear Customer,\n\nPlease find your solar proposal at the link below:\n${window.location.href}\n\nBest regards,\nAlta Vision (Pvt) Ltd\ninfo@altavision.lk`)}`}
                  onClick={() => setShareOpen(false)}
                  className="flex items-center gap-2.5 px-3 py-2 text-sm font-semibold hover:bg-blue-50 hover:text-blue-700 dark:hover:bg-blue-950/30 rounded-lg transition-colors w-full"
                >
                  <svg className="h-4 w-4 text-blue-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                  Email
                </a>
                <div className="border-t border-border/60 my-1" />
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(window.location.href).then(() => {
                      setLinkCopied(true);
                      setShareOpen(false);
                      setTimeout(() => setLinkCopied(false), 2500);
                    });
                  }}
                  className="flex items-center gap-2.5 px-3 py-2 text-sm font-semibold hover:bg-muted rounded-lg transition-colors w-full"
                >
                  {linkCopied ? <Check className="h-4 w-4 text-emerald-500 shrink-0" /> : <Link2 className="h-4 w-4 text-slate-500 shrink-0" />}
                  {linkCopied ? "Copied!" : "Copy Link"}
                </button>
              </div>
            )}
          </div>

          {/* Print / Download */}
          <Button
            disabled={!isFullyLoaded}
            onClick={async () => {
              window.print();
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
              }
            }}
            className={`gap-2 shadow-sm font-semibold transition-all duration-300 ${isFullyLoaded ? 'bg-emerald-600 hover:bg-emerald-700 text-white' : 'bg-muted text-muted-foreground cursor-not-allowed'}`}
          >
            {isFullyLoaded ? <Printer className="h-4 w-4" /> : <Loader2 className="h-4 w-4 animate-spin" />}
            {isFullyLoaded ? "Print / Save PDF" : "Loading Document..."}
          </Button>
        </div>
      </div>

      {hasMissingDatasheets && (
        <div className="max-w-[210mm] mx-auto mb-6 print:hidden bg-red-50 border border-red-200 text-red-800 px-5 py-4 rounded-xl flex items-start gap-4 shadow-sm animate-in fade-in slide-in-from-top-4">
          <div className="bg-red-100 p-2 rounded-full shrink-0">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-red-600"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"></path><path d="M12 9v4"></path><path d="M12 17h.01"></path></svg>
          </div>
          <div>
            <p className="font-bold text-sm">Missing Datasheets Detected</p>
            <p className="text-xs mt-1 text-red-700/80 font-medium">The following selected hardware components do not have a technical datasheet PDF URL defined. They will not be appended to the printout. Please configure their catalog items in the Products tab to resolve this:</p>
            <ul className="list-disc pl-5 mt-2 text-xs text-red-700 font-semibold space-y-0.5">
              {missingDatasheets.map((m, idx) => (
                <li key={idx}>{m.name}</li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {!isFullyLoaded && (
        <div className="max-w-[210mm] mx-auto mb-6 print:hidden bg-amber-50 border border-amber-200 text-amber-800 px-5 py-4 rounded-xl flex items-start gap-4 shadow-sm animate-in fade-in slide-in-from-top-4">
          <div className="bg-amber-100 p-2 rounded-full shrink-0">
            <Loader2 className="h-5 w-5 animate-spin text-amber-600" />
          </div>
          <div>
            <p className="font-bold text-sm">Please wait, document is rendering...</p>
            <p className="text-xs mt-1 text-amber-700/80 font-medium">Do not press print yet. We are rendering high-resolution technical datasheets to ensure they appear perfectly on your final PDF. This might take a few moments.</p>
          </div>
        </div>
      )}

      {/* ── PRINT CONTENT WRAPPER (Forces Light/White Theme for A4 Sheets) ── */}
      <div className="theme-force-light flex flex-col items-center print:block w-full">
        {/* ── POSTAL COVER PAGE (Only if mode=postal) ── */}
      {mode === "postal" && (
        <div className="w-[210mm] min-h-[297mm] mx-auto bg-white shadow-md rounded-2xl print:shadow-none print:rounded-none relative mb-8 print:mb-0 flex flex-col justify-center items-center" style={{ pageBreakAfter: "always" }}>
          
          <div className="w-full max-w-[150mm] mx-auto space-y-24">
            {/* FROM Address (Top Left) */}
            <div className="w-full text-left">
              <h3 className="font-bold text-slate-800 border-b border-slate-300 pb-2 inline-block mb-2">FROM</h3>
              <div className="text-sm text-slate-700 leading-relaxed font-medium">
                <p className="font-bold text-base">Alta Vision (Pvt) Ltd</p>
                <p>298A, Borella Road, Habarakada,</p>
                <p>Homagama,</p>
                <p>Sri Lanka.</p>
                <p className="mt-1 font-semibold">✉️ info@altavision.lk</p>
              </div>
            </div>

            {/* TO Address (Bottom Right / Center) */}
            <div className="w-full pl-32">
              <h3 className="font-bold text-slate-800 border-b border-slate-300 pb-2 inline-block mb-2 text-xl">TO</h3>
              <div className="text-lg text-slate-800 leading-relaxed">
                <p className="font-black text-2xl uppercase mb-2">{proposal.customer.name}</p>
                <p className="whitespace-pre-wrap font-medium">{proposal.customer.address}</p>
                {proposal.customer.phone && <p className="mt-4 font-bold text-slate-700">Phone: {proposal.customer.phone}</p>}
                {proposal.customer.phone2 && <p className="font-bold text-slate-700">Alt Phone: {proposal.customer.phone2}</p>}
              </div>
            </div>
          </div>
          
          <div className="absolute bottom-12 w-full text-center">
             <p className="text-xs font-bold text-slate-400 uppercase tracking-widest border border-slate-200 px-4 py-2 inline-block rounded-md bg-slate-50">Confidential • Please deliver to addressee</p>
          </div>
        </div>
      )}

      {/* ── PAGE 1: COVER PAGE ── */}
      <div 
        className="w-[210mm] min-h-[297mm] mx-auto bg-white shadow-md rounded-2xl print:shadow-none print:rounded-none relative overflow-hidden mb-8 print:mb-0" 
        style={{ 
          pageBreakAfter: "always",
          backgroundImage: "url('/proposal_cover_bg.png')",
          backgroundSize: "100% 100%",
          backgroundRepeat: "no-repeat",
          backgroundPosition: "center"
        }}
      >
        <div className="absolute top-[188mm] left-[20mm] right-[20mm]">
          {/* Grid details block */}
          <div className="grid grid-cols-2 gap-8 border-b border-slate-100 pb-5">
            {/* Proposal Details (Left Column) */}
            <div className="space-y-3 pt-6">
              <div className="space-y-2.5 bg-slate-50/60 p-4 rounded-xl border border-slate-100/80">
                <div className="flex justify-between items-center text-sm">
                  <span className="text-slate-400 font-semibold">Proposal Ref:</span>
                  <span className="font-mono font-extrabold text-slate-800 bg-slate-200/50 px-2 py-0.5 rounded">{proposal.propNo || proposal.qtnNo}</span>
                </div>
                <div className="flex justify-between items-center text-sm">
                  <span className="text-slate-400 font-semibold">Issue Date:</span>
                  <span className="font-bold text-slate-800">{proposal.date}</span>
                </div>
                <div className="flex justify-between items-center text-sm">
                  <span className="text-slate-400 font-semibold">Valid Period:</span>
                  <span className="font-bold text-slate-800">
                    {proposal.validityPeriod
                      ? (proposal.validityPeriod.toLowerCase().includes("week") || proposal.validityPeriod.toLowerCase().includes("day")
                        ? proposal.validityPeriod
                        : `${proposal.validityPeriod} Days`)
                      : "14 Days"}
                  </span>
                </div>
                <div className="flex justify-between items-center text-sm">
                  <span className="text-slate-400 font-semibold">System Type:</span>
                  <span className="font-black text-emerald-600 bg-emerald-50 dark:bg-emerald-950/20 px-2 py-0.5 rounded border border-emerald-100/50">
                    {systemTypeText}
                  </span>
                </div>
              </div>
            </div>

            {/* Prepared For (Customer Info) (Right Column) */}
            <div className="space-y-3 pl-6 pt-10">
              <h3 className="text-[11px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500"></span> Prepared For
              </h3>
              <div className="space-y-1.5">
                <p className="text-xl font-black text-slate-800 tracking-tight leading-tight">{proposal.customer.name}</p>
                <p className="text-sm text-slate-500 whitespace-pre-wrap leading-relaxed max-w-[285px] font-semibold">{proposal.customer.address}</p>
                <div className="pt-2 text-sm text-slate-700 space-y-1">
                  {proposal.customer.phone && <p className="font-bold text-slate-800 flex items-center gap-1">📞 {proposal.customer.phone}</p>}
                  {proposal.customer.phone2 && <p className="text-slate-500 ml-5 font-semibold">{proposal.customer.phone2}</p>}
                  {proposal.customer.email && <p className="text-slate-660 flex items-center gap-1 font-semibold">✉️ {proposal.customer.email}</p>}
                </div>
              </div>
            </div>
          </div>

          {/* Two-line welcoming text to fill the empty space below the details block */}
          <div className="mt-8 text-center px-4">
            <p className="text-xs text-slate-600 font-semibold leading-relaxed">
              We are pleased to present this customized Solar Energy System Proposal.
            </p>
            <p className="text-xs text-emerald-650 font-extrabold leading-relaxed mt-1">
              Thank you for choosing Alta Vision as your trusted partner to transition to sustainable energy.
            </p>
          </div>
        </div>
      </div>

      {/* ── PAGE 2: COMPANY ABOUT & CONTACT INFO ── */}
      <div className="w-[210mm] min-h-[297mm] mx-auto bg-white shadow-md rounded-2xl print:shadow-none print:rounded-none p-12 flex flex-col mb-8 print:mb-0 relative overflow-hidden" style={{ pageBreakAfter: "always" }}>
        
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
              <p className="font-bold text-slate-800 text-xs border-t border-slate-200/60 pt-2 flex items-center gap-1">✉️ info@altavision.lk</p>
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
      <div className="w-[210mm] min-h-[297mm] mx-auto bg-white shadow-md rounded-2xl print:shadow-none print:rounded-none p-12 flex flex-col mb-8 print:mb-0 relative overflow-hidden" style={{ pageBreakAfter: "always" }}>
        
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

        {/* Full-width disclaimer under the 3 summary boxes */}
        <p className="text-[9px] text-slate-400 italic font-medium w-full text-center mb-4 leading-relaxed">
          * Estimated annual savings are indicative values based on current utility tariff rates and standard solar irradiance data. Actual savings may vary based on real-world usage patterns, grid tariff revisions, and site-specific conditions.
        </p>

        <h3 className="text-xl font-bold text-slate-800 mb-6">Your Solution Hardware</h3>
        
        <div className="space-y-4 mb-12 flex-grow">
          {/* Inverter */}
          {primaryOption.inverter && primaryOption.inverter.qty > 0 && (
            <div className={`flex items-start justify-between gap-3.5 p-4 rounded-xl border shadow-sm ${!primaryOption.inverter.dataSheetUrl ? 'border-red-200 bg-red-50/50' : 'border-slate-100 bg-white'}`}>
              <div className="flex items-start gap-3.5">
                <div className={`p-3 rounded-lg ${!primaryOption.inverter.dataSheetUrl ? 'bg-red-100 text-red-600' : 'bg-slate-100 text-slate-600'}`}><Activity className="h-6 w-6" /></div>
                <div>
                  <p className={`text-base font-bold ${!primaryOption.inverter.dataSheetUrl ? 'text-red-700' : 'text-slate-800'}`}>
                    {primaryOption.inverter.brand}{" "}
                    {primaryOption.inverter.productSubtype?.toLowerCase() === "ongrid" ? "On-Grid Inverter"
                      : primaryOption.inverter.productSubtype?.toLowerCase() === "offgrid" ? "Off-Grid Inverter"
                      : primaryOption.inverter.productSubtype?.toLowerCase() === "hybrid" ? "Hybrid Inverter"
                      : "Inverter"}
                    {!primaryOption.inverter.dataSheetUrl && (
                      <span className="ml-2 text-[10px] bg-red-100 text-red-600 px-2 py-0.5 rounded-full font-black uppercase tracking-wider print:hidden">Missing Datasheet</span>
                    )}
                  </p>
                  <p className="text-sm text-slate-500 mt-0.5">{primaryOption.inverter.qty} × {primaryOption.inverter.model}</p>
                  <div className="flex gap-2 mt-2 flex-wrap items-center">
                    <span className={`inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-md ${!primaryOption.inverter.dataSheetUrl ? 'text-red-600 bg-red-100' : 'text-emerald-600 bg-emerald-50'}`}><ShieldCheck className="h-3 w-3"/> {inverterWarrantyText}</span>
                  </div>
                </div>
              </div>
              {primaryOption.inverter.dataSheetUrl ? (
                <a
                  href={primaryOption.inverter.dataSheetUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="print:hidden shrink-0 inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-700 transition-all hover:bg-emerald-100 shadow-sm"
                >
                  📥 Datasheet
                </a>
              ) : (
                <span className="print:hidden shrink-0 inline-flex items-center gap-1.5 rounded-lg border border-red-500/30 bg-red-100 px-3 py-1.5 text-xs font-bold text-red-700 shadow-sm">
                  ❌ Missing PDF URL
                </span>
              )}
            </div>
          )}

          {/* Battery */}
          {primaryOption.battery && (
            <div className={`flex items-start justify-between gap-3.5 p-4 rounded-xl border shadow-sm ${!primaryOption.battery.dataSheetUrl ? 'border-red-200 bg-red-50/50' : 'border-slate-100 bg-white'}`}>
              <div className="flex items-start gap-3.5">
                <div className={`p-3 rounded-lg ${!primaryOption.battery.dataSheetUrl ? 'bg-red-100 text-red-600' : 'bg-slate-100 text-slate-600'}`}><Battery className="h-6 w-6" /></div>
                <div>
                  <p className={`text-base font-bold ${!primaryOption.battery.dataSheetUrl ? 'text-red-700' : 'text-slate-800'}`}>
                    {primaryOption.battery.brand} Energy Storage
                    {!primaryOption.battery.dataSheetUrl && (
                      <span className="ml-2 text-[10px] bg-red-100 text-red-600 px-2 py-0.5 rounded-full font-black uppercase tracking-wider print:hidden">Missing Datasheet</span>
                    )}
                  </p>
                  <p className="text-sm text-slate-500 mt-0.5">{primaryOption.battery.qty} × {primaryOption.battery.ratingLabel || primaryOption.battery.model}</p>
                  <div className="flex gap-2 mt-2 flex-wrap items-center">
                    <span className={`inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-md ${!primaryOption.battery.dataSheetUrl ? 'text-red-600 bg-red-100' : 'text-emerald-600 bg-emerald-50'}`}><ShieldCheck className="h-3 w-3"/> {batteryWarrantyText}</span>
                  </div>
                </div>
              </div>
              {primaryOption.battery.dataSheetUrl ? (
                <a
                  href={primaryOption.battery.dataSheetUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="print:hidden shrink-0 inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-700 transition-all hover:bg-emerald-100 shadow-sm"
                >
                  📥 Datasheet
                </a>
              ) : (
                <span className="print:hidden shrink-0 inline-flex items-center gap-1.5 rounded-lg border border-red-500/30 bg-red-100 px-3 py-1.5 text-xs font-bold text-red-700 shadow-sm">
                  ❌ Missing PDF URL
                </span>
              )}
            </div>
          )}

          {/* Panels */}
          {primaryOption.panel && primaryOption.panel.qty > 0 && (
            <div className={`p-4 rounded-xl border shadow-sm ${!primaryOption.panel.dataSheetUrl ? 'border-red-200 bg-red-50/50' : 'border-slate-100 bg-white'}`}>
              <div className="flex items-start justify-between gap-3.5">
                <div className="flex items-start gap-3.5">
                  <div className={`p-3 rounded-lg shrink-0 ${!primaryOption.panel.dataSheetUrl ? 'bg-red-100 text-red-600' : 'bg-slate-100 text-slate-600'}`}><Sun className="h-6 w-6" /></div>
                  <div>
                    <p className={`text-base font-bold ${!primaryOption.panel.dataSheetUrl ? 'text-red-700' : 'text-slate-800'}`}>
                      {primaryOption.panel.brand}{" "}
                      {primaryOption.panel.productSubtype
                        ? `${primaryOption.panel.productSubtype.charAt(0).toUpperCase() + primaryOption.panel.productSubtype.slice(1)} Panels`
                        : "Solar Panels"}
                      {!primaryOption.panel.dataSheetUrl && (
                        <span className="ml-2 text-[10px] bg-red-100 text-red-600 px-2 py-0.5 rounded-full font-black uppercase tracking-wider print:hidden">Missing Datasheet</span>
                      )}
                    </p>
                    <p className="text-sm text-slate-500 mt-0.5">{primaryOption.panel.qty} × {primaryOption.panel.ratingLabel || primaryOption.panel.model}</p>
                  </div>
                </div>
                {primaryOption.panel.dataSheetUrl ? (
                  <a
                    href={primaryOption.panel.dataSheetUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="print:hidden shrink-0 inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-700 transition-all hover:bg-emerald-100 shadow-sm"
                  >
                    📥 Datasheet
                  </a>
                ) : (
                  <span className="print:hidden shrink-0 inline-flex items-center gap-1.5 rounded-lg border border-red-500/30 bg-red-100 px-3 py-1.5 text-xs font-bold text-red-700 shadow-sm">
                    ❌ Missing PDF URL
                  </span>
                )}
              </div>
              <div className="grid grid-cols-3 gap-2 mt-3 w-full">
                <span className={`inline-flex items-center justify-center gap-1 text-[11px] font-medium px-2 py-1.5 rounded-md ${!primaryOption.panel.dataSheetUrl ? 'text-red-600 bg-red-100' : 'text-emerald-600 bg-emerald-50'}`}><ShieldCheck className="h-3 w-3 shrink-0"/> {panelProductWarrantyText}</span>
                <span className={`inline-flex items-center justify-center gap-1 text-[11px] font-medium px-2 py-1.5 rounded-md ${!primaryOption.panel.dataSheetUrl ? 'text-red-600 bg-red-100' : 'text-emerald-600 bg-emerald-50'}`}><ShieldCheck className="h-3 w-3 shrink-0"/> {panelPerformanceWarrantyText}</span>
                <span className={`inline-flex items-center justify-center gap-1 text-[11px] font-medium px-2 py-1.5 rounded-md ${!primaryOption.panel.dataSheetUrl ? 'text-red-600 bg-red-100' : 'text-emerald-600 bg-emerald-50'}`}><CheckCircle2 className="h-3 w-3 shrink-0"/> Tier 1 Efficiency</span>
              </div>
            </div>
          )}
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
      <div className="w-[210mm] min-h-[297mm] mx-auto bg-white shadow-md rounded-2xl print:shadow-none print:rounded-none p-12 flex flex-col mb-8 print:mb-0 relative overflow-hidden" style={{ pageBreakAfter: "always" }}>
        
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
            <p className="text-[11px] font-bold text-slate-800 leading-relaxed pl-6">
              All the components offered in this proposal (cabling networks, protection isolators, switches, structural mounts and enclosures) carry a <strong className="font-black text-slate-900 underline">3 Years Product Warranty</strong> against any manufacturing defect.
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

        {/* Full-width ancillary disclaimer */}
        <p className="text-[9px] text-slate-400 italic font-medium w-full text-center mt-4 pt-3 border-t border-slate-100 leading-relaxed">
          * Components listed are for indicative purposes only. Actual ancillary items — including cable sizing, protection devices, and mounting hardware — are subject to site conditions and system requirements. Alta Vision reserves the right to substitute equivalent components without prior notice.
        </p>

        <BrandFooter pageNum={4} qtnNo={proposal.propNo || proposal.qtnNo} totalPages={totalPageCount} />
      </div>

      {/* ── PAGE 5: PERFORMANCE & ROI ── */}
      <div className="w-[210mm] min-h-[297mm] mx-auto bg-white shadow-md rounded-2xl print:shadow-none print:rounded-none p-12 flex flex-col mb-8 print:mb-0 relative overflow-hidden" style={{ pageBreakAfter: "always" }}>
        
        {/* Curvy Premium Letterhead Accent with Integrated Icon */}
        <div className="absolute top-0 right-0 w-[200px] h-[52px] bg-emerald-500/10 rounded-bl-[45px] flex items-center justify-end pr-6 pb-1 gap-2">
          <Image src="/icon.png" alt="Alta Vision Icon" width={14} height={14} className="object-contain opacity-90" />
          <span className="text-[8px] font-bold text-emerald-800 tracking-widest uppercase">Alta Vision Solar</span>
        </div>

        <h2 className="text-3xl font-black text-slate-800 mb-4 border-b-2 border-emerald-500 pb-4 inline-block pr-12 mt-6">Performance & ROI</h2>

        <div className="grid grid-cols-4 gap-4 mb-6">
          {/* Card 1: Expected Monthly Generation (Min - Max) */}
          <div className="bg-slate-50 border border-slate-200/60 rounded-2xl px-3.5 py-5 shadow-sm flex flex-col justify-between min-h-[125px]">
            <div>
              <div className="flex items-center gap-1.5 text-[9px] font-black text-slate-400 uppercase tracking-widest mb-3">
                <Zap className="h-4 w-4 text-emerald-500 shrink-0" />
                <span>Expected Monthly Gen.</span>
              </div>
              <div className="mt-1">
                <p className="text-[15px] font-black text-slate-800 tracking-tight whitespace-nowrap">
                  {Math.min(...metrics.monthlyData.map(m => m.generation)).toLocaleString()} - {Math.max(...metrics.monthlyData.map(m => m.generation)).toLocaleString()}
                </p>
                <p className="text-[9px] font-bold text-slate-400 mt-0.5">kWh per month</p>
              </div>
            </div>
            <p className="text-[10px] text-slate-400 font-bold mt-2">Projected monthly yield</p>
          </div>

          {/* Card 2: Annual Output (Min - Max) */}
          <div className="bg-slate-50 border border-slate-200/60 rounded-2xl px-3.5 py-5 shadow-sm flex flex-col justify-between min-h-[125px]">
            <div>
              <div className="flex items-center gap-1.5 text-[9px] font-black text-slate-400 uppercase tracking-widest mb-3">
                <Leaf className="h-4 w-4 text-emerald-500 shrink-0" />
                <span>Annual Output</span>
              </div>
              <div className="mt-1">
                <p className="text-[14px] font-black text-slate-800 tracking-tight whitespace-nowrap">
                  {(Math.min(...metrics.monthlyData.map(m => m.generation)) * 12).toLocaleString()} - {(Math.max(...metrics.monthlyData.map(m => m.generation)) * 12).toLocaleString()}
                </p>
                <p className="text-[9px] font-bold text-slate-400 mt-0.5">kWh per year</p>
              </div>
            </div>
            <p className="text-[10px] text-slate-400 font-bold mt-2">Projected yearly yield</p>
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

        {/* Full-width Performance & ROI disclaimer */}
        <p className="text-[9px] text-slate-400 italic font-medium w-full text-center mt-3 mb-1 leading-relaxed">
          * Projected generation figures, savings, payback periods and financial returns are estimates based on standard solar irradiance models, an 80% system efficiency factor, and current grid tariff rates. Actual energy production and income may vary due to weather variability, shading, system degradation over time, future grid tariff revisions, and applicable net-metering policy changes. Alta Vision makes no guarantee of specific financial outcomes.
        </p>

        <div className="mt-6 border-t border-slate-200/60 pt-6 flex-grow">
          <h3 className="text-lg font-bold text-slate-800 mb-4">Calculation Methodology & Technical Assumptions</h3>
          <div className="grid grid-cols-2 gap-6 text-xs text-slate-600">
            <div className="space-y-4">
              <div className="flex gap-2.5">
                <span className="text-emerald-500 font-extrabold text-sm shrink-0">✓</span>
                <div>
                  <p className="font-bold text-slate-800">System Efficiency Derate Factor</p>
                  <p className="text-slate-500 mt-0.5 leading-relaxed text-[11px]">Calculations assume an overall system efficiency of 80% to account for real-world environmental factors such as ambient temperature, dust accumulation, wiring losses, and inverter conversion efficiency.</p>
                </div>
              </div>
              <div className="flex gap-2.5">
                <span className="text-emerald-500 font-extrabold text-sm shrink-0">✓</span>
                <div>
                  <p className="font-bold text-slate-800">Historical Solar Irradiance</p>
                  <p className="text-slate-500 mt-0.5 leading-relaxed text-[11px]">Expected solar generation values are based on localized solar irradiance data for Sri Lanka. Typical daily peak sun hours range from 5.0 to 6.0 hours depending on seasonal variations.</p>
                </div>
              </div>
            </div>
            <div className="space-y-4">
              <div className="flex gap-2.5">
                <span className="text-emerald-500 font-extrabold text-sm shrink-0">✓</span>
                <div>
                  <p className="font-bold text-slate-800">Average Tariff Rate</p>
                  <p className="text-slate-500 mt-0.5 leading-relaxed text-[11px]">Calculated savings are based on a blended grid utility tariff rate of Rs. 55.00 per kWh. Actual financial returns may vary based on future utility tariff structures and net-metering schemes (Net Plus / Net Metering).</p>
                </div>
              </div>
              <div className="flex gap-2.5">
                <span className="text-emerald-500 font-extrabold text-sm shrink-0">✓</span>
                <div>
                  <p className="font-bold text-slate-800">25-Year Lifetime Projections</p>
                  <p className="text-slate-500 mt-0.5 leading-relaxed text-[11px]">Estimated lifetime returns assume linear solar module degradation conforming to standard performance warranties (typically 80% output at Year 25) and standard grid operations.</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        <BrandFooter pageNum={5} qtnNo={proposal.propNo || proposal.qtnNo} totalPages={totalPageCount} />
      </div>

      {/* ── PAGE 6: DETAILED OPTIONS PRICING ── */}
      <div className="w-[210mm] min-h-[297mm] mx-auto bg-white shadow-md rounded-2xl print:shadow-none print:rounded-none p-12 flex flex-col mb-8 print:mb-0 relative overflow-hidden" style={{ pageBreakAfter: "always" }}>
        
        {/* Curvy Premium Letterhead Accent with Integrated Icon */}
        <div className="absolute top-0 right-0 w-[200px] h-[52px] bg-emerald-500/10 rounded-bl-[45px] flex items-center justify-end pr-6 pb-1 gap-2">
          <Image src="/icon.png" alt="Alta Vision Icon" width={14} height={14} className="object-contain opacity-90" />
          <span className="text-[8px] font-bold text-emerald-800 tracking-widest uppercase">Alta Vision Solar</span>
        </div>
        <h2 className="text-3xl font-black text-slate-800 mb-3 border-b-2 border-emerald-500 pb-4 inline-block pr-12 mt-6">System Investment Summary</h2>

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
                        <th className="pb-1">Details</th>
                        <th className="pb-1 text-right w-12">Qty</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {opt.panel && opt.panel.qty > 0 && (
                        <tr>
                          <td className="py-1.5 font-bold text-slate-800 pr-3">
                            {opt.panel.productSubtype ? `${opt.panel.productSubtype} Solar Panels` : "Solar Panels"}
                          </td>
                          <td className="py-1.5 font-medium text-slate-600">{opt.panel.brand} {opt.panel.ratingLabel} {opt.panel.model}</td>
                          <td className="py-1.5 text-right text-slate-600 font-semibold">{opt.panel.qty}</td>
                        </tr>
                      )}
                      {opt.inverter && opt.inverter.qty > 0 && (
                        <tr>
                          <td className="py-1.5 font-bold text-slate-800 pr-3">
                            {opt.inverter.productSubtype?.toLowerCase() === "ongrid" ? "On-Grid Inverter"
                              : opt.inverter.productSubtype?.toLowerCase() === "offgrid" ? "Off-Grid Inverter"
                              : opt.inverter.productSubtype?.toLowerCase() === "hybrid" ? "Hybrid Inverter"
                              : "Inverter"}
                          </td>
                          <td className="py-1.5 font-medium text-slate-600">{opt.inverter.brand} {opt.inverter.model}</td>
                          <td className="py-1.5 text-right text-slate-600 font-semibold">{opt.inverter.qty}</td>
                        </tr>
                      )}
                      {opt.battery && opt.battery.qty > 0 && (
                        <tr>
                           <td className="py-1.5 font-bold text-slate-800 pr-3">Energy Storage</td>
                           <td className="py-1.5 font-medium text-slate-600">{opt.battery.brand} {opt.battery.ratingLabel || opt.battery.model}</td>
                           <td className="py-1.5 text-right text-slate-600 font-semibold">{opt.battery.qty}</td>
                        </tr>
                      )}
                      <tr>
                        <td className="py-1.5 font-bold text-slate-800 pr-3">Installation & Mounting</td>
                        <td className="py-1.5 font-medium text-slate-600">Standard Roof Mounting Kit, AC/DC Cabling, Earthing</td>
                        <td className="py-1.5 text-right text-slate-600 font-semibold">1</td>
                      </tr>
                    </tbody>
                  </table>
                  <div className={`rounded-lg border overflow-hidden ${isSelected ? 'border-emerald-100' : 'border-slate-100'}`}>
                    {proposal.vatInvoice && (
                      <>
                        <div className={`p-2.5 flex justify-between items-center border-b ${isSelected ? 'bg-emerald-50/50 border-emerald-100' : 'bg-slate-50 border-slate-100'}`}>
                          <span className="text-slate-600 text-[10px] font-semibold">Price before VAT</span>
                          <span className={`text-sm font-bold ${isSelected ? 'text-emerald-600' : 'text-slate-700'}`}>
                            {fmtRs(computeFinalBeforeVat(opt, proposal))}
                          </span>
                        </div>
                        <div className={`p-2.5 flex justify-between items-center border-b ${isSelected ? 'bg-emerald-50/50 border-emerald-100' : 'bg-slate-50 border-slate-100'}`}>
                          <span className="text-slate-600 text-[10px] font-semibold">VAT ({proposal.vatRate || 18}%)</span>
                          <span className={`text-sm font-bold ${isSelected ? 'text-emerald-600' : 'text-slate-700'}`}>
                            {fmtRs(computeVatAmount(opt, proposal))}
                          </span>
                        </div>
                      </>
                    )}
                    <div className={`p-2.5 flex justify-between items-center ${isSelected ? 'bg-emerald-50 border-emerald-100' : 'bg-slate-50 border-slate-100'}`}>
                      <span className="font-extrabold text-slate-800 text-[10px] uppercase tracking-wider">Total System Investment</span>
                      <span className={`text-xl font-black ${isSelected ? 'text-emerald-700' : 'text-slate-800'}`}>
                        {fmtRs(computeOptionTotal(opt, proposal))}
                      </span>
                    </div>
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
          <div key={idx} className="w-[210mm] min-h-[297mm] mx-auto bg-white shadow-md rounded-2xl print:shadow-none print:rounded-none p-12 flex flex-col mb-8 print:mb-0 relative overflow-hidden" style={{ pageBreakAfter: "always" }}>
            
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
              onRenderComplete={handleRenderComplete}
              onUnmount={handleUnmountPdf}
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

    </div>
  );
}

export default function PrintProposalPage() {
  return (
    <Suspense fallback={<div className="flex h-screen items-center justify-center bg-zinc-50"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>}>
      <PrintProposalContent />
    </Suspense>
  );
}
