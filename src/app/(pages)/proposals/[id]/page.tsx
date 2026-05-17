"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { doc, getDoc, updateDoc, addDoc, collection, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Proposal } from "@/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Download, Loader2, FileText, Check, Receipt } from "lucide-react";
import Link from "next/link";
import { motion } from "framer-motion";
import { useAuth } from "@/lib/auth-context";
import { useToast } from "@/hooks/use-toast";

export default function ProposalDetailPage() {
  const { id } = useParams() as { id: string };
  const router = useRouter();
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();
  const { toast } = useToast();
  const [showConvertModal, setShowConvertModal] = useState(false);
  const [selectedOptionIdx, setSelectedOptionIdx] = useState(0);
  const [converting, setConverting] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const snap = await getDoc(doc(db, "proposals", id));
        if (snap.exists()) {
          setProposal({ id: snap.id, ...snap.data() } as Proposal);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [id]);

  const handleConvert = async () => {
    if (!proposal || !user) return;
    setConverting(true);
    try {
      const opt = proposal.options[selectedOptionIdx];
      
      const items = [
        {
          description: `${opt.panel.qty}x ${opt.panel.brand} ${opt.panel.model} (${opt.panel.ratingLabel}) Solar Panels`,
          qty: opt.panel.qty,
          unitPrice: 0,
          total: 0,
        },
        {
          description: `${opt.inverter.qty}x ${opt.inverter.brand} ${opt.inverter.model} (${opt.inverter.ratingLabel}) Inverter`,
          qty: opt.inverter.qty,
          unitPrice: 0,
          total: 0,
        }
      ];

      if (opt.battery) {
        items.push({
          description: `${opt.battery.qty}x ${opt.battery.brand} ${opt.battery.model} (${opt.battery.ratingLabel}) Battery Storage`,
          qty: opt.battery.qty,
          unitPrice: 0,
          total: 0,
        });
      }

      // Generate dynamic and intelligent description
      const panelStr = `${opt.panel.qty}nos ${opt.panel.ratingLabel || ""} ${opt.panel.brand || ""} ${opt.panel.model || ""} Solar panels`.replace(/\s+/g, " ").trim();
      const inverterStr = `${opt.inverter.qty > 1 ? `${opt.inverter.qty}nos of ` : ""}${opt.inverter.ratingLabel || ""} ${opt.inverter.brand || ""} ${opt.inverter.model || ""} hybrid inverter`.replace(/\s+/g, " ").trim();
      const batteryStr = opt.battery
        ? `, ${opt.battery.qty > 1 ? `${opt.battery.qty}nos of ` : "nos of "}${opt.battery.ratingLabel || ""} ${opt.battery.brand || ""} ${opt.battery.model || ""} batteries`
        : "";
      const dynamicDescription = `Supply and installation of ${inverterStr}${batteryStr} with ${panelStr}`.replace(/\s+/g, " ").trim();

      // Formulate warranties
      const inverterWarranty = `• ${opt.inverter.warranty || "5 years"} Warranty`;
      const batteryWarranty = opt.battery ? `• ${opt.battery.warranty || "5 years"} Warranty` : "";
      const panelWarrantyVal = opt.panel.warranty || "12 years";
      const panelWarranty = `• ${panelWarrantyVal} Product Warranty\n• 25 Years Performance Warranty`;

      const quotation = {
        proposalId: id,
        qtnNo: proposal.qtnNo,
        date: new Date().toISOString().split("T")[0],
        customer: proposal.customer,
        items,
        description: dynamicDescription,
        subtotal: opt.pricing.totalPrice,
        total: opt.pricing.totalPrice,
        selectedOption: selectedOptionIdx,
        paymentStatus: "pending_payment",
        inverterWarranty,
        batteryWarranty,
        panelWarranty,
        validityPeriod: "• Quotation Valid for 1 week.",
        paymentTerm: "• The job will be confirmed upon receipt of full payment.",
        confirmedAt: new Date().toISOString(),
        confirmedBy: user.uid,
        bankDetails: {
          accountName: "Alta Vision (Pvt) Ltd",
          bank: "NTB",
          branch: "Tangalle",
          accountNo: "1008 9000 8235"
        },
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };

      // 1. Create the Quotation document
      const qtnRef = await addDoc(collection(db, "quotations"), quotation);

      // 2. Update the Proposal status
      await updateDoc(doc(db, "proposals", id), {
        status: "converted"
      });

      // 3. Log the activity
      const { logActivityClient } = await import("@/lib/audit-logger-client");
      await logActivityClient(user, "QUOTATION_CREATE", {
        proposalId: id,
        qtnNo: proposal.qtnNo,
        quotationId: qtnRef.id,
        customerName: proposal.customer.name,
        optionIndex: selectedOptionIdx,
        optionLabel: opt.label || `Option ${selectedOptionIdx + 1}`,
      });

      toast({
        title: "Converted to Quotation!",
        description: `Reference: ${proposal.qtnNo} is now confirmed.`,
      });

      router.push("/quotations");
    } catch (err: any) {
      toast({
        title: "Conversion failed",
        description: err.message,
        variant: "destructive",
      });
    } finally {
      setConverting(false);
      setShowConvertModal(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-[80vh] items-center justify-center gap-2 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
        <span className="text-sm">Loading proposal…</span>
      </div>
    );
  }

  if (!proposal) {
    return (
      <div className="flex h-[80vh] flex-col items-center justify-center gap-4 text-muted-foreground">
        <p>Proposal not found.</p>
        <Button variant="outline" asChild>
          <Link href="/proposals">Back to Proposals</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="p-6 mx-auto max-w-4xl">
      <Button variant="ghost" className="mb-6 gap-2" asChild>
        <Link href="/proposals">
          <ArrowLeft className="h-4 w-4" />
          Back
        </Link>
      </Button>

      <div className="mb-8 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
            <FileText className="h-6 w-6 text-primary" />
          </div>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold">{proposal.propNo || proposal.qtnNo}</h1>
              <Badge variant={proposal.status === "sent" ? "default" : "secondary"} className="uppercase text-[10px]">
                {proposal.status}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              Ref: {proposal.qtnNo}
            </p>
            <p className="text-sm text-muted-foreground mt-1">
              Created on {proposal.date} for {proposal.customer.name}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          {proposal.status !== "converted" && (
            <Button onClick={() => setShowConvertModal(true)} className="gap-2 bg-green-600 hover:bg-green-700 text-white">
              <Check className="h-4 w-4" />
              Confirm & Convert
            </Button>
          )}
          {proposal.docxUrl && (
            <Button asChild className="gap-2 bg-primary hover:bg-primary/90" onClick={async () => {
              const { logActivityClient } = await import("@/lib/audit-logger-client");
              await logActivityClient(user, "DOCX_DOWNLOAD", {
                proposalId: id,
                qtnNo: proposal.qtnNo,
                propNo: proposal.propNo || "",
                customerName: proposal.customer.name,
              });
            }}>
              <a href={proposal.docxUrl} target="_blank" rel="noreferrer">
                <Download className="h-4 w-4" />
                Download Word Document
              </a>
            </Button>
          )}
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Customer Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div>
                <span className="text-muted-foreground block text-xs">Name</span>
                <span className="font-medium">{proposal.customer.name}</span>
              </div>
              <div>
                <span className="text-muted-foreground block text-xs">Address</span>
                <span className="font-medium">{proposal.customer.address}</span>
              </div>
              <div>
                <span className="text-muted-foreground block text-xs">Contact</span>
                <span className="font-medium">{proposal.customer.phone} {proposal.customer.phone2 ? `/ ${proposal.customer.phone2}` : ""}</span>
              </div>
              <div>
                <span className="text-muted-foreground block text-xs">Email</span>
                <span className="font-medium">{proposal.customer.email || "—"}</span>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Site & System</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div>
                <span className="text-muted-foreground block text-xs">System Type</span>
                <span className="font-medium capitalize">{proposal.sysType}</span>
              </div>
              <div>
                <span className="text-muted-foreground block text-xs">Utility</span>
                <span className="font-medium">{proposal.utility} ({proposal.phase} Phase)</span>
              </div>
              <div>
                <span className="text-muted-foreground block text-xs">Power Scheme</span>
                <span className="font-medium">{proposal.powerScheme}</span>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="md:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Options Included ({proposal.numOptions})</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-6 sm:grid-cols-2">
                {proposal.options.map((opt, i) => (
                  <div key={i} className="rounded-lg border p-4">
                    <h3 className="mb-2 font-semibold text-primary">{opt.label}</h3>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between border-b pb-1">
                        <span className="text-muted-foreground text-xs">Inverter</span>
                        <span className="font-medium text-right text-xs max-w-[150px] truncate">{opt.inverter.brand} {opt.inverter.model}</span>
                      </div>
                      <div className="flex justify-between border-b pb-1">
                        <span className="text-muted-foreground text-xs">Panels</span>
                        <span className="font-medium text-right text-xs max-w-[150px] truncate">{opt.panel.qty}x {opt.panel.brand}</span>
                      </div>
                      <div className="flex justify-between pt-1">
                        <span className="text-muted-foreground font-semibold">Total Price</span>
                        <span className="font-bold">Rs. {opt.pricing.totalPrice.toLocaleString()}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* Convert to Quotation Modal */}
      {showConvertModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in duration-200">
          <Card className="max-w-md w-full shadow-2xl border bg-card">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Receipt className="h-5 w-5 text-green-600" />
                Confirm & Convert to Quotation
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Convert this solar proposal into a confirmed order. Select the system option accepted by the customer.
              </p>

              {proposal.numOptions > 1 ? (
                <div className="space-y-3">
                  <label className="text-xs font-semibold text-muted-foreground uppercase">Select Option</label>
                  <div className="grid gap-3">
                    {proposal.options.map((opt, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => setSelectedOptionIdx(i)}
                        className={`flex flex-col text-left p-3 rounded-lg border-2 transition-all ${
                          selectedOptionIdx === i
                            ? "border-green-600 bg-green-50/20 dark:bg-green-950/20"
                            : "border-muted hover:border-muted-foreground"
                        }`}
                      >
                        <span className="font-bold text-sm text-primary">{opt.label || `Option ${i + 1}`}</span>
                        <span className="text-xs text-muted-foreground mt-1">
                          {opt.panel.qty}x {opt.panel.brand} / {opt.inverter.qty}x {opt.inverter.brand}
                        </span>
                        <span className="font-bold text-sm mt-2 text-green-600">
                          Rs. {opt.pricing.totalPrice.toLocaleString()}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="p-3 bg-muted/40 rounded-lg text-sm space-y-1">
                  <p className="font-medium text-xs text-muted-foreground">Selected Option</p>
                  <p className="font-semibold text-primary">{proposal.options[0]?.label || "Option 1"}</p>
                  <p className="text-xs text-muted-foreground">
                    {proposal.options[0]?.panel.qty}x {proposal.options[0]?.panel.brand} / {proposal.options[0]?.inverter.qty}x {proposal.options[0]?.inverter.brand}
                  </p>
                  <p className="font-bold text-green-600 mt-1">
                    Rs. {proposal.options[0]?.pricing.totalPrice.toLocaleString()}
                  </p>
                </div>
              )}

              <div className="flex gap-3 justify-end pt-2">
                <Button variant="outline" onClick={() => setShowConvertModal(false)} disabled={converting}>
                  Cancel
                </Button>
                <Button onClick={handleConvert} disabled={converting} className="bg-green-600 hover:bg-green-700 text-white gap-2">
                  {converting && <Loader2 className="h-4 w-4 animate-spin" />}
                  Confirm Order
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
