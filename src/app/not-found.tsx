"use client";

import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { HelpCircle, ArrowLeft, Home, Search, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import Link from "next/link";

export default function NotFound() {
  const router = useRouter();

  return (
    <div className="relative min-h-[85vh] w-full flex items-center justify-center p-4 md:p-8 overflow-hidden bg-background">
      {/* Premium Ambient Background Blobs */}
      <div className="absolute top-1/4 left-1/3 -translate-x-1/2 -translate-y-1/2 w-80 h-80 rounded-full bg-emerald-500/10 blur-[90px] pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/3 translate-x-1/2 translate-y-1/2 w-96 h-96 rounded-full bg-blue-500/10 blur-[120px] pointer-events-none" />

      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
        className="w-full max-w-md z-10"
      >
        <Card className="border-border/60 bg-card/60 backdrop-blur-md shadow-2xl rounded-2xl overflow-hidden">
          <CardContent className="pt-10 pb-8 px-6 md:px-10 flex flex-col items-center text-center space-y-6">
            {/* 404 Icon Glow Ring */}
            <div className="relative flex items-center justify-center w-20 h-20 rounded-2xl bg-amber-500/10 text-amber-500 border border-amber-500/20 animate-pulse">
              <ShieldAlert className="w-10 h-10 stroke-[1.5]" />
              <div className="absolute -inset-1 rounded-2xl border border-amber-500/10 scale-110 pointer-events-none" />
            </div>

            <div className="space-y-2">
              <h1 className="text-3xl font-black tracking-tight text-foreground md:text-4xl">
                404 - Page Not Found
              </h1>
              <p className="text-sm text-muted-foreground max-w-xs mx-auto font-medium">
                The requested URL path does not exist on this server or has been relocated.
              </p>
            </div>

            <div className="w-full text-xs text-muted-foreground/80 leading-relaxed border-t border-border/50 pt-4">
              If you copied and pasted this URL, please double-check the spelling, query params, or check if the target resource resides in the Firestore Database.
            </div>

            {/* Interactive Navigation Options */}
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
                <Link href="/projects">
                  <Search className="w-4 h-4" />
                  Projects
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
