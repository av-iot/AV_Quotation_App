"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, Zap, ArrowRight, ShieldCheck } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import Image from "next/image";
import { cn } from "@/lib/utils";

function LoginContent() {
  const { user, loading, signInWithGoogle, signInWithMyIot, signInDev } = useAuth();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const [signingIn, setSigningIn] = useState(false);
  const [timeString, setTimeString] = useState<string>("");

  // Live-updating Clock (hydration-safe)
  useEffect(() => {
    const updateClock = () => {
      const now = new Date();
      const time = now.toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });
      const date = now.toLocaleDateString("en-US", { day: "2-digit", month: "short", year: "numeric" });
      setTimeString(`${date} • ${time}`);
    };
    updateClock();
    const timer = setInterval(updateClock, 1000);
    return () => clearInterval(timer);
  }, []);

  const slogans = [
    "Powering Sri Lanka's leading solar system design platform with precise estimation engineering.",
    "Streamlining automated quotation workflows and high-fidelity generation in seconds.",
    "Ensuring maximum reliability and data integrity through robust access-controlled layers.",
    "Transforming renewable energy management with smart calculations and modern interfaces."
  ];

  const [sloganIndex, setSloganIndex] = useState(0);

  useEffect(() => {
    const sloganTimer = setInterval(() => {
      setSloganIndex((prev) => (prev + 1) % slogans.length);
    }, 10000);
    return () => clearInterval(sloganTimer);
  }, []);

  // If user is already logged in, redirect to dashboard
  useEffect(() => {
    if (!loading && user) {
      const from = searchParams.get("from") || "/";
      window.location.href = from;
    }
  }, [user, loading, searchParams]);

  // Handle myiot JWT redirect: /login?token=<jwt>
  useEffect(() => {
    const token = searchParams.get("token");
    if (!token || loading) return;
    setSigningIn(true);
    signInWithMyIot(token).catch((err) => {
      toast({ title: "myiot login failed", description: err.message, variant: "destructive" });
      setSigningIn(false);
    });
  }, [searchParams, loading]); // eslint-disable-line

  const handleGoogleSignIn = async () => {
    setSigningIn(true);
    try {
      await signInWithGoogle();
    } catch (err: any) {
      toast({
        title: "Sign in failed",
        description: err.message || "Please try again.",
        variant: "destructive",
      });
      setSigningIn(false);
    }
  };

  // Show spinner while Firebase restores session, while signing in, or while redirecting
  if (loading || signingIn || user) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-gradient-to-br from-background via-accent/10 to-background">
        <div className="flex flex-col items-center gap-6">
          <div className="relative">
            {/* Spinning external sun rings */}
            <div className="absolute inset-0 rounded-full border-2 border-primary/20 animate-ping duration-1000" />
            <div className="relative flex h-20 w-20 items-center justify-center rounded-2xl bg-white border border-border shadow-xl">
              <Image
                src="/icon.png"
                alt="Alta Vision"
                width={48}
                height={48}
                className="object-contain animate-pulse"
                priority
              />
            </div>
          </div>
          <div className="flex flex-col items-center gap-2 text-center">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
            <p className="text-sm font-semibold text-foreground mt-1">
              {signingIn ? "Signing in to Alta Vision…" : "Authenticating session…"}
            </p>
            <p className="text-xs text-muted-foreground">
              Please wait while we establish a secure connection.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Only rendered when 100% sure there is no logged-in user
  return (
    <div className="flex min-h-screen w-screen bg-background overflow-hidden">
      {/* ── LEFT SHOWCASE PANEL (Enterprise Brand Pitch) ───────────────── */}
      <div className="hidden lg:flex lg:w-[45%] xl:w-[50%] flex-col justify-between p-12 relative overflow-hidden text-white border-r border-primary/20">
        {/* Solar Panel Farm Background Image */}
        <div className="absolute inset-0 z-0">
          <Image
            src="/login-side.jpg"
            alt="Alta Vision Solar Panel Farm"
            fill
            className="object-cover object-center scale-105"
            priority
          />
          {/* High-End Contrast Vignettes: darkens left for text sharpness, keeping center/right bright */}
          <div className="absolute inset-0 bg-gradient-to-r from-black/85 via-black/20 to-transparent z-[1]" />
          <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-transparent to-black/75 z-[1]" />
          {/* Gentle corporate green hue integration */}
          <div className="absolute inset-0 bg-emerald-950/20 mix-blend-color z-[1]" />
        </div>

        {/* Tech Grid Pattern */}
        <div className="absolute inset-0 z-[1] bg-[linear-gradient(to_right,rgba(52,211,153,0.06)_1px,transparent_1px),linear-gradient(to_bottom,rgba(52,211,153,0.06)_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_40%,#000_80%,transparent_100%)] opacity-30" />

        {/* Top Header Navigation (Integrated Logo + Live System Clock) */}
        <div className="relative z-10 flex items-center justify-between w-full bg-black/40 border border-white/10 px-6 py-4 rounded-2xl backdrop-blur-md shadow-2xl">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-white/10 backdrop-blur-md flex items-center justify-center border border-white/15 shadow-inner">
              <Image
                src="/icon.png"
                alt="Alta Vision Solar"
                width={24}
                height={24}
                className="object-contain filter brightness-110"
              />
            </div>
            <span className="text-sm font-black tracking-wider text-white uppercase">Alta Vision</span>
          </div>
          
          <div className="flex items-center gap-2 bg-emerald-500/10 text-emerald-400 text-[10px] font-bold px-4 py-2 rounded-full border border-emerald-500/20 shadow-inner backdrop-blur-md">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-450 animate-pulse" />
            <span className="font-mono tracking-wider uppercase tabular-nums">{timeString || "CONNECTING..."}</span>
          </div>
        </div>

        {/* Central Typographic Lockup */}
        <div className="relative z-10 my-auto w-full max-w-lg pl-2">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
            className="flex flex-col gap-6"
          >
            {/* Glowing Accent Tag */}
            <div className="self-start">
              <span className="text-[10px] font-extrabold tracking-[0.3em] uppercase bg-gradient-to-r from-emerald-400 to-teal-300 bg-clip-text text-transparent border-b border-emerald-500/30 pb-2">
                Enterprise Solar Suite
              </span>
            </div>

            {/* Giant Title Stack */}
            <h1 className="text-4xl sm:text-5xl font-black tracking-tight text-white leading-[1.12] drop-shadow-[0_4px_16px_rgba(0,0,0,0.6)]">
              Solar Quotation<br />
              <span className="bg-gradient-to-r from-emerald-400 via-teal-350 to-emerald-250 bg-clip-text text-transparent drop-shadow-none">
                Generation System.
              </span>
            </h1>
            
            <p className="text-xs text-slate-300 font-semibold tracking-wide max-w-sm leading-relaxed drop-shadow-[0_2px_4px_rgba(0,0,0,0.4)]">
              Automate solar engineering calculations, invoice configurations, and PDF generation with high precision.
            </p>
          </motion.div>
        </div>

        {/* Animated Sliding Slogan Footer wrapped in protective high-end glass container */}
        <div className="relative z-10 self-start w-full bg-black/45 border border-white/10 px-6 py-5 rounded-2xl backdrop-blur-md max-w-md shadow-2xl min-h-[90px] flex items-center overflow-hidden">
          <div className="flex flex-col gap-2 w-full">
            <span className="text-[9px] font-bold tracking-[0.2em] text-emerald-400/80 uppercase">System Insights</span>
            <AnimatePresence mode="wait">
              <motion.p
                key={sloganIndex}
                initial={{ opacity: 0, x: -15 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 15 }}
                transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                className="text-emerald-100/90 text-xs font-semibold leading-relaxed tracking-wide min-h-[36px]"
              >
                {slogans[sloganIndex]}
              </motion.p>
            </AnimatePresence>
            <div className="flex items-center gap-1.5 pt-1">
              {slogans.map((_, idx) => (
                <button
                  key={idx}
                  onClick={() => setSloganIndex(idx)}
                  className={cn(
                    "h-1 rounded-full transition-all duration-300",
                    idx === sloganIndex ? "w-4 bg-emerald-400" : "w-1.5 bg-emerald-500/20"
                  )}
                  aria-label={`Go to slide ${idx + 1}`}
                />
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── RIGHT CORE INTERACTIVE PANEL (Sign In Card) ────────────────── */}
      <div className="flex-1 flex flex-col justify-between p-6 sm:p-8 md:p-12 relative bg-background bg-[radial-gradient(hsl(var(--accent)/0.15)_1px,transparent_1px)] [background-size:24px_24px] overflow-hidden">
        {/* Animated background blobs for maximum visual excellence */}
        <div className="absolute top-[20%] right-[10%] w-[350px] h-[350px] bg-emerald-500/5 dark:bg-emerald-500/10 rounded-full blur-[100px] animate-pulse duration-[8000ms] pointer-events-none" />
        <div className="absolute bottom-[10%] left-[10%] w-[300px] h-[300px] bg-teal-500/5 dark:bg-teal-500/10 rounded-full blur-[90px] animate-pulse duration-[6000ms] pointer-events-none" />
        
        {/* Decorative elements for mobile screens */}
        <div className="absolute top-[10%] left-[10%] w-60 h-60 bg-emerald-500/5 rounded-full blur-[80px] lg:hidden pointer-events-none" />
        
        {/* Main Brand Header for mobile/tablet */}
        <div className="flex justify-between items-center w-full max-w-md mx-auto lg:mx-0">
          <div className="lg:hidden flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-white flex items-center justify-center border border-border shadow-sm">
              <Image
                src="/icon.png"
                alt="Alta Vision Solar"
                width={20}
                height={20}
                className="object-contain"
              />
            </div>
            <span className="text-md font-bold tracking-tight text-foreground">Alta Vision Solar</span>
          </div>
          {/* Theme display placeholder */}
          <div className="ml-auto" />
        </div>

        {/* Centered Sign In Form container */}
        <div className="my-auto w-full max-w-md mx-auto flex flex-col justify-center">
          {/* Logo container */}
          <motion.div 
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="mb-8 hidden lg:flex justify-center"
          >
            <Image
              src="/logo.png"
              alt="Alta Vision Solar"
              width={220}
              height={36}
              className="object-contain dark:brightness-0 dark:invert transition-all duration-300"
              priority
            />
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 15, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="relative w-full"
          >
            {/* Soft glowing card background shadow */}
            <div className="absolute -inset-1 rounded-[2.2rem] bg-gradient-to-r from-emerald-555 to-teal-555 opacity-10 blur-xl transition duration-1000 pointer-events-none" />
            
            <Card className="relative border border-border/85 bg-card/85 backdrop-blur-xl shadow-2xl rounded-[2rem] overflow-hidden">
              <div className="h-1.5 w-full bg-gradient-to-r from-emerald-550 to-teal-550" />
              
              <CardHeader className="pb-4 pt-7 px-6">
                <CardTitle className="text-xl font-bold tracking-tight text-foreground">Sign in to continue</CardTitle>
                <CardDescription className="text-muted-foreground/80 mt-1">
                  Use your company Google account, or connect via myiot.
                </CardDescription>
              </CardHeader>
              
              <CardContent className="space-y-6 px-6 pb-7">
                {/* Google Sign In Button */}
                <Button
                  className="w-full h-12 gap-3 text-sm font-bold border border-border dark:border-slate-800 bg-white dark:bg-slate-950 hover:bg-slate-50 dark:hover:bg-slate-900/60 active:scale-[0.99] hover:border-emerald-500/30 transition-all duration-200 shadow-sm rounded-2xl flex items-center justify-center group"
                  variant="outline"
                  size="lg"
                  onClick={handleGoogleSignIn}
                  disabled={signingIn}
                >
                  {signingIn ? (
                    <Loader2 className="h-4.5 w-4.5 animate-spin text-primary" />
                  ) : (
                    <svg className="h-5 w-5 shrink-0 transition-transform duration-200 group-hover:scale-105" viewBox="0 0 24 24">
                      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                    </svg>
                  )}
                  Continue with Google
                </Button>

                {/* Separator */}
                <div className="relative my-2">
                  <div className="absolute inset-0 flex items-center">
                    <span className="w-full border-t border-border/80" />
                  </div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-card px-3 text-muted-foreground font-bold tracking-wider text-[10px]">
                      Or
                    </span>
                  </div>
                </div>

                {/* myiot Integration Banner */}
                <div className="relative overflow-hidden rounded-2xl border border-emerald-500/10 bg-slate-50/50 dark:bg-slate-950/40 p-4 hover:border-emerald-500/20 transition-all duration-300 shadow-sm hover:shadow-md backdrop-blur-sm group">
                  <div className="absolute -right-8 -bottom-8 w-24 h-24 bg-emerald-500/5 dark:bg-emerald-450/5 rounded-full blur-xl group-hover:bg-emerald-500/10 transition-all duration-300 pointer-events-none" />
                  
                  <div className="relative flex items-start gap-3.5">
                    <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 dark:bg-emerald-500/25 border border-emerald-500/20 shadow-sm text-emerald-600 dark:text-emerald-400 group-hover:scale-105 transition-transform duration-300">
                      <Zap className="h-5 w-5" />
                    </div>
                    <div className="space-y-1 flex-1">
                      <h4 className="text-sm font-bold text-foreground">myiot Integration</h4>
                      <p className="text-xs leading-relaxed text-muted-foreground">
                        If you're a myiot user, click <span className="font-bold text-emerald-600 dark:text-emerald-400">Launch Proposal System</span> from inside the myiot app. You'll be automatically redirected here.
                      </p>
                      <div className="pt-1 flex items-center gap-1 text-[10px] font-black text-emerald-600 dark:text-emerald-400 uppercase tracking-wider">
                        <span>Direct token authentication active</span>
                        <ArrowRight className="h-3 w-3 transition-transform duration-300 group-hover:translate-x-1" />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Developer skip logic */}
                {process.env.NODE_ENV === "development" && (
                  <div className="pt-2 border-t border-dashed border-border/80">
                    <div className="rounded-2xl border border-amber-500/10 bg-amber-500/5 p-3.5 hover:border-amber-500/20 transition-all duration-300">
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <span className="text-[10px] uppercase font-black text-amber-600 dark:text-amber-400 tracking-wider">Local Developer Sandbox</span>
                        <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-ping shrink-0" />
                      </div>
                      <Button
                        className="w-full h-10 gap-2 text-xs border border-amber-500/20 bg-amber-550/10 hover:bg-amber-500/20 text-amber-700 dark:text-amber-400 hover:border-amber-500/30 active:scale-[0.99] transition-all duration-200 font-bold rounded-xl shadow-sm"
                        variant="outline"
                        size="sm"
                        onClick={async () => {
                          setSigningIn(true);
                          try {
                            await signInDev();
                            const from = searchParams.get("from") || "/";
                            window.location.href = from;
                          } catch (err: any) {
                            toast({ title: "Dev login failed", description: err.message, variant: "destructive" });
                            setSigningIn(false);
                          }
                        }}
                        disabled={signingIn}
                      >
                        🔧 Dev Login (Bypass Firebase Auth)
                      </Button>
                    </div>
                  </div>
                )}

                {/* Restricted Account Notice */}
                <div className="flex items-center justify-center gap-2 pt-4 border-t border-border/80 text-center text-xs text-muted-foreground/80">
                  <ShieldCheck className="h-4 w-4 text-emerald-500 shrink-0" />
                  <span>Access is restricted to authorized company accounts.</span>
                </div>
              </CardContent>
            </Card>
          </motion.div>
          
          <div className="mt-4 text-center text-[11px] text-muted-foreground/80 leading-relaxed px-4">
            Contact your administrator if you need access.
          </div>
        </div>

        {/* Footer copyright */}
        <div className="w-full max-w-md mx-auto text-center text-xs text-muted-foreground/60 relative z-10 pt-8 lg:pt-0">
          © {new Date().getFullYear()} Alta Vision (Pvt) Ltd · Business Reg. No: PV 90948
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    }>
      <LoginContent />
    </Suspense>
  );
}