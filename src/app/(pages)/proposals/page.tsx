"use client";

import { useEffect, useState } from "react";
import { collection, query, orderBy, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/auth-context";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { FileText, Plus, Search, Download, Eye, Loader2, Trash2, ArrowRight, Pencil } from "lucide-react";
import type { Proposal, ProposalStatus } from "@/types";

const STATUS: Record<ProposalStatus, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  draft: { label: "Draft", variant: "secondary" },
  sent: { label: "Sent", variant: "default" },
  confirmed: { label: "Confirmed", variant: "default" },
  partial: { label: "Partial", variant: "outline" },
  converted: { label: "Converted", variant: "default" },
  expired: { label: "Expired", variant: "destructive" },
};

export default function ProposalsPage() {
  const { firebaseUser, user } = useAuth();
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const canCRUD = user?.role && ["superadmin", "admin", "authorized"].includes(user.role);

  useEffect(() => {
    if (!firebaseUser) return;
    const q = query(collection(db, "proposals"), orderBy("createdAt", "desc"));
    return onSnapshot(q, (s) => {
      setProposals(s.docs.map((d) => ({ id: d.id, ...d.data() }) as Proposal));
      setLoading(false);
    });
  }, [firebaseUser]);

  const filtered = proposals.filter(
    (p) =>
      p.customer?.name?.toLowerCase().includes(search.toLowerCase()) ||
      p.qtnNo?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="p-6">
      <div className="mb-6 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
            <FileText className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold">Proposals</h1>
            <p className="text-sm text-muted-foreground">All solar PV quotations</p>
          </div>
        </div>
        {canCRUD && (
          <Button asChild className="gap-2 bg-primary hover:bg-primary/90">
            <Link href="/proposals/new">
              <Plus className="h-4 w-4" />
              New proposal
            </Link>
          </Button>
        )}
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4 pb-4">
          <CardTitle className="text-base">All proposals</CardTitle>
          <div className="relative w-64">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input className="pl-8 h-9 text-sm" placeholder="Search…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex h-32 items-center justify-center gap-2 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="text-sm">Loading…</span>
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex h-32 flex-col items-center justify-center gap-3">
              <p className="text-sm text-muted-foreground">{search ? "No results." : "No proposals yet."}</p>
              {!search && (
                <Button asChild size="sm" className="gap-2">
                  <Link href="/proposals/new"><Plus className="h-3.5 w-3.5" />Create first proposal</Link>
                </Button>
              )}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Proposal No.</TableHead>
                  <TableHead className="text-xs">Customer</TableHead>
                  <TableHead className="text-xs">Date</TableHead>
                  <TableHead className="text-xs">Type</TableHead>
                  <TableHead className="text-xs">Options</TableHead>
                  <TableHead className="text-xs">Status</TableHead>
                  <TableHead className="text-xs" />
                </TableRow>
              </TableHeader>
              <TableBody>
                <AnimatePresence>
                  {filtered.map((p, i) => (
                    <motion.tr
                      key={p.id}
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.03 }}
                      className="border-b last:border-0 hover:bg-muted/40 transition-colors"
                    >
                      <TableCell className="py-3 text-sm font-mono font-medium text-primary">
                        {p.propNo || p.qtnNo || "No Reference"}
                      </TableCell>
                      <TableCell className="py-3 text-sm">{p.customer?.name}</TableCell>
                      <TableCell className="py-3 text-sm text-muted-foreground">{p.date}</TableCell>
                      <TableCell className="py-3 text-xs uppercase text-muted-foreground">
                        {p.options && p.options.length > 0
                          ? Array.from(new Set(p.options.map((o: any) => o.sysType).filter(Boolean))).join(", ")
                          : p.sysType}
                      </TableCell>
                      <TableCell className="py-3 text-sm text-center">{p.numOptions}</TableCell>
                      <TableCell className="py-3">
                        <Badge variant={STATUS[p.status]?.variant || "outline"} className="text-xs">
                          {STATUS[p.status]?.label || p.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="py-3">
                        <div className="flex gap-1 justify-end">
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-blue-500" title="View PDF" asChild>
                            <Link href={`/print/${p.id}`}><Eye className="h-3.5 w-3.5" /></Link>
                          </Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-primary" title="Next Step / Details" asChild>
                            <Link href={`/proposals/${p.id}`}><ArrowRight className="h-3.5 w-3.5" /></Link>
                          </Button>
                          {canCRUD && (
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-amber-500" title="Edit Proposal" asChild>
                              <Link href={`/proposals/${p.id}/edit`}><Pencil className="h-3.5 w-3.5" /></Link>
                            </Button>
                          )}
                          {p.docxUrl && (
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-green-500" title="Download Word" asChild>
                              <a href={p.docxUrl} target="_blank" rel="noreferrer"><Download className="h-3.5 w-3.5" /></a>
                            </Button>
                          )}
                          {canCRUD && (
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              className="h-7 w-7 text-muted-foreground hover:text-destructive"
                              title="Delete"
                              onClick={async () => {
                                if (window.confirm("Are you really sure ?")) {
                                  try {
                                    const { deleteDoc, doc } = await import("firebase/firestore");
                                    await deleteDoc(doc(db, "proposals", p.id));

                                    const { logActivityClient } = await import("@/lib/audit-logger-client");
                                    await logActivityClient(user, "PROPOSAL_DELETE", {
                                      proposalId: p.id,
                                      qtnNo: p.qtnNo,
                                      customerName: p.customer?.name || "",
                                    });
                                  } catch (error) {
                                    console.error("Failed to delete proposal:", error);
                                  }
                                }
                              }}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </motion.tr>
                  ))}
                </AnimatePresence>
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
