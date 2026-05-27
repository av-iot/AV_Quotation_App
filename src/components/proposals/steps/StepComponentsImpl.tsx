"use client";

import { useFormContext } from "react-hook-form";
import { useEffect, useState, useCallback, useMemo } from "react";
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
import { 
  Cpu, 
  Zap, 
  Battery as BatteryIcon, 
  Loader2, 
  Info, 
  Lightbulb, 
  Pencil, 
  Check, 
  X, 
  Plus, 
  Trash2, 
  History,
  Sparkles,
  TrendingUp,
  Sun,
  ShieldAlert,
  CheckCircle2,
  Info as InfoIcon,
  AlertTriangle
} from "lucide-react";
import { motion } from "framer-motion";

const stagger = { animate: { transition: { staggerChildren: 0.07 } } };
const cardFade = {
  initial: { opacity: 0, y: 15 },
  animate: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 100, damping: 15 } }
};

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

const addRecentItem = (key: string, id: string) => {
  if (typeof window === "undefined" || !id) return;
  try {
    const currentRaw = localStorage.getItem(key);
    const current: string[] = currentRaw ? JSON.parse(currentRaw) : [];
    const updated = [id, ...current.filter(x => x !== id)].slice(0, 3);
    localStorage.setItem(key, JSON.stringify(updated));
    return updated;
  } catch (e) {
    console.error("Failed to save to localStorage", e);
  }
};

export default function StepComponents({ onNext }: { onNext: () => void }) {
  const { watch, setValue, register, formState: { errors } } = useFormContext<ProposalFormData>();
  const numOptions = watch("numOptions");
  const [products, setProducts] = useState<Products>({
    panels: [], inverters: [], batteries: [],
  });
  const [pastProposals, setPastProposals] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const [recentInvs, setRecentInvs] = useState<string[]>([]);
  const [recentPanels, setRecentPanels] = useState<string[]>([]);
  const [recentBats, setRecentBats] = useState<string[]>([]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      try {
        const invs = localStorage.getItem("recent_inverters");
        const panels = localStorage.getItem("recent_panels");
        const bats = localStorage.getItem("recent_batteries");
        if (invs) setRecentInvs(JSON.parse(invs));
        if (panels) setRecentPanels(JSON.parse(panels));
        if (bats) setRecentBats(JSON.parse(bats));
      } catch (e) {
        console.error("Failed to load recent items from localStorage", e);
      }
    }
  }, []);

  const trackRecentInverter = useCallback((id: string) => {
    const updated = addRecentItem("recent_inverters", id);
    if (updated) setRecentInvs(updated);
  }, []);

  const trackRecentPanel = useCallback((id: string) => {
    const updated = addRecentItem("recent_panels", id);
    if (updated) setRecentPanels(updated);
  }, []);

  const trackRecentBattery = useCallback((id: string) => {
    const updated = addRecentItem("recent_batteries", id);
    if (updated) setRecentBats(updated);
  }, []);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const [prodSnap, propSnap] = await Promise.all([
          getDocs(query(collection(db, "products"), where("active", "==", true))),
          getDocs(query(collection(db, "proposals"), orderBy("date", "desc"), limit(25)))
        ]);

        const all = prodSnap.docs.map((d) => ({ ...d.data(), id: d.id })) as any[];
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
        <Loader2 className="h-5 w-5 animate-spin text-primary" />
        <span className="text-sm font-medium">Loading product catalog…</span>
      </div>
    );
  }

  if (!products.panels.length && !products.inverters.length) {
    return (
      <div className="flex h-48 flex-col items-center justify-center gap-2 text-muted-foreground">
        <AlertTriangle className="h-8 w-8 text-amber-500" />
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
    <motion.div variants={stagger} initial="initial" animate="animate" className="space-y-6">
      <Card className="border border-border/80 shadow-md bg-gradient-to-br from-background to-muted/25 overflow-hidden">
        <CardHeader className="pb-3 border-b border-border/40">
          <CardTitle className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-primary/10 text-primary">
              <TrendingUp className="h-4.5 w-4.5" />
            </div>
            <div>
              <span className="text-base font-bold tracking-tight text-foreground">Customer Usage Details</span>
              <p className="text-xs text-muted-foreground font-normal">Provide consumption details to compute optimal hardware suggestions</p>
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-4">
          <div className="flex flex-col gap-4">
            <div className="space-y-2">
              <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Monthly usage (kWh)</Label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-muted-foreground">
                  <Zap className="h-4 w-4 text-amber-500" />
                </span>
                <Input
                  {...register("monthlyUsage", {
                    required: "Monthly usage is required",
                    min: { value: 1, message: "Usage must be greater than 0" }
                  })}
                  type="number"
                  min={0}
                  className="h-10 pl-9 pr-4 text-sm bg-background border-input hover:border-accent-foreground/30 focus-visible:ring-primary"
                  placeholder="e.g. 600"
                />
              </div>
              {errors.monthlyUsage && (
                <p className="text-xs font-medium text-destructive mt-1">{errors.monthlyUsage.message}</p>
              )}
            </div>
            
            {recLowKw != null && recHighKw != null ? (
              <div className="flex items-center gap-3 rounded-xl border border-primary/20 bg-gradient-to-r from-primary/10 to-indigo-500/5 px-4 py-3 shadow-inner">
                <div className="p-2 rounded-full bg-primary/10 text-primary animate-pulse">
                  <Sparkles className="h-4 w-4" />
                </div>
                <div className="space-y-0.5">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-primary">AI Sizing Recommendation</p>
                  <p className="text-sm font-semibold text-foreground">
                    Recommended inverter:{" "}
                    <span className="text-primary font-bold">{recLowKw} kW – {recHighKw} kW</span>
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    Based on monthly usage of <span className="font-semibold text-foreground">{monthlyUsage} kWh</span>
                  </p>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-3 rounded-xl border border-dashed border-muted-foreground/30 px-4 py-3">
                <InfoIcon className="h-5 w-5 text-muted-foreground/75 animate-pulse" />
                <p className="text-xs text-muted-foreground">
                  Enter monthly energy usage to calculate recommended inverter sizing range.
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
          errors={errors}
          onRemove={idx > 0 ? () => setValue("numOptions", ((numOptions || 1) - 1) as any) : undefined}
          recentInvs={recentInvs}
          recentPanels={recentPanels}
          recentBats={recentBats}
          trackRecentInverter={trackRecentInverter}
          trackRecentPanel={trackRecentPanel}
          trackRecentBattery={trackRecentBattery}
        />
      ))}

      {numOptions < 4 && (
        <div className="flex justify-center pt-2 pb-6">
          <Button 
            type="button" 
            variant="outline" 
            onClick={() => setValue("numOptions", ((numOptions || 1) + 1) as any)}
            className="gap-2 rounded-full border-primary/30 hover:bg-primary/5 hover:text-primary px-5 shadow-sm transition-all hover:scale-102"
          >
            <Plus className="h-4 w-4" />
            Add Another Option
          </Button>
        </div>
      )}
    </motion.div>
  );
}

