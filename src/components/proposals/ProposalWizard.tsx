"use client";

import { useState, useCallback, useEffect } from "react";
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
import { ArrowLeft, ArrowRight, Loader2, FileText, AlertTriangle } from "lucide-react";
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
  includeStructInTotal: false,
  includeInstallInTotal: false,
};

const defaultValues: ProposalFormData = {
  custName: "",
  custSalutation: "",
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
  cebInclusive: true,
  vatInvoice: false,
  vatRate: "18",
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
  const [localProposalId, setLocalProposalId] = useState<string | undefined>(proposalId);
  const [step, setStep] = useState(1);
  const [direction, setDirection] = useState(1);
  const [saving, setSaving] = useState(false);
  const [isExpired, setIsExpired] = useState(false);
  const [expiredLetters, setExpiredLetters] = useState<Array<{ name: string; expiryDate: string }>>([]);
  const [expiryLoading, setExpiryLoading] = useState(true);
  const { user, firebaseUser } = useAuth();
  const { toast } = useToast();
  const router = useRouter();

  useEffect(() => {
    async function checkExpiry() {
      try {
        const { doc, getDoc } = await import("firebase/firestore");
        const { db } = await import("@/lib/firebase");
        const snap = await getDoc(doc(db, "settings", "engineers"));
        if (snap.exists()) {
          const data = snap.data();
          const expiredList: Array<{ name: string; expiryDate: string }> = [];
          const today = new Date();
          
          if (data.letters && Array.isArray(data.letters)) {
            data.letters.forEach((letObj: any) => {
              if (letObj.noExpiry) return;
              if (!letObj.expiryDate) return;
              const expiryDate = new Date(letObj.expiryDate);
              expiryDate.setHours(23, 59, 59, 999);
              if (today > expiryDate) {
                expiredList.push({ name: letObj.name || letObj.fileName || "Unnamed Letter", expiryDate: letObj.expiryDate });
              }
            });
          } else if (data.letterExpiryDate) {
            const expiryDate = new Date(data.letterExpiryDate);
            expiryDate.setHours(23, 59, 59, 999);
            if (today > expiryDate) {
              expiredList.push({ name: "Authorization Letters", expiryDate: data.letterExpiryDate });
            }
          }
          
          if (expiredList.length > 0) {
            setExpiredLetters(expiredList);
            setIsExpired(true);
          }
        }
      } catch (err) {
        console.error("Failed to check expiry", err);
      } finally {
        setExpiryLoading(false);
      }
    }
    checkExpiry();
  }, []);

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
      includeStructInTotal: opt.pricing?.includeStructInTotal !== false,
      includeInstallInTotal: opt.pricing?.includeInstallInTotal !== false,
      expectedGen: opt.expectedGen ? String(opt.expectedGen) : "",
      afterSalesPeriod: opt.afterSalesPeriod ? String(opt.afterSalesPeriod) : "",
      servicesPerYear: opt.servicesPerYear ? String(opt.servicesPerYear) : "",
      hasShading: opt.hasShading || false,
      shadingReduction: opt.shadingReduction ? String(opt.shadingReduction) : "",
    });

    return {
      custName: p.customer?.name || "",
      custSalutation: p.customer?.salutation || "",
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
      cebInclusive: p.cebInclusive !== false,
      vatInvoice: p.vatInvoice || false,
      vatRate: p.vatRate ? String(p.vatRate) : "18",
      validityPeriod: p.validityPeriod ? String(p.validityPeriod) : "14",
    };
  };

  const formValues = initialData ? mapProposalToFormData(initialData) : defaultValues;

  const methods = useForm<ProposalFormData>({
    defaultValues: formValues,
    mode: "onChange",
  });

  const goNext = async () => {
    let fieldsToValidate: any[] = [];
    if (step === 1) {
      fieldsToValidate = ["custName", "addr", "phone", "phone2", "email", "sendFormat"];
    } else if (step === 2) {
      fieldsToValidate = ["utility", "phase", "cutoutCurrent", "mountType", "roofType", "powerScheme"];
    } else if (step === 3) {
      fieldsToValidate = ["monthlyUsage"];
      const numOpts = methods.getValues("numOptions") || 1;
      for (let i = 0; i < numOpts; i++) {
        fieldsToValidate.push(`options.${i}.inverterProductId`);
        fieldsToValidate.push(`options.${i}.inverterQty`);
        fieldsToValidate.push(`options.${i}.panelProductId`);
        fieldsToValidate.push(`options.${i}.panelQty`);
        fieldsToValidate.push(`options.${i}.batteryProductId`);
        fieldsToValidate.push(`options.${i}.batteryQty`);
      }
    } else if (step === 4) {
      const cebInclusiveVal = methods.watch("cebInclusive");
      fieldsToValidate = ["pay1", "pay2", "pay3", "validityPeriod"];
      if (cebInclusiveVal === false) {
        fieldsToValidate.push("cebCharges");
      }
      const numOpts = methods.getValues("numOptions") || 1;
      for (let i = 0; i < numOpts; i++) {
        fieldsToValidate.push(`options.${i}.sysPrice`);
      }
    }

    const isValid = await methods.trigger(fieldsToValidate);
    if (!isValid) {
      toast({
        title: "Validation Error",
        description: "Please check all required fields and correct any errors before proceeding.",
        variant: "destructive",
      });
      return;
    }

    await handleSave("draft", false);
    setDirection(1);
    setStep((s) => Math.min(s + 1, 5));
  };

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

  const handleSave = async (status: "draft" | "sent", redirect: boolean = true) => {
    if (!firebaseUser && !user) return;

    if (status === "sent") {
      const isValid = await methods.trigger();
      if (!isValid) {
        toast({
          title: "Validation Error",
          description: "Please fix all validation errors before generating the proposal.",
          variant: "destructive",
        });
        return;
      }
    }

    setSaving(true);
    try {
      const values = methods.getValues();

      if (localProposalId) {
        // Edit Mode: update the existing proposal document directly in Firestore
        const { doc, updateDoc, serverTimestamp } = await import("firebase/firestore");
        const { db } = await import("@/lib/firebase");
        const { buildProposalFromForm } = await import("@/lib/proposal-builder");

        const proposal: any = buildProposalFromForm(
          values,
          initialData?.createdBy || user?.uid || "dev_user",
          getProductsMapFromCache()
        );
        // Retain original audit fields
        proposal.qtnNo = initialData?.qtnNo || values.qtnNo || `QTN_${Date.now().toString().slice(-5)}`;
        if (initialData?.propNo) proposal.propNo = initialData.propNo;
        if (initialData?.createdAt) proposal.createdAt = initialData.createdAt;
        if (initialData?.createdBy) proposal.createdBy = initialData.createdBy;

        const docRef = doc(db, "proposals", localProposalId);
        await updateDoc(docRef, {
          ...proposal,
          status: status as any,
          updatedAt: serverTimestamp(),
          updatedBy: user?.uid || "dev_user",
        });

        // Log proposal update action
        const { logActivityClient } = await import("@/lib/audit-logger-client");
        await logActivityClient(user, "PROPOSAL_UPDATE", {
          proposalId: localProposalId,
          qtnNo: proposal.qtnNo,
          customerName: proposal.customer.name,
          sysType: proposal.sysType,
          status,
        });

        if (redirect) {
          toast({
            title: "Proposal Updated",
            description: `Successfully updated Reference: ${proposal.propNo || proposal.qtnNo}`,
          });
          router.push(`/proposals/${localProposalId}`);
        }
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
            setLocalProposalId(data.id);
            if (redirect) {
              toast({
                title: status === "draft" ? "Saved as draft" : "Proposal sent",
                description: `Reference: ${data.qtnNo}`,
              });
              router.push(`/proposals/${data.id}`);
            }
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
        
        setLocalProposalId(docRef.id);

        if (redirect) {
          toast({
            title: "Saved offline",
            description: `Ref: ${tempQtnNo} — will sync when online`,
          });
          router.push(`/proposals/${docRef.id}`);
        }
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

  if (expiryLoading) {
    return (
      <div className="flex h-[60vh] flex-col items-center justify-center gap-2 text-muted-foreground p-6">
        <Loader2 className="h-10 w-10 animate-spin text-emerald-500 mb-2" />
        <p className="text-sm font-semibold">Checking authorization letters...</p>
      </div>
    );
  }

  if (isExpired && !proposalId) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-center space-y-6">
        <div className="flex justify-center">
          <div className="h-20 w-20 bg-destructive/10 text-destructive rounded-full flex items-center justify-center">
            <AlertTriangle className="h-10 w-10" />
          </div>
        </div>
        <h1 className="text-2xl font-black text-slate-800 tracking-tight">Authorization Letters Expired</h1>
        <div className="text-muted-foreground font-medium max-w-lg mx-auto space-y-2 text-sm text-left bg-slate-50 border border-slate-200 p-4 rounded-xl">
          <p className="font-semibold text-slate-700 text-center">The following attached letters have passed their expiry date:</p>
          <ul className="list-disc pl-5 space-y-1 mt-2 text-xs">
            {expiredLetters.map((l, i) => (
              <li key={i} className="text-red-650 font-medium">
                {l.name} <span className="font-bold text-slate-500">(Expired: {l.expiryDate})</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="bg-amber-50 border border-amber-200 text-amber-800 p-4 rounded-xl text-sm max-w-lg mx-auto">
          Please contact a system administrator to update the authorization PDFs in the system and update the expiry dates in the Settings page to resume proposal generation.
        </div>
        <Button variant="outline" className="mt-4" onClick={() => router.push("/proposals")}>
          <ArrowLeft className="h-4 w-4 mr-2" /> Back to Proposals
        </Button>
      </div>
    );
  }

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
                  onClick={() => handleSave("sent", true)}
                  disabled={saving}
                  className="gap-2 bg-primary hover:bg-primary/90"
                >
                  {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                  Generate Proposal
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </>
            ) : (
              <Button
                onClick={goNext}
                disabled={saving}
                className="gap-2 bg-primary hover:bg-primary/90"
              >
                {saving && <Loader2 className="h-4 w-4 animate-spin" />}
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
