"use client";

import { useEffect, useState, useMemo } from "react";
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
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator, DropdownMenuLabel } from "@/components/ui/dropdown-menu";
import { FileText, Plus, Search, Eye, Loader2, Trash2, ArrowRight, Pencil, Send, Mail, MessageCircle, Printer, MoreVertical } from "lucide-react";
import type { Proposal, ProposalStatus } from "@/types";
import ShareModal from "@/components/proposals/ShareModal";
import { Pagination } from "@/components/ui/pagination";

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
  const [shareOpen, setShareOpen] = useState(false);
  const [shareDoc, setShareDoc] = useState<any>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

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
      p.qtnNo?.toLowerCase().includes(search.toLowerCase()) ||
      p.propNo?.toLowerCase().includes(search.toLowerCase())
  );

  // Reset to page 1 when search changes
  useMemo(() => { setPage(1); }, [search]);

  const pagedProposals = filtered.slice((page - 1) * pageSize, page * pageSize);

  return (
    <div className="p-4 md:p-8 max-w-[1400px] mx-auto space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row items-start md:items-end justify-between gap-6 mb-2">
        <div>
          <div className="inline-flex items-center gap-1.5 text-xs font-bold text-primary mb-3 bg-primary/10 px-3 py-1.5 rounded-full border border-primary/20">
            <FileText className="h-3.5 w-3.5" />
            Proposals
          </div>
          <h1 className="text-3xl md:text-4xl font-black tracking-tight text-foreground">
            Manage Proposals
          </h1>
          <p className="text-muted-foreground mt-2 text-sm md:text-base font-medium">Create and track all solar PV proposals.</p>
        </div>
        {canCRUD && (
          <Button asChild className="gap-2 shadow-sm rounded-lg h-10 px-5">
            <Link href="/proposals/new">
              <Plus className="h-4 w-4" />
              New Proposal
            </Link>
          </Button>
        )}
      </div>

      <Card className="shadow-sm border-border/60">
        <CardHeader className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 border-b border-border/50">
          <CardTitle className="text-lg font-semibold">All Proposals</CardTitle>
          <div className="relative w-full sm:w-72">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input className="pl-9 h-9 text-sm bg-muted/30 border-border/50 focus-visible:ring-primary/20" placeholder="Search by customer or reference..." value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex flex-col h-48 items-center justify-center gap-3 text-muted-foreground bg-muted/10">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
              <span className="text-sm font-medium">Loading proposals...</span>
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col h-48 items-center justify-center gap-3 bg-muted/10">
              <FileText className="h-8 w-8 text-muted-foreground/50" />
              <p className="text-sm font-medium text-muted-foreground">{search ? "No results found." : "No proposals yet."}</p>
              {!search && (
                <Button asChild size="sm" variant="outline" className="mt-2">
                  <Link href="/proposals/new"><Plus className="h-3.5 w-3.5 mr-1.5" />Create first proposal</Link>
                </Button>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader className="bg-muted/30">
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="text-xs font-semibold uppercase tracking-wider h-10">Reference</TableHead>
                    <TableHead className="text-xs font-semibold uppercase tracking-wider h-10">Customer</TableHead>
                    <TableHead className="text-xs font-semibold uppercase tracking-wider h-10">Date</TableHead>
                    <TableHead className="text-xs font-semibold uppercase tracking-wider h-10">Status</TableHead>
                    <TableHead className="text-xs font-semibold uppercase tracking-wider h-10 text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <AnimatePresence>
                    {pagedProposals.map((p, i) => {
                      const docUrl = typeof window !== "undefined" ? `${window.location.origin}/print/${p.id}` : "";

                      return (
                        <motion.tr
                          key={p.id}
                          initial={{ opacity: 0, y: 5 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: i * 0.02 }}
                          className="border-b border-border/50 last:border-0 hover:bg-muted/30 transition-colors group"
                        >
                          <TableCell className="py-3 text-sm font-mono font-semibold text-primary">
                            <Link href={`/proposals/${p.id}`} className="hover:underline">
                              {p.propNo || p.qtnNo || "Draft"}
                            </Link>
                          </TableCell>
                          <TableCell className="py-3">
                            <Link href={`/proposals/${p.id}`} className="hover:underline font-semibold text-foreground hover:text-primary transition-colors text-sm">
                              {p.customer?.name || "Unnamed Customer"}
                            </Link>
                            <p className="text-xs text-muted-foreground mt-0.5 truncate max-w-[200px]">
                              {p.options && p.options.length > 0
                                ? Array.from(new Set(p.options.map((o: any) => o.sysType).filter(Boolean))).join(", ")
                                : p.sysType || "Custom System"}
                            </p>
                          </TableCell>
                          <TableCell className="py-3 text-sm text-muted-foreground">
                            {p.date || new Date((p.createdAt as any)?.seconds * 1000).toLocaleDateString()}
                          </TableCell>
                          <TableCell className="py-3">
                            <Badge variant={STATUS[p.status]?.variant || "outline"} className="text-[10px] uppercase font-bold tracking-wider shadow-none whitespace-nowrap">
                              {STATUS[p.status]?.label || p.status || "DRAFT"}
                            </Badge>
                          </TableCell>
                          <TableCell className="py-3">
                            <div className="flex items-center justify-end gap-2 opacity-90 group-hover:opacity-100 transition-opacity">
                              
                              {/* Next Step: Generate Quotation */}
                              {canCRUD && p.status !== "converted" && (
                                <Button size="sm" className="h-8 text-xs font-semibold shadow-sm bg-primary hover:bg-primary/90 text-primary-foreground pr-2.5" asChild>
                                  <Link href={`/proposals/${p.id}`}>
                                    Next Step <ArrowRight className="h-3.5 w-3.5 ml-1.5" />
                                  </Link>
                                </Button>
                              )}

                              {/* Send Button */}
                              <Button 
                                variant="outline" 
                                size="sm" 
                                className="h-8 gap-1.5 text-xs font-medium border-border/60 hover:bg-muted/50"
                                onClick={() => {
                                  setShareDoc({
                                    customerName: p.customer?.name || "",
                                    customerPhone: p.customer?.phone || "",
                                    customerEmail: p.customer?.email || "",
                                    customerAddress: p.customer?.address || "",
                                    docType: "proposal",
                                    docNo: p.propNo || p.qtnNo || "Draft",
                                    docUrl,
                                    preferredFormats: p.customer?.sendFormat || []
                                  });
                                  setShareOpen(true);
                                }}
                              >
                                <Send className="h-3.5 w-3.5" /> Send
                              </Button>

                              {/* More Actions Dropdown */}
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground">
                                    <MoreVertical className="h-4 w-4" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="w-40">
                                  <DropdownMenuItem asChild className="cursor-pointer">
                                    <Link href={`/print/${p.id}`}><Eye className="h-4 w-4 mr-2 text-muted-foreground" /> View PDF</Link>
                                  </DropdownMenuItem>
                                  {canCRUD && (
                                    <DropdownMenuItem asChild className="cursor-pointer">
                                      <Link href={`/proposals/${p.id}/edit`}><Pencil className="h-4 w-4 mr-2 text-muted-foreground" /> Edit</Link>
                                    </DropdownMenuItem>
                                  )}
                                  {canCRUD && (
                                    <>
                                      <DropdownMenuSeparator />
                                      <DropdownMenuItem 
                                        className="cursor-pointer text-destructive focus:text-destructive focus:bg-destructive/10"
                                        onClick={async () => {
                                          if (window.confirm("Are you sure you want to delete this proposal?")) {
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
                                        <Trash2 className="h-4 w-4 mr-2" /> Delete
                                      </DropdownMenuItem>
                                    </>
                                  )}
                                </DropdownMenuContent>
                              </DropdownMenu>

                            </div>
                          </TableCell>
                        </motion.tr>
                      );
                    })}
                  </AnimatePresence>
                </TableBody>
              </Table>
            </div>
          )}
          <Pagination
            page={page}
            pageSize={pageSize}
            total={filtered.length}
            pageSizeOptions={[25, 50, 100]}
            onPageChange={setPage}
            onPageSizeChange={(s) => { setPageSize(s); setPage(1); }}
          />
        </CardContent>
      </Card>
      {shareDoc && (
        <ShareModal
          isOpen={shareOpen}
          onClose={() => setShareOpen(false)}
          customerName={shareDoc.customerName}
          customerPhone={shareDoc.customerPhone}
          customerEmail={shareDoc.customerEmail}
          customerAddress={shareDoc.customerAddress}
          docType={shareDoc.docType}
          docNo={shareDoc.docNo}
          docUrl={shareDoc.docUrl}
          preferredFormats={shareDoc.preferredFormats}
        />
      )}
    </div>
  );
}