// OptionBlock representing each system design proposal alternative
function OptionBlock({
  idx,
  products,
  register,
  watch,
  setValue,
  globalRecLowKw,
  globalRecHighKw,
  pastProposals,
  usageNum,
  errors,
  onRemove,
  recentInvs = [],
  recentPanels = [],
  recentBats = [],
  trackRecentInverter,
  trackRecentPanel,
  trackRecentBattery
}: any) {
  const prefix = `options.${idx}` as const;

  const sysType: string = watch(`${prefix}.sysType`) || "ongrid";
  const hasBattery = sysType !== "ongrid";

  const [userEditedQty, setUserEditedQty] = useState(false);
  const [userEditedInv, setUserEditedInv] = useState(false);

  const invId    = watch(`${prefix}.inverterProductId`) || "";
  const invQtyRaw = watch(`${prefix}.inverterQty`) || "";
  const oversize  = watch(`${prefix}.oversize`) || false;
  const panelId  = watch(`${prefix}.panelProductId`) || "";
  const panelQty = watch(`${prefix}.panelQty`)       || "";
  const batId    = watch(`${prefix}.batteryProductId`) || "";
  const batQty   = watch(`${prefix}.batteryQty`)       || "";

  // Memoize to prevent new references every render (these feed into useEffect deps)
  const filteredInverters = useMemo(
    () => filterInverters(products.inverters, sysType),
    [products.inverters, sysType]
  );

  const selectedInv = useMemo(
    () => filteredInverters.find((i: InverterProduct) => i.id === invId) ?? null,
    [filteredInverters, invId]
  );

  const suggestion = useMemo(
    () => globalRecLowKw && globalRecHighKw
      ? suggestInverter(filteredInverters, globalRecLowKw, globalRecHighKw, pastProposals, sysType)
      : null,
    [filteredInverters, globalRecLowKw, globalRecHighKw, pastProposals, sysType]
  );

  useEffect(() => {
    register(`${prefix}.inverterProductId`, { required: "Inverter model is required" });
    register(`${prefix}.panelProductId`, {
      validate: (val: string) => {
        const currentSysType = watch(`${prefix}.sysType`) || "ongrid";
        if (currentSysType !== "grid-backup") {
          return val ? true : "Panel model is required";
        }
        return true;
      }
    });
    register(`${prefix}.batteryProductId`, {
      validate: (val: string) => {
        const currentSysType = watch(`${prefix}.sysType`) || "ongrid";
        if (currentSysType !== "ongrid") {
          return val ? true : "Battery model is required";
        }
        return true;
      }
    });
  }, [register, prefix, watch]);

  // Track recent items when selected
  useEffect(() => {
    if (invId && trackRecentInverter) {
      trackRecentInverter(invId);
    }
  }, [invId, trackRecentInverter]);

  useEffect(() => {
    if (panelId && trackRecentPanel) {
      trackRecentPanel(panelId);
    }
  }, [panelId, trackRecentPanel]);

  useEffect(() => {
    if (batId && batId !== "_none" && trackRecentBattery) {
      trackRecentBattery(batId);
    }
  }, [batId, trackRecentBattery]);

  // Sorting and tagging recommendations
  const isRecommendedInverter = (inv: InverterProduct) => {
    if (suggestion && inv.id === suggestion.inverter.id) return true;
    if (globalRecLowKw !== null && globalRecHighKw !== null) {
      const kw = inv.input_rated_power / 1000;
      return kw >= globalRecLowKw && kw <= globalRecHighKw;
    }
    return false;
  };

  const sortedInverters = useMemo(() => {
    const recommended = filteredInverters.filter(isRecommendedInverter);
    const others = filteredInverters.filter(i => !isRecommendedInverter(i));
    
    recommended.sort((a, b) => {
      if (suggestion) {
        if (a.id === suggestion.inverter.id) return -1;
        if (b.id === suggestion.inverter.id) return 1;
      }
      return a.input_rated_power - b.input_rated_power;
    });
    
    others.sort((a, b) => a.input_rated_power - b.input_rated_power);
    
    return [...recommended, ...others];
  }, [filteredInverters, suggestion, globalRecLowKw, globalRecHighKw]);

  // Inverter default selection — auto-applies suggestion unless user explicitly chose a model
  useEffect(() => {
    if (!suggestion) return;
    if (!userEditedInv) {
      setValue(`${prefix}.inverterProductId`, suggestion.inverter.id, { shouldValidate: true });
      setValue(`${prefix}.panelQty`, "");
      if (suggestion.historicalPanelId) {
        setValue(`${prefix}.panelProductId`, suggestion.historicalPanelId, { shouldValidate: true });
      }
    }
    if (!userEditedQty) {
      setValue(`${prefix}.inverterQty`, String(suggestion.qty), { shouldValidate: true });
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

  // Sort panels descending by capacity and recommend the highest
  const sortedPanels = useMemo(() => {
    return [...products.panels].sort((a, b) => {
      const powerA = a.max_panel_output_power || (a as any).max_panel_output || 0;
      const powerB = b.max_panel_output_power || (b as any).max_panel_output || 0;
      return powerB - powerA;
    });
  }, [products.panels]);

  const panel = sortedPanels.find((p: PanelProduct) => p.id === panelId);

  // Auto-select first panel as default panel model when empty
  useEffect(() => {
    if (sysType !== "grid-backup" && !panelId && sortedPanels.length > 0) {
      setValue(`${prefix}.panelProductId`, sortedPanels[0].id, { shouldValidate: true });
    }
  }, [sysType, panelId, sortedPanels, prefix, setValue]);

  const suggestedPanelQty = panel && totalInvCapW
    ? Math.ceil(totalInvCapW / (panel.max_panel_output_power || (panel as any).max_panel_output))
    : null;

  useEffect(() => {
    if (suggestedPanelQty) {
      setValue(`${prefix}.panelQty`, String(suggestedPanelQty), { shouldValidate: true });
    }
  }, [suggestedPanelQty]);

  const compatibleBatteries = useMemo(() => {
    return products.batteries.filter((b: BatteryProduct) => {
      if (!selectedInv) return true;
      if (!selectedInv.min_battery_voltage || !selectedInv.max_battery_voltage) return true;
      const raw = b.battery_operating_voltage || "";
      const nums = raw.replace(/V/gi, "").split("-").map((s: string) => parseFloat(s.trim())).filter((n: number) => !isNaN(n));
      if (nums.length === 0) return true;
      const batMin = nums[0];
      const batMax = nums.length > 1 ? nums[1] : nums[0];
      return batMax >= selectedInv.min_battery_voltage && batMin <= selectedInv.max_battery_voltage;
    });
  }, [products.batteries, selectedInv]);

  const sortedBatteries = useMemo(() => {
    return [...compatibleBatteries].sort((a, b) => b.usable_energy - a.usable_energy);
  }, [compatibleBatteries]);

  const bat = sortedBatteries.find((b: BatteryProduct) => b.id === batId)
           || products.batteries.find((b: BatteryProduct) => b.id === batId);

  const batteryDays: number = watch(`${prefix}.batteryDays`) ?? (sysType === "hybrid" ? 0.5 : 1);
  const reqBatKwh = usageNum > 0 && hasBattery ? (usageNum / 30) * batteryDays : 0;

  const suggestedBatQty = bat && reqBatKwh > 0
    ? Math.ceil(reqBatKwh / bat.usable_energy)
    : null;

  useEffect(() => {
    if (hasBattery && !batId && sortedBatteries.length > 0 && reqBatKwh > 0) {
      setValue(`${prefix}.batteryProductId`, sortedBatteries[0].id, { shouldValidate: true });
    }
    if (hasBattery && suggestedBatQty) {
      setValue(`${prefix}.batteryQty`, String(suggestedBatQty), { shouldValidate: true });
    }
  }, [hasBattery, invId, reqBatKwh, batId, suggestedBatQty, sortedBatteries, prefix, setValue]);

  // Premium Custom battery sizing computations
  const selectedBatCapacity = bat && batQty ? bat.usable_energy * parseInt(batQty) : 0;
  const targetBatCapacity = reqBatKwh;
  const targetPct = targetBatCapacity > 0 ? (selectedBatCapacity / targetBatCapacity) * 100 : 0;
  
  let batterySizingStatus: "under" | "optimal" | "over" | "none" = "none";
  if (targetBatCapacity > 0) {
    if (selectedBatCapacity === 0) batterySizingStatus = "none";
    else if (targetPct < 90) batterySizingStatus = "under";
    else if (targetPct <= 130) batterySizingStatus = "optimal";
    else batterySizingStatus = "over";
  }

  return (
    <motion.div variants={cardFade} className="space-y-4">
      <Card className="border border-border/80 shadow-md overflow-hidden bg-background">
        <CardHeader className="pb-3 border-b border-border/50 bg-gradient-to-r from-muted/30 to-muted/10">
          <CardTitle className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-2">
              <span className="text-base font-bold text-foreground">Option {idx + 1} Configuration</span>
              <Badge variant="outline" className="text-[10px] font-semibold bg-primary/5 text-primary border-primary/20">
                {sysType.toUpperCase()}
              </Badge>
            </div>
            <div className="flex items-center gap-2">
              <Select value={sysType} onValueChange={(v) => {
                setValue(`${prefix}.sysType`, v, { shouldValidate: true });
                if (v === "ongrid") {
                  setValue(`${prefix}.batteryProductId`, "", { shouldValidate: true });
                  setValue(`${prefix}.batteryQty`, "", { shouldValidate: true });
                } else if (v === "grid-backup") {
                  setValue(`${prefix}.panelProductId`, "", { shouldValidate: true });
                  setValue(`${prefix}.panelQty`, "", { shouldValidate: true });
                }
              }}>
                <SelectTrigger className="h-8 w-auto gap-2 rounded-full border-primary/30 bg-background px-4 text-xs font-semibold shadow-sm transition-all hover:bg-muted">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ongrid" className="text-xs font-medium">On-Grid (Solar + Grid)</SelectItem>
                  <SelectItem value="hybrid" className="text-xs font-medium">Hybrid (Solar + Grid + Battery)</SelectItem>
                  <SelectItem value="hybrid-offgrid" className="text-xs font-medium">Hybrid (Solar + Battery - No Grid)</SelectItem>
                  <SelectItem value="offgrid" className="text-xs font-medium">Off-Grid (Solar + Battery)</SelectItem>
                  <SelectItem value="grid-backup" className="text-xs font-medium">Grid Backup (Grid + Battery - No Solar)</SelectItem>
                </SelectContent>
              </Select>
              {onRemove && (
                <Button 
                  type="button" 
                  variant="ghost" 
                  size="sm" 
                  onClick={onRemove} 
                  className="h-8 w-8 p-0 text-destructive hover:bg-destructive/10 hover:text-destructive rounded-full transition-all"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </div>
          </CardTitle>
        </CardHeader>

        <CardContent className="space-y-5 pt-5 pb-5">
          {/* INVERTER COMPONENT BLOCK */}
          <div className="rounded-2xl border border-blue-500/15 bg-gradient-to-b from-blue-500/5 to-transparent p-5 dark:from-blue-950/10">
            <div className="mb-4 flex items-center gap-2 border-b border-blue-500/10 pb-3">
              <div className="p-1 rounded-md bg-blue-500/10 text-blue-600 dark:text-blue-400">
                <Cpu className="h-4 w-4" />
              </div>
              <span className="text-xs font-bold uppercase tracking-wider text-blue-700 dark:text-blue-400">
                Inverter Selection
              </span>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-2 sm:col-span-1">
                <Label className="text-xs font-semibold text-muted-foreground">Inverter model</Label>
                <Select
                  value={invId}
                  onValueChange={(v) => {
                    setValue(`${prefix}.inverterProductId`, v, { shouldValidate: true });
                    setValue(`${prefix}.panelQty`, "");
                    setUserEditedInv(true);
                  }}
                >
                  <SelectTrigger className="h-10 text-sm bg-background border-input hover:border-accent-foreground/20 focus:ring-blue-500">
                    <SelectValue placeholder="Select inverter" />
                  </SelectTrigger>
                  <SelectContent>
                    {sortedInverters.map((i: InverterProduct) => {
                      const isRec = isRecommendedInverter(i);
                      return (
                        <SelectItem key={i.id} value={i.id} className="text-xs font-medium">
                          {isRec ? "⭐ " : ""}{i.brand} {kwLabel(i.input_rated_power)} ({i.model})
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
                {errors.options?.[idx]?.inverterProductId && (
                  <p className="text-xs font-medium text-destructive mt-1">{errors.options[idx].inverterProductId.message}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label className="text-xs font-semibold text-muted-foreground">Qty</Label>
                <Input
                  {...register(`${prefix}.inverterQty`, {
                    required: "Inverter quantity is required",
                    min: { value: 1, message: "Quantity must be at least 1" }
                  })}
                  type="number"
                  min={1}
                  className="h-10 text-sm bg-background border-input focus-visible:ring-blue-500"
                  value={watch(`${prefix}.inverterQty`) || ""}
                  onChange={(e) => {
                    setValue(`${prefix}.inverterQty`, e.target.value, { shouldValidate: true });
                    setUserEditedQty(true);
                  }}
                />
                {errors.options?.[idx]?.inverterQty && (
                  <p className="text-xs font-medium text-destructive mt-1">{errors.options[idx].inverterQty.message}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label className="text-xs font-semibold text-muted-foreground">Total capacity</Label>
                <div className="flex h-10 items-center rounded-md border bg-muted/50 px-3 text-sm font-semibold text-foreground">
                  {totalInvCapKw ? `${totalInvCapKw} kW` : "—"}
                  {invQtyNum > 1 && selectedInv && (
                    <span className="ml-1 text-xs text-muted-foreground font-normal">
                      ({invQtyNum}×{kwLabel(singleInvCapW)})
                    </span>
                  )}
                </div>
              </div>
            </div>

            {recentInvs.length > 0 && (
              <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px]">
                <span className="flex items-center gap-1 text-muted-foreground font-medium">
                  <History className="h-3 w-3" /> Recent:
                </span>
                {recentInvs.map((id: string) => {
                  const item = products.inverters.find((i: InverterProduct) => i.id === id);
                  if (!item) return null;
                  return (
                    <Badge
                      key={id}
                      variant="outline"
                      className="cursor-pointer border-blue-500/20 bg-blue-500/5 text-blue-700 hover:bg-blue-500/10 dark:text-blue-300 transition-all active:scale-95 px-2 py-0.5 text-[10px] rounded-md font-medium"
                      onClick={() => {
                        setValue(`${prefix}.inverterProductId`, id, { shouldValidate: true });
                        setValue(`${prefix}.panelQty`, "");
                        setUserEditedInv(true);
                      }}
                    >
                      {item.brand} {kwLabel(item.input_rated_power)}
                    </Badge>
                  );
                })}
              </div>
            )}

            <div className="mt-3 flex items-center gap-2">
              <Checkbox
                id={`oversize-${idx}`}
                checked={oversize}
                onCheckedChange={(v) => {
                  setValue(`${prefix}.oversize`, !!v);
                  setValue(`${prefix}.panelQty`, "");
                }}
                className="border-blue-500/30 text-blue-600 focus:ring-blue-500"
              />
              <label htmlFor={`oversize-${idx}`} className="cursor-pointer text-xs font-medium text-muted-foreground select-none">
                Oversize system
                {selectedInv && (
                  <span className="ml-1 text-[11px] text-muted-foreground font-normal">
                    — using{" "}
                    <span className="font-semibold text-foreground">
                      {oversize
                        ? `${(selectedInv.max_input_power / 1000).toFixed(1)} kW (max input power)`
                        : `${(selectedInv.input_rated_power / 1000).toFixed(1)} kW (rated power)`}
                    </span>
                  </span>
                )}
              </label>
            </div>

            {sysType === "ongrid" && permittedPowerKw !== null && totalInvCapW > 0 && (
              <div className={`mt-3 flex items-start gap-3 rounded-xl border p-4 shadow-sm ${
                powerExceeded
                  ? "border-destructive/30 bg-destructive/5"
                  : "border-emerald-500/20 bg-emerald-500/5 dark:bg-emerald-950/20"
              }`}>
                <div className={`p-1.5 rounded-full ${
                  powerExceeded 
                    ? "bg-destructive/10 text-destructive animate-pulse" 
                    : "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                }`}>
                  {powerExceeded ? <ShieldAlert className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
                </div>
                <div className="space-y-1">
                  <p className={`text-xs font-semibold ${
                    powerExceeded ? "text-destructive" : "text-emerald-700 dark:text-emerald-400"
                  }`}>
                    {powerExceeded
                      ? "Grid Connection Limit Exceeded"
                      : "Grid Connection Limit Verified"}
                  </p>
                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    System inverter capacity is <span className={`font-semibold ${powerExceeded ? "text-destructive" : "text-foreground"}`}>{totalInvCapKw} kW</span>. 
                    Your utility connection limit is <span className="font-semibold text-foreground">{permittedPowerKw.toFixed(2)} kW</span> ({cutoutCurrent}A × {phaseNum} phase × {HOME_VOLTAGE}V).
                  </p>
                </div>
              </div>
            )}

            {suggestion && (
              <div className="mt-3 flex items-center justify-between rounded-xl border border-blue-500/20 bg-blue-500/5 p-3.5 dark:border-blue-500/30">
                <div className="flex items-start gap-2.5">
                  <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-blue-500 animate-pulse" />
                  <div className="space-y-0.5">
                    <p className="text-xs font-semibold text-blue-900 dark:text-blue-200">
                      Smart AI Recommendation
                    </p>
                    <p className="text-[11px] text-muted-foreground leading-snug">
                      {suggestion.reason === "historical" ? (
                        <>Based on matching past projects: <span className="font-semibold text-foreground">{suggestion.qty} × {suggestion.inverter.brand} {kwLabel(suggestion.inverter.input_rated_power)}</span></>
                      ) : (
                        <>Optimal model: <span className="font-semibold text-foreground">{suggestion.qty} × {suggestion.inverter.brand} {kwLabel(suggestion.inverter.input_rated_power)}</span></>
                      )}
                    </p>
                  </div>
                </div>
                {(invId !== suggestion.inverter.id || parseInt(invQtyRaw) !== suggestion.qty) && (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-7 text-xs font-semibold text-blue-600 hover:bg-blue-500/10 hover:text-blue-700 dark:text-blue-400 dark:hover:bg-blue-500/20 shadow-none"
                    onClick={() => {
                      setValue(`${prefix}.inverterProductId`, suggestion.inverter.id, { shouldValidate: true });
                      setValue(`${prefix}.inverterQty`, String(suggestion.qty), { shouldValidate: true });
                      setUserEditedInv(false);
                      setUserEditedQty(false);
                      if (suggestion.historicalPanelId) {
                        setValue(`${prefix}.panelProductId`, suggestion.historicalPanelId, { shouldValidate: true });
                      }
                    }}
                  >
                    Apply
                  </Button>
                )}
              </div>
            )}
          </div>

          {/* SOLAR PANELS COMPONENT BLOCK */}
          {sysType !== "grid-backup" && (
            <div className="rounded-2xl border border-amber-500/15 bg-gradient-to-b from-amber-500/5 to-transparent p-5 dark:from-amber-950/10">
              <div className="mb-4 flex items-center gap-2 border-b border-amber-500/10 pb-3">
                <div className="p-1 rounded-md bg-amber-500/10 text-amber-600 dark:text-amber-400">
                  <Sun className="h-4 w-4" />
                </div>
                <span className="text-xs font-bold uppercase tracking-wider text-amber-700 dark:text-amber-400">
                  Solar Panel Selection
                </span>
              </div>

              <div className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-2 sm:col-span-1">
                  <Label className="text-xs font-semibold text-muted-foreground">Panel model</Label>
                  <Select
                    value={panelId}
                    onValueChange={(v) => setValue(`${prefix}.panelProductId`, v, { shouldValidate: true })}
                  >
                    <SelectTrigger className="h-10 text-sm bg-background border-input hover:border-accent-foreground/20 focus:ring-amber-500">
                      <SelectValue placeholder="Select panel" />
                    </SelectTrigger>
                    <SelectContent>
                      {sortedPanels.map((p: PanelProduct, pIdx) => (
                        <SelectItem key={p.id} value={p.id} className="text-xs font-medium">
                          {pIdx === 0 ? "⭐ " : ""}{p.brand} {p.max_panel_output_power || (p as any).max_panel_output}W ({p.model})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {errors.options?.[idx]?.panelProductId && (
                    <p className="text-xs font-medium text-destructive mt-1">{errors.options[idx].panelProductId.message}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label className="text-xs font-semibold text-muted-foreground">Qty</Label>
                  <Input
                    {...register(`${prefix}.panelQty`, {
                      validate: (val: string) => {
                        const currentSysType = watch(`${prefix}.sysType`) || "ongrid";
                        if (currentSysType !== "grid-backup") {
                          if (!val) return "Panel quantity is required";
                          if (parseInt(val) < 1) return "Must be at least 1";
                        }
                        return true;
                      }
                    }) }
                    type="number"
                    min={1}
                    max={200}
                    className="h-10 text-sm bg-background border-input focus-visible:ring-amber-500"
                    placeholder={suggestedPanelQty ? `Suggested: ${suggestedPanelQty}` : "10"}
                    value={watch(`${prefix}.panelQty`) || ""}
                    onChange={(e) => {
                      setValue(`${prefix}.panelQty`, e.target.value, { shouldValidate: true });
                    }}
                  />
                  {errors.options?.[idx]?.panelQty && (
                    <p className="text-xs font-medium text-destructive mt-1">{errors.options[idx].panelQty.message}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label className="text-xs font-semibold text-muted-foreground">Total Solar Power</Label>
                  <div className="flex h-10 items-center rounded-md border bg-muted/50 px-3 text-sm font-semibold text-foreground">
                    {panel && panelQty ? `${(( (panel.max_panel_output_power || (panel as any).max_panel_output) * parseInt(panelQty) ) / 1000).toFixed(2)} kW` : "—"}
                  </div>
                </div>
              </div>

              {recentPanels.length > 0 && (
                <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px]">
                  <span className="flex items-center gap-1 text-muted-foreground font-medium">
                    <History className="h-3 w-3" /> Recent:
                  </span>
                  {recentPanels.map((id: string) => {
                    const item = products.panels.find((p: PanelProduct) => p.id === id);
                    if (!item) return null;
                    return (
                      <Badge
                        key={id}
                        variant="outline"
                        className="cursor-pointer border-amber-500/20 bg-amber-500/5 text-amber-700 hover:bg-amber-500/10 dark:text-amber-300 transition-all active:scale-95 px-2 py-0.5 text-[10px] rounded-md font-medium"
                        onClick={() => setValue(`${prefix}.panelProductId`, id, { shouldValidate: true })}
                      >
                        {item.brand} {item.max_panel_output_power || (item as any).max_panel_output}W
                      </Badge>
                    );
                  })}
                </div>
              )}

              {sortedPanels.length > 0 && suggestedPanelQty !== null && (
                <div className="mt-3 flex items-center justify-between rounded-xl border border-amber-500/20 bg-amber-500/5 p-3.5 dark:border-amber-500/30">
                  <div className="flex items-start gap-2.5">
                    <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-amber-500 animate-pulse" />
                    <div className="space-y-0.5">
                      <p className="text-xs font-semibold text-amber-900 dark:text-amber-200">
                        Smart AI Recommendation
                      </p>
                      <p className="text-[11px] text-muted-foreground leading-snug">
                        Suggested panel layout: <span className="font-semibold text-foreground">{suggestedPanelQty} × {sortedPanels[0].brand} ({sortedPanels[0].max_panel_output_power || (sortedPanels[0] as any).max_panel_output}W)</span>
                      </p>
                    </div>
                  </div>
                  {(panelId !== sortedPanels[0].id || parseInt(panelQty) !== suggestedPanelQty) && (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-7 text-xs font-semibold text-amber-600 hover:bg-amber-500/10 hover:text-amber-700 dark:text-amber-400 dark:hover:bg-amber-500/20 shadow-none"
                      onClick={() => {
                        setValue(`${prefix}.panelProductId`, sortedPanels[0].id, { shouldValidate: true });
                        setValue(`${prefix}.panelQty`, String(suggestedPanelQty), { shouldValidate: true });
                      }}
                    >
                      Apply
                    </Button>
                  )}
                </div>
              )}
            </div>
          )}

          {/* BATTERY COMPONENT BLOCK */}
          {hasBattery && (
            <div className="rounded-2xl border border-emerald-500/15 bg-gradient-to-b from-emerald-500/5 to-transparent p-5 dark:from-emerald-950/10">
              <div className="mb-4 flex items-center gap-2 border-b border-emerald-500/10 pb-3">
                <div className="p-1 rounded-md bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                  <BatteryIcon className="h-4 w-4" />
                </div>
                <span className="text-xs font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
                  Battery Storage Selection
                </span>
              </div>

              {usageNum > 0 && (
                <div className="mb-4 rounded-xl border border-emerald-500/10 bg-emerald-500/5 p-4 space-y-3">
                  <div className="flex flex-col gap-2">
                    <div className="flex justify-between items-center text-xs font-semibold text-muted-foreground select-none">
                      <span>Target Autonomy Days</span>
                      <span className="text-emerald-700 dark:text-emerald-400">
                        {batteryDays === 0.5 ? "Night time only (0.5d)" : `${batteryDays} Day${batteryDays > 1 ? "s" : ""}`}
                      </span>
                    </div>
                    <input
                      type="range"
                      min={sysType === "hybrid" ? 0.5 : 1}
                      max={sysType === "hybrid" ? 3 : 7}
                      step={sysType === "hybrid" ? 0.5 : 1}
                      value={batteryDays}
                      onChange={(e) => setValue(`${prefix}.batteryDays`, parseFloat(e.target.value))}
                      className="w-full cursor-pointer h-2 rounded-lg appearance-none [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-emerald-600 [&::-webkit-slider-thumb]:cursor-pointer [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-emerald-600 [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:cursor-pointer"
                      style={{
                        background: (() => {
                          const min = sysType === "hybrid" ? 0.5 : 1;
                          const max = sysType === "hybrid" ? 3 : 7;
                          const pct = ((batteryDays - min) / (max - min)) * 100;
                          return `linear-gradient(to right, #059669 0%, #059669 ${pct}%, hsl(var(--muted)) ${pct}%, hsl(var(--muted)) 100%)`;
                        })()
                      }}
                    />
                  </div>
                  <div className="flex justify-between items-center bg-background/50 p-3 rounded-lg border border-border/50">
                    <span className="text-xs text-muted-foreground font-medium">
                      Required storage capacity:
                    </span>
                    <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400">
                      {reqBatKwh.toFixed(1)} kWh
                    </span>
                  </div>
                </div>
              )}

              {bat && parseInt(batQty) > 0 && reqBatKwh > 0 && (
                <div className="mb-4 rounded-xl border border-emerald-500/10 bg-emerald-500/5 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-foreground">Battery Storage Gauge</span>
                    <Badge className={
                      batterySizingStatus === "optimal" 
                        ? "bg-emerald-600 hover:bg-emerald-700 text-white border-none"
                        : batterySizingStatus === "over"
                          ? "bg-blue-600 hover:bg-blue-700 text-white border-none"
                          : "bg-amber-600 hover:bg-amber-700 text-white border-none"
                    }>
                      {batterySizingStatus === "optimal" && "Optimal Capacity"}
                      {batterySizingStatus === "over" && "Extended Backup"}
                      {batterySizingStatus === "under" && "Under-sized Capacity"}
                    </Badge>
                  </div>
                  
                  <div className="space-y-1">
                    <div className="h-2 w-full rounded-full bg-muted overflow-hidden flex">
                      <div 
                        className={`h-full rounded-full transition-all duration-500 ${
                          batterySizingStatus === "optimal" 
                            ? "bg-emerald-500" 
                            : batterySizingStatus === "over" 
                              ? "bg-blue-500" 
                              : "bg-amber-500"
                        }`}
                        style={{ width: `${Math.min(targetPct, 100)}%` }}
                      />
                      {targetPct > 100 && (
                        <div className="h-full bg-indigo-500 transition-all duration-500" style={{ width: `${Math.min(targetPct - 100, 100)}%` }} />
                      )}
                    </div>
                    <div className="flex justify-between text-[11px] text-muted-foreground font-medium">
                      <span>Usable Selected: <span className="text-foreground">{selectedBatCapacity.toFixed(1)} kWh</span></span>
                      <span>Target Requirement: <span className="text-foreground">{targetBatCapacity.toFixed(1)} kWh</span> ({Math.round(targetPct)}%)</span>
                    </div>
                  </div>
                  
                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    {batterySizingStatus === "optimal" && "✅ This configuration provides sufficient energy storage to cover the selected days of backup."}
                    {batterySizingStatus === "over" && "✨ This configuration provides excess storage capacity, ensuring extended backup times during prolonged blackouts."}
                    {batterySizingStatus === "under" && "⚠️ This configuration is below recommended storage capacity. Consider increasing battery count or choosing a larger battery model."}
                  </p>
                </div>
              )}

              <div className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-2 sm:col-span-1">
                  <Label className="text-xs font-semibold text-muted-foreground">Battery model</Label>
                  <Select
                    value={batId}
                    onValueChange={(v) => setValue(`${prefix}.batteryProductId`, v, { shouldValidate: true })}
                  >
                    <SelectTrigger className="h-10 text-sm bg-background border-input hover:border-accent-foreground/20 focus:ring-emerald-500">
                      <SelectValue placeholder="Select battery" />
                    </SelectTrigger>
                    <SelectContent>
                      {sortedBatteries.length === 0 && (
                        <SelectItem value="_none" disabled className="text-xs text-muted-foreground">
                          No compatible batteries for selected inverter
                        </SelectItem>
                      )}
                      {sortedBatteries.map((b: BatteryProduct, bIdx) => (
                        <SelectItem key={b.id} value={b.id} className="text-xs font-medium">
                          {bIdx === 0 ? "⭐ " : ""}{b.brand} {b.usable_energy} kWh ({b.model})
                          <span className="ml-1 text-muted-foreground font-normal">
                            ({b.battery_operating_voltage})
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {errors.options?.[idx]?.batteryProductId && (
                    <p className="text-xs font-medium text-destructive mt-1">{errors.options[idx].batteryProductId.message}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label className="text-xs font-semibold text-muted-foreground">Qty</Label>
                  <Input
                    {...register(`${prefix}.batteryQty`, {
                      validate: (val: string) => {
                        const currentSysType = watch(`${prefix}.sysType`) || "ongrid";
                        if (currentSysType !== "ongrid") {
                          if (!val) return "Battery quantity is required";
                          if (parseInt(val) < 1) return "Must be at least 1";
                        }
                        return true;
                      }
                    }) }
                    type="number"
                    min={1}
                    className="h-10 text-sm bg-background border-input focus-visible:ring-emerald-500"
                    value={watch(`${prefix}.batteryQty`) || ""}
                    onChange={(e) => {
                      setValue(`${prefix}.batteryQty`, e.target.value, { shouldValidate: true });
                    }}
                  />
                  {errors.options?.[idx]?.batteryQty && (
                    <p className="text-xs font-medium text-destructive mt-1">{errors.options[idx].batteryQty.message}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label className="text-xs font-semibold text-muted-foreground">Total Usable Energy</Label>
                  <div className="flex h-10 items-center rounded-md border bg-muted/50 px-3 text-sm font-semibold text-foreground">
                    {bat && batQty ? `${(bat.usable_energy * parseInt(batQty)).toFixed(1)} kWh` : "—"}
                  </div>
                </div>
              </div>

              {recentBats.length > 0 && (
                <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px]">
                  <span className="flex items-center gap-1 text-muted-foreground font-medium">
                    <History className="h-3 w-3" /> Recent:
                  </span>
                  {recentBats.map((id: string) => {
                    const item = products.batteries.find((b: BatteryProduct) => b.id === id);
                    if (!item) return null;
                    return (
                      <Badge
                        key={id}
                        variant="outline"
                        className="cursor-pointer border-emerald-500/20 bg-emerald-500/5 text-emerald-700 hover:bg-emerald-500/10 dark:text-emerald-300 transition-all active:scale-95 px-2 py-0.5 text-[10px] rounded-md font-medium"
                        onClick={() => setValue(`${prefix}.batteryProductId`, id, { shouldValidate: true })}
                      >
                        {item.brand} {item.usable_energy} kWh
                      </Badge>
                    );
                  })}
                </div>
              )}

              {sortedBatteries.length > 0 && suggestedBatQty !== null && suggestedBatQty > 0 && (
                <div className="mt-3 flex items-center justify-between rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3.5 dark:border-emerald-500/30">
                  <div className="flex items-start gap-2.5">
                    <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500 animate-pulse" />
                    <div className="space-y-0.5">
                      <p className="text-xs font-semibold text-emerald-900 dark:text-emerald-200">
                        Smart AI Recommendation
                      </p>
                      <p className="text-[11px] text-muted-foreground leading-snug">
                        Suggested backup sizing: <span className="font-semibold text-foreground">{suggestedBatQty} × {sortedBatteries[0].brand} ({sortedBatteries[0].usable_energy} kWh)</span>
                      </p>
                    </div>
                  </div>
                  {(batId !== sortedBatteries[0].id || parseInt(batQty) !== suggestedBatQty) && (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-7 text-xs font-semibold text-emerald-600 hover:bg-emerald-500/10 hover:text-emerald-700 dark:text-emerald-400 dark:hover:bg-emerald-500/20 shadow-none"
                      onClick={() => {
                        setValue(`${prefix}.batteryProductId`, sortedBatteries[0].id, { shouldValidate: true });
                        setValue(`${prefix}.batteryQty`, String(suggestedBatQty), { shouldValidate: true });
                      }}
                    >
                      Apply
                    </Button>
                  )}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}
