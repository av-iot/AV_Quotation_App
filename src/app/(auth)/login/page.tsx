"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, Sun, Zap } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function LoginPage() {
  const { user, loading, signInWithGoogle, signInWithMyIot } = useAuth();
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
      // onAuthStateChanged fires → user state updates → useEffect above redirects
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
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary shadow-lg">
            <Sun className="h-7 w-7 text-primary-foreground" strokeWidth={1.5} />
          </div>
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">
            {signingIn ? "Signing in…" : "Loading…"}
          </p>
        </div>
      </div>
    );
  }

  // Only rendered when 100% sure there is no logged-in user
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-background via-accent/20 to-background p-4">
      <motion.div
        initial={{ opacity: 0, y: 24, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
        className="w-full max-w-md"
      >
        <div className="mb-8 flex flex-col items-center gap-3">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary shadow-lg">
            <Sun className="h-9 w-9 text-primary-foreground" strokeWidth={1.5} />
          </div>
          <div className="text-center">
            <h1 className="text-2xl font-bold tracking-tight">Alta Vision Solar</h1>
            <p className="mt-1 text-sm text-muted-foreground">Proposal & Quotation System</p>
          </div>
        </div>

        <Card className="shadow-xl">
          <CardHeader className="pb-4">
            <CardTitle className="text-lg">Sign in to continue</CardTitle>
            <CardDescription>
              Use your company Google account, or connect via myiot.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button
              className="w-full gap-3 text-sm"
              variant="outline"
              size="lg"
              onClick={handleGoogleSignIn}
              disabled={signingIn}
            >
              {signingIn ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <svg className="h-4 w-4" viewBox="0 0 24 24">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                </svg>
              )}
              Continue with Google
            </Button>

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-card px-2 text-muted-foreground">Or</span>
              </div>
            </div>

            <div className="rounded-lg border bg-muted/40 p-4">
              <div className="flex items-start gap-3">
                <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                  <Zap className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <p className="text-sm font-medium">myiot Integration</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    If you're a myiot user, click{" "}
                    <span className="font-medium text-primary">Launch Proposal System</span>{" "}
                    from inside the myiot app. You'll be automatically redirected here with your session.
                  </p>
                </div>
              </div>
            </div>

            <p className="text-center text-xs text-muted-foreground">
              Access is restricted to authorized company accounts.
              <br />
              Contact your administrator if you need access.
            </p>
          </CardContent>
        </Card>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          © {new Date().getFullYear()} Alta Vision (Pvt) Ltd · Business Reg. No: PV 90948
        </p>
      </motion.div>
    </div>
  );
}