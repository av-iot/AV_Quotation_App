"use client";

import { useState, useCallback } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { useForm, FormProvider } from "react-hook-form";
import { useAuth } from "@/lib/auth-context";
import { useToast } from "@/hooks/use-toast";
import type { ProposalFormData } from "@/types";

import StepCustomer from "./steps/StepCustomer";
import StepSite from "./steps/StepSite";
import StepComponents from "./steps/StepComponentsImpl";
import StepPricing from "./steps/StepPricingImpl";
import StepReview from "./steps/StepReviewImpl";

import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { ArrowLeft, ArrowRight, Loader2, FileText } from "lucide-react";
import { cn } from "@/lib/utils";

const STEPS = [
  { id: 1, label: "Customer" },
  { id: 2, label: "Site & Type" },
  { id: 3, label: "Components" },
  { id: 4, label: "Pricing" },
  { id: 5, label: "Review" },
];

const defaultOption = {
  sysType: "ongrid" as const,
  batteryDays: 1,
  panelProductId: "",
  panelQty: "",
  inverterProductId: "",
  inverterQty: "",
  batteryProductId: "",
  batteryQty: "",
  coo: "China",
  oversize: false,
  estOutput: "",
  sysPrice: "",
  structPrice: "",
  installPrice: "",
  discount: "",
  totalPrice: "",
  specialStructNote: false,
};

const defaultValues: ProposalFormData = {
  custName: "",
  qtnNo: "",
  addr: "",
  phone: "",
  phone2: "",
  email: "",
  sendFormat: ["email"],
  date: new Date().toISOString().split("T")[0],
  sysType: "ongrid",
  utility: "CEB",
  phase: "1",
  cutoutCurrent: "63",
  mountType: "roof",
  roofType: "tile",
  powerScheme: "Net Accounting",
  numOptions: 1,
  monthlyUsage: "",
  batteryDays: 1,
  options: [{ ...defaultOption }, { ...defaultOption }],
  pay1: "50",
  pay2: "40",
  pay3: "10",
  extraNotes: "",
  cebCharges: "",
  validityPeriod: "14",
};

const slideVariants = {
  enter: (dir: number) => ({
    x: dir > 0 ? 40 : -40,
    opacity: 0,
  }),
  center: { x: 0, opacity: 1 },
  exit: (dir: number) => ({
    x: dir > 0 ? -40 : 40,
    opacity: 0,
  }),
};

interface ProposalWizardProps {
  initialData?: any;
  proposalId?: string;
}

