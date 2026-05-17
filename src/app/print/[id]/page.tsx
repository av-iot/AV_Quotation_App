"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { doc, getDoc, collection, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Proposal } from "@/types";
import { Loader2, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth-context";

export default function PrintProposalPage() {
  const { id } = useParams() as { id: string };
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();

  useEffect(() => {
    async function load() {
      try {
        const snap = await getDoc(doc(db, "proposals", id));
        if (snap.exists()) {
          const propData = { id: snap.id, ...snap.data() } as Proposal;
          
          // Fetch products to resolve names if needed
          const prodSnap = await getDocs(collection(db, "products"));
          const productsMap = new Map();
          prodSnap.docs.forEach((d) => productsMap.set(d.id, d.data()));
          
          // Enrich proposal options with product names if missing
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
          
          // Log PDF generation
          import("@/lib/audit-logger-client").then(({ logActivityClient }) => {
            logActivityClient(user, "PDF_GENERATE", {
              proposalId: id,
              qtnNo: propData.qtnNo,
              propNo: propData.propNo || "",
              customerName: propData.customer.name,
              type: "proposal",
            });
          });

          // Wait a bit for render then print
          setTimeout(() => {
            window.print();
          }, 500);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [id]);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center gap-2 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
        <span className="text-sm">Loading PDF preview…</span>
      </div>
    );
  }

  if (!proposal) {
    return <div className="p-8 text-center text-muted-foreground">Proposal not found.</div>;
  }

  return (
    <div className="bg-white text-black min-h-screen p-8 max-w-4xl mx-auto font-sans">
      <div className="print:hidden mb-8 flex justify-end">
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
        }} className="gap-2">
          <Printer className="h-4 w-4" />
          Print / Save as PDF
        </Button>
      </div>

      {/* Basic PDF Layout */}
      <div className="space-y-8">
        <header className="border-b pb-4 flex justify-between items-end">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Alta Vision</h1>
            <p className="text-sm text-gray-500 mt-1">Solar PV System Quotation</p>
          </div>
          <div className="text-right">
            <p className="font-bold text-lg">{proposal.propNo || proposal.qtnNo}</p>
            <p className="text-sm text-gray-500">Date: {proposal.date}</p>
          </div>
        </header>

        <section>
          <h2 className="text-lg font-semibold border-b pb-2 mb-4">Customer Details</h2>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-gray-500">Name</p>
              <p className="font-medium">{proposal.customer.name}</p>
            </div>
            <div>
              <p className="text-gray-500">Address</p>
              <p className="font-medium">{proposal.customer.address}</p>
            </div>
            <div>
              <p className="text-gray-500">Contact</p>
              <p className="font-medium">{proposal.customer.phone} {proposal.customer.phone2 ? `/ ${proposal.customer.phone2}` : ""}</p>
            </div>
            <div>
              <p className="text-gray-500">Email</p>
              <p className="font-medium">{proposal.customer.email || "N/A"}</p>
            </div>
          </div>
        </section>

        <section>
          <h2 className="text-lg font-semibold border-b pb-2 mb-4">System Specifications</h2>
          <div className="grid grid-cols-3 gap-4 text-sm">
            <div>
              <p className="text-gray-500">System Type</p>
              <p className="font-medium capitalize">{proposal.sysType}</p>
            </div>
            <div>
              <p className="text-gray-500">Utility / Phase</p>
              <p className="font-medium">{proposal.utility} / {proposal.phase} Phase</p>
            </div>
            <div>
              <p className="text-gray-500">Power Scheme</p>
              <p className="font-medium">{proposal.powerScheme}</p>
            </div>
          </div>
        </section>

        <section>
          <h2 className="text-lg font-semibold border-b pb-2 mb-4">Proposed Options</h2>
          <div className="space-y-6">
            {proposal.options.map((opt, i) => (
              <div key={i} className="border rounded-lg p-4 bg-gray-50">
                <h3 className="font-bold text-lg mb-3">{opt.label}</h3>
                <div className="grid grid-cols-2 gap-y-2 text-sm mb-4">
                  <div className="text-gray-600">Inverter</div>
                  <div className="font-medium text-right">{opt.inverter.qty}x {opt.inverter.brand} {opt.inverter.model}</div>
                  
                  <div className="text-gray-600">Solar Panels</div>
                  <div className="font-medium text-right">{opt.panel.qty}x {opt.panel.brand}</div>

                  {opt.battery && (
                    <>
                      <div className="text-gray-600">Battery</div>
                      <div className="font-medium text-right">{opt.battery.qty}x {opt.battery.brand}</div>
                    </>
                  )}
                </div>
                <div className="pt-3 border-t flex justify-between items-center">
                  <span className="font-bold text-gray-700">Total Investment</span>
                  <span className="text-xl font-bold">Rs. {opt.pricing.totalPrice.toLocaleString()}</span>
                </div>
              </div>
            ))}
          </div>
        </section>

        <footer className="pt-12 text-center text-sm text-gray-500">
          <p>This is a system generated quotation and is subject to full terms and conditions.</p>
        </footer>
      </div>
    </div>
  );
}
