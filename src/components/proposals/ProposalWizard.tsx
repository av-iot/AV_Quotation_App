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
  panelProductId: "",
  panelQty: "",
  inverterProductId: "",
  inverterQty: "",
  batteryProductId: "",
  batteryQty: "",
  coo: "China",
  monthlyUsage: "",
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
  date: new Date().toISOString().split("T")[0],
  sysType: "ongrid",
  utility: "CEB",
  phase: "1",
  cutoutCurrent: "63",
  mountType: "roof",
  roofType: "tile",
  powerScheme: "Net Accounting",
  numOptions: 1,
  options: [{ ...defaultOption }, { ...defaultOption }],
  pay1: "50",
  pay2: "40",
  pay3: "10",
  extraNotes: "",
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

export default function ProposalWizard() {
  const [step, setStep] = useState(1);
  const [direction, setDirection] = useState(1);
  const [saving, setSaving] = useState(false);
  const { user, firebaseUser } = useAuth();
  const { toast } = useToast();
  const router = useRouter();

  const methods = useForm<ProposalFormData>({
    defaultValues,
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

  const handleSave = async (status: "draft" | "sent") => {
    if (!firebaseUser) return;
    setSaving(true);
    try {
      const idToken = await firebaseUser.getIdToken();
      const values = methods.getValues();
      const res = await fetch("/api/proposals", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({ ...values, status }),
      });
      const { data, error } = await res.json();
      if (error) throw new Error(error);
      toast({
        title: status === "draft" ? "Saved as draft" : "Proposal sent",
        description: `Reference: ${data.qtnNo}`,
      });
      router.push(`/proposals/${data.id}`);
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
          <h1 className="text-xl font-bold">New Proposal</h1>
          <p className="text-sm text-muted-foreground">Solar PV system quotation builder</p>
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
