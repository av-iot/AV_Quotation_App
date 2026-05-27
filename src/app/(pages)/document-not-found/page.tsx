"use client";

import { useSearchParams, useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { FileWarning, ArrowLeft, Home, Search, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import Link from "next/link";
import { Suspense } from "react";

function DocumentNotFoundContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const id = searchParams.get("id") || "";
  const type = searchParams.get("type") || "document";

  const getFriendlyType = (t: string) => {
    switch (t.toLowerCase()) {
      case "proposal":
        return "Solar Proposal Design";
      case "quotation":
        return "Quotation / Invoice";
      case "receipt":
        return "Official Payment Receipt";
      default:
        return "Document";
    }
  };

  return (
    <div className="relative min-h-[80vh] w-full flex items-center justify-center p-4 md:p-8 overflow-hidden bg-background">
      {/* Premium Ambient Background Blobs */}
      <div className="absolute top-1/4 left-1/4 -translate-x-1/2 -translate-y-1/2 w-72 h-72 rounded-full bg-emerald-500/10 blur-[80px] pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 translate-x-1/2 translate-y-1/2 w-80 h-80 rounded-full bg-blue-500/10 blur-[100px] pointer-events-none" />

      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 15 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
        className="w-full max-w-lg z-10"
      >
        <Card className="border-border/60 bg-card/60 backdrop-blur-md shadow-2xl rounded-2xl overflow-hidden">
          <CardContent className="pt-8 pb-8 px-6 md:px-10 flex flex-col items-center text-center space-y-6">
            {/* Warning Icon Glow Ring */}
            <div className="relative flex items-center justify-center w-20 h-20 rounded-2xl bg-destructive/10 text-destructive border border-destructive/20 animate-pulse">
              <FileWarning className="w-10 h-10 stroke-[1.5]" />
              <div className="absolute -inset-1 rounded-2xl border border-destructive/10 scale-110 pointer-events-none" />
            </div>

            <div className="space-y-2">
              <h1 className="text-2xl font-extrabold tracking-tight text-foreground md:text-3xl">
                404 - Document Not Found
              </h1>
              <p className="text-sm text-muted-foreground max-w-sm mx-auto">
                The requested {getFriendlyType(type)} could not be resolved or retrieved from the server.
              </p>
            </div>

            {/* Document Details Block */}
            {id && (
              <div className="w-full bg-muted/40 border rounded-xl p-4 text-left space-y-2">
                <div className="flex items-center gap-2 text-xs font-bold text-muted-foreground uppercase tracking-widest">
                  <AlertCircle className="w-3.5 h-3.5 text-destructive" />
                  Diagnostic Details
                </div>
                <div className="grid grid-cols-3 gap-2 text-xs pt-1">
                  <span className="text-muted-foreground font-medium">Ref / ID:</span>
                  <span className="col-span-2 font-mono font-bold text-foreground break-all">{id}</span>
                  
                  <span className="text-muted-foreground font-medium">Doc Type:</span>
                  <span className="col-span-2 font-semibold text-foreground capitalize">{type}</span>

                  <span className="text-muted-foreground font-medium">Status:</span>
                  <span className="col-span-2 font-semibold text-destructive">Collection Match Missed</span>
                </div>
              </div>
            )}

            <div className="w-full text-xs text-muted-foreground/80 leading-relaxed border-t border-border/50 pt-4">
              It is possible this document was recently deleted, has not been finalized yet, or belongs to a different database sandbox. Please verify the log entry or check with a Super Admin.
            </div>

            {/* Interactive Navigation Grid */}
            <div className="grid grid-cols-2 gap-3 w-full pt-2">
              <Button
                variant="outline"
                size="sm"
                className="h-10 rounded-xl font-semibold gap-1.5 flex items-center justify-center transition-all hover:bg-muted/80 active:scale-[0.98]"
                onClick={() => router.back()}
              >
                <ArrowLeft className="w-4 h-4" />
                Go Back
              </Button>
              <Button
                variant="default"
                size="sm"
                className="h-10 rounded-xl font-bold bg-primary hover:bg-primary/95 text-primary-foreground gap-1.5 flex items-center justify-center transition-all shadow-md shadow-primary/10 active:scale-[0.98]"
                asChild
              >
                <Link href="/activity">
                  <Search className="w-4 h-4" />
                  Activity Logs
                </Link>
              </Button>
            </div>

            <Link href="/" className="text-xs font-semibold text-primary hover:underline flex items-center gap-1">
              <Home className="w-3.5 h-3.5" /> Return to Dashboard
            </Link>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}

export default function DocumentNotFoundPage() {
  return (
    <Suspense fallback={
      <div className="min-h-[80vh] flex items-center justify-center bg-background">
        <div className="text-muted-foreground text-sm font-semibold">Loading diagnostic report...</div>
      </div>
    }>
      <DocumentNotFoundContent />
    </Suspense>
  );
}
