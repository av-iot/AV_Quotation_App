"use client";

import { useFormContext } from "react-hook-form";
import { useEffect, useState } from "react";
import { collection, query, where, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase";
import sizingConfig from "@/lib/data.json";
import type { ProposalFormData, PanelProduct, InverterProduct, BatteryProduct } from "@/types";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Cpu, Zap, Battery as BatteryIcon, Loader2, Info, Lightbulb, Pencil, Check, X } from "lucide-react";
import { motion } from "framer-motion";

const stagger = { animate: { transition: { staggerChildren: 0.07 } } };

const DIVISOR_LOW  = sizingConfig.sizing.divisor_low;
const DIVISOR_HIGH = sizingConfig.sizing.divisor_high;
const HOME_VOLTAGE = sizingConfig.grid.home_voltage;

interface Products {
  panels: PanelProduct[];
  inverters: InverterProduct[];
  batteries: BatteryProduct[];
}

// Filter inverters by system type
function filterInverters(inverters: InverterProduct[], sysType: string): InverterProduct[] {
  return inverters.filter((inv) => {
    const t = inv.inverter_type;
    if (sysType === "ongrid")  return t === "ongrid"  || t === "hybrid";
    if (sysType === "offgrid") return t === "offgrid" || t === "hybrid";
    if (sysType === "hybrid")  return t === "hybrid";
    return true;
  });
}

// Round up to nearest 0.5
function roundUpHalf(val: number): number {
  return Math.ceil(val * 2) / 2;
}

function kwLabel(w: number): string {
  const kw = w / 1000;
  return (kw % 1 === 0 ? kw.toFixed(0) : kw.toFixed(1)) + " kW";
}

interface InverterSuggestion {
  inverter: InverterProduct;
  qty: number;
  totalKw: number;
  reason: "exact" | "above" | "multiple_smaller";
}

// Core suggestion logic:
// 1. Find inverter(s) within range           → qty 1
// 2. Next inverter above range               → qty 1
// 3. Only smaller inverters available        → qty = ceil(recHighKw / invKw)
function suggestInverter(
  inverters: InverterProduct[],
  recLowKw: number,
  recHighKw: number
): InverterSuggestion | null {
  if (!inverters.length) return null;

  const sorted = [...inverters].sort(
    (a, b) => a.input_rated_power - b.input_rated_power
  );

  // 1. Exact range match (prefer largest in range)
  // 1. Find inverters within range, pick the one closest to recLowKw
 // 1. Find inverters within range, pick closest to recLowKw (lowest recommended)
  const inRange = sorted.filter((inv) => {
    const kw = inv.input_rated_power / 1000;
    return kw >= recLowKw && kw <= recHighKw;
  });
  if (inRange.length > 0) {
    // Pick the one closest to recLowKw — lowest sufficient capacity
    const inv = inRange.reduce((prev, curr) => {
      const prevDiff = Math.abs(prev.input_rated_power / 1000 - recLowKw);
      const currDiff = Math.abs(curr.input_rated_power / 1000 - recLowKw);
      return currDiff < prevDiff ? curr : prev;
    });
    return { inverter: inv, qty: 1, totalKw: inv.input_rated_power / 1000, reason: "exact" };
  }

  // 2. No inverter in range — find next above recLowKw (not recHighKw)
  const above = sorted.filter(
    (inv) => inv.input_rated_power / 1000 > recLowKw
  );
  if (above.length > 0) {
    const inv = above[0]; // smallest above recLowKw
    return { inverter: inv, qty: 1, totalKw: inv.input_rated_power / 1000, reason: "above" };
  }

  // 3. All inverters are smaller — find the best inverter × qty combination
  // that gives a total closest to recLowKw (minimum required), not recHighKw
  let bestInv = sorted[sorted.length - 1];
  let bestQty = Math.ceil((recLowKw * 1000) / bestInv.input_rated_power);
  let bestTotal = (bestInv.input_rated_power / 1000) * bestQty;
  let bestDiff = Math.abs(bestTotal - recLowKw);

  // Check all available inverters — pick combo whose total is nearest to recLowKw
  for (const inv of sorted) {
    const invKw = inv.input_rated_power / 1000;
    const qty = Math.ceil(recLowKw / invKw);
    const total = invKw * qty;
    const diff = Math.abs(total - recLowKw);
    if (diff < bestDiff) {
      bestDiff = diff;
      bestInv = inv;
      bestQty = qty;
      bestTotal = total;
    }
  }

  return {
    inverter: bestInv,
    qty: bestQty,
    totalKw: bestTotal,
    reason: "multiple_smaller",
  };
}

