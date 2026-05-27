"use client";
import { useFormContext } from "react-hook-form";
import { useEffect, useState } from "react";
import type { ProposalFormData } from "@/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DollarSign, Calculator, Sun, Receipt, ChevronDown } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

const fadeUp = { initial: { opacity: 0, y: 8 }, animate: { opacity: 1, y: 0, transition: { duration: 0.2 } } };

const fmtRs = (v: number | string) => {
  const n = Number(v);
  if (!v || isNaN(n)) return "";
  return "Rs. " + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

export default function StepPricing({ onNext: _onNext }: { onNext: () => void }) {
  const { register, watch, setValue, trigger, formState: { errors } } = useFormContext<ProposalFormData>();
  const numOptions = watch("numOptions");
  const sysType    = watch("sysType");
  const utility    = watch("utility") || "CEB";
  const cebInclusive = watch("cebInclusive") !== false;
  const vatInvoice = watch("vatInvoice") || false;
  const vatRateRaw = watch("vatRate") || "18";

  // Register validityPeriod
  useEffect(() => {
    register("validityPeriod", { required: "Validity period is required" });
  }, [register]);

  // Load VAT rate from localStorage on mount
  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = localStorage.getItem("vatRate");
    if (stored && !watch("vatRate")) {
      setValue("vatRate", stored);
    }
    // Initialize cebInclusive default
    if (watch("cebInclusive") === undefined) {
      setValue("cebInclusive", true);
    }
  }, []);

  // Persist VAT rate to localStorage
  useEffect(() => {
    if (typeof window !== "undefined" && vatRateRaw) {
      localStorage.setItem("vatRate", vatRateRaw);
    }
  }, [vatRateRaw]);

  // Validator for payment terms summing to 100
  const sumTo100Val = () => {
    const p1Raw = watch("pay1");
    const p2Raw = watch("pay2");
    const p3Raw = watch("pay3");
    if (!p1Raw || !p2Raw || !p3Raw) return true;
    const p1 = parseFloat(p1Raw) || 0;
    const p2 = parseFloat(p2Raw) || 0;
    const p3 = parseFloat(p3Raw) || 0;
    if (p1 + p2 + p3 !== 100) return "Payment percentages must sum to exactly 100%";
    return true;
  };

  const pay1Raw = watch("pay1") || "";
  const pay2Raw = watch("pay2") || "";
  const pay3Raw = watch("pay3") || "";

  const pay1 = parseFloat(pay1Raw) || 0;
  const pay2 = parseFloat(pay2Raw) || 0;
  const pay3 = parseFloat(pay3Raw) || 0;
  const payTotal = pay1 + pay2 + pay3;
  const payError = payTotal !== 100;

  // Auto-fill the third field if two are filled
  useEffect(() => {
    const p1 = parseFloat(pay1Raw) || 0;
    const p2 = parseFloat(pay2Raw) || 0;
    const p3 = parseFloat(pay3Raw) || 0;
    if (pay1Raw && pay2Raw && !pay3Raw) {
      const remain = 100 - p1 - p2;
      if (remain >= 0) { setValue("pay3", String(remain), { shouldValidate: true }); trigger(["pay1", "pay2", "pay3"]); }
    } else if (pay1Raw && pay3Raw && !pay2Raw) {
      const remain = 100 - p1 - p3;
      if (remain >= 0) { setValue("pay2", String(remain), { shouldValidate: true }); trigger(["pay1", "pay2", "pay3"]); }
    } else if (pay2Raw && pay3Raw && !pay1Raw) {
      const remain = 100 - p2 - p3;
      if (remain >= 0) { setValue("pay1", String(remain), { shouldValidate: true }); trigger(["pay1", "pay2", "pay3"]); }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pay1Raw, pay2Raw, pay3Raw]);

  const cebChargesRaw = watch("cebCharges");

  useEffect(() => {
    if (typeof window !== "undefined" && cebChargesRaw && !cebInclusive) {
      localStorage.setItem("cebCharges", cebChargesRaw);
    }
  }, [cebChargesRaw, cebInclusive]);

  useEffect(() => {
    if (typeof window !== "undefined" && !cebInclusive) {
      const stored = localStorage.getItem("cebCharges");
      if (stored && !watch("cebCharges")) {
        setValue("cebCharges", stored);
      }
    }
  }, [cebInclusive, setValue, watch]);

  return (
    <motion.div initial="initial" animate="animate" className="space-y-4">
      {/* ── CEB Charges section ── */}
      {utility === "CEB" && (
        <motion.div variants={fadeUp}>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">CEB Connection Charges</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-3">
                <Checkbox
                  id="cebInclusive"
                  checked={cebInclusive}
                  onCheckedChange={(v) => setValue("cebInclusive", !!v)}
                />
                <label htmlFor="cebInclusive" className="text-sm cursor-pointer text-muted-foreground">
                  CEB charges inclusive <span className="text-xs text-muted-foreground/70">(included in system price)</span>
                </label>
              </div>
              {!cebInclusive && (
                <div className="space-y-1.5">
                  <Label className="text-sm">CEB charges (Rs.)</Label>
                  <Input
                    {...register("cebCharges", {
                      required: "CEB charges is required",
                      min: { value: 0, message: "Charges cannot be negative" }
                    })}
                    type="number"
                    min={0}
                    placeholder="0"
                    className="h-9"
                  />
                  {errors.cebCharges && (
                    <p className="text-xs font-medium text-destructive mt-1">{errors.cebCharges.message}</p>
                  )}
                  <p className="text-xs text-muted-foreground">This value will be saved for future use.</p>
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>
      )}

      {Array.from({ length: numOptions }, (_, idx) => (
        <OptionPricing key={idx} idx={idx} sysType={sysType} cebInclusive={cebInclusive} />
      ))}

      {/* ── VAT Invoice section ── */}
      <motion.div variants={fadeUp}>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Receipt className="h-4 w-4 text-primary" />
              VAT Invoice
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-3">
              <Checkbox
                id="vatInvoice"
                checked={vatInvoice}
                onCheckedChange={(v) => setValue("vatInvoice", !!v)}
              />
              <label htmlFor="vatInvoice" className="text-sm cursor-pointer text-muted-foreground">
                Issue VAT invoice (VAT will be shown on proposals &amp; invoices)
              </label>
            </div>
            {vatInvoice && (
              <div className="space-y-1.5">
                <Label className="text-sm">VAT Rate (%)</Label>
                <div className="flex items-center gap-2">
                  <Input
                    {...register("vatRate")}
                    type="number"
                    min={0}
                    max={100}
                    step={0.1}
                    placeholder="18"
                    className="h-9 w-28"
                  />
                  <span className="text-xs text-muted-foreground">%</span>
                </div>
                <p className="text-xs text-amber-600 dark:text-amber-400 font-medium">
                  Note: VAT rate changes from 18% → 20.5% on July 1, 2026
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>

      {/* ── Payment terms ── */}
      <motion.div variants={fadeUp}>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Payment terms</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-3">
              {/* Term 1 */}
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Input
                  {...register("pay1", {
                    required: "Stage 1 percentage is required",
                    min: { value: 0, message: "Percentage cannot be negative" },
                    max: { value: 100, message: "Percentage cannot exceed 100%" },
                    validate: { sumTo100: sumTo100Val }
                  })}
                  type="number" min={0} max={100} placeholder="50"
                  className="h-8 w-20 shrink-0 text-center text-sm"
                  onChange={(e) => { setValue("pay3", "", { shouldValidate: true }); setValue("pay1", e.target.value, { shouldValidate: true }); trigger(["pay1", "pay2", "pay3"]); }}
                />
                <span>% payment should be made upon the job confirmation.</span>
              </div>
              {/* Term 2 */}
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Input
                  {...register("pay2", {
                    required: "Stage 2 percentage is required",
                    min: { value: 0, message: "Percentage cannot be negative" },
                    max: { value: 100, message: "Percentage cannot exceed 100%" },
                    validate: { sumTo100: sumTo100Val }
                  })}
                  type="number" min={0} max={100} placeholder="40"
                  className="h-8 w-20 shrink-0 text-center text-sm"
                  onChange={(e) => { setValue("pay3", "", { shouldValidate: true }); setValue("pay2", e.target.value, { shouldValidate: true }); trigger(["pay1", "pay2", "pay3"]); }}
                />
                <span>% payment should be made before the installation date or during the installation.</span>
              </div>
              {/* Term 3 */}
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Input
                  {...register("pay3", {
                    required: "Stage 3 percentage is required",
                    min: { value: 0, message: "Percentage cannot be negative" },
                    max: { value: 100, message: "Percentage cannot exceed 100%" },
                    validate: { sumTo100: sumTo100Val }
                  })}
                  type="number" min={0} max={100} placeholder="10"
                  className="h-8 w-20 shrink-0 text-center text-sm"
                  onChange={(e) => { setValue("pay3", e.target.value, { shouldValidate: true }); trigger(["pay1", "pay2", "pay3"]); }}
                />
                <span>% payment should be made after the CEB/LECO commissioning.</span>
              </div>
              {(errors.pay1 || errors.pay2 || errors.pay3) && (
                <div className="text-xs text-destructive mt-1 font-medium space-y-0.5">
                  {errors.pay1 && errors.pay1.type !== "sumTo100" && <p>• Stage 1: {errors.pay1.message}</p>}
                  {errors.pay2 && errors.pay2.type !== "sumTo100" && <p>• Stage 2: {errors.pay2.message}</p>}
                  {errors.pay3 && errors.pay3.type !== "sumTo100" && <p>• Stage 3: {errors.pay3.message}</p>}
                  {(errors.pay1?.type === "sumTo100" || errors.pay2?.type === "sumTo100" || errors.pay3?.type === "sumTo100") && (
                    <p>• Payment percentages must sum to exactly 100%</p>
                  )}
                </div>
              )}
              <div className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-xs ${
                payError
                  ? "border-destructive/40 bg-destructive/5 text-destructive"
                  : "border-green-200 bg-green-50 text-green-700 dark:border-green-900 dark:bg-green-950/30 dark:text-green-400"
              }`}>
                {payError ? `⚠️ Total is ${payTotal}% — must be exactly 100%` : "✅ Payment terms total 100%"}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-sm">Validity period</Label>
              <Select
                value={watch("validityPeriod") || ""}
                onValueChange={(v) => setValue("validityPeriod", v, { shouldValidate: true })}
              >
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue placeholder="Select validity period" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="7">7 days</SelectItem>
                  <SelectItem value="14">14 days</SelectItem>
                  <SelectItem value="30">30 days</SelectItem>
                </SelectContent>
              </Select>
              {errors.validityPeriod && (
                <p className="text-xs font-medium text-destructive mt-1">{errors.validityPeriod.message}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label>Additional notes (optional)</Label>
              <Textarea
                {...register("extraNotes")}
                placeholder="Site-specific details, exclusions, special conditions…"
                rows={3}
              />
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </motion.div>
  );
}

// ── Per-option pricing block ──────────────────────────────────────────────────
function OptionPricing({ idx, sysType, cebInclusive }: { idx: number; sysType: string; cebInclusive: boolean }) {
  const { register, watch, setValue, formState: { errors } } = useFormContext<ProposalFormData>();
  const prefix = `options.${idx}` as const;

  const specNote    = watch(`${prefix}.specialStructNote`);
  const structPrice = parseFloat(watch(`${prefix}.structPrice`) || "0") || 0;
  const installPrice= parseFloat(watch(`${prefix}.installPrice`) || "0") || 0;
  const discountPct = parseFloat(watch(`${prefix}.discount`) || "0") || 0;
  const includeStructInTotal = watch(`${prefix}.includeStructInTotal`) !== false;
  const includeInstallInTotal = watch(`${prefix}.includeInstallInTotal`) !== false;

  const [showAdditionalPrices, setShowAdditionalPrices] = useState(false);

  useEffect(() => {
    if (structPrice > 0 || installPrice > 0) {
      setShowAdditionalPrices(true);
    }
  }, [structPrice, installPrice]);

  // ── Auto-calculate system price from selected components ──────────────────
  const panelProductId   = watch(`${prefix}.panelProductId`);
  const panelQty         = parseInt(watch(`${prefix}.panelQty`) || "0") || 0;
  const inverterProductId= watch(`${prefix}.inverterProductId`);
  const inverterQty      = parseInt(watch(`${prefix}.inverterQty`) || "1") || 1;
  const batteryProductId = watch(`${prefix}.batteryProductId`) ?? "";
  const batteryQty       = parseInt(watch(`${prefix}.batteryQty`) || "0") || 0;
  const oversize            = watch(`${prefix}.oversize`) || false;
  const hasShading          = watch(`${prefix}.hasShading`) || false;
  const shadingReduction    = parseFloat(watch(`${prefix}.shadingReduction`) || "0") || 0;
  const shadingMultiplier   = parseFloat(watch(`${prefix}.shadingMultiplier`) || (oversize ? "110" : "100")) || (oversize ? 110 : 100);
  const addShading29kw      = watch(`${prefix}.addShading29kw`) || false;

  const vatInvoice = watch("vatInvoice") || false;
  const vatRateRaw = watch("vatRate") || "18";
  const vatRate    = parseFloat(vatRateRaw) || 18;

  const getProductSellPrice = (id: string): number => {
    if (!id || typeof window === "undefined") return 0;
    const cache = (window as any).__productCache as Record<string, any> | undefined;
    if (!cache) return 0;
    return cache[id]?.sell_price || 0;
  };

  const panelTotal   = panelQty   * getProductSellPrice(panelProductId);
  const invTotal     = inverterQty * getProductSellPrice(inverterProductId);
  const batTotal     = batteryQty  * getProductSellPrice(batteryProductId ?? 0);
  const autoSysPrice = panelTotal + invTotal + batTotal;

  const cache = (window as any).__productCache || {};
  const panel = cache[panelProductId];
  const panelWatts = panel?.max_panel_output_power || panel?.max_panel_output || 0;
  const systemSizeKw = (panelWatts * panelQty) / 1000;

  const sysPriceRaw  = watch(`${prefix}.sysPrice`);
  const sysPrice     = parseFloat(sysPriceRaw || "0") || autoSysPrice;

  useEffect(() => {
    if (!sysPriceRaw && autoSysPrice > 0) {
      setValue(`${prefix}.sysPrice`, String(autoSysPrice));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoSysPrice]);

  const cebChargesRaw = watch("cebCharges");
  const cebChargesNum = !cebInclusive ? (parseFloat(cebChargesRaw || "0") || 0) : 0;

  // ── Auto-calculate expected generations ──────────────────────────────────
  useEffect(() => {
    const cache = (window as any).__productCache || {};
    const panel = cache[panelProductId];
    const panelWatts = panel?.max_panel_output_power || panel?.max_panel_output || 0;
    const systemSizeKw = (panelWatts * panelQty) / 1000;
    if (systemSizeKw > 0) {
      let gen: number;
      if (hasShading) {
        gen = systemSizeKw * shadingMultiplier;
        if (addShading29kw) gen += 2.9 * 75;
        gen -= shadingReduction;
      } else {
        gen = systemSizeKw * (oversize ? 110 : 100);
      }
      setValue(`${prefix}.expectedGen`, (Math.floor(gen / 10) * 10).toString());
    }
  }, [panelProductId, panelQty, oversize, hasShading, shadingReduction, shadingMultiplier, addShading29kw, setValue, prefix]);

  // ── Auto-fill after sales defaults ──────────────────────────────────────
  useEffect(() => {
    const cache = (window as any).__productCache || {};
    const selectedInv = cache[inverterProductId];
    const brand = selectedInv?.brand?.toLowerCase();
    let period = "2", freq = "1";
    if (sysType === "hybrid-offgrid" || sysType === "offgrid") { period = "1"; freq = "1"; }
    if (brand === "goodwe") freq = "1";
    else if (brand === "growatt") freq = "2";
    setValue(`${prefix}.afterSalesPeriod`, period);
    setValue(`${prefix}.servicesPerYear`, freq);
  }, [inverterProductId, sysType, setValue, prefix]);

  // Initialize checkbox defaults — off by default (user opts in if needed)
  useEffect(() => {
    if (watch(`${prefix}.includeStructInTotal`) === undefined) {
      setValue(`${prefix}.includeStructInTotal`, false);
    }
    if (watch(`${prefix}.includeInstallInTotal`) === undefined) {
      setValue(`${prefix}.includeInstallInTotal`, false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Totals ────────────────────────────────────────────────────────────────
  // VAT-inclusive model: the entered system price already contains VAT when vatInvoice=true.
  // Grand total = entered price after discount; VAT is extracted backwards.
  const effectiveStruct   = includeStructInTotal ? structPrice : 0;
  const effectiveInstall  = includeInstallInTotal ? installPrice : 0;
  const subtotal    = sysPrice + effectiveStruct + effectiveInstall + cebChargesNum;
  const discountAmt = (subtotal * discountPct) / 100;
  const grandTotal  = subtotal - discountAmt; // this IS the VAT-inclusive total
  const priceBeforeVat = vatInvoice ? grandTotal / (1 + vatRate / 100) : grandTotal;
  const vatAmt         = grandTotal - priceBeforeVat;

  useEffect(() => {
    setValue(`${prefix}.totalPrice`, String(Math.round(grandTotal)));
  }, [grandTotal, setValue, prefix]);

  return (
    <motion.div variants={fadeUp}>
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <DollarSign className="h-4 w-4 text-primary" />
            Option {idx + 1} — Pricing
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">

          {/* System price */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label className="text-sm">System price (Rs.)</Label>
              {autoSysPrice > 0 && (
                <button type="button" className="text-[10px] text-primary underline"
                  onClick={() => setValue(`${prefix}.sysPrice`, String(autoSysPrice))}>
                  Use calculated: {fmtRs(autoSysPrice)}
                </button>
              )}
            </div>
            <Input
              {...register(`${prefix}.sysPrice`, {
                required: "System price is required",
                min: { value: 0, message: "Price cannot be negative" }
              })}
              type="number" min={0}
              placeholder={autoSysPrice > 0 ? String(autoSysPrice) : "Enter system price"}
              className="h-9"
            />
            {errors.options?.[idx]?.sysPrice && (
              <p className="text-xs font-medium text-destructive mt-1">{errors.options[idx]?.sysPrice?.message}</p>
            )}
            {autoSysPrice > 0 && (
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Calculator className="h-3 w-3" />
                <span>
                  Calculated:{" "}
                  {panelTotal > 0 && `Panels ${fmtRs(panelTotal)}`}
                  {invTotal > 0 && ` + Inverter ${fmtRs(invTotal)}`}
                  {batTotal > 0 && ` + Battery ${fmtRs(batTotal)}`}
                </span>
              </div>
            )}
          </div>

          {/* Collapsible Structure & Installation Prices */}
          <div className="border-t pt-3">
            <button
              type="button"
              onClick={() => setShowAdditionalPrices(!showAdditionalPrices)}
              className="flex items-center gap-1 text-xs font-bold text-primary hover:text-primary/80 transition-colors"
            >
              <ChevronDown className={`h-4 w-4 transition-transform duration-200 ${showAdditionalPrices ? "rotate-180" : ""}`} />
              <span>Additional Prices (Structure & Installation)</span>
            </button>

            <AnimatePresence initial={false}>
              {showAdditionalPrices && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="overflow-hidden"
                >
                  <div className="grid gap-4 sm:grid-cols-2 mt-3 pt-1">
                    {/* Structure price */}
                    <div className="space-y-1.5">
                      <Label className="text-sm">Structure price (Rs.)</Label>
                      <Input
                        {...register(`${prefix}.structPrice`, {
                          min: { value: 0, message: "Price cannot be negative" }
                        })}
                        type="number" min={0} placeholder="0" className="h-9"
                      />
                      {errors.options?.[idx]?.structPrice && (
                        <p className="text-xs font-medium text-destructive mt-1">{errors.options[idx]?.structPrice?.message}</p>
                      )}
                      {structPrice > 0 && <p className="text-xs text-muted-foreground">{fmtRs(structPrice)}</p>}
                      <div className="flex items-center gap-2 mt-1">
                        <Checkbox
                          id={`includeStruct-${idx}`}
                          checked={includeStructInTotal}
                          onCheckedChange={(v) => setValue(`${prefix}.includeStructInTotal`, !!v)}
                        />
                        <label htmlFor={`includeStruct-${idx}`} className="text-xs cursor-pointer text-muted-foreground">
                          Include in total
                        </label>
                      </div>
                    </div>

                    {/* Installation price */}
                    <div className="space-y-1.5">
                      <Label className="text-sm">Installation price (Rs.)</Label>
                      <Input
                        {...register(`${prefix}.installPrice`, {
                          min: { value: 0, message: "Price cannot be negative" }
                        })}
                        type="number" min={0} placeholder="0" className="h-9"
                      />
                      {errors.options?.[idx]?.installPrice && (
                        <p className="text-xs font-medium text-destructive mt-1">{errors.options[idx]?.installPrice?.message}</p>
                      )}
                      {installPrice > 0 && <p className="text-xs text-muted-foreground">{fmtRs(installPrice)}</p>}
                      <div className="flex items-center gap-2 mt-1">
                        <Checkbox
                          id={`includeInstall-${idx}`}
                          checked={includeInstallInTotal}
                          onCheckedChange={(v) => setValue(`${prefix}.includeInstallInTotal`, !!v)}
                        />
                        <label htmlFor={`includeInstall-${idx}`} className="text-xs cursor-pointer text-muted-foreground">
                          Include in total
                        </label>
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* After Sales & Performance */}
          <div className="rounded-xl border bg-gradient-to-br from-amber-50/50 to-orange-50/50 p-4 dark:from-amber-950/20 dark:to-orange-950/20 mt-4">
            <div className="mb-4 flex items-center gap-2 border-b pb-3">
              <Sun className="h-4 w-4 text-amber-500" />
              <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Performance &amp; Service</span>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label className="text-sm">After sales period</Label>
                <Select value={watch(`${prefix}.afterSalesPeriod`) || "2"} onValueChange={(v) => setValue(`${prefix}.afterSalesPeriod`, v)}>
                  <SelectTrigger className="h-9 text-sm bg-background"><SelectValue placeholder="Select years" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">1 Year</SelectItem>
                    <SelectItem value="2">2 Years</SelectItem>
                    <SelectItem value="3">3 Years</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm">Services per year</Label>
                <Select value={watch(`${prefix}.servicesPerYear`) || "1"} onValueChange={(v) => setValue(`${prefix}.servicesPerYear`, v)}>
                  <SelectTrigger className="h-9 text-sm bg-background"><SelectValue placeholder="Select frequency" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">1 per year</SelectItem>
                    <SelectItem value="2">2 per year</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 mt-4">
              <div className="space-y-1.5">
                <Label className="text-sm">Expected generation (Units/month)</Label>
                <div className="relative">
                  <Input {...register(`${prefix}.expectedGen`)} type="number" placeholder="0" className="h-9 pr-12 bg-background" />
                  <div className="absolute right-3 top-2 text-xs text-muted-foreground">Units</div>
                </div>
                {systemSizeKw > 0 && (
                  <p className="text-xs text-muted-foreground">
                    Auto-filled:{" "}
                    {hasShading ? (
                      <>{systemSizeKw.toFixed(1)} kW × {shadingMultiplier}{addShading29kw && " + 2.9 kW × 75"}{shadingReduction > 0 && ` − ${shadingReduction}`}</>
                    ) : (
                      <>{systemSizeKw.toFixed(1)} kW × {oversize ? "110" : "100"}</>
                    )}
                    {" = "}{watch(`${prefix}.expectedGen`)} Units
                  </p>
                )}
              </div>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label className="text-sm">Shading conditions</Label>
                  <div className="flex items-center gap-2">
                    <Checkbox id={`shading-${idx}`} checked={hasShading} onCheckedChange={(v) => setValue(`${prefix}.hasShading`, !!v)} />
                    <Label htmlFor={`shading-${idx}`} className="text-xs cursor-pointer text-muted-foreground">Apply reduction</Label>
                  </div>
                </div>
                {hasShading ? (
                  <div className="mt-2 space-y-2 rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-900 dark:bg-amber-950/30">
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <Label className="text-xs font-medium text-amber-800 dark:text-amber-300">Generation multiplier</Label>
                        <span className="text-xs font-bold text-amber-700 dark:text-amber-300">{shadingMultiplier}</span>
                      </div>
                      <input
                        type="range" min={10} max={150} step={1} value={shadingMultiplier}
                        onChange={(e) => setValue(`${prefix}.shadingMultiplier`, e.target.value)}
                        className="w-full h-2 rounded-lg appearance-none cursor-pointer accent-amber-500"
                      />
                      <div className="flex justify-between text-[10px] text-amber-500 mt-0.5"><span>10</span><span>150</span></div>
                    </div>
                    <div className="flex items-center gap-2 pt-1">
                      <Checkbox id={`shading29kw-${idx}`} checked={addShading29kw} onCheckedChange={(v) => setValue(`${prefix}.addShading29kw`, !!v)} />
                      <label htmlFor={`shading29kw-${idx}`} className="text-xs cursor-pointer text-amber-700 dark:text-amber-300">Add 2.9 kW × 75 contribution</label>
                    </div>
                    <div>
                      <div className="flex items-center justify-between">
                        <Label className="text-xs font-medium text-amber-800 dark:text-amber-300">Reduction amount</Label>
                        <span className="text-xs text-amber-600 dark:text-amber-400">Units/month</span>
                      </div>
                      <Input {...register(`${prefix}.shadingReduction`)} type="number" placeholder="Enter reduction"
                        className="h-8 text-xs border-amber-300 focus-visible:ring-amber-500 bg-background mt-1" />
                      <p className="text-[10px] text-amber-600 dark:text-amber-400 mt-1">This will be subtracted from the base expected generation.</p>
                    </div>
                  </div>
                ) : (
                  <div className="flex h-16 items-center justify-center rounded-lg border border-dashed text-xs text-muted-foreground">No shading applied</div>
                )}
              </div>
            </div>
          </div>

          {/* Price breakdown */}
          {subtotal > 0 && (
            <div className="rounded-lg border bg-muted/20 divide-y text-sm">
              <div className="flex justify-between px-4 py-2 text-muted-foreground">
                <span>System price</span><span className="font-medium">{fmtRs(sysPrice)}</span>
              </div>
              {structPrice > 0 && (
                <div className="flex justify-between px-4 py-2 text-muted-foreground">
                  <span>Structure {!includeStructInTotal && <span className="text-xs text-amber-500">(excluded)</span>}</span>
                  <span className={includeStructInTotal ? "font-medium" : "line-through opacity-50"}>{fmtRs(structPrice)}</span>
                </div>
              )}
              {installPrice > 0 && (
                <div className="flex justify-between px-4 py-2 text-muted-foreground">
                  <span>Installation {!includeInstallInTotal && <span className="text-xs text-amber-500">(excluded)</span>}</span>
                  <span className={includeInstallInTotal ? "font-medium" : "line-through opacity-50"}>{fmtRs(installPrice)}</span>
                </div>
              )}
              {!cebInclusive && cebChargesNum > 0 && (
                <div className="flex justify-between px-4 py-2 text-muted-foreground">
                  <span>CEB Charges</span><span className="font-medium">{fmtRs(cebChargesNum)}</span>
                </div>
              )}
              <div className="flex justify-between px-4 py-2 text-muted-foreground font-medium">
                <span>Subtotal</span><span>{fmtRs(subtotal)}</span>
              </div>
            </div>
          )}

          {/* Discount */}
          <div className="space-y-1.5">
            <Label className="text-sm">Discount</Label>
            <div className="flex items-center gap-2">
              <div className="relative w-28">
                <Input
                  {...register(`${prefix}.discount`, {
                    min: { value: 0, message: "Discount cannot be negative" },
                    max: { value: 100, message: "Discount cannot exceed 100%" }
                  })}
                  type="number" min={0} max={100} placeholder="0" className="h-9 pr-7"
                />
                <span className="absolute right-2.5 top-2 text-xs text-muted-foreground pointer-events-none">%</span>
              </div>
              {errors.options?.[idx]?.discount && (
                <p className="text-xs font-medium text-destructive mt-1">{errors.options[idx]?.discount?.message}</p>
              )}
              {discountPct > 0 && subtotal > 0 && (
                <span className="text-xs text-muted-foreground">= {fmtRs(discountAmt)} off</span>
              )}
            </div>
          </div>

          {/* Final price */}
          <div className="rounded-lg border-2 border-primary/20 bg-primary/5 px-4 py-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-primary">
                {vatInvoice ? "Price before VAT" : "Final price"}
              </span>
              <span className="text-lg font-bold text-primary">{priceBeforeVat > 0 ? fmtRs(priceBeforeVat) : "—"}</span>
            </div>
            {vatInvoice && grandTotal > 0 && (
              <>
                <div className="flex items-center justify-between text-sm text-muted-foreground border-t pt-2">
                  <span>VAT ({vatRate}%)</span>
                  <span className="font-medium">{fmtRs(vatAmt)}</span>
                </div>
                <div className="flex items-center justify-between border-t pt-2">
                  <span className="text-sm font-bold text-primary">Grand total (incl. VAT)</span>
                  <span className="text-xl font-black text-primary">{fmtRs(grandTotal)}</span>
                </div>
              </>
            )}
            {discountPct > 0 && subtotal > 0 && (
              <p className="text-xs text-muted-foreground">After {discountPct}% discount on {fmtRs(subtotal)}</p>
            )}
          </div>

          {/* Special structure note */}
          <div className="flex items-center gap-2">
            <Checkbox id={`snote-${idx}`} checked={specNote || false} onCheckedChange={(v) => setValue(`${prefix}.specialStructNote`, !!v)} />
            <label htmlFor={`snote-${idx}`} className="cursor-pointer text-sm text-muted-foreground">
              Add note: "Special structure cost not included in above price"
            </label>
          </div>

        </CardContent>
      </Card>
    </motion.div>
  );
}
