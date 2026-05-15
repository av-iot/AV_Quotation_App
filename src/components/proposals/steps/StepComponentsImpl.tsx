"use client";

import { useFormContext } from "react-hook-form";
import { useEffect, useState } from "react";
import { collection, query, where, getDocs, orderBy, limit } from "firebase/firestore";
import { db } from "@/lib/firebase";
import sizingConfig from "@/lib/data.json";
import type { ProposalFormData, PanelProduct, InverterProduct, BatteryProduct } from "@/types";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Cpu, Zap, Battery as BatteryIcon, Loader2, Info, Lightbulb, Pencil, Check, X, Plus, Trash2, History } from "lucide-react";
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
    if (sysType === "hybrid-offgrid") return t === "offgrid" || t === "hybrid";
    if (sysType === "grid-backup") return t === "hybrid" || t === "offgrid";
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
  reason: "exact" | "above" | "multiple_smaller" | "historical";
  historicalPanelId?: string;
}

// Core suggestion logic:
function suggestInverter(
  inverters: InverterProduct[],
  recLowKw: number,
  recHighKw: number,
  pastProposals: any[],
  sysType: string
): InverterSuggestion | null {
  if (!inverters.length) return null;

  // 1. Try Historical Match First
  if (pastProposals && pastProposals.length > 0) {
    for (const prop of pastProposals) {
      if (prop.sysType === sysType && prop.options && prop.options.length > 0) {
        const opt = prop.options[0]; // analyze the primary option
        const histInvId = opt.inverter?.productId;
        const histPanelId = opt.panel?.productId;
        if (histInvId) {
          const matchedInv = inverters.find(i => i.id === histInvId);
          if (matchedInv) {
            const histTotalKw = (matchedInv.input_rated_power * (opt.inverter?.qty || 1)) / 1000;
            if (histTotalKw >= recLowKw * 0.8 && histTotalKw <= recHighKw * 1.2) {
              return {
                inverter: matchedInv,
                qty: opt.inverter?.qty || 1,
                totalKw: histTotalKw,
                reason: "historical",
                historicalPanelId: histPanelId
              };
            }
          }
        }
      }
    }
  }

  const sorted = [...inverters].sort(
    (a, b) => a.input_rated_power - b.input_rated_power
  );

  // 2. Exact range match
  const inRange = sorted.filter((inv) => {
    const kw = inv.input_rated_power / 1000;
    return kw >= recLowKw && kw <= recHighKw;
  });
  if (inRange.length > 0) {
    const inv = inRange.reduce((prev, curr) => {
      const prevDiff = Math.abs(prev.input_rated_power / 1000 - recLowKw);
      const currDiff = Math.abs(curr.input_rated_power / 1000 - recLowKw);
      return currDiff < prevDiff ? curr : prev;
    });
    return { inverter: inv, qty: 1, totalKw: inv.input_rated_power / 1000, reason: "exact" };
  }

  // 3. No inverter in range — find next above recLowKw
  const above = sorted.filter(
    (inv) => inv.input_rated_power / 1000 > recLowKw
  );
  if (above.length > 0) {
    const inv = above[0];
    return { inverter: inv, qty: 1, totalKw: inv.input_rated_power / 1000, reason: "above" };
  }

  // 4. All inverters are smaller — find the best inverter × qty combination
  let bestInv = sorted[sorted.length - 1];
  let bestQty = Math.ceil((recLowKw * 1000) / bestInv.input_rated_power);
  let bestTotal = (bestInv.input_rated_power / 1000) * bestQty;
  let bestDiff = Math.abs(bestTotal - recLowKw);

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
  const numOptions = watch("numOptions");
  const [products, setProducts] = useState<Products>({
    panels: [], inverters: [], batteries: [],
  });
  const [pastProposals, setPastProposals] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const [prodSnap, propSnap] = await Promise.all([
          getDocs(query(collection(db, "products"), where("active", "==", true))),
          getDocs(query(collection(db, "proposals"), orderBy("date", "desc"), limit(25)))
        ]);

        const all = prodSnap.docs.map((d) => ({ id: d.id, ...d.data() })) as any[];
        setProducts({
          panels:    all.filter((p) => p.type === "panel"),
          inverters: all.filter((p) => p.type === "inverter"),
          batteries: all.filter((p) => p.type === "battery"),
        });

        setPastProposals(propSnap.docs.map(d => d.data()));

        const cache: Record<string, any> = {};
        all.forEach((p) => { cache[p.id] = p; });
        (window as any).__productCache = cache;
      } catch (err) {
        console.error("Failed to load products/proposals:", err);
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

  const monthlyUsage = watch("monthlyUsage") || "";
  const usageNum     = parseFloat(monthlyUsage) || 0;

  const rawLow    = usageNum > 0 ? usageNum / DIVISOR_HIGH : null;
  const rawHigh   = usageNum > 0 ? usageNum / DIVISOR_LOW  : null;
  const recLowKw  = rawLow  != null ? Math.ceil(rawLow)  : null;
  const recHighKw = rawHigh != null ? Math.ceil(rawHigh) : null;

  return (
    <motion.div variants={stagger} initial="initial" animate="animate" className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm">
            <Info className="h-4 w-4 text-primary" />
            <span className="text-base font-semibold text-primary">Customer Usage</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Monthly usage (kWh)</Label>
              <Input
                {...register("monthlyUsage")}
                type="number"
                min={0}
                className="h-9 text-sm"
                placeholder="e.g. 600"
              />
            </div>
            {recLowKw != null && recHighKw != null && (
              <div className="flex items-center gap-2 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2">
                <Lightbulb className="h-4 w-4 shrink-0 text-primary" />
                <p className="text-xs text-primary">
                  Recommended inverter:{" "}
                  <span className="font-bold">{recLowKw} kW – {recHighKw} kW</span>
                  <span className="text-muted-foreground"> based on {monthlyUsage} kWh/month</span>
                </p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {Array.from({ length: numOptions || 1 }, (_, idx) => (
        <OptionBlock
          key={idx}
          idx={idx}
          products={products}
          register={register}
          watch={watch}
          setValue={setValue}
          globalRecLowKw={recLowKw}
          globalRecHighKw={recHighKw}
          pastProposals={pastProposals}
          usageNum={usageNum}
          onRemove={idx > 0 ? () => setValue("numOptions", ((numOptions || 1) - 1) as any) : undefined}
        />
      ))}

      {numOptions < 4 && (
        <div className="flex justify-center pt-2 pb-6">
          <Button 
            type="button" 
            variant="outline" 
            onClick={() => setValue("numOptions", ((numOptions || 1) + 1) as any)}
            className="gap-2 rounded-full border-primary/30 hover:bg-primary/5 hover:text-primary"
          >
            <Plus className="h-4 w-4" />
            Add Another Option
          </Button>
        </div>
      )}
    </motion.div>
  );
}

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

// Real OptionBlock with requested fixes
function OptionBlock({ idx, products, register, watch, setValue, globalRecLowKw, globalRecHighKw, pastProposals, usageNum, onRemove }: any) {
  const prefix = `options.${idx}` as const;

  const sysType: string = watch(`${prefix}.sysType`) || "ongrid";
  const hasBattery = sysType !== "ongrid";

  const filteredInverters = filterInverters(products.inverters, sysType);
  const suggestion = globalRecLowKw && globalRecHighKw
    ? suggestInverter(filteredInverters, globalRecLowKw, globalRecHighKw, pastProposals, sysType)
    : null;
  const invId             = watch(`${prefix}.inverterProductId`) || "";
  const invQtyRaw         = watch(`${prefix}.inverterQty`) || "";
  const oversize          = watch(`${prefix}.oversize`) || false;
  const [userEditedQty, setUserEditedQty] = useState(false);

  const selectedInv = filteredInverters.find(
    (i: InverterProduct) => i.id === invId
  );

  useEffect(() => {
    if (!suggestion) return;
    if (!invId) {
      setValue(`${prefix}.inverterProductId`, suggestion.inverter.id);
      setValue(`${prefix}.panelQty`, "");
      if (suggestion.historicalPanelId) {
        setValue(`${prefix}.panelProductId`, suggestion.historicalPanelId);
      }
    }
    if (!userEditedQty) {
      setValue(`${prefix}.inverterQty`, String(suggestion.qty));
    }
  }, [globalRecLowKw, globalRecHighKw, suggestion?.inverter.id, sysType]);

  const singleInvCapW = selectedInv
    ? oversize
      ? selectedInv.max_input_power
      : selectedInv.input_rated_power
    : 0;

  const invQtyNum     = parseInt(invQtyRaw) || 1;
  const totalInvCapW  = singleInvCapW * invQtyNum;
  const totalInvCapKw = totalInvCapW
    ? ((totalInvCapW / 1000) % 1 === 0
        ? (totalInvCapW / 1000).toFixed(0)
        : (totalInvCapW / 1000).toFixed(1))
    : null;

  const cutoutCurrent = parseFloat(watch("cutoutCurrent") || "0");
  const phase         = watch("phase"); 
  const phaseNum      = phase === "3" ? 3 : 1;

  const permittedPowerKw = cutoutCurrent > 0
    ? (cutoutCurrent * phaseNum * HOME_VOLTAGE) / 1000
    : null;

  const powerExceeded =
    sysType === "ongrid" &&
    permittedPowerKw !== null &&
    totalInvCapW > 0 &&
    totalInvCapW / 1000 > permittedPowerKw;

  const panelId  = watch(`${prefix}.panelProductId`) || "";
  const panelQty = watch(`${prefix}.panelQty`)       || "";
  const panel    = products.panels.find((p: PanelProduct) => p.id === panelId);

  const suggestedPanelQty = panel && totalInvCapW
    ? Math.ceil(totalInvCapW / (panel.max_panel_output_power || (panel as any).max_panel_output))
    : null;

  useEffect(() => {
    if (suggestedPanelQty) {
      setValue(`${prefix}.panelQty`, String(suggestedPanelQty));
    }
  }, [suggestedPanelQty]);

  const batId    = watch(`${prefix}.batteryProductId`) || "";
  const batQty   = watch(`${prefix}.batteryQty`)       || "";

  const compatibleBatteries = products.batteries.filter((b: BatteryProduct) => {
    if (!selectedInv) return true;
    if (!selectedInv.min_battery_voltage || !selectedInv.max_battery_voltage) return true;
    const raw = b.battery_operating_voltage || "";
    const nums = raw.replace(/V/gi, "").split("-").map((s: string) => parseFloat(s.trim())).filter((n: number) => !isNaN(n));
    if (nums.length === 0) return true;
    const batMin = nums[0];
    const batMax = nums.length > 1 ? nums[1] : nums[0];
    return batMax >= selectedInv.min_battery_voltage && batMin <= selectedInv.max_battery_voltage;
  });

  const bat = compatibleBatteries.find((b: BatteryProduct) => b.id === batId)
           || products.batteries.find((b: BatteryProduct) => b.id === batId);

  const batteryDays: number = watch(`${prefix}.batteryDays`) ?? (sysType === "hybrid" ? 0.5 : 1);
  const reqBatKwh = usageNum > 0 && hasBattery ? (usageNum / 30) * batteryDays : 0;

  const suggestedBatQty = bat && reqBatKwh > 0
    ? Math.ceil(reqBatKwh / bat.usable_energy)
    : null;

  useEffect(() => {
    if (!batId && compatibleBatteries.length > 0 && reqBatKwh > 0) {
      setValue(`${prefix}.batteryProductId`, compatibleBatteries[0].id);
    }
    if (suggestedBatQty) {
      setValue(`${prefix}.batteryQty`, String(suggestedBatQty));
    }
  }, [invId, reqBatKwh, batId, suggestedBatQty]);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3 border-b border-border/50 bg-muted/20">
          <CardTitle className="flex items-center justify-between text-sm">
            <span className="text-base font-semibold text-primary">Option {idx + 1}</span>
            <div className="flex items-center gap-2">
              <Select value={sysType} onValueChange={(v) => {
                setValue(`${prefix}.sysType`, v);
                if (v === "ongrid") {
                  setValue(`${prefix}.batteryProductId`, "");
                  setValue(`${prefix}.batteryQty`, "");
                }
              }}>
                <SelectTrigger className="h-7 w-auto gap-1.5 rounded-full border-primary/30 bg-background px-3 text-xs font-medium">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ongrid" className="text-xs">On-Grid (Solar + Grid)</SelectItem>
                  <SelectItem value="hybrid" className="text-xs">Hybrid (Solar + Grid + Battery)</SelectItem>
                  <SelectItem value="hybrid-offgrid" className="text-xs">Hybrid (Solar + Battery - No Grid)</SelectItem>
                  <SelectItem value="offgrid" className="text-xs">Off-Grid (Solar + Battery)</SelectItem>
                  <SelectItem value="grid-backup" className="text-xs">Grid Backup (Grid + Battery - No Solar)</SelectItem>
                </SelectContent>
              </Select>
              {onRemove && (
                <Button type="button" variant="ghost" size="sm" onClick={onRemove} className="h-7 px-2 text-destructive hover:bg-destructive/10 hover:text-destructive">
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
          </CardTitle>
        </CardHeader>

        <CardContent className="space-y-4 pt-4">
          <div className="rounded-xl border bg-slate-50/40 p-4 dark:bg-slate-900/40">
            <div className="mb-4 flex items-center gap-2 border-b pb-3">
              <Cpu className="h-4 w-4 text-blue-500" />
              <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Inverter
              </span>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1.5 sm:col-span-1">
                <Label className="text-xs">Inverter model</Label>
                <Select
                  value={invId}
                  onValueChange={(v) => {
                    setValue(`${prefix}.inverterProductId`, v);
                    setValue(`${prefix}.panelQty`, "");
                  }}
                >
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue placeholder="Select inverter" />
                  </SelectTrigger>
                  <SelectContent>
                    {filteredInverters.map((i: InverterProduct) => (
                      <SelectItem key={i.id} value={i.id} className="text-xs">
                        {i.brand} {kwLabel(i.input_rated_power)} ({i.model})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">Qty</Label>
                <Input
                  {...register(`${prefix}.inverterQty`)}
                  type="number"
                  min={1}
                  className="h-9 text-sm"
                  onChange={(e) => {
                    register(`${prefix}.inverterQty`).onChange(e);
                    setUserEditedQty(true);
                  }}
                />
              </div>

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
                </div>
              </div>
            )}

            {suggestion && globalRecLowKw && (
              <div className="mt-3 flex items-start gap-2 rounded-lg border border-primary/20 bg-primary/5 px-4 py-2.5">
                <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <div className="space-y-0.5">
                  <p className="text-xs text-primary font-medium">
                    Recommended: {globalRecLowKw} kW – {globalRecHighKw} kW
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {suggestion.reason === "historical" && (
                      <>🕒 Based on past proposals: <span className="font-medium text-foreground">{suggestion.qty}× {kwLabel(suggestion.inverter.input_rated_power)} {suggestion.inverter.brand} ({suggestion.inverter.model})</span></>
                    )}
                    {suggestion.reason === "exact" && (
                      <>✅ <span className="font-medium text-foreground">{suggestion.qty}× {kwLabel(suggestion.inverter.input_rated_power)} {suggestion.inverter.brand} ({suggestion.inverter.model})</span></>
                    )}
                    {suggestion.reason === "above" && (
                      <>↑ Nearest: <span className="font-medium text-foreground">{suggestion.qty}× {kwLabel(suggestion.inverter.input_rated_power)} {suggestion.inverter.brand} ({suggestion.inverter.model})</span></>
                    )}
                    {suggestion.reason === "multiple_smaller" && (
                      <>⚡ <span className="font-medium text-foreground">{suggestion.qty}× {kwLabel(suggestion.inverter.input_rated_power)} {suggestion.inverter.brand}</span> = {kwLabel(suggestion.totalKw * 1000)} total</>
                    )}
                  </p>
                </div>
              </div>
            )}
          </div>

          {sysType !== "grid-backup" && (
            <div className="rounded-xl border bg-slate-50/40 p-4 dark:bg-slate-900/40">
              <div className="mb-4 flex items-center gap-2 border-b pb-3">
                <Zap className="h-4 w-4 text-amber-500" />
                <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  Solar panels
                </span>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <div className="space-y-1.5 sm:col-span-1">
                  <Label className="text-xs">Panel model</Label>
                  <Select
                    value={panelId}
                    onValueChange={(v) => setValue(`${prefix}.panelProductId`, v)}
                  >
                    <SelectTrigger className="h-9 text-sm">
                      <SelectValue placeholder="Select panel" />
                    </SelectTrigger>
                    <SelectContent>
                      {products.panels.map((p: PanelProduct) => (
                        <SelectItem key={p.id} value={p.id} className="text-xs">
                          {p.brand} {p.max_panel_output_power || (p as any).max_panel_output}W ({p.model})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs">Qty</Label>
                  <Input
                    {...register(`${prefix}.panelQty`)}
                    type="number"
                    min={1}
                    max={200}
                    className="h-9 text-sm"
                    placeholder={suggestedPanelQty ? `Suggested: ${suggestedPanelQty}` : "10"}
                  />
                </div>
              </div>
            </div>
          )}

          {hasBattery && (
            <div className="rounded-xl border bg-slate-50/40 p-4 dark:bg-slate-900/40">
              <div className="mb-4 flex items-center gap-2 border-b pb-3">
                <BatteryIcon className="h-4 w-4 text-green-600" />
                <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  Battery
                </span>
              </div>

              {usageNum > 0 && (
                <div className="mb-4 rounded-lg border bg-muted/30 px-4 py-3">
                  <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
                    <div className="flex-1 w-full space-y-2">
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span>{sysType === "hybrid" ? "Night time (12h)" : "1 Day"}</span>
                        <span>{sysType === "hybrid" ? "3 Days" : "7 Days+"}</span>
                      </div>
                      <input
                        type="range"
                        min={sysType === "hybrid" ? 0.5 : 1}
                        max={sysType === "hybrid" ? 3 : 7}
                        step={sysType === "hybrid" ? 0.5 : 1}
                        value={batteryDays}
                        onChange={(e) => setValue(`${prefix}.batteryDays`, parseFloat(e.target.value))}
                        className="w-full accent-green-600 cursor-pointer"
                      />
                      <div className="flex justify-between items-center">
                        <span className="text-[10px] text-muted-foreground font-medium">
                          {batteryDays === 0.5 ? "Night time only" : `${batteryDays} Day${batteryDays > 1 ? "s" : ""}${batteryDays === 7 ? "+" : ""}`}
                        </span>
                        <span className="text-xs font-bold text-green-700 dark:text-green-500">
                          {(usageNum / 30 * batteryDays).toFixed(1) || 0} kWh required
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              <div className="grid gap-3 sm:grid-cols-3">
                <div className="space-y-1.5 sm:col-span-1">
                  <Label className="text-xs">Battery model</Label>
                  <Select
                    value={batId}
                    onValueChange={(v) => setValue(`${prefix}.batteryProductId`, v)}
                  >
                    <SelectTrigger className="h-9 text-sm">
                      <SelectValue placeholder="Select battery" />
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
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