export default function StepComponents({ onNext }: { onNext: () => void }) {
  const { watch, setValue, register } = useFormContext<ProposalFormData>();
  const sysType    = watch("sysType");
  const numOptions = watch("numOptions");
  const [products, setProducts] = useState<Products>({
    panels: [], inverters: [], batteries: [],
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const snap = await getDocs(
          query(collection(db, "products"), where("active", "==", true))
        );
        const all = snap.docs.map((d) => ({ id: d.id, ...d.data() })) as any[];
        setProducts({
  panels:    all.filter((p) => p.type === "panel"),
  inverters: all.filter((p) => p.type === "inverter"),
  batteries: all.filter((p) => p.type === "battery"),
});
// Cache products by ID so StepPricing can look up sell prices
const cache: Record<string, any> = {};
all.forEach((p) => { cache[p.id] = p; });
(window as any).__productCache = cache;
      } catch (err) {
        console.error("Failed to load products:", err);
        setProducts({ panels: [], inverters: [], batteries: [] });
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  if (loading) {
    return (
      <div className="flex h-48 items-center justify-center gap-3 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
        <span className="text-sm">Loading product catalog…</span>
      </div>
    );
  }

  if (!products.panels.length && !products.inverters.length) {
    return (
      <div className="flex h-48 flex-col items-center justify-center gap-2 text-muted-foreground">
        <p className="text-sm font-medium">No products found in database.</p>
        <p className="text-xs">Go to the Products section to add inverters, panels and batteries first.</p>
      </div>
    );
  }

  return (
    <motion.div variants={stagger} initial="initial" animate="animate" className="space-y-4">
      {Array.from({ length: numOptions }, (_, idx) => (
        <OptionBlock
          key={idx}
          idx={idx}
          sysType={sysType}
          products={products}
          register={register}
          watch={watch}
          setValue={setValue}
        />
      ))}
    </motion.div>
  );
}

// ── Editable field — shows value with a pencil icon, click to edit inline ────
function EditableValue({
  label,
  value,
  onChange,
  suffix = "",
  type = "number",
  className = "",
}: {
  label: string;
  value: string | number;
  onChange: (v: string) => void;
  suffix?: string;
  type?: string;
  className?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft]     = useState(String(value));

  const commit = () => {
    onChange(draft);
    setEditing(false);
  };
  const cancel = () => {
    setDraft(String(value));
    setEditing(false);
  };

  if (editing) {
    return (
      <div className={`flex items-center gap-1 ${className}`}>
        <Input
          type={type}
          value={draft}
          autoFocus
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit();
            if (e.key === "Escape") cancel();
          }}
          className="h-7 w-full text-xs"
        />
        <button type="button" onClick={commit}  className="text-green-600 hover:text-green-700"><Check className="h-3.5 w-3.5" /></button>
        <button type="button" onClick={cancel}  className="text-destructive hover:text-destructive/80"><X className="h-3.5 w-3.5" /></button>
      </div>
    );
  }

  return (
    <div
      className={`group flex cursor-pointer items-center gap-1 ${className}`}
      onClick={() => { setDraft(String(value)); setEditing(true); }}
      title={`Click to edit ${label}`}
    >
      <span className="text-sm font-medium">{value}{suffix}</span>
      <Pencil className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
    </div>
  );
}

