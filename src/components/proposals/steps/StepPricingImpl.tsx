"use client";
import { useFormContext } from "react-hook-form";
import { useEffect, useMemo } from "react";
import type { ProposalFormData, InverterProduct, PanelProduct, BatteryProduct } from "@/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DollarSign, Calculator, Sun } from "lucide-react";
import { motion } from "framer-motion";

const fadeUp = { initial: { opacity: 0, y: 8 }, animate: { opacity: 1, y: 0, transition: { duration: 0.2 } } };

const fmtRs = (v: number | string) => {
  const n = Number(v);
  if (!v || isNaN(n)) return "";
  return "Rs. " + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

export default function StepPricing({ onNext }: { onNext: () => void }) {
  const { register, watch, setValue } = useFormContext<ProposalFormData>();
  const numOptions = watch("numOptions");
  const sysType    = watch("sysType");
  const utility    = watch("utility") || "CEB";

  // ── Payment terms ──────────────────────────────────────────────────────────
  const pay1Raw = watch("pay1") || "";
  const pay2Raw = watch("pay2") || "";
  const pay3Raw = watch("pay3") || "";

  const pay1 = parseFloat(pay1Raw) || 0;
  const pay2 = parseFloat(pay2Raw) || 0;
  const pay3 = parseFloat(pay3Raw) || 0;
  const payTotal = pay1 + pay2 + pay3;
  const payError = payTotal > 100;

  // Auto-fill the third field if two are filled
  useEffect(() => {
    const p1 = parseFloat(pay1Raw) || 0;
    const p2 = parseFloat(pay2Raw) || 0;
    const p3 = parseFloat(pay3Raw) || 0;

    // If pay1 and pay2 filled, pay3 is blank → auto fill
    if (pay1Raw && pay2Raw && !pay3Raw) {
      const remain = 100 - p1 - p2;
      if (remain >= 0) setValue("pay3", String(remain));
    }
    // If pay1 and pay3 filled, pay2 is blank → auto fill
    else if (pay1Raw && pay3Raw && !pay2Raw) {
      const remain = 100 - p1 - p3;
      if (remain >= 0) setValue("pay2", String(remain));
    }
    // If pay2 and pay3 filled, pay1 is blank → auto fill
    else if (pay2Raw && pay3Raw && !pay1Raw) {
      const remain = 100 - p2 - p3;
      if (remain >= 0) setValue("pay1", String(remain));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pay1Raw, pay2Raw, pay3Raw]);

  const cebChargesRaw = watch("cebCharges");

  useEffect(() => {
    if (typeof window !== "undefined" && cebChargesRaw) {
      localStorage.setItem("cebCharges", cebChargesRaw);
    }
  }, [cebChargesRaw]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem("cebCharges");
      if (stored && !watch("cebCharges")) {
        setValue("cebCharges", stored);
      }
    }
  }, [setValue, watch]);

  return (
    <motion.div initial="initial" animate="animate" className="space-y-4">
      {/* ── Additional charges (Only if utility is CEB) ── */}
      {utility === "CEB" && (
        <motion.div variants={fadeUp}>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Additional charges</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label className="text-sm">CEB chargers (Rs.)</Label>
                <Input
                  {...register("cebCharges")}
                  type="number"
                  placeholder="0"
                  className="h-9"
                />
                <p className="text-xs text-muted-foreground">This value will be saved for future use.</p>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {Array.from({ length: numOptions }, (_, idx) => (
        <OptionPricing key={idx} idx={idx} sysType={sysType} />
      ))}

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
                  {...register("pay1")}
                  type="number"
                  min={0}
                  max={100}
                  placeholder="50"
                  className="h-8 w-20 shrink-0 text-center text-sm"
                  onChange={(e) => {
                    setValue("pay3", "");
                    setValue("pay1", e.target.value);
                  }}
                />
                <span>% payment should be made upon the job confirmation.</span>
              </div>

              {/* Term 2 */}
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Input
                  {...register("pay2")}
                  type="number"
                  min={0}
                  max={100}
                  placeholder="40"
                  className="h-8 w-20 shrink-0 text-center text-sm"
                  onChange={(e) => {
                    setValue("pay3", "");
                    setValue("pay2", e.target.value);
                  }}
                />
                <span>% payment should be made before the installation date or during the installation.</span>
              </div>

              {/* Term 3 */}
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Input
                  {...register("pay3")}
                  type="number"
                  min={0}
                  max={100}
                  placeholder="10"
                  className="h-8 w-20 shrink-0 text-center text-sm"
                />
                <span>% payment should be made after the CEB/LECO commissioning.</span>
              </div>

              {/* Total + error */}
              <div className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-xs ${
                payError
                  ? "border-destructive/40 bg-destructive/5 text-destructive"
                  : payTotal === 100
                  ? "border-green-200 bg-green-50 text-green-700 dark:border-green-900 dark:bg-green-950/30 dark:text-green-400"
                  : "border-border bg-muted/40 text-muted-foreground"
              }`}>
                {payError
                  ? `⚠️ Total is ${payTotal}% — must not exceed 100%`
                  : payTotal === 100
                  ? "✅ Payment terms total 100%"
                  : `Total: ${payTotal}% — ${100 - payTotal}% remaining`}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-sm">Validity period</Label>
              <Select
                value={watch("validityPeriod") || "14"}
                onValueChange={(v) => setValue("validityPeriod", v)}
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
function OptionPricing({ idx, sysType }: { idx: number; sysType: string }) {
  const { register, watch, setValue } = useFormContext<ProposalFormData>();
  const prefix = `options.${idx}` as const;

  const specNote    = watch(`${prefix}.specialStructNote`);
  const structPrice = parseFloat(watch(`${prefix}.structPrice`) || "0") || 0;
  const installPrice= parseFloat(watch(`${prefix}.installPrice`) || "0") || 0;
  const discountPct = parseFloat(watch(`${prefix}.discount`) || "0") || 0;

  // ── Auto-calculate system price from selected components ──────────────────
  const panelProductId   = watch(`${prefix}.panelProductId`);
  const panelQty         = parseInt(watch(`${prefix}.panelQty`) || "0") || 0;
  const inverterProductId= watch(`${prefix}.inverterProductId`);
  const inverterQty      = parseInt(watch(`${prefix}.inverterQty`) || "1") || 1;
  const batteryProductId = watch(`${prefix}.batteryProductId`) ?? "";
  const batteryQty       = parseInt(watch(`${prefix}.batteryQty`) || "0") || 0;
  const oversize          = watch(`${prefix}.oversize`) || false;
  const hasShading        = watch(`${prefix}.hasShading`) || false;
  const shadingReduction  = parseFloat(watch(`${prefix}.shadingReduction`) || "0") || 0;

  // We need the product catalog — fetch from form context via a shared data attr
  // Since products aren't in form state, we use a global window cache set by StepComponents
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
  
  // ── System size for generation calculation ────────────────────────────────
  const cache = (window as any).__productCache || {};
  const panel = cache[panelProductId];
  const panelWatts = panel?.max_panel_output_power || panel?.max_panel_output || 0;
  const systemSizeKw = (panelWatts * panelQty) / 1000;

  // Editable system price — defaults to auto-calculated
  const sysPriceRaw  = watch(`${prefix}.sysPrice`);
  const sysPrice     = parseFloat(sysPriceRaw || "0") || autoSysPrice;

  // Fill sysPrice with auto value when it's empty and auto is available
  useEffect(() => {
    if (!sysPriceRaw && autoSysPrice > 0) {
      setValue(`${prefix}.sysPrice`, String(autoSysPrice));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoSysPrice]);

  // ── Auto-calculate expected generations ──────────────────────────────────
  useEffect(() => {
    const cache = (window as any).__productCache || {};
    const panel = cache[panelProductId];
    const panelWatts = panel?.max_panel_output_power || panel?.max_panel_output || 0;
    const systemSizeKw = (panelWatts * panelQty) / 1000;

    if (systemSizeKw > 0) {
      const multiplier = oversize ? 150 : 110;
      let gen = systemSizeKw * multiplier;
      if (hasShading) {
        gen -= shadingReduction;
      }
      setValue(`${prefix}.expectedGen`, (Math.floor(gen / 10) * 10).toString());
    }
  }, [panelProductId, panelQty, oversize, hasShading, shadingReduction, setValue, prefix]);

  // ── Auto-fill after sales defaults ──────────────────────────────────────
  useEffect(() => {
    const cache = (window as any).__productCache || {};
    const selectedInv = cache[inverterProductId];
    const brand = selectedInv?.brand?.toLowerCase();

    let period = "2";
    let freq = "1";

    if (sysType === "ongrid" || sysType === "hybrid") {
      period = "2";
      freq = "1";
    } else if (sysType === "hybrid-offgrid" || sysType === "offgrid") {
      period = "1";
      freq = "1";
    }

    if (brand === "goodwe") {
      freq = "1";
    } else if (brand === "growatt") {
      freq = "2";
    }

    setValue(`${prefix}.afterSalesPeriod`, period);
    setValue(`${prefix}.servicesPerYear`, freq);
  }, [inverterProductId, sysType, setValue, prefix]);

  // ── Totals ────────────────────────────────────────────────────────────────
  const utility = watch("utility") || "CEB";
  const cebCharges  = utility === "CEB" ? (parseFloat(watch("cebCharges") || "0") || 0) : 0;
  const subtotal    = sysPrice + structPrice + installPrice + cebCharges;
  const discountAmt = (subtotal * discountPct) / 100;
  const finalPrice  = subtotal - discountAmt;

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
                <button
                  type="button"
                  className="text-[10px] text-primary underline"
                  onClick={() => setValue(`${prefix}.sysPrice`, String(autoSysPrice))}
                >
                  Use calculated: {fmtRs(autoSysPrice)}
                </button>
              )}
            </div>
            <Input
              {...register(`${prefix}.sysPrice`)}
              type="number"
              placeholder={autoSysPrice > 0 ? String(autoSysPrice) : "Enter system price"}
              className="h-9"
            />
            {autoSysPrice > 0 && (
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Calculator className="h-3 w-3" />
                <span>
                  Calculated from sell prices:{" "}
                  {panelTotal > 0 && `Panels ${fmtRs(panelTotal)}`}
                  {invTotal > 0 && ` + Inverter ${fmtRs(invTotal)}`}
                  {batTotal > 0 && ` + Battery ${fmtRs(batTotal)}`}
                </span>
              </div>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {/* Structure price */}
            <div className="space-y-1.5">
              <Label className="text-sm">Structure price (Rs.)</Label>
              <Input
                {...register(`${prefix}.structPrice`)}
                type="number"
                placeholder="0"
                className="h-9"
              />
              {structPrice > 0 && (
                <p className="text-xs text-muted-foreground">{fmtRs(structPrice)}</p>
              )}
            </div>

            {/* Installation price */}
            <div className="space-y-1.5">
              <Label className="text-sm">Installation price (Rs.)</Label>
              <Input
                {...register(`${prefix}.installPrice`)}
                type="number"
                placeholder="0"
                className="h-9"
              />
              {installPrice > 0 && (
                <p className="text-xs text-muted-foreground">{fmtRs(installPrice)}</p>
              )}
            </div>
          </div>

          {/* After Sales & Performance */}
          <div className="rounded-xl border bg-gradient-to-br from-amber-50/50 to-orange-50/50 p-4 dark:from-amber-950/20 dark:to-orange-950/20 mt-4">
            <div className="mb-4 flex items-center gap-2 border-b pb-3">
              <Sun className="h-4 w-4 text-amber-500" />
              <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Performance & Service
              </span>
            </div>
            
            <div className="grid gap-4 sm:grid-cols-2">
              {/* After sales period */}
              <div className="space-y-1.5">
                <Label className="text-sm">After sales period</Label>
                <Select
                  value={watch(`${prefix}.afterSalesPeriod`) || "2"}
                  onValueChange={(v) => setValue(`${prefix}.afterSalesPeriod`, v)}
                >
                  <SelectTrigger className="h-9 text-sm bg-background">
                    <SelectValue placeholder="Select years" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">1 Year</SelectItem>
                    <SelectItem value="2">2 Years</SelectItem>
                    <SelectItem value="3">3 Years</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Services per year */}
              <div className="space-y-1.5">
                <Label className="text-sm">Services per year</Label>
                <Select
                  value={watch(`${prefix}.servicesPerYear`) || "1"}
                  onValueChange={(v) => setValue(`${prefix}.servicesPerYear`, v)}
                >
                  <SelectTrigger className="h-9 text-sm bg-background">
                    <SelectValue placeholder="Select frequency" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">1 per year</SelectItem>
                    <SelectItem value="2">2 per year</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 mt-4">
              {/* Expected generation */}
              <div className="space-y-1.5">
                <Label className="text-sm">Expected generation (Units/month)</Label>
                <div className="relative">
                  <Input
                    {...register(`${prefix}.expectedGen`)}
                    type="number"
                    placeholder="0"
                    className="h-9 pr-12 bg-background"
                  />
                  <div className="absolute right-3 top-2 text-xs text-muted-foreground">
                    Units
                  </div>
                </div>
                {systemSizeKw > 0 && (
                  <p className="text-xs text-muted-foreground">
                    Auto-filled: {systemSizeKw.toFixed(1)} kW × {oversize ? "150" : "110"}{" "}
                    {hasShading && `− ${shadingReduction}`} = {watch(`${prefix}.expectedGen`)} Units
                  </p>
                )}
              </div>

              {/* Shading */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label className="text-sm">Shading conditions</Label>
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id={`shading-${idx}`}
                      checked={hasShading}
                      onCheckedChange={(v) => setValue(`${prefix}.hasShading`, !!v)}
                    />
                    <Label htmlFor={`shading-${idx}`} className="text-xs cursor-pointer text-muted-foreground">Apply reduction</Label>
                  </div>
                </div>
                {hasShading ? (
                  <div className="mt-2 space-y-1.5 rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-900 dark:bg-amber-950/30">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs font-medium text-amber-800 dark:text-amber-300">Reduction amount</Label>
                      <span className="text-xs text-amber-600 dark:text-amber-400">Units/month</span>
                    </div>
                    <Input
                      {...register(`${prefix}.shadingReduction`)}
                      type="number"
                      placeholder="Enter reduction"
                      className="h-8 text-xs border-amber-300 focus-visible:ring-amber-500 bg-background"
                    />
                    <p className="text-[10px] text-amber-600 dark:text-amber-400">
                      This will be subtracted from the base expected generation.
                    </p>
                  </div>
                ) : (
                  <div className="flex h-16 items-center justify-center rounded-lg border border-dashed text-xs text-muted-foreground">
                    No shading applied
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Subtotal row */}
          {subtotal > 0 && (
            <div className="flex items-center justify-between rounded-lg border bg-muted/40 px-4 py-2.5 text-sm">
              <span className="text-muted-foreground">Subtotal</span>
              <span className="font-medium">{fmtRs(subtotal)}</span>
            </div>
          )}

          {/* Discount */}
          <div className="space-y-1.5">
            <Label className="text-sm">Discount (%)</Label>
            <div className="flex items-center gap-2">
              <Input
                {...register(`${prefix}.discount`)}
                type="number"
                min={0}
                max={100}
                placeholder="0"
                className="h-9 w-28"
              />
              {discountPct > 0 && subtotal > 0 && (
                <span className="text-xs text-muted-foreground">
                  = {fmtRs(discountAmt)} off
                </span>
              )}
            </div>
          </div>

          {/* Final price — read only */}
          <div className="rounded-lg border-2 border-primary/20 bg-primary/5 px-4 py-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-primary">Final price</span>
              <span className="text-lg font-bold text-primary">
                {finalPrice > 0 ? fmtRs(finalPrice) : "—"}
              </span>
            </div>
            {discountPct > 0 && subtotal > 0 && (
              <p className="mt-0.5 text-xs text-muted-foreground">
                After {discountPct}% discount on {fmtRs(subtotal)}
              </p>
            )}
          </div>

          {/* Special structure note */}
          <div className="flex items-center gap-2">
            <Checkbox
              id={`snote-${idx}`}
              checked={specNote || false}
              onCheckedChange={(v) => setValue(`${prefix}.specialStructNote`, !!v)}
            />
            <label htmlFor={`snote-${idx}`} className="cursor-pointer text-sm text-muted-foreground">
              Add note: "Special structure cost not included in above price"
            </label>
          </div>

        </CardContent>
      </Card>
    </motion.div>
  );
}
