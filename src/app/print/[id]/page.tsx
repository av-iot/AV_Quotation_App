"use client";

import { useEffect, useState, useMemo } from "react";
import { useParams } from "next/navigation";
import { doc, getDoc, collection, getDocs } from "firebase/firestore";
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

export default function PrintProposalPage() {
  const { id } = useParams() as { id: string };
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [legalDocs, setLegalDocs] = useState<{title: string, content: string}[]>([]);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();

  useEffect(() => {
    async function load() {
      try {
        // Fetch Legal Docs
        fetch("/api/docs/legal")
          .then(res => res.json())
          .then(data => {
            if (data.documents) setLegalDocs(data.documents);
          })
          .catch(console.error);

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

  const metrics = useMemo(() => {
    if (!proposal || !proposal.options || proposal.options.length === 0) return null;
    const opt = proposal.options[0];
    const panelW = parseWatts(opt.panel.ratingLabel);
    return calculateSolarMetrics(opt.panel.qty || 0, panelW, opt.pricing.totalPrice || 0);
  }, [proposal]);

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

  const primaryOption = proposal.options[0];

  return (
    <div className="bg-zinc-100 min-h-screen pb-12 font-sans print:bg-white print:p-0">
      
      {/* ── Control Bar (Hidden on Print) ── */}
      <div className="max-w-[210mm] mx-auto pt-8 pb-4 print:hidden flex justify-between items-center">
        <div>
          <h2 className="text-lg font-bold text-zinc-800">Proposal Document</h2>
          <p className="text-xs text-zinc-500">Optimized for A4 Printing</p>
        </div>
        <Button onClick={async () => {
          const { logActivityClient } = await import("@/lib/audit-logger-client");
          await logActivityClient(user, "PDF_GENERATE", {
            proposalId: id,
            qtnNo: proposal.qtnNo,
            propNo: proposal.propNo || "",
            customerName: proposal.customer.name,
            type: "proposal",
            manualClick: true,
          });
          window.print();
        }} className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm">
          <Printer className="h-4 w-4" />
          Print / Save PDF
        </Button>
      </div>

      {/* ── PAGE 1: COVER PAGE ── */}
      <div className="w-[210mm] min-h-[297mm] mx-auto bg-white shadow-md print:shadow-none relative overflow-hidden mb-8 print:mb-0" style={{ pageBreakAfter: "always" }}>
        
        {/* Decorative Header Graphic */}
        <div className="absolute top-0 left-0 w-full h-[350px] bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 rounded-b-[100px] -mt-10 -mx-4 opacity-95 flex flex-col justify-end pb-12 px-16">
          <Image src="/logo.png" alt="Alta Vision" width={220} height={80} className="object-contain brightness-0 invert opacity-90 mb-6" priority />
          <h1 className="text-4xl font-black text-white tracking-tight uppercase">Solar Energy<br/><span className="text-emerald-400">System Proposal</span></h1>
          <p className="text-slate-300 mt-3 max-w-md">Achieve Energy Freedom & Sustainability with World-Class Solar Engineering.</p>
        </div>

        <div className="pt-[380px] px-16 pb-16 h-full flex flex-col">
          
          <div className="space-y-12 flex-grow">
            <div className="grid grid-cols-2 gap-12">
              <div className="space-y-4">
                <h3 className="text-sm font-bold text-slate-400 uppercase tracking-widest border-b border-slate-100 pb-2">Prepared For</h3>
                <div>
                  <p className="text-2xl font-bold text-slate-800">{proposal.customer.name}</p>
                  <p className="text-sm text-slate-600 mt-1 whitespace-pre-wrap leading-relaxed max-w-[250px]">{proposal.customer.address}</p>
                  <p className="text-sm font-medium text-slate-800 mt-3">{proposal.customer.phone} {proposal.customer.phone2 ? `/ ${proposal.customer.phone2}` : ""}</p>
                  <p className="text-sm text-slate-600">{proposal.customer.email}</p>
                </div>
              </div>
              <div className="space-y-4">
                <h3 className="text-sm font-bold text-slate-400 uppercase tracking-widest border-b border-slate-100 pb-2">Proposal Details</h3>
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-sm text-slate-500">Reference No:</span>
                    <span className="text-sm font-bold text-slate-800">{proposal.propNo || proposal.qtnNo}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-slate-500">Generated On:</span>
                    <span className="text-sm font-bold text-slate-800">{proposal.date}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-slate-500">Valid Until:</span>
                    <span className="text-sm font-bold text-slate-800">14 Days from Issue</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-slate-500">System Type:</span>
                    <span className="text-sm font-bold text-emerald-600 capitalize">{proposal.sysType}</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-slate-50 rounded-2xl p-8 border border-slate-100 mt-12 space-y-4">
              <p className="text-sm text-slate-700 leading-relaxed">
                Dear {proposal.customer.name.split(' ')[0] || 'Customer'},
              </p>
              <p className="text-sm text-slate-700 leading-relaxed">
                Thank you for the opportunity to present your tailor-made Solar Energy System Proposal. We at Alta Vision Ltd bring together the best solar equipment in the world with unparalleled engineering expertise to offer the finest solar solutions in Sri Lanka.
              </p>
              <p className="text-sm text-slate-700 leading-relaxed">
                In an era where sustainable energy is a crucial cost-saving strategy for homes and businesses, we are committed to offering the absolute best in renewable infrastructure.
              </p>
              <div className="pt-4">
                <p className="text-sm font-bold text-slate-900">Best Regards,</p>
                <p className="text-sm text-slate-600">The Alta Vision Engineering Team</p>
              </div>
            </div>
          </div>

          <div className="mt-auto pt-8 border-t border-slate-100 flex justify-between items-center text-xs text-slate-400">
            <p>Alta Vision (Pvt) Ltd</p>
            <p>info@altavision.lk | www.altavision.lk</p>
            <p>Page 1</p>
          </div>
        </div>
      </div>

      {/* ── PAGE 2: SYSTEM OVERVIEW & IMPACT ── */}
      <div className="w-[210mm] min-h-[297mm] mx-auto bg-white shadow-md print:shadow-none p-16 flex flex-col mb-8 print:mb-0" style={{ pageBreakAfter: "always" }}>
        <h2 className="text-3xl font-black text-slate-800 mb-8 border-b-2 border-emerald-500 pb-4 inline-block pr-12">Recommended System Option</h2>
        
        <div className="grid grid-cols-3 gap-6 mb-12">
          <div className="bg-slate-50 rounded-xl p-5 border border-slate-100">
            <Zap className="h-6 w-6 text-emerald-500 mb-3" />
            <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">System Size</p>
            <p className="text-3xl font-black text-slate-800">{metrics.totalCapacityKw} kWp</p>
          </div>
          <div className="bg-slate-50 rounded-xl p-5 border border-slate-100">
            <Banknote className="h-6 w-6 text-emerald-500 mb-3" />
            <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">Annual Savings</p>
            <p className="text-3xl font-black text-slate-800">{fmtRs(metrics.financial.annualSavings)}</p>
          </div>
          <div className="bg-emerald-50 rounded-xl p-5 border border-emerald-200">
            <Activity className="h-6 w-6 text-emerald-600 mb-3" />
            <p className="text-xs font-bold text-emerald-600 uppercase tracking-widest mb-1">Total Investment</p>
            <p className="text-3xl font-black text-emerald-800">{fmtRs(primaryOption.pricing.totalPrice)}</p>
          </div>
        </div>

        <h3 className="text-xl font-bold text-slate-800 mb-6">Your Solution Hardware</h3>
        
        <div className="space-y-4 mb-12 flex-grow">
          {/* Inverter */}
          <div className="flex items-start gap-4 p-5 rounded-xl border border-slate-100 bg-white shadow-sm">
            <div className="bg-slate-100 p-3 rounded-lg"><Activity className="h-6 w-6 text-slate-600" /></div>
            <div>
              <p className="text-lg font-bold text-slate-800">{primaryOption.inverter.brand} Hybrid Inverter</p>
              <p className="text-sm text-slate-500 mt-1">{primaryOption.inverter.qty} × {primaryOption.inverter.model}</p>
              <div className="flex gap-4 mt-3">
                <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600 bg-emerald-50 px-2 py-1 rounded-md"><ShieldCheck className="h-3 w-3"/> {primaryOption.inverter.warranty || "5"} Yr Warranty</span>
              </div>
            </div>
          </div>

          {/* Battery */}
          {primaryOption.battery && (
            <div className="flex items-start gap-4 p-5 rounded-xl border border-slate-100 bg-white shadow-sm">
              <div className="bg-slate-100 p-3 rounded-lg"><Battery className="h-6 w-6 text-slate-600" /></div>
              <div>
                <p className="text-lg font-bold text-slate-800">{primaryOption.battery.brand} Energy Storage</p>
                <p className="text-sm text-slate-500 mt-1">{primaryOption.battery.qty} × {primaryOption.battery.ratingLabel || primaryOption.battery.model}</p>
                <div className="flex gap-4 mt-3">
                  <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600 bg-emerald-50 px-2 py-1 rounded-md"><ShieldCheck className="h-3 w-3"/> {primaryOption.battery.warranty || "5"} Yr Warranty</span>
                </div>
              </div>
            </div>
          )}

          {/* Panels */}
          <div className="flex items-start gap-4 p-5 rounded-xl border border-slate-100 bg-white shadow-sm">
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
              <p className="text-3xl font-black text-emerald-400">{metrics.environmental.carDistanceAvoidedKm.toLocaleString()} km</p>
              <p className="text-xs text-slate-400 mt-1 uppercase tracking-wider">Car Travel Avoided</p>
            </div>
          </div>
        </div>

        <div className="mt-auto pt-8 border-t border-slate-100 flex justify-between items-center text-xs text-slate-400">
          <p>Alta Vision (Pvt) Ltd</p>
          <p>{proposal.propNo || proposal.qtnNo}</p>
          <p>Page 2</p>
        </div>
      </div>

      {/* ── PAGE 3: PERFORMANCE & ROI ── */}
      <div className="w-[210mm] min-h-[297mm] mx-auto bg-white shadow-md print:shadow-none p-16 flex flex-col mb-8 print:mb-0" style={{ pageBreakAfter: "always" }}>
        <h2 className="text-3xl font-black text-slate-800 mb-8 border-b-2 border-emerald-500 pb-4 inline-block pr-12">Performance & ROI</h2>

        <div className="grid grid-cols-2 gap-8 mb-12">
          <div className="space-y-6">
            <div>
              <p className="text-sm font-bold text-slate-400 uppercase tracking-widest mb-1">Projected Annual Output</p>
              <p className="text-4xl font-black text-emerald-600">{metrics.annualGenerationKwh.toLocaleString()} <span className="text-xl">kWh</span></p>
            </div>
            <div>
              <p className="text-sm font-bold text-slate-400 uppercase tracking-widest mb-1">Lifetime Generation (25 Yrs)</p>
              <p className="text-2xl font-bold text-slate-800">{metrics.financial.lifetimeGenerationMwh.toLocaleString()} MWh</p>
            </div>
          </div>
          <div className="space-y-6 bg-slate-50 p-6 rounded-xl border border-slate-100">
            <div>
              <p className="text-sm font-bold text-slate-400 uppercase tracking-widest mb-1">Break-Even Point</p>
              <p className="text-4xl font-black text-emerald-600">{metrics.financial.breakEvenYears} <span className="text-xl">Years</span></p>
              <p className="text-xs text-slate-500 mt-2">After {metrics.financial.breakEvenYears} years, your electricity becomes 100% profit.</p>
            </div>
            <div className="pt-4 border-t border-slate-200">
              <p className="text-sm font-bold text-slate-400 uppercase tracking-widest mb-1">25-Year Net Profit</p>
              <p className="text-2xl font-bold text-slate-800">{fmtRs(metrics.financial.lifetimeProfit)}</p>
            </div>
          </div>
        </div>

        <h3 className="text-xl font-bold text-slate-800 mb-4">Monthly Generation Breakdown</h3>
        <p className="text-xs text-slate-500 mb-6">Estimated values based on historical solar irradiance averages for Sri Lanka. Actual performance may vary.</p>
        
        <div className="border border-slate-200 rounded-xl overflow-hidden flex-grow mb-8">
          <table className="w-full text-sm text-left">
            <thead className="bg-slate-50 text-slate-600 font-bold uppercase text-[10px] tracking-wider">
              <tr>
                <th className="px-6 py-4">Month</th>
                <th className="px-6 py-4 text-center">Avg Daily Sun (h)</th>
                <th className="px-6 py-4 text-right">Generation (kWh)</th>
                <th className="px-6 py-4 text-right">Est. Savings</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {metrics.monthlyData.map((m) => (
                <tr key={m.month} className="hover:bg-slate-50">
                  <td className="px-6 py-3 font-bold text-slate-800">{m.month}</td>
                  <td className="px-6 py-3 text-center text-slate-600">{m.sunHours}</td>
                  <td className="px-6 py-3 text-right font-medium text-emerald-600">{m.generation}</td>
                  <td className="px-6 py-3 text-right font-medium text-slate-800">{fmtRs(m.savings)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-slate-50 font-bold">
              <tr>
                <td className="px-6 py-4 text-slate-800">ANNUAL TOTAL</td>
                <td className="px-6 py-4 text-center text-slate-600">—</td>
                <td className="px-6 py-4 text-right text-emerald-600">{metrics.annualGenerationKwh.toLocaleString()}</td>
                <td className="px-6 py-4 text-right text-slate-800">{fmtRs(metrics.financial.annualSavings)}</td>
              </tr>
            </tfoot>
          </table>
        </div>

        <div className="mt-auto pt-8 border-t border-slate-100 flex justify-between items-center text-xs text-slate-400">
          <p>Alta Vision (Pvt) Ltd</p>
          <p>{proposal.propNo || proposal.qtnNo}</p>
          <p>Page 3</p>
        </div>
      </div>

      {/* ── PAGE 4: DETAILED OPTIONS PRICING ── */}
      <div className="w-[210mm] min-h-[297mm] mx-auto bg-white shadow-md print:shadow-none p-16 flex flex-col mb-8 print:mb-0" style={{ pageBreakAfter: "always" }}>
        <h2 className="text-3xl font-black text-slate-800 mb-8 border-b-2 border-emerald-500 pb-4 inline-block pr-12">Detailed Cost Breakdown</h2>

        <div className="space-y-12 flex-grow">
          {proposal.options.map((opt, i) => (
            <div key={i} className={`rounded-2xl border ${i === 0 ? 'border-emerald-200 shadow-md bg-emerald-50/30' : 'border-slate-200 bg-white'}`}>
              <div className={`p-4 border-b ${i === 0 ? 'bg-emerald-50 border-emerald-100' : 'bg-slate-50 border-slate-200'} rounded-t-2xl flex justify-between items-center`}>
                <h3 className={`font-bold text-lg ${i === 0 ? 'text-emerald-800' : 'text-slate-800'}`}>{opt.label} {i === 0 && <span className="text-xs bg-emerald-200 text-emerald-800 px-2 py-0.5 rounded-full ml-2 uppercase tracking-wide">Recommended</span>}</h3>
                <p className="font-mono text-sm text-slate-500">System Capacity: {((opt.panel.qty || 0) * parseWatts(opt.panel.ratingLabel) / 1000).toFixed(2)} kWp</p>
              </div>
              <div className="p-6">
                <table className="w-full text-sm text-left mb-6">
                  <thead className="text-[10px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100">
                    <tr>
                      <th className="pb-2">Component</th>
                      <th className="pb-2 text-center">Qty</th>
                      <th className="pb-2 text-right">Details</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    <tr>
                      <td className="py-3 font-medium text-slate-800">Solar Panels</td>
                      <td className="py-3 text-center text-slate-600">{opt.panel.qty}</td>
                      <td className="py-3 text-right text-slate-600">{opt.panel.brand} {opt.panel.ratingLabel}</td>
                    </tr>
                    <tr>
                      <td className="py-3 font-medium text-slate-800">Hybrid Inverter</td>
                      <td className="py-3 text-center text-slate-600">{opt.inverter.qty}</td>
                      <td className="py-3 text-right text-slate-600">{opt.inverter.brand} {opt.inverter.model}</td>
                    </tr>
                    {opt.battery && (
                      <tr>
                        <td className="py-3 font-medium text-slate-800">Energy Storage</td>
                        <td className="py-3 text-center text-slate-600">{opt.battery.qty}</td>
                        <td className="py-3 text-right text-slate-600">{opt.battery.brand} {opt.battery.ratingLabel}</td>
                      </tr>
                    )}
                    <tr>
                      <td className="py-3 font-medium text-slate-800">Installation & Mounting</td>
                      <td className="py-3 text-center text-slate-600">1</td>
                      <td className="py-3 text-right text-slate-600">Standard Roof Mounting Kit, AC/DC Cabling, Earthing</td>
                    </tr>
                  </tbody>
                </table>
                <div className="flex justify-between items-center pt-4 border-t-2 border-slate-800">
                  <span className="font-bold text-slate-800 uppercase tracking-wider">Total System Investment</span>
                  <span className={`text-2xl font-black ${i === 0 ? 'text-emerald-700' : 'text-slate-800'}`}>{fmtRs(opt.pricing.totalPrice)}</span>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-auto pt-8 border-t border-slate-100 flex justify-between items-center text-xs text-slate-400">
          <p>Alta Vision (Pvt) Ltd</p>
          <p>{proposal.propNo || proposal.qtnNo}</p>
          <p>Page 4</p>
        </div>
      </div>

      {/* ── PAGE 5+: LEGAL DOCS ── */}
      {legalDocs.map((doc, idx) => (
        <div key={idx} className="w-[210mm] min-h-[297mm] mx-auto bg-white shadow-md print:shadow-none p-16 flex flex-col mb-8 print:mb-0" style={{ pageBreakAfter: "always" }}>
          <h2 className="text-2xl font-bold text-slate-800 mb-8 border-b-2 border-slate-200 pb-4 inline-block pr-12">{doc.title}</h2>
          
          <div className="flex-grow prose prose-sm prose-slate max-w-none prose-headings:font-bold prose-headings:text-slate-800 prose-p:text-slate-600 prose-li:text-slate-600">
            <ReactMarkdown>{doc.content}</ReactMarkdown>
          </div>

          <div className="mt-auto pt-8 border-t border-slate-100 flex justify-between items-center text-xs text-slate-400">
            <p>Alta Vision (Pvt) Ltd</p>
            <p>{proposal.propNo || proposal.qtnNo}</p>
            <p>Page {5 + idx}</p>
          </div>
        </div>
      ))}

    </div>
  );
}