// ── Option block ─────────────────────────────────────────────────────────────
function OptionBlock({  idx, sysType, products, register, watch, setValue }: any) {
  const prefix = `options.${idx}` as const;

  // ── Monthly usage ─────────────────────────────────────────────────────────
  const monthlyUsage = watch(`${prefix}.monthlyUsage`) || "";
  const usageNum     = parseFloat(monthlyUsage) || 0;

  const rawLow    = usageNum > 0 ? usageNum / DIVISOR_HIGH : null;
  const rawHigh   = usageNum > 0 ? usageNum / DIVISOR_LOW  : null;
const recLowKw  = rawLow  != null ? Math.ceil(rawLow)  : null;
const recHighKw = rawHigh != null ? Math.ceil(rawHigh) : null;

  // ── Inverter ──────────────────────────────────────────────────────────────
  const filteredInverters = filterInverters(products.inverters, sysType);
const invId             = watch(`${prefix}.inverterProductId`) || "";
const invQtyRaw         = watch(`${prefix}.inverterQty`) || "";
const oversize          = watch(`${prefix}.oversize`) || false;
const [userEditedQty, setUserEditedQty] = useState(false);

  const selectedInv = filteredInverters.find(
    (i: InverterProduct) => i.id === invId
  );

  // Compute suggestion
  const suggestion: InverterSuggestion | null =
    recLowKw && recHighKw
      ? suggestInverter(filteredInverters, recLowKw, recHighKw)
      : null;

  // Auto-apply suggestion when usage changes and no manual selection yet
// Auto-apply suggestion only once when usage is first entered
useEffect(() => {
    if (!suggestion) return;
    if (!invId) {
      setValue(`${prefix}.inverterProductId`, suggestion.inverter.id);
      setValue(`${prefix}.panelQty`, "");
    }
    // Only auto-fill qty if user has NOT manually edited it
    if (!userEditedQty) {
      setValue(`${prefix}.inverterQty`, String(suggestion.qty));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recLowKw, recHighKw, suggestion?.inverter.id]);


  // Total inverter capacity (single unit)
  const singleInvCapW = selectedInv
    ? oversize
      ? selectedInv.max_input_power
      : selectedInv.input_rated_power
    : 0;

  // Total capacity across all units
  const invQtyNum     = parseInt(invQtyRaw) || 1;
  const totalInvCapW  = singleInvCapW * invQtyNum;
  const totalInvCapKw = totalInvCapW
    ? ((totalInvCapW / 1000) % 1 === 0
        ? (totalInvCapW / 1000).toFixed(0)
        : (totalInvCapW / 1000).toFixed(1))
    : null;
    // ── Permitted power check (ongrid only) ──────────────────────────────────
  const cutoutCurrent = parseFloat(watch("cutoutCurrent") || "0");
  const phase         = watch("phase"); // "1" or "3"
  const phaseNum      = phase === "3" ? 3 : 1;

  // permitted power in kW = cutout_current × phase × home_voltage / 1000
  const permittedPowerKw = cutoutCurrent > 0
    ? (cutoutCurrent * phaseNum * HOME_VOLTAGE) / 1000
    : null;

  const powerExceeded =
    sysType === "ongrid" &&
    permittedPowerKw !== null &&
    totalInvCapW > 0 &&
    totalInvCapW / 1000 > permittedPowerKw;

  // ── Panels ────────────────────────────────────────────────────────────────
  const panelId  = watch(`${prefix}.panelProductId`) || "";
  const panelQty = watch(`${prefix}.panelQty`)       || "";
  const panel    = products.panels.find((p: PanelProduct) => p.id === panelId);

  const suggestedPanelQty = panel && totalInvCapW
    ? Math.ceil(totalInvCapW / panel.max_panel_output)
    : null;

  const totalKw = panel && panelQty
    ? ((Number(panelQty) * panel.max_panel_output) / 1000).toFixed(2) + " kW"
    : "";

  useEffect(() => {
    if (suggestedPanelQty && !panelQty) {
      setValue(`${prefix}.panelQty`, String(suggestedPanelQty));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invId, oversize, panelId, invQtyRaw]);

  // ── Battery ───────────────────────────────────────────────────────────────
  const batId    = watch(`${prefix}.batteryProductId`) || "";
  const batQty   = watch(`${prefix}.batteryQty`)       || "";
// Filter batteries by inverter voltage compatibility
const compatibleBatteries = products.batteries.filter((b: BatteryProduct) => {
  if (!selectedInv) return true; // show all if no inverter selected yet
  if (!selectedInv.min_battery_voltage || !selectedInv.max_battery_voltage) return true;
  // Parse battery_operating_voltage — stored as e.g. "44.8 - 57.6V" or "48V"
  const raw = b.battery_operating_voltage || "";
  const nums = raw.replace(/V/gi, "").split("-").map((s: string) => parseFloat(s.trim())).filter((n: number) => !isNaN(n));
  if (nums.length === 0) return true; // can't parse — show it
  const batMin = nums[0];
  const batMax = nums.length > 1 ? nums[1] : nums[0];
  // Compatible if battery voltage range overlaps inverter battery voltage range
  return batMax >= selectedInv.min_battery_voltage && batMin <= selectedInv.max_battery_voltage;
});

const bat = compatibleBatteries.find((b: BatteryProduct) => b.id === batId)
         || products.batteries.find((b: BatteryProduct) => b.id === batId);

  const totalKwh = bat && batQty
    ? (Number(batQty) * bat.usable_energy) + " kWh"
    : "";

    useEffect(() => {
  if (!batId) return;
  const stillCompatible = compatibleBatteries.some((b: BatteryProduct) => b.id === batId);
  if (!stillCompatible) {
    setValue(`${prefix}.batteryProductId`, "");
    setValue(`${prefix}.batteryQty`, "");
  }
// eslint-disable-next-line react-hooks/exhaustive-deps
}, [invId]);


  return (
    <motion.div variants={{ initial: { opacity: 0, y: 8 }, animate: { opacity: 1, y: 0 } }}>
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center justify-between text-sm">
            <span className="text-base font-semibold text-primary">Option {idx + 1}</span>
            <Badge variant="outline" className="text-xs capitalize">{sysType}</Badge>
          </CardTitle>
        </CardHeader>

        <CardContent className="space-y-6">

          {/* ── Monthly usage ── */}
          <div>
            <div className="mb-2 flex items-center gap-2">
              <Info className="h-3.5 w-3.5 text-primary" />
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Customer usage
              </span>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Monthly usage (kWh)</Label>
                <Input
                  {...register(`${prefix}.monthlyUsage`)}
                  type="number"
                  min={0}
                  className="h-9 text-sm"
                  placeholder="e.g. 600"
                />
              </div>

              {/* Recommendation banner */}
              {recLowKw != null && recHighKw != null && (
                <div className="sm:col-span-2 flex items-start gap-2 rounded-lg border border-primary/20 bg-primary/5 px-4 py-2.5">
                  <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  <div className="space-y-1">
                    <p className="text-xs text-primary">
                      Based on{" "}
                      <span className="font-bold">{monthlyUsage} kWh/month</span>{" "}
                      — recommended inverter:{" "}
                      <span className="font-bold">{recLowKw} kW – {recHighKw} kW</span>
                    </p>

                    {/* Show suggestion detail */}
                    {suggestion && (
                      <p className="text-xs text-muted-foreground">
                        {suggestion.reason === "exact" && (
                          <>
                            ✅ Matched:{" "}
                            <span className="font-medium text-foreground">
                              {suggestion.qty}× {kwLabel(suggestion.inverter.input_rated_power)} {suggestion.inverter.brand} ({suggestion.inverter.model})
                            </span>
                          </>
                        )}
                        {suggestion.reason === "above" && (
                          <>
                            ↑ Nearest above range:{" "}
                            <span className="font-medium text-foreground">
                              {suggestion.qty}× {kwLabel(suggestion.inverter.input_rated_power)} {suggestion.inverter.brand} ({suggestion.inverter.model})
                            </span>
                          </>
                        )}
                        {suggestion.reason === "multiple_smaller" && (
                          <>
                            ⚡ No single match — suggest{" "}
                            <span className="font-medium text-foreground">
                              {suggestion.qty}× {kwLabel(suggestion.inverter.input_rated_power)} {suggestion.inverter.brand} ({suggestion.inverter.model})
                            </span>{" "}
                            = <span className="font-medium text-foreground">{kwLabel(suggestion.totalKw * 1000)} total</span>
                          </>
                        )}
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* ── Inverter ── */}
          <div>
            <div className="mb-3 flex items-center gap-2">
              <Cpu className="h-3.5 w-3.5 text-blue-500" />
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Inverter
              </span>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              {/* Model select */}
              <div className="space-y-1.5 sm:col-span-1">
                <Label className="text-xs">Inverter model</Label>
                <Select
                  value={invId}
                  onValueChange={(v) => {
                    setValue(`${prefix}.inverterProductId`, v);
                    setValue(`${prefix}.panelQty`, "");
                  }}
                >
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue placeholder="Select inverter…" />
                  </SelectTrigger>
                  <SelectContent>
                    {filteredInverters.length === 0 && (
                      <SelectItem value="_none" disabled className="text-xs text-muted-foreground">
                        No inverters for {sysType} in database
                      </SelectItem>
                    )}
                    {filteredInverters
                      .slice()
                      .sort((a: InverterProduct, b: InverterProduct) =>
                        a.input_rated_power - b.input_rated_power
                      )
                      .map((inv: InverterProduct) => {
                        const kw = inv.input_rated_power / 1000;
                        const inRange =
                          recLowKw != null &&
                          recHighKw != null &&
                          kw >= recLowKw &&
                          kw <= recHighKw;
                        const isSuggested = suggestion?.inverter.id === inv.id;
                        return (
                          <SelectItem key={inv.id} value={inv.id} className="text-xs">
                            {inRange     ? "★ " : ""}
                            {isSuggested && !inRange ? "→ " : ""}
                            {inv.brand} {kwLabel(inv.input_rated_power)} {inv.phase_count} ({inv.model})
                          </SelectItem>
                        );
                      })}
                  </SelectContent>
                </Select>
              </div>

              {/* Qty — editable inline */}
              <div className="space-y-1.5">
  <Label className="text-xs">Quantity</Label>
  <Input
    {...register(`${prefix}.inverterQty`)}
    type="number"
    min={1}
    className="h-9 text-sm"
    placeholder={suggestion && !userEditedQty ? String(suggestion.qty) : "1"}
    onChange={(e) => {
      setUserEditedQty(true);
      setValue(`${prefix}.inverterQty`, e.target.value);
      setValue(`${prefix}.panelQty`, ""); // recalc panels when qty changes
    }}
  />
</div>

              {/* Total capacity display */}
              <div className="space-y-1.5">
                <Label className="text-xs">Total capacity</Label>
                <div className="flex h-9 items-center rounded-md border bg-muted px-3 text-sm text-muted-foreground">
                  {totalInvCapKw ? `${totalInvCapKw} kW` : "—"}
                  {invQtyNum > 1 && selectedInv && (
                    <span className="ml-1 text-xs">
                      ({invQtyNum}×{kwLabel(singleInvCapW)})
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Oversize checkbox */}
            {/* Oversize checkbox */}
            <div className="mt-2 flex items-center gap-2">
              <Checkbox
                id={`oversize-${idx}`}
                checked={oversize}
                onCheckedChange={(v) => {
                  setValue(`${prefix}.oversize`, !!v);
                  setValue(`${prefix}.panelQty`, "");
                }}
              />
              <label htmlFor={`oversize-${idx}`} className="cursor-pointer text-xs text-muted-foreground">
                Oversize system
                {selectedInv && (
                  <span className="ml-1">
                    — using{" "}
                    <span className="font-medium text-foreground">
                      {oversize
                        ? `${(selectedInv.max_input_power / 1000).toFixed(1)} kW (max input power)`
                        : `${(selectedInv.input_rated_power / 1000).toFixed(1)} kW (rated power)`}
                    </span>
                  </span>
                )}
              </label>
            </div>

            {/* Permitted power warning */}
            {sysType === "ongrid" && permittedPowerKw !== null && totalInvCapW > 0 && (
              <div className={`mt-3 flex items-start gap-2 rounded-lg border px-4 py-3 ${
                powerExceeded
                  ? "border-destructive/40 bg-destructive/5"
                  : "border-green-200 bg-green-50 dark:border-green-900 dark:bg-green-950/30"
              }`}>
                <span className="mt-0.5 text-sm">
                  {powerExceeded ? "⚠️" : "✅"}
                </span>
                <div className="space-y-0.5">
                  <p className={`text-xs font-medium ${
                    powerExceeded ? "text-destructive" : "text-green-700 dark:text-green-400"
                  }`}>
                    {powerExceeded
                      ? "Power exceeds permitted limit"
                      : "Power within permitted limit"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Permitted:{" "}
                    <span className="font-medium text-foreground">
                      {permittedPowerKw.toFixed(2)} kW
                    </span>
                    {" "}({cutoutCurrent}A × {phaseNum} phase × {HOME_VOLTAGE}V)
                    {" · "}
                    System:{" "}
                    <span className={`font-medium ${powerExceeded ? "text-destructive" : "text-foreground"}`}>
                      {totalInvCapKw} kW
                    </span>
                  </p>
                  {powerExceeded && (
                    <p className="text-xs text-destructive">
                      This system capacity is not permitted by the utility provider with the current cutout current.
                      Consider reducing the inverter size or increasing the cutout current.
                    </p>
                  )}
                </div>
              </div>
            )}

          </div>

          {/* ── Solar panels ── */}
          <div>
            <div className="mb-3 flex items-center gap-2">
              <Zap className="h-3.5 w-3.5 text-amber-500" />
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Solar panels
              </span>
            </div>

            {/* {suggestedPanelQty && panel && (
              <div className="mb-3 flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 dark:border-amber-900 dark:bg-amber-950/30">
                <Lightbulb className="h-3.5 w-3.5 shrink-0 text-amber-600" />
                <p className="text-xs text-amber-700 dark:text-amber-400">
                  For{" "}
                  <span className="font-bold">{totalInvCapKw} kW</span> total inverter
                  capacity with{" "}
                  <span className="font-bold">{panel.max_panel_output}W</span> panels —
                  suggested:{" "}
                  <span className="font-bold">{suggestedPanelQty} panels</span>.
                </p>
              </div>
            )} */}

            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Panel model</Label>
                <Select
                  value={panelId}
                  onValueChange={(v) => {
                    setValue(`${prefix}.panelProductId`, v);
                    setValue(`${prefix}.panelQty`, "");
                  }}
                >
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue placeholder="Select panel…" />
                  </SelectTrigger>
                  <SelectContent>
                    {products.panels.map((p: PanelProduct) => (
                      <SelectItem key={p.id} value={p.id} className="text-xs">
                        {p.brand} {p.max_panel_output_power}W ({p.model})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                {/* <div className="flex items-center justify-between"> */}
                  <Label className="text-xs">Quantity</Label>
                  {/* {suggestedPanelQty && String(panelQty) !== String(suggestedPanelQty) && (
                    <button
                      type="button"
                      className="text-[10px] text-primary underline"
                      onClick={() => setValue(`${prefix}.panelQty`, String(suggestedPanelQty))}
                    >
                      Use {suggestedPanelQty}
                    </button>
                  )} */}
                {/* </div> */}
                <Input
                  {...register(`${prefix}.panelQty`)}
                  type="number"
                  min={1}
                  max={200}
                  className="h-9 text-sm"
                  placeholder={suggestedPanelQty ? `Suggested: ${suggestedPanelQty}` : "10"}
                />
              </div>

              {/* <div className="space-y-1.5">
                <Label className="text-xs">Total capacity</Label>
                <Input
                  value={totalKw}
                  readOnly
                  className="h-9 bg-muted text-sm"
                  placeholder="auto"
                />
              </div> */}
            </div>
          </div>

          {/* ── Battery ── */}
          {sysType !== "ongrid" && (
            <div>
              <div className="mb-3 flex items-center gap-2">
                <BatteryIcon className="h-3.5 w-3.5 text-green-600" />
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Battery
                </span>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="space-y-1.5 sm:col-span-1">
                  <Label className="text-xs">Battery model</Label>
                  <Select
                    value={batId}
                    onValueChange={(v) => setValue(`${prefix}.batteryProductId`, v)}
                  >
                    <SelectTrigger className="h-9 text-xs">
                      <SelectValue placeholder="Select battery…" />
                    </SelectTrigger>
                    <SelectContent>
                      {compatibleBatteries.length === 0 && (
  <SelectItem value="_none" disabled className="text-xs text-muted-foreground">
    No compatible batteries for selected inverter
  </SelectItem>
)}
{compatibleBatteries.map((b: BatteryProduct) => (
  <SelectItem key={b.id} value={b.id} className="text-xs">
    {b.brand} {b.usable_energy} kWh ({b.model})
    <span className="ml-1 text-muted-foreground">
      ({b.battery_operating_voltage})
    </span>
  </SelectItem>
))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Qty</Label>
                  <Input
                    {...register(`${prefix}.batteryQty`)}
                    type="number"
                    min={1}
                    className="h-9 text-sm"
                  />
                </div>
                {/* <div className="space-y-1.5">
                  <Label className="text-xs">Total capacity</Label>
                  <Input
                    value={totalKwh}
                    readOnly
                    className="h-9 bg-muted text-sm"
                    placeholder="auto"
                  />
                </div> */}
              </div>
            </div>
          )}

        </CardContent>
      </Card>
    </motion.div>
  );
}