export default function ProposalWizard({ initialData, proposalId }: ProposalWizardProps = {}) {
  const [step, setStep] = useState(1);
  const [direction, setDirection] = useState(1);
  const [saving, setSaving] = useState(false);
  const { user, firebaseUser } = useAuth();
  const { toast } = useToast();
  const router = useRouter();

  const mapProposalToFormData = (p: any): ProposalFormData => {
    const mapOption = (opt: any) => ({
      sysType: opt.sysType || p.sysType || "ongrid",
      panelProductId: opt.panel?.productId || "",
      panelQty: opt.panel?.qty ? String(opt.panel.qty) : "",
      inverterProductId: opt.inverter?.productId || "",
      inverterQty: opt.inverter?.qty ? String(opt.inverter.qty) : "",
      batteryProductId: opt.battery?.productId || "",
      batteryQty: opt.battery?.qty ? String(opt.battery.qty) : "",
      batteryDays: opt.batteryDays || p.batteryDays || 1,
      coo: opt.coo || opt.panel?.origin || "China",
      oversize: opt.oversize || false,
      estOutput: opt.pricing?.estOutput || "",
      sysPrice: opt.pricing?.sysPrice ? String(opt.pricing.sysPrice) : "",
      structPrice: opt.pricing?.structPrice ? String(opt.pricing.structPrice) : "",
      installPrice: opt.pricing?.installPrice ? String(opt.pricing.installPrice) : "",
      discount: opt.pricing?.discount ? String(opt.pricing.discount) : "",
      totalPrice: opt.pricing?.totalPrice ? String(opt.pricing.totalPrice) : "",
      specialStructNote: opt.pricing?.specialStructNote || false,
      expectedGen: opt.expectedGen ? String(opt.expectedGen) : "",
      afterSalesPeriod: opt.afterSalesPeriod ? String(opt.afterSalesPeriod) : "",
      servicesPerYear: opt.servicesPerYear ? String(opt.servicesPerYear) : "",
      hasShading: opt.hasShading || false,
      shadingReduction: opt.shadingReduction ? String(opt.shadingReduction) : "",
    });

    return {
      custName: p.customer?.name || "",
      qtnNo: p.qtnNo || "",
      addr: p.customer?.address || "",
      phone: p.customer?.phone || "",
      phone2: p.customer?.phone2 || "",
      email: p.customer?.email || "",
      sendFormat: p.customer?.sendFormat || ["email"],
      date: p.date ? p.date.split("T")[0] : new Date().toISOString().split("T")[0],
      sysType: p.sysType || "ongrid",
      utility: p.utility || "CEB",
      phase: p.phase || "1",
      cutoutCurrent: p.cutoutCurrent || "63",
      mountType: (p.mountType as any) || "roof",
      roofType: p.roofType || "tile",
      powerScheme: p.powerScheme || "Net Accounting",
      numOptions: (p.numOptions === 2 ? 2 : 1) as any,
      monthlyUsage: p.monthlyUsage ? String(p.monthlyUsage) : "",
      batteryDays: p.batteryDays || 1,
      options: p.options ? p.options.map(mapOption) : [],
      pay1: p.pay1 || "50",
      pay2: p.pay2 || "40",
      pay3: p.pay3 || "10",
      extraNotes: p.extraNotes || "",
      cebCharges: p.cebCharges ? String(p.cebCharges) : "",
      validityPeriod: p.validityPeriod ? String(p.validityPeriod) : "14",
    };
  };

  const formValues = initialData ? mapProposalToFormData(initialData) : defaultValues;

  const methods = useForm<ProposalFormData>({
    defaultValues: formValues,
    mode: "onChange",
  });

  const goNext = useCallback(() => {
    setDirection(1);
    setStep((s) => Math.min(s + 1, 5));
  }, []);

  const goBack = useCallback(() => {
    setDirection(-1);
    setStep((s) => Math.max(s - 1, 1));
  }, []);

  const goToStep = useCallback((n: number) => {
    setDirection(n > step ? 1 : -1);
    setStep(n);
  }, [step]);

  const getProductsMapFromCache = useCallback((): Map<string, any> => {
    const productsMap = new Map();
    if (typeof window !== "undefined") {
      const cache = (window as any).__productCache;
      if (cache) {
        Object.entries(cache).forEach(([id, prod]) => {
          productsMap.set(id, prod);
        });
      }
    }
    return productsMap;
  }, []);

  const handleSave = async (status: "draft" | "sent") => {
    if (!firebaseUser && !user) return;
    setSaving(true);
    try {
      const values = methods.getValues();

      if (proposalId) {
        // Edit Mode: update the existing proposal document directly in Firestore
        const { doc, updateDoc, serverTimestamp } = await import("firebase/firestore");
        const { db } = await import("@/lib/firebase");
        const { buildProposalFromForm } = await import("@/lib/proposal-builder");

        const proposal = buildProposalFromForm(
          values,
          user?.uid || "dev_user",
          getProductsMapFromCache()
        );
        // Retain original QtnNo and PropNo
        proposal.qtnNo = initialData?.qtnNo || values.qtnNo;
        if (initialData?.propNo) proposal.propNo = initialData.propNo;

        const docRef = doc(db, "proposals", proposalId);
        await updateDoc(docRef, {
          ...proposal,
          status: status as any,
          updatedAt: serverTimestamp(),
        });

        // Log proposal update action
        const { logActivityClient } = await import("@/lib/audit-logger-client");
        await logActivityClient(user, "PROPOSAL_UPDATE", {
          proposalId,
          qtnNo: proposal.qtnNo,
          customerName: proposal.customer.name,
          sysType: proposal.sysType,
          status,
        });

        // Fire-and-forget: re-generate docx in background for the updated proposal
        if (status === "sent") {
          const idToken = firebaseUser ? await firebaseUser.getIdToken() : null;
          fetch(`${process.env.NEXT_PUBLIC_BASE_URL}/api/proposals/${proposalId}/generate`, {
            method: "POST",
            headers: {
              ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}),
            },
          }).catch(console.error);
        }

        toast({
          title: "Proposal Updated",
          description: `Successfully updated Reference: ${proposal.qtnNo}`,
        });
        router.push(`/proposals/${proposalId}`);
        return;
      }

      // Try server API first
      let serverSuccess = false;
      try {
        const idToken = firebaseUser ? await firebaseUser.getIdToken() : null;
        const res = await fetch("/api/proposals", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}),
          },
          body: JSON.stringify({ ...values, status }),
        });
        if (res.ok) {
          const { data, error } = await res.json();
          if (!error) {
            serverSuccess = true;
            toast({
              title: status === "draft" ? "Saved as draft" : "Proposal sent",
              description: `Reference: ${data.qtnNo}`,
            });
            router.push(`/proposals/${data.id}`);
            return;
          }
        }
      } catch {
        // Server unreachable — fall through to offline save
      }

      // Offline fallback: write to client-side Firestore (auto-cached by persistence)
      if (!serverSuccess) {
        const { collection, addDoc, Timestamp } = await import("firebase/firestore");
        const { db } = await import("@/lib/firebase");
        const { buildProposalFromForm } = await import("@/lib/proposal-builder");
        const { enqueue } = await import("@/lib/offline-queue");

        const tempQtnNo = `PROP_LOCAL_${Date.now().toString().slice(-6)}`;
        const proposal = buildProposalFromForm(
          values,
          user?.uid || "dev_user",
          getProductsMapFromCache()
        );
        proposal.qtnNo = tempQtnNo;
        proposal.status = status as any;

        const docRef = await addDoc(collection(db, "proposals"), {
          ...proposal,
          createdAt: Timestamp.now(),
          updatedAt: Timestamp.now(),
          _pendingSync: true, // Flag for sync indicator
        });

        // Log client-side offline proposal creation
        const { logActivityClient } = await import("@/lib/audit-logger-client");
        await logActivityClient(user, "PROPOSAL_CREATE_OFFLINE", {
          proposalId: docRef.id,
          qtnNo: tempQtnNo,
          customerName: proposal.customer.name,
          sysType: proposal.sysType,
          status: status,
        });

        // Queue for server sync when back online
        await enqueue("create_proposal", { ...values, status }, docRef.id);

        toast({
          title: "Saved offline",
          description: `Ref: ${tempQtnNo} — will sync when online`,
        });
        router.push(`/proposals/${docRef.id}`);
      }
    } catch (err: any) {
      toast({
        title: "Save failed",
        description: err.message,
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const stepComponents = [StepCustomer, StepSite, StepComponents, StepPricing, StepReview];
  const StepComponent = stepComponents[step - 1];

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      {/* Header */}
      <div className="mb-8 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
          <FileText className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-xl font-bold">{proposalId ? "Edit Proposal" : "New Proposal"}</h1>
          <p className="text-sm text-muted-foreground">
            {proposalId ? `Editing Reference: ${initialData?.qtnNo || ""}` : "Solar PV system quotation builder"}
          </p>
        </div>
      </div>

      {/* Step indicator */}
      <div className="mb-8">
        <div className="mb-3 flex items-center justify-between">
          <span className="text-sm font-medium">
            Step {step} of {STEPS.length}: {STEPS[step - 1].label}
          </span>
          <span className="text-sm text-muted-foreground">{Math.round((step / STEPS.length) * 100)}%</span>
        </div>
        <Progress value={(step / STEPS.length) * 100} className="h-1.5" />
        <div className="mt-3 flex gap-2">
          {STEPS.map((s) => (
            <button
              key={s.id}
              onClick={() => s.id < step && goToStep(s.id)}
              className={cn(
                "step-dot cursor-default",
                s.id === step && "active",
                s.id < step && "done cursor-pointer"
              )}
              aria-label={s.label}
            />
          ))}
        </div>
      </div>

      {/* Step content with slide animation */}
      <FormProvider {...methods}>
        <div className="relative overflow-hidden">
          <AnimatePresence custom={direction} mode="wait">
            <motion.div
              key={step}
              custom={direction}
              variants={slideVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
            >
              <StepComponent onNext={goNext} />
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Nav buttons */}
        <div className="mt-8 flex items-center justify-between">
          <Button
            variant="outline"
            onClick={goBack}
            disabled={step === 1 || saving}
            className="gap-2"
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </Button>

          <div className="flex gap-2">
            {step === 5 ? (
              <>
                <Button
                  variant="outline"
                  onClick={() => handleSave("draft")}
                  disabled={saving}
                  className="gap-2"
                >
                  {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                  Save draft
                </Button>
                <Button
                  onClick={() => handleSave("sent")}
                  disabled={saving}
                  className="gap-2 bg-primary hover:bg-primary/90"
                >
                  {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                  Save & Generate
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </>
            ) : (
              <Button
                onClick={goNext}
                className="gap-2 bg-primary hover:bg-primary/90"
              >
                Next
                <ArrowRight className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      </FormProvider>
    </div>
  );
}
