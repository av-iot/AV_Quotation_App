"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Proposal } from "@/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Download, Loader2, FileText } from "lucide-react";
import Link from "next/link";
import { motion } from "framer-motion";

export default function ProposalDetailPage() {
  const { id } = useParams() as { id: string };
  const router = useRouter();
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [loading, setLoading] = useState(true);

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
        {proposal.docxUrl && (
          <Button asChild className="gap-2 bg-primary hover:bg-primary/90">
            <a href={proposal.docxUrl} target="_blank" rel="noreferrer">
              <Download className="h-4 w-4" />
              Download Word Document
            </a>
          </Button>
        )}
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
    </div>
  );
}
