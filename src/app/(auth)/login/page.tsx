"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, Zap, ArrowRight, ShieldCheck } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import Image from "next/image";

function LoginContent() {
  const { user, loading, signInWithGoogle, signInWithMyIot, signInDev } = useAuth();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const [signingIn, setSigningIn] = useState(false);

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
            <div className="relative flex h-20 w-20 items-center justify-center rounded-2xl bg-card border border-border shadow-xl">
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
      <div className="hidden lg:flex lg:w-[45%] xl:w-[50%] flex-col justify-between p-12 bg-gradient-to-br from-[#0c2e1b] via-[#104825] to-[#082212] relative overflow-hidden text-white border-r border-primary/20">
        {/* Tech Grid Pattern */}
        <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(52,211,153,0.06)_1px,transparent_1px),linear-gradient(to_bottom,rgba(52,211,153,0.06)_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_40%,#000_80%,transparent_100%)]" />
        
        {/* Solar Ray Radial Glows */}
        <div className="absolute top-[-10%] right-[-10%] w-[450px] h-[450px] bg-emerald-400/10 rounded-full blur-[100px]" />
        <div className="absolute bottom-[-10%] left-[-10%] w-[350px] h-[350px] bg-teal-500/10 rounded-full blur-[80px]" />

        {/* Top Header */}
        <div className="relative z-10 flex items-center justify-between">
          <div className="flex items-center gap-2 bg-emerald-950/40 border border-emerald-500/20 text-emerald-300 text-xs px-3.5 py-1.5 rounded-full backdrop-blur-md">
            <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="font-semibold tracking-wide uppercase text-[10px]">Secure Proposal Portal</span>
          </div>
        </div>

        {/* Central Graphic Container */}
        <div className="relative z-10 my-auto flex flex-col items-center justify-center">
          <motion.div
            initial={{ opacity: 0, y: 15, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
            className="bg-emerald-950/20 border border-emerald-500/15 rounded-3xl p-8 backdrop-blur-xl max-w-md w-full shadow-[0_20px_50px_rgba(0,0,0,0.3)] hover:border-emerald-500/30 transition-colors duration-500"
          >
            <div className="flex justify-center mb-6">
              <div className="p-4 bg-emerald-500/10 rounded-2xl border border-emerald-500/20 shadow-inner flex items-center justify-center">
                <Image
                  src="/icon.png"
                  alt="Alta Vision Solar Icon"
                  width={64}
                  height={64}
                  className="object-contain drop-shadow-[0_0_15px_rgba(52,211,153,0.4)]"
                  priority
                />
              </div>
            </div>
            
            <h2 className="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-white via-emerald-100 to-emerald-200 bg-clip-text text-transparent text-center">
              Alta Vision Solar
            </h2>
            <p className="text-emerald-300/80 text-sm mt-1 text-center font-medium">
              Proposal & Quotation Engine
            </p>

            {/* Spec grid for modern hardware look */}
            <div className="mt-8 pt-6 border-t border-emerald-500/10 grid grid-cols-2 gap-4">
              <div className="bg-white/5 rounded-xl p-3 border border-white/5">
                <div className="text-[10px] text-emerald-400 font-bold uppercase tracking-wider">Estimation Core</div>
                <div className="text-lg font-bold mt-0.5 text-white">v3.5.0</div>
                <div className="text-[9px] text-emerald-300/60 mt-0.5">Automated workflows</div>
              </div>
              <div className="bg-white/5 rounded-xl p-3 border border-white/5">
                <div className="text-[10px] text-emerald-400 font-bold uppercase tracking-wider">Security Layer</div>
                <div className="text-lg font-bold mt-0.5 text-white">OAuth 2.0</div>
                <div className="text-[9px] text-emerald-300/60 mt-0.5">Restricted admin domain</div>
              </div>
            </div>

            {/* Micro mock layout representation */}
            <div className="mt-4 bg-white/5 rounded-xl p-3 border border-white/5 flex items-center gap-3">
              <div className="flex -space-x-1.5">
                <div className="h-6 w-6 rounded-full bg-emerald-500 border border-emerald-600 flex items-center justify-center text-[10px] font-bold">A</div>
                <div className="h-6 w-6 rounded-full bg-teal-500 border border-teal-600 flex items-center justify-center text-[10px] font-bold">V</div>
              </div>
              <div className="flex-1 min-w-0">
                <div className="h-1.5 w-24 bg-white/20 rounded-full" />
                <div className="h-1 w-16 bg-white/10 rounded-full mt-1.5" />
              </div>
              <span className="text-[9px] font-mono bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-2 py-0.5 rounded">
                CONNECTED
              </span>
            </div>
          </motion.div>
        </div>

        {/* Slogan Footer */}
        <div className="relative z-10 text-emerald-300/60 text-xs text-center lg:text-left max-w-sm">
          Powering Sri Lanka's leading solar system design platform with precise estimation engineering.
        </div>
      </div>

      {/* ── RIGHT CORE INTERACTIVE PANEL (Sign In Card) ────────────────── */}
      <div className="flex-1 flex flex-col justify-between p-6 sm:p-8 md:p-12 relative bg-background bg-[radial-gradient(hsl(var(--accent)/0.2)_1px,transparent_1px)] [background-size:24px_24px]">
        {/* Decorative elements for mobile screens */}
        <div className="absolute top-[10%] left-[10%] w-60 h-60 bg-emerald-500/5 rounded-full blur-[80px] lg:hidden" />
        
        {/* Main Brand Header for mobile/tablet */}
        <div className="flex justify-between items-center w-full max-w-md mx-auto lg:mx-0">
          <div className="lg:hidden flex items-center gap-2">
            <Image
              src="/icon.png"
              alt="Alta Vision Solar"
              width={32}
              height={32}
              className="object-contain"
            />
            <span className="text-md font-bold tracking-tight text-foreground">Alta Vision Solar</span>
          </div>
          {/* Theme display placeholder */}
          <div className="ml-auto" />
        </div>

        {/* Centered Sign In Form container */}
        <div className="my-auto w-full max-w-md mx-auto flex flex-col justify-center">
          {/* Logo container */}
          <div className="mb-8 hidden lg:flex justify-center">
            <Image
              src="/logo.png"
              alt="Alta Vision Solar"
              width={220}
              height={36}
              className="object-contain dark:brightness-125 dark:contrast-110 transition-all duration-300"
              priority
            />
          </div>

          <motion.div
            initial={{ opacity: 0, y: 15, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.5, delay: 0.05 }}
          >
            <Card className="border border-border/80 bg-card/75 backdrop-blur-xl shadow-2xl rounded-3xl overflow-hidden">
              <div className="h-1.5 w-full bg-gradient-to-r from-emerald-500 via-primary to-teal-500" />
              
              <CardHeader className="pb-4 pt-6">
                <CardTitle className="text-xl font-bold tracking-tight text-foreground">Sign in to continue</CardTitle>
                <CardDescription className="text-muted-foreground/80 mt-1">
                  Use your company Google account, or connect via myiot.
                </CardDescription>
              </CardHeader>
              
              <CardContent className="space-y-5">
                {/* Google Sign In Button */}
                <Button
                  className="w-full h-12 gap-3 text-sm font-semibold border-border/80 hover:bg-accent/40 hover:border-primary/30 active:scale-[0.99] transition-all duration-200 shadow-sm"
                  variant="outline"
                  size="lg"
                  onClick={handleGoogleSignIn}
                  disabled={signingIn}
                >
                  {signingIn ? (
                    <Loader2 className="h-4.5 w-4.5 animate-spin text-primary" />
                  ) : (
                    <svg className="h-5 w-5 shrink-0" viewBox="0 0 24 24">
                      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                    </svg>
                  )}
                  Continue with Google
                </Button>

                {/* Separator */}
                <div className="relative my-4">
                  <div className="absolute inset-0 flex items-center">
                    <span className="w-full border-t border-border/80" />
                  </div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-card px-3 text-muted-foreground font-semibold tracking-wider text-[10px]">
                      Or
                    </span>
                  </div>
                </div>

                {/* myiot Integration Banner */}
                <div className="rounded-2xl border border-emerald-500/10 bg-accent/35 dark:bg-accent/5 p-4 hover:border-emerald-500/25 transition-all duration-300 shadow-inner">
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 border border-primary/20 shadow-sm text-primary">
                      <Zap className="h-4.5 w-4.5" />
                    </div>
                    <div className="space-y-1">
                      <h4 className="text-sm font-bold text-foreground">myiot Integration</h4>
                      <p className="text-xs leading-relaxed text-muted-foreground">
                        If you're a myiot user, click <span className="font-semibold text-primary">Launch Proposal System</span> from inside the myiot app. You'll be automatically redirected here with your session.
                      </p>
                      <div className="pt-1.5 flex items-center gap-1 text-[10px] font-bold text-primary/80">
                        <span>Direct token authentication active</span>
                        <ArrowRight className="h-3 w-3 animate-pulse" />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Developer skip logic */}
                {process.env.NODE_ENV === "development" && (
                  <>
                    <div className="relative my-2">
                      <div className="absolute inset-0 flex items-center">
                        <span className="w-full border-t border-dashed border-yellow-500/30" />
                      </div>
                      <div className="relative flex justify-center text-[10px] uppercase font-bold text-yellow-600 dark:text-yellow-400 tracking-wider">
                        <span className="bg-card px-2">Local Development Bypass</span>
                      </div>
                    </div>
                    <Button
                      className="w-full h-11 gap-2 text-xs border-dashed border-yellow-500/40 text-yellow-600 hover:bg-yellow-500/10 active:scale-[0.99] transition-all font-semibold"
                      variant="outline"
                      size="lg"
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
                  </>
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