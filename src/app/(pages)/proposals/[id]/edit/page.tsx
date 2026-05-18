"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/auth-context";
import ProposalWizard from "@/components/proposals/ProposalWizard";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, ArrowLeft, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from "next/link";

export default function EditProposalPage() {
  const { id } = useParams() as { id: string };
  const router = useRouter();
  const { user, firebaseUser } = useAuth();
  const [proposal, setProposal] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const canCRUD = user?.role && ["superadmin", "admin", "authorized"].includes(user.role);

  useEffect(() => {
    if (!firebaseUser) return;

    async function loadProposal() {
      try {
        const snap = await getDoc(doc(db, "proposals", id));
        if (snap.exists()) {
          setProposal({ id: snap.id, ...snap.data() });
        } else {
          router.push("/proposals");
        }
      } catch (err) {
        console.error("Failed to load proposal for editing:", err);
      } finally {
        setLoading(false);
      }
    }

    loadProposal();
  }, [id, firebaseUser, router]);

  if (!firebaseUser || loading) {
    return (
      <div className="flex h-[70vh] flex-col items-center justify-center gap-2 text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
        <span className="text-sm font-medium">Loading proposal details…</span>
      </div>
    );
  }

  if (!canCRUD) {
    return (
      <div className="flex h-[60vh] flex-col items-center justify-center gap-2 text-muted-foreground p-6">
        <Shield className="h-10 w-10 text-destructive mb-2" />
        <h1 className="text-lg font-bold text-foreground">Access Restricted</h1>
        <p className="text-sm">You do not have permissions to edit proposals.</p>
        <Button asChild className="mt-4" variant="outline">
          <Link href={`/proposals/${id}`}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Proposal Details
          </Link>
        </Button>
      </div>
    );
  }

  return <ProposalWizard initialData={proposal} proposalId={id} />;
}
