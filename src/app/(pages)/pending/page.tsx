"use client";

import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Lock, LogOut } from "lucide-react";

export default function PendingPage() {
  const { user, signOut } = useAuth();

  return (
    <div className="flex h-screen flex-col items-center justify-center bg-background p-6 text-center">
      <div className="max-w-md space-y-6 rounded-2xl border bg-card p-8 shadow-sm">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800">
          <Lock className="h-8 w-8 text-slate-500" />
        </div>
        
        <div className="space-y-2">
          <h1 className="text-2xl font-black tracking-tight">Access Restricted</h1>
          <p className="text-muted-foreground text-sm">
            Your account ({user?.email}) currently has <strong className="text-foreground">Viewer</strong> privileges and is pending approval. 
          </p>
          <p className="text-muted-foreground text-sm">
            Please contact your administrator to request access to the workspace.
          </p>
        </div>

        <div className="pt-4">
          <Button onClick={signOut} variant="outline" className="w-full gap-2">
            <LogOut className="h-4 w-4" />
            Sign Out
          </Button>
        </div>
      </div>
    </div>
  );
}
