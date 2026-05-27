"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { collection, addDoc, serverTimestamp, query, where, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Loader2, Search, ArrowLeft, Save, MapPin, X,
  Sun, Wrench, CheckCircle2, ChevronRight, Package,
  Plus, Trash2, Receipt,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { OfficeLocation } from "@/types";
import { cn } from "@/lib/utils";

// ── Helpers ───────────────────────────────────────────────────────────────────
function haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

const fmtRs = (n: number) => `Rs. ${n.toLocaleString()}`;

const SERVICE_TYPES = [
  { value: "maintenance",  label: "Maintenance",  icon: "🔧" },
  { value: "troubleshoot", label: "Troubleshoot", icon: "🩺" },
  { value: "expansion",    label: "Expansion",    icon: "➕" },
  { value: "repair",       label: "Repair",       icon: "🛠️" },
  { value: "inspection",   label: "Inspection",   icon: "🔍" },
  { value: "emergency",    label: "Emergency",    icon: "⚡" },
  { value: "upgrade",      label: "Upgrade",      icon: "⬆️" },
  { value: "other",        label: "Other",        icon: "📋" },
];

// ── Types ─────────────────────────────────────────────────────────────────────
interface MaterialLine  { id: string; name: string; qty: number; unitPrice: number; }
interface PanelEntry    { id: string; mode: "catalog"|"text"; productId: string; text: string; qty: string; }
interface InverterEntry { id: string; mode: "catalog"|"text"; productId: string; text: string; qty: string; serialNos: string; }
interface BatteryEntry  { id: string; mode: "catalog"|"text"; productId: string; text: string; qty: string; serialNos: string; }

const mkPanel    = (): PanelEntry    => ({ id: crypto.randomUUID(), mode: "catalog", productId: "", text: "", qty: "" });
const mkInverter = (): InverterEntry => ({ id: crypto.randomUUID(), mode: "catalog", productId: "", text: "", qty: "1", serialNos: "" });
const mkBattery  = (): BatteryEntry  => ({ id: crypto.randomUUID(), mode: "catalog", productId: "", text: "", qty: "1", serialNos: "" });


// ── Inline product search (no label header) used inside line rows ─────────────
function ProductPicker({
  products, selectedId, mode, textValue,
  formatLabel, formatMeta,
  onSelect, onClear, onTextChange, onModeChange,
  placeholder = "Search…", textPlaceholder = "Type brand & model",
}: {
  products: any[]; selectedId: string; mode: "catalog"|"text"; textValue: string;
  formatLabel: (p:any) => string; formatMeta: (p:any) => string;
  onSelect: (id:string, p:any) => void; onClear: () => void;
  onTextChange: (v:string) => void; onModeChange: (m:"catalog"|"text") => void;
  placeholder?: string; textPlaceholder?: string;
}) {
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const h = (e: MouseEvent) => { if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  const filtered = products.filter(p => `${p.brand} ${p.model}`.toLowerCase().includes(search.toLowerCase())).slice(0, 12);
  const selected = products.find(p => p.id === selectedId);

  if (mode === "text") {
    return (
      <div className="flex items-center gap-1.5 flex-1 min-w-0">
        <Input value={textValue} onChange={e => onTextChange(e.target.value)}
          placeholder={textPlaceholder}
          className="h-8 text-xs rounded-lg flex-1 min-w-0 border-border/60 bg-slate-50 dark:bg-slate-900/50 focus:bg-white" />
        <button type="button" onClick={() => { onModeChange("catalog"); onTextChange(""); }}
          className="shrink-0 text-[10px] text-primary hover:underline font-semibold whitespace-nowrap flex items-center gap-0.5">
          <Package className="h-2.5 w-2.5" /> Catalog
        </button>
      </div>
    );
  }

  return (
    <div className="flex-1 min-w-0 relative" ref={wrapRef}>
      {selected ? (
        <div className="flex items-center gap-1.5 h-8 px-2 rounded-lg border bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-900">
          <span className="flex-1 text-xs font-semibold text-emerald-800 dark:text-emerald-300 truncate">{formatLabel(selected)}</span>
          <span className="text-[10px] text-emerald-600 shrink-0">{formatMeta(selected)}</span>
          <button type="button" onClick={onClear} className="text-muted-foreground hover:text-destructive shrink-0">
            <X className="h-3 w-3" />
          </button>
        </div>
      ) : (
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground pointer-events-none" />
          <Input className="pl-7 h-8 text-xs rounded-lg border-border/60 bg-slate-50 dark:bg-slate-900/50 focus:bg-white"
            placeholder={placeholder} value={search}
            onChange={e => { setSearch(e.target.value); setOpen(true); }}
            onFocus={() => setOpen(true)} autoComplete="off" />
          {open && (
            <div className="absolute z-50 top-full mt-1 w-full rounded-xl border bg-background shadow-xl overflow-hidden max-h-52 overflow-y-auto">
              {filtered.length > 0 ? filtered.map(p => (
                <button key={p.id} type="button"
                  className="w-full flex items-center justify-between px-3 py-2 text-xs hover:bg-muted/60 border-b last:border-b-0 text-left"
                  onMouseDown={() => { onSelect(p.id, p); setSearch(""); setOpen(false); }}>
                  <span className="font-medium truncate">{formatLabel(p)}</span>
                  <span className="text-muted-foreground shrink-0 ml-2">{formatMeta(p)}</span>
                </button>
              )) : (
                <div className="px-3 py-3 text-xs text-muted-foreground text-center">No results</div>
              )}
              <button type="button"
                className="w-full px-3 py-2 text-[10px] text-primary font-semibold hover:bg-primary/5 border-t text-center"
                onMouseDown={() => { onModeChange("text"); setOpen(false); }}>
                Not in list? Enter manually
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Panel line row ─────────────────────────────────────────────────────────────
function PanelLineRow({ line, panels, idx, total, onChange, onRemove }: {
  line: PanelEntry; panels: any[]; idx: number; total: number;
  onChange: (patch: Partial<PanelEntry>) => void; onRemove: () => void;
}) {
  const prod = panels.find(p => p.id === line.productId);
  const watts = prod ? (prod.max_panel_output_power || prod.max_panel_output || 0) : 0;
  const lineKwp = watts && line.qty ? Math.round(watts * (parseInt(line.qty)||0) / 100) / 10 : 0;
  return (
    <div className="rounded-xl border border-border/50 bg-slate-50/50 dark:bg-slate-900/30 overflow-hidden">
      <div className="flex items-center gap-2 px-2.5 py-2">
        <span className="text-[10px] font-black text-muted-foreground/50 w-4 shrink-0">{idx+1}</span>
        <ProductPicker
          products={panels} selectedId={line.productId} mode={line.mode} textValue={line.text}
          formatLabel={p => `${p.brand} ${p.model}`}
          formatMeta={p => `${p.max_panel_output_power || p.max_panel_output || "?"}Wp`}
          onSelect={(id) => onChange({ productId: id, mode: "catalog" })}
          onClear={() => onChange({ productId: "", mode: "catalog" })}
          onTextChange={v => onChange({ text: v })}
          onModeChange={m => onChange({ mode: m, productId: "", text: "" })}
          placeholder="Search panels…" textPlaceholder="e.g. Jinko 540W"
        />
        <div className="flex items-center gap-1 shrink-0">
          <span className="text-[10px] text-muted-foreground font-semibold">×</span>
          <Input value={line.qty} onChange={e => onChange({ qty: e.target.value })}
            type="number" min={1} placeholder="Qty"
            className="h-8 w-16 text-xs text-center rounded-lg border-border/60 bg-white dark:bg-card px-1" />
        </div>
        {total > 1 && (
          <button type="button" onClick={onRemove}
            className="h-7 w-7 flex items-center justify-center rounded-lg text-muted-foreground hover:text-destructive hover:bg-red-50 dark:hover:bg-red-950/20 shrink-0">
            <Trash2 className="h-3 w-3" />
          </button>
        )}
      </div>
      {lineKwp > 0 && (
        <div className="px-2.5 pb-1.5 flex items-center gap-1">
          <span className="text-[10px] text-emerald-600 font-bold">{parseInt(line.qty)||0} panels · {lineKwp} kWp</span>
        </div>
      )}
    </div>
  );
}

// ── Inverter line row ──────────────────────────────────────────────────────────
function InverterLineRow({ line, inverters, idx, total, onChange, onRemove }: {
  line: InverterEntry; inverters: any[]; idx: number; total: number;
  onChange: (patch: Partial<InverterEntry>) => void; onRemove: () => void;
}) {
  const prod = inverters.find(p => p.id === line.productId);
  const kw   = prod ? Math.round((prod.input_rated_power||0) / 100) / 10 : 0;
  return (
    <div className="rounded-xl border border-border/50 bg-slate-50/50 dark:bg-slate-900/30 overflow-hidden">
      <div className="flex items-center gap-2 px-2.5 py-2">
        <span className="text-[10px] font-black text-muted-foreground/50 w-4 shrink-0">{idx+1}</span>
        <ProductPicker
          products={inverters} selectedId={line.productId} mode={line.mode} textValue={line.text}
          formatLabel={p => `${p.brand} ${p.model}`}
          formatMeta={p => `${Math.round((p.input_rated_power||0)/100)/10} kW`}
          onSelect={(id) => onChange({ productId: id, mode: "catalog" })}
          onClear={() => onChange({ productId: "", mode: "catalog" })}
          onTextChange={v => onChange({ text: v })}
          onModeChange={m => onChange({ mode: m, productId: "", text: "" })}
          placeholder="Search inverters…" textPlaceholder="e.g. Goodwe GW5048D-ES"
        />
        <div className="flex items-center gap-1 shrink-0">
          <span className="text-[10px] text-muted-foreground font-semibold">×</span>
          <Input value={line.qty} onChange={e => onChange({ qty: e.target.value })}
            type="number" min={1} placeholder="Qty"
            className="h-8 w-14 text-xs text-center rounded-lg border-border/60 bg-white dark:bg-card px-1" />
        </div>
        {total > 1 && (
          <button type="button" onClick={onRemove}
            className="h-7 w-7 flex items-center justify-center rounded-lg text-muted-foreground hover:text-destructive hover:bg-red-50 dark:hover:bg-red-950/20 shrink-0">
            <Trash2 className="h-3 w-3" />
          </button>
        )}
      </div>
      {kw > 0 && parseInt(line.qty) > 1 && (
        <div className="px-2.5 pb-1 flex items-center gap-1">
          <span className="text-[10px] text-blue-600 font-bold">{parseInt(line.qty)}× {kw}kW = {Math.round(parseInt(line.qty) * kw * 10)/10}kW total</span>
        </div>
      )}
      <div className="px-2.5 pb-2">
        <Input value={line.serialNos} onChange={e => onChange({ serialNos: e.target.value })}
          placeholder="Serial No(s) — optional, e.g. SN12345 / SN67890"
          className="h-7 text-[11px] font-mono rounded-lg border-border/50 bg-white dark:bg-card" />
      </div>
    </div>
  );
}

// ── Battery line row ───────────────────────────────────────────────────────────
function BatteryLineRow({ line, batteries, idx, total, onChange, onRemove }: {
  line: BatteryEntry; batteries: any[]; idx: number; total: number;
  onChange: (patch: Partial<BatteryEntry>) => void; onRemove: () => void;
}) {
  const prod  = batteries.find(p => p.id === line.productId);
  const kwh   = prod ? (prod.usable_energy || 0) : 0;
  return (
    <div className="rounded-xl border border-border/50 bg-slate-50/50 dark:bg-slate-900/30 overflow-hidden">
      <div className="flex items-center gap-2 px-2.5 py-2">
        <span className="text-[10px] font-black text-muted-foreground/50 w-4 shrink-0">{idx+1}</span>
        <ProductPicker
          products={batteries} selectedId={line.productId} mode={line.mode} textValue={line.text}
          formatLabel={p => `${p.brand} ${p.model}`}
          formatMeta={p => `${p.usable_energy} kWh`}
          onSelect={(id) => onChange({ productId: id, mode: "catalog" })}
          onClear={() => onChange({ productId: "", mode: "catalog" })}
          onTextChange={v => onChange({ text: v })}
          onModeChange={m => onChange({ mode: m, productId: "", text: "" })}
          placeholder="Search batteries…" textPlaceholder="e.g. Pylontech US3000C"
        />
        <div className="flex items-center gap-1 shrink-0">
          <span className="text-[10px] text-muted-foreground font-semibold">×</span>
          <Input value={line.qty} onChange={e => onChange({ qty: e.target.value })}
            type="number" min={1} placeholder="Qty"
            className="h-8 w-14 text-xs text-center rounded-lg border-border/60 bg-white dark:bg-card px-1" />
        </div>
        <button type="button" onClick={onRemove}
          className="h-7 w-7 flex items-center justify-center rounded-lg text-muted-foreground hover:text-destructive hover:bg-red-50 dark:hover:bg-red-950/20 shrink-0">
          <Trash2 className="h-3 w-3" />
        </button>
      </div>
      {kwh > 0 && parseInt(line.qty) > 1 && (
        <div className="px-2.5 pb-1 flex items-center gap-1">
          <span className="text-[10px] text-violet-600 font-bold">{parseInt(line.qty)}× {kwh}kWh = {Math.round(parseInt(line.qty) * kwh * 10)/10}kWh total</span>
        </div>
      )}
      <div className="px-2.5 pb-2">
        <Input value={line.serialNos} onChange={e => onChange({ serialNos: e.target.value })}
          placeholder="Serial No(s) — optional, e.g. BAT-001 / BAT-002"
          className="h-7 text-[11px] font-mono rounded-lg border-border/50 bg-white dark:bg-card" />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
export default function NewServicePage() {
  const router       = useRouter();
  const searchParams = useSearchParams();
  const { user }     = useAuth();
  const { toast }    = useToast();
  const dropdownRef  = useRef<HTMLDivElement>(null);

  // ── Settings ──────────────────────────────────────────────────────────────
  const [ratePerKm, setRatePerKm] = useState(300);
  const [offices, setOffices] = useState<OfficeLocation[]>([
    { id: "matara",  name: "Charlie Mount Industrial Zone",  lat: 5.996394, lng: 80.461759 },
    { id: "colombo", name: "Colombo Office", lat: 6.864488, lng: 80.009497 },
  ]);

  // ── Products ──────────────────────────────────────────────────────────────
  const [panels,    setPanels]    = useState<any[]>([]);
  const [inverters, setInverters] = useState<any[]>([]);
  const [batteries, setBatteries] = useState<any[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(false);

  // ── Search ────────────────────────────────────────────────────────────────
  const [legacyProjects,  setLegacyProjects]  = useState<any[]>([]);
  const [firestoreProjects, setFirestoreProjects] = useState<any[]>([]);
  const [searchText,      setSearchText]      = useState("");
  const [searchResults,   setSearchResults]   = useState<any[]>([]);
  const [showDropdown,    setShowDropdown]    = useState(false);
  const [fbSearching,     setFbSearching]     = useState(false);
  const [selectedProject, setSelectedProject] = useState<any>(null);

  // ── Service details ───────────────────────────────────────────────────────
  const [projectNo,          setProjectNo]          = useState("");
  const [serviceType,        setServiceType]        = useState("maintenance");
  const [scheduledDate,      setScheduledDate]      = useState(new Date().toISOString().split("T")[0]);
  const [serviceRound,       setServiceRound]       = useState("");
  const [roundAutoDetected,  setRoundAutoDetected]  = useState(false);
  const [description,        setDescription]        = useState("");
  const [internalNotes,      setInternalNotes]      = useState("");
  const [serviceAnalysis,    setServiceAnalysis]    = useState<{
    loading: boolean; dbCount: number; dbFreeCount: number; dbPaidCount: number;
    legacyDbCount: number; csvFound: boolean; totalCount: number;
    freeUsed: number; isNextFree: boolean;
  }>({ loading: false, dbCount: 0, dbFreeCount: 0, dbPaidCount: 0, legacyDbCount: 0, csvFound: false, totalCount: 0, freeUsed: 0, isNextFree: true });

  // ── System: panels / inverters / batteries (multi-line) ──────────────────
  const [panelLines,    setPanelLines]    = useState<PanelEntry[]>(() => [mkPanel()]);
  const [inverterLines, setInverterLines] = useState<InverterEntry[]>(() => [mkInverter()]);
  const [batteryLines,  setBatteryLines]  = useState<BatteryEntry[]>([]);

  // ── System type + capacity ────────────────────────────────────────────────
  const [systemType, setSystemType] = useState("ongrid");
  const [capacity,   setCapacity]   = useState("");  // editable, auto-computed from catalog lines

  // ── Customer ──────────────────────────────────────────────────────────────
  const [customerName,    setCustomerName]    = useState("");
  const [customerPhone,   setCustomerPhone]   = useState("");
  const [customerEmail,   setCustomerEmail]   = useState("");
  const [customerAddress, setCustomerAddress] = useState("");

  // ── Location ──────────────────────────────────────────────────────────────
  const [customerLat,     setCustomerLat]     = useState("");
  const [customerLng,     setCustomerLng]     = useState("");
  const [selectedOfficeId,setSelectedOfficeId]= useState("");
  const [distanceKm,      setDistanceKm]      = useState(0);
  const [officeAutoSelected, setOfficeAutoSelected] = useState(false);

  // ── Costs ─────────────────────────────────────────────────────────────────
  const [labourCost,        setLabourCost]        = useState(0);
  const [labourOverridden,  setLabourOverridden]  = useState(false);
  const [travelOverridden,  setTravelOverridden]  = useState(false);
  const [travelOverride,    setTravelOverride]    = useState(0);
  const [totalOverridden,   setTotalOverridden]   = useState(false);
  const [totalOverride,     setTotalOverride]     = useState(0);
  const [materials,         setMaterials]         = useState<MaterialLine[]>([]);
  const [isFreeService,     setIsFreeService]     = useState(false);
  const [saving,            setSaving]            = useState(false);
  const [savedService,      setSavedService]      = useState<{ serviceId: string; invoiceId: string; invoiceNo: string } | null>(null);

  // ── Service pricing rules (from settings) ────────────────────────────────
  // Defaults must match services/page.tsx defaults so unset localStorage gives correct results
  const [svcThreshold1, setSvcThreshold1] = useState(2);
  const [svcRate1,      setSvcRate1]      = useState(5000);
  const [svcThreshold2, setSvcThreshold2] = useState(20);
  const [svcRate2,      setSvcRate2]      = useState(1000);
  const [svcRateAbove,  setSvcRateAbove]  = useState(500);

  // ── Auto-compute capacity from catalog panel lines ────────────────────────
  useEffect(() => {
    let totalW = 0;
    for (const line of panelLines) {
      if (line.mode !== "catalog" || !line.productId) continue;
      const qty = parseInt(line.qty) || 0;
      if (!qty) continue;
      const prod = panels.find(p => p.id === line.productId);
      const watts = prod ? (prod.max_panel_output_power || prod.max_panel_output || 0) : 0;
      totalW += qty * watts;
    }
    if (totalW > 0) setCapacity(String(Math.round(totalW / 100) / 10));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [panelLines, panels]);

  // ── Auto-compute labour from capacity + pricing rules (mirrors services page formula) ──
  useEffect(() => {
    if (labourOverridden) return;
    if (serviceType !== "maintenance") { setLabourCost(0); return; }
    const kw = parseFloat(capacity) || 0;
    if (!kw) { setLabourCost(0); return; }
    // rate1 = flat for ≤T1 (e.g. Rs.5000 for ≤2kW), then per-kW above
    let cost: number;
    if (kw <= svcThreshold1)      cost = svcRate1;
    else if (kw <= svcThreshold2) cost = svcRate1 + (kw - svcThreshold1) * svcRate2;
    else                           cost = svcRate1 + (svcThreshold2 - svcThreshold1) * svcRate2 + (kw - svcThreshold2) * svcRateAbove;
    setLabourCost(Math.round(cost));
  }, [capacity, svcThreshold1, svcRate1, svcThreshold2, svcRate2, svcRateAbove, labourOverridden, serviceType]);

  // ── Auto-detect service round from history when project is chosen ─────────
  useEffect(() => {
    if (!projectNo.trim()) {
      setRoundAutoDetected(false);
      setServiceAnalysis({ loading: false, dbCount: 0, dbFreeCount: 0, dbPaidCount: 0, legacyDbCount: 0, csvFound: false, totalCount: 0, freeUsed: 0, isNextFree: true });
      return;
    }
    setServiceAnalysis(prev => ({ ...prev, loading: true }));
    Promise.all([
      getDocs(query(collection(db, "services"), where("projectNo", "==", projectNo.trim()))),
      getDocs(query(collection(db, "projects"), where("projectNo", "==", projectNo.trim())))
    ]).then(([svcSnap, projSnap]) => {
      const dbServices = svcSnap.docs.map(d => d.data());
      const dbCount = dbServices.length;
      let freeCount = dbServices.filter(s => s.isFreeService || s.serviceNo?.endsWith("/F")).length;
      let paidCount = dbServices.filter(s => !s.isFreeService && !s.serviceNo?.endsWith("/F")).length;
      let legacyDbCount = 0;

      if (!projSnap.empty) {
        const legacyProj = projSnap.docs[0].data();
        if (legacyProj.serviceRecords) {
          legacyDbCount = legacyProj.serviceRecords.length;
          legacyProj.serviceRecords.forEach((r: any) => {
            const text = (r.type || r.remarks || "").toLowerCase();
            if (text.includes("free") || text.includes("warranty")) freeCount++;
            else if (text.includes("paid")) paidCount++;
            else if (freeCount < 3) freeCount++;
            else paidCount++;
          });
        }
      }

      // Check CSV data for this site
      const pNoLower = projectNo.trim().toLowerCase();
      const csvRecord = legacyProjects.find((p: any) =>
        String(p.projectNo || "").toLowerCase() === pNoLower ||
        String(p.siteNo    || "").toLowerCase() === pNoLower
      );
      const csvFound = !!csvRecord;

      const totalCount = dbCount + legacyDbCount;
      const freeUsed   = Math.min(freeCount, 3);
      const freeLabels = ["1st Free", "2nd Free", "3rd Free"];
      const detected   = freeCount < 3 ? freeLabels[freeCount] : `Paid ${paidCount + 1}`;

      setServiceAnalysis({ loading: false, dbCount, dbFreeCount: freeCount, dbPaidCount: paidCount, legacyDbCount, csvFound, totalCount, freeUsed, isNextFree: freeCount < 3 });
      setServiceRound(detected);
      setIsFreeService(freeCount < 3);
      setRoundAutoDetected(true);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectNo, legacyProjects]);

  // ── Auto-set systemType from battery lines ───────────────────────────────
  useEffect(() => {
    const hasBattery = batteryLines.some(b => b.mode === "catalog" ? !!b.productId : !!b.text.trim());
    if (hasBattery && systemType === "ongrid") setSystemType("hybrid");
    if (!hasBattery && systemType === "hybrid") setSystemType("ongrid");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [batteryLines]);

  // ── Mount: load settings + products + legacy data ─────────────────────────
  useEffect(() => {
    const savedRate = localStorage.getItem("serviceRatePerKm");
    if (savedRate) setRatePerKm(Number(savedRate));

    const t1 = localStorage.getItem("serviceThreshold1"); if (t1) setSvcThreshold1(Number(t1));
    const r1 = localStorage.getItem("serviceRate1");      if (r1) setSvcRate1(Number(r1));
    const t2 = localStorage.getItem("serviceThreshold2"); if (t2) setSvcThreshold2(Number(t2));
    const r2 = localStorage.getItem("serviceRate2");      if (r2) setSvcRate2(Number(r2));
    const rA = localStorage.getItem("serviceRateAbove");  if (rA) setSvcRateAbove(Number(rA));

    const savedOffices = localStorage.getItem("serviceOffices");
    if (savedOffices) {
      try {
        let parsed = JSON.parse(savedOffices);
        if (Array.isArray(parsed) && parsed.length > 0) {
          let migrated = false;
          parsed = parsed.map(o => {
            if (o.id === "matara" && (o.name !== "Charlie Mount Industrial Zone" || o.lat !== 5.996394 || o.lng !== 80.461759)) {
              migrated = true;
              return { ...o, name: "Charlie Mount Industrial Zone", lat: 5.996394, lng: 80.461759 };
            }
            if (o.id === "colombo" && (o.lat !== 6.864488 || o.lng !== 80.009497)) {
              migrated = true;
              return { ...o, name: "Colombo Office", lat: 6.864488, lng: 80.009497 };
            }
            return o;
          });
          if (migrated) {
            localStorage.setItem("serviceOffices", JSON.stringify(parsed));
          }
          setOffices(parsed);
          setSelectedOfficeId(parsed[0].id);
        }
      } catch {}
    } else {
      setSelectedOfficeId("matara");
    }

    // Load products
    setLoadingProducts(true);
    getDocs(query(collection(db, "products"), where("active", "==", true)))
      .then(snap => {
        const all = snap.docs.map(d => ({ ...d.data(), id: d.id })) as any[];
        setPanels(   all.filter(p => p.type === "panel"));
        setInverters(all.filter(p => p.type === "inverter"));
        setBatteries(all.filter(p => p.type === "battery"));
      })
      .catch(() => {})
      .finally(() => setLoadingProducts(false));

    // Load legacy projects
    fetch("/api/projects/legacy")
      .then(r => r.json())
      .then(data => { if (Array.isArray(data)) setLegacyProjects(data); })
      .catch(() => {});

    // Load firestore projects
    getDocs(collection(db, "projects"))
      .then(snap => {
        const list = snap.docs.map(d => {
          const data = d.data();
          return {
            ...data,
            id: d.id,
            projectNo: data.siteNo || d.id.slice(0, 8),
            customerName: data.customer?.name || "",
            contactNumber: data.customer?.phone || "",
            emailAddress: data.customer?.email || "",
            address: data.customer?.address || "",
            solarPanelCapacity: data.solarCapacity || data.inverterCapacity || 0,
            noOfPanels: data.noOfPanels || "",
            inverterBrand: data.inverterBrand || "",
            inverterModelNo: data.inverterModel || "",
            solarPanelModel: data.panelModel || "",
            battery: data.battery || "",
            systemType: data.systemType || "ongrid",
            latitude: data.latitude || null,
            longitude: data.longitude || null,
            _source: "firestore",
          };
        });
        setFirestoreProjects(list);
      })
      .catch(() => {});

    const pNo = searchParams.get("projectNo");
    if (pNo) setSearchText(pNo);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Auto-match URL project once data loads ─────────────────────────────────
  useEffect(() => {
    const pNo = searchParams.get("projectNo");
    if (!pNo) return;

    if (legacyProjects.length) {
      const match = legacyProjects.find(p => String(p.projectNo).toLowerCase() === pNo.toLowerCase());
      if (match) {
        selectProject({ ...match, _source: "legacy" });
        return;
      }
    }

    if (firestoreProjects.length) {
      const match = firestoreProjects.find(p => String(p.projectNo).toLowerCase() === pNo.toLowerCase());
      if (match) {
        selectProject({ ...match, _source: "firestore" });
        return;
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [legacyProjects, firestoreProjects]);

  // ── Debounced search ──────────────────────────────────────────────────────
  useEffect(() => {
    if (selectedProject) return;
    if (!searchText.trim()) { setSearchResults([]); setShowDropdown(false); return; }

    const timer = setTimeout(async () => {
      const q       = searchText.toLowerCase().trim();
      const qDigits = q.replace(/\D/g, "");

      const firestoreMatches = firestoreProjects
        .filter(p =>
          String(p.projectNo    || "").toLowerCase().includes(q) ||
          String(p.customerName || "").toLowerCase().includes(q) ||
          (qDigits.length >= 6 && String(p.contactNumber || "").replace(/\D/g, "").includes(qDigits)) ||
          String(p.address      || "").toLowerCase().includes(q)
        )
        .map(p => ({ ...p, _source: "firestore" }));

      const legacyMatches = legacyProjects
        .filter(p => !p._isFallbackId)
        .filter(p =>
          String(p.projectNo    || "").toLowerCase().includes(q) ||
          String(p.customerName || "").toLowerCase().includes(q) ||
          (qDigits.length >= 6 && String(p.contactNumber || "").replace(/\D/g, "").includes(qDigits)) ||
          String(p.address      || "").toLowerCase().includes(q)
        )
        .map(p => ({ ...p, _source: "legacy" }));

      const localMatches = [...firestoreMatches, ...legacyMatches];
      setSearchResults(localMatches.slice(0, 9));
      setShowDropdown(true);

      if (/^(prop|p_inv|qtn)/i.test(q) || /^\d{5,}/.test(q)) {
        setFbSearching(true);
        try {
          const raw = searchText.trim();
          const [s1, s2] = await Promise.all([
            getDocs(query(collection(db, "proposals"), where("propNo", "==", raw))),
            getDocs(query(collection(db, "proposals"), where("qtnNo",  "==", raw))),
          ]);
          const seen = new Set<string>();
          const fbRows: any[] = [];
          for (const d of [...s1.docs, ...s2.docs]) {
            if (seen.has(d.id)) continue; seen.add(d.id);
            const data = d.data();
            const opt  = data.options?.[0];
            const panW = Number(opt?.panel?.ratingLabel?.replace(/\D/g, "") || 0);
            const panQ = Number(opt?.panel?.qty || 0);
            fbRows.push({
              projectNo: data.propNo || data.qtnNo || d.id,
              customerName: data.customer?.name  || "",
              contactNumber: data.customer?.phone || "",
              emailAddress:  data.customer?.email || "",
              address:       data.customer?.address || "",
              solarPanelCapacity: panW && panQ ? Math.round((panW * panQ) / 100) / 10 : 0,
              noOfPanels:    panQ || "",
              inverterBrand: opt?.inverter?.brand || "",
              inverterModelNo: opt?.inverter?.model || "",
              battery:       opt?.battery ? `${opt.battery.brand} ${opt.battery.model}`.trim() : "",
              systemType:    data.sysType || "ongrid",
              _source: "firebase",
            });
          }
          setSearchResults([...fbRows, ...localMatches].slice(0, 9));
          if (fbRows.length) setShowDropdown(true);
        } catch {} finally { setFbSearching(false); }
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [searchText, legacyProjects, firestoreProjects, selectedProject]);

  // ── Close project dropdown on outside click ───────────────────────────────
  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node))
        setShowDropdown(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  // ── Auto-select nearest office + distance when GPS changes ────────────────
  useEffect(() => {
    const lat = parseFloat(customerLat), lng = parseFloat(customerLng);
    if (isNaN(lat) || isNaN(lng) || !offices.length) {
      if (!customerLat || !customerLng) setDistanceKm(0);
      return;
    }
    let nearId = offices[0].id, nearDist = haversine(offices[0].lat, offices[0].lng, lat, lng);
    for (const o of offices.slice(1)) {
      const d = haversine(o.lat, o.lng, lat, lng);
      if (d < nearDist) { nearDist = d; nearId = o.id; }
    }
    setSelectedOfficeId(nearId);
    setOfficeAutoSelected(true);
    setDistanceKm(Math.round(nearDist * 10) / 10);
  }, [customerLat, customerLng, offices]);

  useEffect(() => {
    if (officeAutoSelected) { setOfficeAutoSelected(false); return; }
    const lat = parseFloat(customerLat), lng = parseFloat(customerLng);
    if (isNaN(lat) || isNaN(lng) || !selectedOfficeId) return;
    const office = offices.find(o => o.id === selectedOfficeId);
    if (office) setDistanceKm(Math.round(haversine(office.lat, office.lng, lat, lng) * 10) / 10);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedOfficeId]);

  // ── Select a project ──────────────────────────────────────────────────────
  function selectProject(p: any) {
    setSelectedProject(p);
    setProjectNo(String(p.projectNo || ""));
    setSearchText(`#${p.projectNo} — ${p.customerName}`);
    setShowDropdown(false);

    setCustomerName(p.customerName || "");
    setCustomerPhone(p.contactNumber || p.phone || "");
    setCustomerEmail(p.emailAddress  || p.email || "");
    setCustomerAddress(p.address     || "");

    // System info → populate multi-line arrays from project data
    const cap = p.solarPanelCapacity || p.inverterCapacity || 0;
    setCapacity(cap ? String(cap) : "");

    // Panel line(s) — use text mode since no catalog product IDs in legacy data
    if (p.noOfPanels) {
      const wattPerPanel = cap && p.noOfPanels ? Math.round((cap * 1000) / Number(p.noOfPanels)) : 0;
      const panelStr = p.solarPanelModel || (wattPerPanel ? `${wattPerPanel}W panel` : "");
      setPanelLines([{ ...mkPanel(), mode: "text", text: panelStr, qty: String(p.noOfPanels) }]);
    } else {
      setPanelLines([mkPanel()]);
    }

    // Inverter line(s)
    const invStr = [p.inverterBrand, p.inverterModelNo].filter(Boolean).join(" ");
    setInverterLines([{ ...mkInverter(), mode: invStr ? "text" : "catalog", text: invStr }]);

    // Battery line(s)
    if (p.battery) {
      setBatteryLines([{ ...mkBattery(), mode: "text", text: p.battery }]);
    } else {
      setBatteryLines([]);
    }

    setSystemType(p.systemType || p.sysType || "ongrid");

    if (p.latitude && p.longitude) {
      setCustomerLat(String(p.latitude));
      setCustomerLng(String(p.longitude));
    }
  }

  function clearProject() {
    setSelectedProject(null); setSearchText(""); setProjectNo("");
    setCustomerName(""); setCustomerPhone(""); setCustomerEmail(""); setCustomerAddress("");
    setPanelLines([mkPanel()]); setInverterLines([mkInverter()]); setBatteryLines([]);
    setCapacity(""); setSystemType("ongrid");
    setCustomerLat(""); setCustomerLng(""); setDistanceKm(0);
    setLabourOverridden(false); setTravelOverridden(false); setTotalOverridden(false);
    setMaterials([]); setIsFreeService(false);
  }

  function addMaterial() {
    setMaterials(prev => [...prev, { id: crypto.randomUUID(), name: "", qty: 1, unitPrice: 0 }]);
  }

  function updateMaterial(id: string, field: keyof MaterialLine, value: string | number) {
    setMaterials(prev => prev.map(m => m.id === id ? { ...m, [field]: value } : m));
  }

  function removeMaterial(id: string) {
    setMaterials(prev => prev.filter(m => m.id !== id));
  }

  // ── Derived summary strings (for storage + labels) ───────────────────────
  const getProductName = (arr: any[], id: string) => { const p = arr.find(x => x.id === id); return p ? `${p.brand} ${p.model}` : ""; };
  const panelLabel = panelLines.map(l => {
    const name = l.mode === "catalog" && l.productId ? (() => { const p = panels.find(x => x.id === l.productId); return p ? `${p.brand} ${p.model} (${p.max_panel_output_power || p.max_panel_output || "?"}W)` : ""; })() : l.text;
    const q = parseInt(l.qty) || 0; return q > 1 ? `${q}× ${name}` : name;
  }).filter(Boolean).join(", ");
  const inverterLabel = inverterLines.map(l => {
    const name = l.mode === "catalog" && l.productId ? getProductName(inverters, l.productId) : l.text;
    const q = parseInt(l.qty) || 0; return q > 1 ? `${q}× ${name}` : name;
  }).filter(Boolean).join(", ");
  const batteryLabel = batteryLines.map(l => {
    const name = l.mode === "catalog" && l.productId ? getProductName(batteries, l.productId) : l.text;
    const q = parseInt(l.qty) || 0; return q > 1 ? `${q}× ${name}` : name;
  }).filter(Boolean).join(", ");
  const totalPanelCount = panelLines.reduce((s, l) => s + (parseInt(l.qty) || 0), 0);
  const inverterSerialsSummary = inverterLines.map(l => l.serialNos.trim()).filter(Boolean).join(" / ");
  const batterySerialsSummary  = batteryLines.map(l => l.serialNos.trim()).filter(Boolean).join(" / ");

  // ── Filtered inverters by system type (used per inverter-line row) ────────
  const filteredInverters = inverters.filter(inv => {
    const t = inv.inverter_type;
    if (systemType === "offgrid") return t === "offgrid" || t === "hybrid";
    return true;
  });

  // ── Costs ─────────────────────────────────────────────────────────────────
  const materialCost   = materials.reduce((sum, m) => sum + (m.qty || 0) * (m.unitPrice || 0), 0);
  const distanceCost   = travelOverridden ? travelOverride : Math.round(distanceKm * ratePerKm);
  const computedTotal  = distanceCost + labourCost + materialCost;
  const totalCost      = isFreeService ? 0 : (totalOverridden ? totalOverride : computedTotal);
  const hasCoords      = customerLat && customerLng && !isNaN(parseFloat(customerLat)) && !isNaN(parseFloat(customerLng));
  const selectedOffice = offices.find(o => o.id === selectedOfficeId);

  // ── Save ──────────────────────────────────────────────────────────────────
  async function handleSave() {
    if (!projectNo.trim()) { toast({ title: "Project number is required", variant: "destructive" }); return; }
    setSaving(true);
    try {
      // Find the highest existing sequence for this project across both legacy and new records
      const prefix = `SRV-${projectNo.trim()}/`;
      const [projSnap, byProjectNo, allSnap] = await Promise.all([
        getDocs(query(collection(db, "projects"), where("projectNo", "==", projectNo.trim()))),
        getDocs(query(collection(db, "services"), where("projectNo", "==", projectNo.trim()))),
        getDocs(collection(db, "services")),
      ]);
      const legacyServicesCount = projSnap.empty ? 0 : (projSnap.docs[0].data().serviceRecords?.length || 0);
      let maxSeq = byProjectNo.size + legacyServicesCount; // base count from projectNo field + legacy
      allSnap.forEach(d => {
        const no: string = d.data().serviceNo || "";
        if (no.startsWith(prefix)) {
          const parts = no.split("/");
          const n = parseInt(parts[1] || "0", 10);
          if (n > maxSeq) maxSeq = n;
        }
      });
      const seqNo = String(maxSeq + 1).padStart(3, "0");
      const freeOrPaid = isFreeService ? "F" : "P";
      const serviceNo = `SRV-${projectNo.trim()}/${seqNo}/${freeOrPaid}`;
      const serviceRef = await addDoc(collection(db, "services"), {
        serviceNo,
        projectNo, serviceType, scheduledDate, serviceRound, description, internalNotes,
        capacity, panelCount: String(totalPanelCount), systemType,
        // summary strings (backward-compat)
        panel: panelLabel, inverter: inverterLabel, battery: batteryLabel,
        inverterSerialNos: inverterSerialsSummary || null,
        batterySerialNos:  batterySerialsSummary  || null,
        // structured arrays (new)
        panelLines: panelLines.filter(l => l.productId || l.text.trim()).map(l => ({
          productId: l.productId || null, text: l.text, qty: parseInt(l.qty)||1, mode: l.mode,
        })),
        inverterLines: inverterLines.filter(l => l.productId || l.text.trim()).map(l => ({
          productId: l.productId || null, text: l.text, qty: parseInt(l.qty)||1, serialNos: l.serialNos||null, mode: l.mode,
        })),
        batteryLines: batteryLines.filter(l => l.productId || l.text.trim()).map(l => ({
          productId: l.productId || null, text: l.text, qty: parseInt(l.qty)||1, serialNos: l.serialNos||null, mode: l.mode,
        })),
        customer: { name: customerName, phone: customerPhone, email: customerEmail, address: customerAddress },
        location: { lat: parseFloat(customerLat) || 0, lng: parseFloat(customerLng) || 0, address: customerAddress, distanceKm, officeId: selectedOfficeId, officeName: selectedOffice?.name || "" },
        costs: { perKmRate: ratePerKm, distanceCost, labourCost, materialCost, materials, totalCost },
        isFreeService,
        status: "pending",
        createdBy: user?.uid || "",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      // Create service invoice — SINV/{projectNo}/{seq}/{F|P}
      const invoiceNo = `SINV/${projectNo.trim()}/${seqNo}/${freeOrPaid}`;
      const invoiceItems = [
        { description: `Labour — Solar System ${serviceType.charAt(0).toUpperCase() + serviceType.slice(1)} (${capacity || "?"}kWp)`, amount: labourCost },
        ...materials.filter(m => m.name.trim()).map(m => ({
          description: m.name,
          qty: m.qty,
          unitPrice: m.unitPrice,
          amount: m.qty * m.unitPrice,
        })),
        ...(distanceCost > 0 ? [{ description: "Transport", amount: distanceCost }] : []),
      ];
      const invoiceRef = await addDoc(collection(db, "serviceInvoices"), {
        invoiceNo,
        serviceId: serviceRef.id,
        serviceNo,
        projectNo,
        type: "service",
        serviceType,
        scheduledDate,
        customer: { name: customerName, phone: customerPhone, email: customerEmail, address: customerAddress },
        items: invoiceItems,
        labourCost,
        materialCost,
        travelCost: distanceCost,
        total: totalCost,
        paymentStatus: "pending_payment",
        paidAmount: 0,
        createdBy: user?.uid || "",
        createdAt: serverTimestamp(),
      });

      // Back-link invoice id to service
      const { updateDoc, doc } = await import("firebase/firestore");
      await updateDoc(doc(db, "services", serviceRef.id), { invoiceId: invoiceRef.id, invoiceNo });

      setSavedService({ serviceId: serviceRef.id, invoiceId: invoiceRef.id, invoiceNo });
      toast({ title: "Service request created", description: `Invoice ${invoiceNo} generated` });
    } catch (err: any) {
      toast({ title: "Failed to save", description: err.message, variant: "destructive" });
    } finally { setSaving(false); }
  }

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-full bg-gradient-to-br from-slate-50 via-white to-slate-50 dark:from-slate-950 dark:via-background dark:to-slate-950">
    <div className="max-w-6xl mx-auto p-4 md:p-6 space-y-6">

      {/* ── Header ── */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => router.push("/services")} className="shrink-0 rounded-xl hover:bg-white dark:hover:bg-slate-800 shadow-sm border">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
              <Wrench className="h-5 w-5 text-emerald-600" />
            </div>
            <div>
              <h1 className="text-xl font-black tracking-tight">New Service Request</h1>
              <p className="text-xs text-muted-foreground">Select a project · fill details · generate invoice</p>
            </div>
          </div>
        </div>
      </div>

      {/* ── Project Search ── */}
      <div className="relative" ref={dropdownRef}>
        <div className="rounded-2xl border bg-white dark:bg-card shadow-sm p-1">
          <div className="flex items-center gap-3 px-3 py-1">
            <div className="p-1.5 rounded-lg bg-primary/10"><Search className="h-4 w-4 text-primary" /></div>
            <span className="text-[11px] font-black uppercase tracking-widest text-muted-foreground">Project Lookup</span>
          </div>
          <div className="px-2 pb-2">
          <div className="relative">

            {selectedProject ? (
              <div className="flex items-center gap-3 p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/60">
                <div className="h-9 w-9 rounded-xl bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center shrink-0">
                  <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-black font-mono text-emerald-700 dark:text-emerald-400">#{selectedProject.projectNo}</span>
                    <span className="font-bold text-foreground">{selectedProject.customerName}</span>
                    {Number(selectedProject.solarPanelCapacity) > 0 && (
                      <span className="text-[10px] bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 px-2 py-0.5 rounded-full font-bold border border-emerald-200 dark:border-emerald-800">⚡ {selectedProject.solarPanelCapacity} kWp</span>
                    )}
                  </div>
                  {selectedProject.address && <p className="text-xs text-muted-foreground mt-0.5 truncate flex items-center gap-1"><MapPin className="h-3 w-3 shrink-0" />{selectedProject.address}</p>}
                  {!hasCoords && <p className="text-[10px] text-amber-600 mt-1 flex items-center gap-1">⚠ No GPS stored — enter coordinates below</p>}
                </div>
                <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0 rounded-lg hover:bg-red-50 hover:text-destructive" onClick={clearProject}>
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
            ) : (
              <div className="relative">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                {fbSearching && <Loader2 className="absolute right-3.5 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-primary" />}
                <Input
                  className="pl-10 h-12 text-sm rounded-xl border-0 bg-slate-50 dark:bg-slate-900 focus:ring-2 focus:ring-primary/20 focus:bg-white dark:focus:bg-slate-800"
                  placeholder="Search by site number, customer name, or phone…"
                  value={searchText}
                  onChange={e => { setSearchText(e.target.value); setShowDropdown(true); }}
                  onFocus={() => searchResults.length > 0 && setShowDropdown(true)}
                  autoComplete="off"
                />
                {searchText && !fbSearching && (
                  <button className="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground rounded-md p-0.5 hover:bg-muted"
                    onClick={() => { setSearchText(""); setSearchResults([]); setShowDropdown(false); }}>
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
                {showDropdown && searchText && (
                  <div className="absolute z-50 top-full mt-2 w-full rounded-xl border bg-background shadow-2xl overflow-hidden">
                    {searchResults.length > 0 ? searchResults.map((p, i) => (
                      <button key={i} className="w-full text-left px-4 py-3 hover:bg-primary/5 border-b last:border-b-0 transition-colors flex items-center gap-3 group"
                        onMouseDown={() => selectProject(p)}>
                        <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 text-primary text-xs font-black">{(p.customerName || "?").charAt(0)}</div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-xs font-bold text-primary bg-primary/10 px-1.5 py-0.5 rounded">#{p.projectNo}</span>
                            <span className="font-semibold text-sm truncate">{p.customerName || "—"}</span>
                          </div>
                          {(p.contactNumber || p.address) && (
                            <p className="text-xs text-muted-foreground mt-0.5 truncate">{[p.contactNumber, p.address].filter(Boolean).join(" · ")}</p>
                          )}
                        </div>
                        {(p.solarPanelCapacity || p.inverterCapacity) > 0 && (
                          <span className="text-xs font-bold text-muted-foreground shrink-0">⚡ {p.solarPanelCapacity || p.inverterCapacity} kWp</span>
                        )}
                        <ChevronRight className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 shrink-0" />
                      </button>
                    )) : (
                      <div className="p-6 text-center text-sm text-muted-foreground">No projects found for &ldquo;{searchText}&rdquo;</div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
          </div>
        </div>
      </div>

      {/* ── Main grid ── */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">

        {/* Left: service details + system info */}
        <div className="lg:col-span-3 space-y-5">

          {/* Service Details */}
          <div className="rounded-2xl border bg-white dark:bg-card shadow-sm overflow-hidden">
            <div className="flex items-center gap-2 px-5 py-3.5 border-b bg-muted/20">
              <div className="p-1.5 rounded-lg bg-orange-500/10"><Wrench className="h-3.5 w-3.5 text-orange-600" /></div>
              <span className="text-[11px] font-black uppercase tracking-widest text-muted-foreground">Service Details</span>
            </div>
            <div className="p-5 space-y-5">

              {/* Type grid */}
              <div className="space-y-2">
                <Label className="text-xs font-bold text-muted-foreground uppercase tracking-wide">Service Type</Label>
                <div className="grid grid-cols-3 gap-2">
                  {SERVICE_TYPES.map(t => (
                    <button key={t.value} type="button" onClick={() => setServiceType(t.value)}
                      className={cn("rounded-xl border-2 py-3 px-2 text-center transition-all", serviceType === t.value
                        ? "border-primary bg-primary/5 shadow-sm"
                        : "border-border/60 hover:border-primary/40 hover:bg-muted/30 text-muted-foreground")}>
                      <div className="text-2xl leading-none mb-1.5">{t.icon}</div>
                      <div className="text-[10px] font-bold">{t.label}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Scheduled Date */}
              <div className="space-y-2">
                <Label className="text-xs font-bold text-muted-foreground uppercase tracking-wide">Scheduled Date</Label>
                <Input type="date" value={scheduledDate} onChange={e => setScheduledDate(e.target.value)}
                  className="h-10 rounded-xl border-border/60 bg-slate-50 dark:bg-slate-900/50 focus:bg-white" />
              </div>

              {/* Service Round — redesigned analysis card */}
              {(() => {
                const PRESET_ROUNDS = ["1st Free","2nd Free","3rd Free","Paid 1","Paid 2","Paid 3"] as const;
                const isPreset = PRESET_ROUNDS.includes(serviceRound as any);
                const isCustom = !roundAutoDetected && serviceRound && !isPreset;
                return (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs font-bold text-muted-foreground uppercase tracking-wide">Service Round</Label>
                      {roundAutoDetected && (
                        <span className="text-[10px] font-bold text-emerald-600 flex items-center gap-1">
                          <CheckCircle2 className="h-2.5 w-2.5" /> auto-detected · editable
                        </span>
                      )}
                    </div>

                    {!projectNo.trim() ? (
                      /* No site selected */
                      <div className="flex items-center gap-2.5 px-4 py-3 rounded-xl border border-dashed border-border/60 bg-slate-50/60 dark:bg-slate-900/30">
                        <Receipt className="h-4 w-4 text-muted-foreground/40 shrink-0" />
                        <span className="text-xs text-muted-foreground">Select a site above to auto-detect service round</span>
                      </div>
                    ) : serviceAnalysis.loading ? (
                      /* Loading */
                      <div className="flex items-center gap-2.5 px-4 py-3 rounded-xl border border-border/60 bg-slate-50/60 dark:bg-slate-900/30">
                        <Loader2 className="h-4 w-4 animate-spin text-primary shrink-0" />
                        <span className="text-xs text-muted-foreground">Checking service history…</span>
                      </div>
                    ) : (
                      /* Full analysis */
                      <div className="space-y-2.5">
                        {/* Data source chips */}
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-[9px] font-black uppercase tracking-widest text-muted-foreground/50">Sources</span>
                          <span className={cn("text-[10px] font-bold px-2 py-0.5 rounded-full border leading-none",
                            serviceAnalysis.csvFound
                              ? "bg-indigo-50 dark:bg-indigo-950/30 text-indigo-700 border-indigo-200 dark:border-indigo-800"
                              : "bg-muted/60 text-muted-foreground/50 border-border/40 line-through")}>
                            CSV {serviceAnalysis.csvFound ? "✓" : "—"}
                          </span>
                          <span className={cn("text-[10px] font-bold px-2 py-0.5 rounded-full border leading-none",
                            serviceAnalysis.totalCount > 0
                              ? "bg-blue-50 dark:bg-blue-950/30 text-blue-700 border-blue-200 dark:border-blue-800"
                              : "bg-muted/60 text-muted-foreground/50 border-border/40")}>
                            DB: {serviceAnalysis.totalCount} {serviceAnalysis.totalCount === 1 ? "visit" : "visits"}
                          </span>
                          {serviceAnalysis.legacyDbCount > 0 && (
                            <span className="text-[9px] text-muted-foreground/50">
                              ({serviceAnalysis.dbCount} new + {serviceAnalysis.legacyDbCount} legacy)
                            </span>
                          )}
                        </div>

                        {/* Free warranty progress bar */}
                        <div className="flex items-center gap-3 px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-900/50 border border-border/50">
                          <div className="flex items-center gap-1.5">
                            {Array.from({ length: 3 }).map((_, i) => (
                              <div key={i} className={cn("h-2.5 w-2.5 rounded-full transition-colors",
                                i < serviceAnalysis.freeUsed
                                  ? "bg-emerald-500 shadow-sm shadow-emerald-200"
                                  : "bg-slate-200 dark:bg-slate-700")} />
                            ))}
                          </div>
                          <span className="text-[11px] font-semibold text-muted-foreground">
                            {serviceAnalysis.freeUsed} / 3 free services used
                          </span>
                          {serviceAnalysis.freeUsed >= 3 && (
                            <span className="ml-auto text-[9px] font-black uppercase tracking-wide text-amber-600 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 px-1.5 py-0.5 rounded-full">
                              warranty complete
                            </span>
                          )}
                        </div>

                        {/* This Visit highlight */}
                        <div className={cn("flex items-center justify-between px-4 py-3 rounded-xl border-2",
                          serviceAnalysis.isNextFree
                            ? "bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-900"
                            : "bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-900")}>
                          <div>
                            <div className="text-[9px] font-black uppercase tracking-widest text-muted-foreground mb-0.5">
                              This Visit
                            </div>
                            <div className="text-base font-black leading-none">{serviceRound || "—"}</div>
                          </div>
                          <span className={cn("text-[11px] font-black px-3 py-1.5 rounded-full shadow-sm",
                            serviceAnalysis.isNextFree
                              ? "bg-emerald-500 text-white"
                              : "bg-amber-500 text-white")}>
                            {serviceAnalysis.isNextFree ? "FREE" : "PAID"}
                          </span>
                        </div>

                        {/* Override presets */}
                        <div className="space-y-1.5">
                          <div className="text-[9px] font-black uppercase tracking-widest text-muted-foreground/50">Override</div>
                          <div className="flex flex-wrap gap-1.5">
                            {PRESET_ROUNDS.map(r => (
                              <button key={r} type="button"
                                onClick={() => {
                                  setRoundAutoDetected(false);
                                  setServiceRound(r);
                                  setIsFreeService(r.includes("Free"));
                                  setServiceAnalysis(prev => ({ ...prev, isNextFree: r.includes("Free") }));
                                }}
                                className={cn("text-[10px] font-bold px-2.5 py-1 rounded-lg border transition-all",
                                  !roundAutoDetected && serviceRound === r
                                    ? "bg-primary text-white border-primary shadow-sm"
                                    : "border-border/60 text-muted-foreground hover:border-primary/50 hover:text-foreground bg-white dark:bg-card")}>
                                {r}
                              </button>
                            ))}
                            <button type="button"
                              onClick={() => { setRoundAutoDetected(false); setServiceRound(""); }}
                              className={cn("text-[10px] font-bold px-2.5 py-1 rounded-lg border transition-all",
                                isCustom
                                  ? "bg-primary/10 text-primary border-primary/40"
                                  : "border-border/60 text-muted-foreground hover:border-primary/50 hover:text-foreground bg-white dark:bg-card")}>
                              Custom…
                            </button>
                          </div>
                          {isCustom && (
                            <Input autoFocus value={serviceRound}
                              onChange={e => setServiceRound(e.target.value)}
                              placeholder="e.g. Annual, 4th Paid, Special…"
                              className="h-9 text-sm rounded-xl border-primary/50 bg-slate-50 dark:bg-slate-900/50 focus:bg-white" />
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}

              <div className="space-y-2">
                <Label className="text-xs font-bold text-muted-foreground uppercase tracking-wide">Issue / Description</Label>
                <Textarea value={description} onChange={e => setDescription(e.target.value)}
                  placeholder="Describe the fault, complaint, or work required…" rows={3}
                  className="resize-none text-sm rounded-xl border-border/60 bg-slate-50 dark:bg-slate-900/50 focus:bg-white" />
              </div>

              <div className="space-y-2">
                <Label className="text-xs font-bold text-muted-foreground uppercase tracking-wide">Internal Notes <span className="font-normal normal-case">(optional)</span></Label>
                <Textarea value={internalNotes} onChange={e => setInternalNotes(e.target.value)}
                  placeholder="Parts to bring, access codes, technician instructions…" rows={2}
                  className="resize-none text-sm rounded-xl border-border/60 bg-slate-50 dark:bg-slate-900/50 focus:bg-white" />
              </div>
            </div>
          </div>

          {/* System Info — redesigned multi-component */}
          <div className="rounded-2xl border bg-white dark:bg-card shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3.5 border-b bg-muted/20">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-amber-500/10"><Sun className="h-3.5 w-3.5 text-amber-600" /></div>
                <span className="text-[11px] font-black uppercase tracking-widest text-muted-foreground">System Info</span>
                {loadingProducts && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
              </div>
              {selectedProject && <span className="text-[10px] text-primary/70 font-medium">auto-filled · editable</span>}
            </div>
            <div className="p-5 space-y-5">

              {/* ── Solar Panels ── */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-bold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                    ☀️ Solar Panels
                    {totalPanelCount > 0 && (
                      <span className="font-normal normal-case text-muted-foreground">
                        — {totalPanelCount} panels
                        {capacity && <span className="text-emerald-600 font-bold"> · {capacity} kWp</span>}
                      </span>
                    )}
                  </Label>
                  <button type="button" onClick={() => setPanelLines(prev => [...prev, mkPanel()])}
                    className="flex items-center gap-1 text-[10px] font-bold text-primary hover:underline">
                    <Plus className="h-3 w-3" /> Add type
                  </button>
                </div>
                <div className="space-y-2">
                  {panelLines.map((line, idx) => (
                    <PanelLineRow key={line.id} line={line} panels={panels} idx={idx} total={panelLines.length}
                      onChange={patch => setPanelLines(prev => prev.map(l => l.id === line.id ? { ...l, ...patch } : l))}
                      onRemove={() => setPanelLines(prev => prev.filter(l => l.id !== line.id))} />
                  ))}
                </div>
              </div>

              {/* ── Capacity override ── */}
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
                  Total Capacity (kWp)
                  {panelLines.some(l => l.mode === "catalog" && l.productId && l.qty) &&
                    <span className="text-[10px] text-emerald-600 font-bold normal-case">auto-computed</span>}
                </Label>
                <Input value={capacity} onChange={e => setCapacity(e.target.value)} placeholder="e.g. 5.04"
                  className="h-9 text-sm rounded-xl border-border/60 bg-slate-50 dark:bg-slate-900/50 focus:bg-white" />
              </div>

              {/* ── Inverters ── */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-bold text-muted-foreground uppercase tracking-wide">⚡ Inverters</Label>
                  <button type="button" onClick={() => setInverterLines(prev => [...prev, mkInverter()])}
                    className="flex items-center gap-1 text-[10px] font-bold text-primary hover:underline">
                    <Plus className="h-3 w-3" /> Add inverter
                  </button>
                </div>
                <div className="space-y-2">
                  {inverterLines.map((line, idx) => (
                    <InverterLineRow key={line.id} line={line} inverters={filteredInverters} idx={idx} total={inverterLines.length}
                      onChange={patch => setInverterLines(prev => prev.map(l => l.id === line.id ? { ...l, ...patch } : l))}
                      onRemove={() => setInverterLines(prev => prev.filter(l => l.id !== line.id))} />
                  ))}
                </div>
              </div>

              {/* ── Batteries ── */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-bold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                    🔋 Batteries <span className="font-normal text-muted-foreground/60 normal-case">(optional)</span>
                  </Label>
                  <button type="button" onClick={() => setBatteryLines(prev => [...prev, mkBattery()])}
                    className="flex items-center gap-1 text-[10px] font-bold text-primary hover:underline">
                    <Plus className="h-3 w-3" /> Add battery
                  </button>
                </div>
                {batteryLines.length === 0 ? (
                  <button type="button" onClick={() => setBatteryLines([mkBattery()])}
                    className="w-full rounded-xl border-2 border-dashed border-border/50 py-3 text-xs text-muted-foreground hover:border-primary/40 hover:text-primary transition-colors">
                    + Add battery to this system
                  </button>
                ) : (
                  <div className="space-y-2">
                    {batteryLines.map((line, idx) => (
                      <BatteryLineRow key={line.id} line={line} batteries={batteries} idx={idx} total={batteryLines.length}
                        onChange={patch => setBatteryLines(prev => prev.map(l => l.id === line.id ? { ...l, ...patch } : l))}
                        onRemove={() => setBatteryLines(prev => prev.filter(l => l.id !== line.id))} />
                    ))}
                  </div>
                )}
              </div>

              {/* ── System Type ── */}
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
                  System Type
                  {batteryLines.some(b => b.productId || b.text.trim()) &&
                    <span className="text-[10px] text-emerald-600 font-bold normal-case">auto-detected from battery</span>}
                </Label>
                <Select value={systemType} onValueChange={setSystemType}>
                  <SelectTrigger className="h-9 text-sm rounded-xl border-border/60 bg-slate-50 dark:bg-slate-900/50"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ongrid">On-Grid (Solar + Grid)</SelectItem>
                    <SelectItem value="hybrid">Hybrid (Solar + Grid + Battery)</SelectItem>
                    <SelectItem value="hybrid-offgrid">Hybrid Off-Grid (Solar + Battery)</SelectItem>
                    <SelectItem value="offgrid">Off-Grid (Solar + Battery only)</SelectItem>
                    <SelectItem value="grid-backup">Grid Backup (Grid + Battery)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        </div>

        {/* Right: customer + location + cost */}
        <div className="lg:col-span-2 space-y-5">

          {/* Customer */}
          <div className="rounded-2xl border bg-white dark:bg-card shadow-sm overflow-hidden">
            <div className="flex items-center gap-2 px-5 py-3.5 border-b bg-muted/20">
              <div className="p-1.5 rounded-lg bg-blue-500/10">
                <svg className="h-3.5 w-3.5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
              </div>
              <span className="text-[11px] font-black uppercase tracking-widest text-muted-foreground">Customer</span>
              {selectedProject && <span className="ml-auto text-[10px] text-primary/70 font-medium">auto-filled</span>}
            </div>
            <div className="p-5 space-y-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-muted-foreground">Full Name</Label>
                <Input value={customerName} onChange={e => setCustomerName(e.target.value)}
                  className="h-9 text-sm rounded-xl border-border/60 bg-slate-50 dark:bg-slate-900/50 focus:bg-white" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-muted-foreground">Phone</Label>
                <Input value={customerPhone} onChange={e => setCustomerPhone(e.target.value)}
                  className="h-9 text-sm rounded-xl border-border/60 bg-slate-50 dark:bg-slate-900/50 focus:bg-white" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-muted-foreground">Address</Label>
                <Textarea value={customerAddress} onChange={e => setCustomerAddress(e.target.value)} rows={2}
                  className="resize-none text-sm rounded-xl border-border/60 bg-slate-50 dark:bg-slate-900/50 focus:bg-white" />
              </div>
            </div>
          </div>

          {/* Location & Travel */}
          <div className="rounded-2xl border bg-white dark:bg-card shadow-sm overflow-hidden">
            <div className="flex items-center gap-2 px-5 py-3.5 border-b bg-muted/20">
              <div className="p-1.5 rounded-lg bg-sky-500/10"><MapPin className="h-3.5 w-3.5 text-sky-600" /></div>
              <span className="text-[11px] font-black uppercase tracking-widest text-muted-foreground">Location & Travel</span>
              {hasCoords && (
                <a href={`https://www.google.com/maps/search/?api=1&query=${customerLat},${customerLng}`}
                  target="_blank" rel="noopener noreferrer"
                  className="ml-auto inline-flex items-center gap-1 text-[10px] text-sky-600 hover:underline font-semibold">
                  <MapPin className="h-2.5 w-2.5" /> Maps
                </a>
              )}
            </div>
            <div className="p-5 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold text-muted-foreground">Latitude</Label>
                  <Input value={customerLat} onChange={e => setCustomerLat(e.target.value)} placeholder="6.93"
                    className="h-9 text-sm font-mono rounded-xl border-border/60 bg-slate-50 dark:bg-slate-900/50 focus:bg-white" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold text-muted-foreground">Longitude</Label>
                  <Input value={customerLng} onChange={e => setCustomerLng(e.target.value)} placeholder="79.86"
                    className="h-9 text-sm font-mono rounded-xl border-border/60 bg-slate-50 dark:bg-slate-900/50 focus:bg-white" />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-muted-foreground flex items-center gap-1">
                  Departing Office
                  {hasCoords && <span className="text-[10px] text-emerald-600 font-bold normal-case">nearest · auto</span>}
                </Label>
                <Select value={selectedOfficeId} onValueChange={v => { setSelectedOfficeId(v); setOfficeAutoSelected(false); }}>
                  <SelectTrigger className="h-9 text-sm rounded-xl border-border/60 bg-slate-50 dark:bg-slate-900/50"><SelectValue placeholder="Select office" /></SelectTrigger>
                  <SelectContent>
                    {offices.map(o => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              {distanceKm > 0 ? (
                <div className="rounded-xl bg-sky-50 dark:bg-sky-950/30 border border-sky-200 dark:border-sky-900/50 px-4 py-3 flex items-center justify-between">
                  <div>
                    <p className="text-xs text-muted-foreground">Distance · Rs. {ratePerKm}/km</p>
                    <p className="text-base font-black text-sky-700 dark:text-sky-400 mt-0.5">{distanceKm} km</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-muted-foreground">Travel cost</p>
                    <p className="text-base font-black text-sky-700 dark:text-sky-400 mt-0.5">{fmtRs(distanceCost)}</p>
                  </div>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground italic px-1">
                  {hasCoords ? "Calculating…" : "Enter GPS coordinates to auto-calculate travel cost."}
                </p>
              )}
            </div>
          </div>

          {/* Costs */}
          <div className="rounded-2xl border bg-white dark:bg-card shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3.5 border-b bg-muted/20">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-violet-500/10"><Receipt className="h-3.5 w-3.5 text-violet-600" /></div>
                <span className="text-[11px] font-black uppercase tracking-widest text-muted-foreground">Cost Breakdown</span>
              </div>
              {/* Free / Paid toggle */}
              <div className="flex rounded-lg border overflow-hidden text-[10px] font-black">
                <button type="button"
                  onClick={() => setIsFreeService(false)}
                  className={cn("px-3 py-1.5 transition-colors", !isFreeService ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted")}>
                  PAID
                </button>
                <button type="button"
                  onClick={() => setIsFreeService(true)}
                  className={cn("px-3 py-1.5 transition-colors", isFreeService ? "bg-emerald-600 text-white" : "text-muted-foreground hover:bg-muted")}>
                  FREE
                </button>
              </div>
            </div>
            <div className="p-5 space-y-4">

              {isFreeService && (
                <div className="flex items-center gap-2 rounded-xl bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900 px-3 py-2.5 text-xs font-bold text-emerald-700 dark:text-emerald-400">
                  <Receipt className="h-3.5 w-3.5 shrink-0" /> Free service — invoice total will be Rs. 0
                </div>
              )}

              {/* Labour */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-semibold text-muted-foreground">Labour (Rs.)</Label>
                  {labourOverridden ? (
                    <button type="button" onClick={() => setLabourOverridden(false)}
                      className="text-[10px] text-primary hover:underline font-medium">reset to auto</button>
                  ) : labourCost > 0 ? (
                    <span className="text-[10px] text-emerald-600 font-semibold">auto-computed</span>
                  ) : null}
                </div>
                <Input
                  type="number" min={0}
                  value={labourCost || ""}
                  onChange={e => { setLabourCost(Number(e.target.value) || 0); setLabourOverridden(true); }}
                  placeholder={capacity ? "Computing…" : "Set capacity first"}
                  className={cn("h-9 text-sm rounded-xl border-border/60",
                    !labourOverridden && labourCost > 0
                      ? "bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800"
                      : "bg-slate-50 dark:bg-slate-900/50 focus:bg-white")}
                />
              </div>

              {/* Materials / Replacement Parts */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-semibold text-muted-foreground">Replacement Parts</Label>
                  <button type="button" onClick={addMaterial}
                    className="flex items-center gap-1 text-[10px] text-primary hover:underline font-bold">
                    <Plus className="h-3 w-3" /> Add Part
                  </button>
                </div>
                {materials.length > 0 && (
                  <div className="rounded-xl border overflow-hidden">
                    <div className="grid grid-cols-[1fr_44px_68px_28px] gap-0 text-[10px] text-muted-foreground bg-muted/30 px-2 py-1.5 border-b">
                      <span className="pl-1">Part / Description</span><span className="text-center">Qty</span><span className="text-center">Unit Rs.</span><span/>
                    </div>
                    {materials.map((m, idx) => (
                      <div key={m.id} className={cn("grid grid-cols-[1fr_44px_68px_28px] gap-0 items-center", idx < materials.length-1 && "border-b")}>
                        <Input
                          value={m.name}
                          onChange={e => updateMaterial(m.id, "name", e.target.value)}
                          placeholder="Part name…"
                          className="h-8 text-xs border-0 border-r rounded-none focus-visible:ring-0 focus-visible:ring-offset-0 bg-transparent"
                        />
                        <Input
                          type="number" min={1}
                          value={m.qty || ""}
                          onChange={e => updateMaterial(m.id, "qty", Number(e.target.value) || 1)}
                          className="h-8 text-xs text-center border-0 border-r rounded-none focus-visible:ring-0 focus-visible:ring-offset-0 px-1 bg-transparent"
                        />
                        <Input
                          type="number" min={0}
                          value={m.unitPrice || ""}
                          onChange={e => updateMaterial(m.id, "unitPrice", Number(e.target.value) || 0)}
                          placeholder="0"
                          className="h-8 text-xs text-right border-0 border-r rounded-none focus-visible:ring-0 focus-visible:ring-offset-0 px-2 bg-transparent"
                        />
                        <button type="button" onClick={() => removeMaterial(m.id)}
                          className="h-8 flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-red-50 dark:hover:bg-red-950/20">
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                    {materialCost > 0 && (
                      <div className="flex justify-between px-3 py-1.5 text-xs text-muted-foreground bg-muted/20 border-t">
                        <span>Parts subtotal</span>
                        <span className="font-bold">{fmtRs(materialCost)}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Travel — editable */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-semibold text-muted-foreground">Travel (Rs.)</Label>
                  {travelOverridden ? (
                    <button type="button" onClick={() => setTravelOverridden(false)}
                      className="text-[10px] text-primary hover:underline font-medium">reset to auto</button>
                  ) : distanceCost > 0 ? (
                    <span className="text-[10px] text-sky-600 font-semibold">{distanceKm}km · auto</span>
                  ) : null}
                </div>
                <Input
                  type="number" min={0}
                  value={travelOverridden ? (travelOverride || "") : (distanceCost || "")}
                  onChange={e => { setTravelOverride(Number(e.target.value) || 0); setTravelOverridden(true); }}
                  placeholder="0"
                  className={cn("h-9 text-sm rounded-xl border-border/60",
                    !travelOverridden && distanceCost > 0
                      ? "bg-sky-50 dark:bg-sky-950/20 border-sky-200 dark:border-sky-800"
                      : "bg-slate-50 dark:bg-slate-900/50 focus:bg-white")}
                />
              </div>

              {/* Total summary */}
              <div className="rounded-xl border overflow-hidden">
                {labourCost > 0 && (
                  <div className="flex justify-between px-3 py-2 text-xs border-b">
                    <span className="text-muted-foreground">Labour</span>
                    <span className="font-semibold">{fmtRs(labourCost)}</span>
                  </div>
                )}
                {materialCost > 0 && (
                  <div className="flex justify-between px-3 py-2 text-xs border-b">
                    <span className="text-muted-foreground">Parts ({materials.filter(m=>m.name).length})</span>
                    <span className="font-semibold">{fmtRs(materialCost)}</span>
                  </div>
                )}
                {distanceCost > 0 && (
                  <div className="flex justify-between px-3 py-2 text-xs border-b">
                    <span className="text-muted-foreground">Travel{!travelOverridden && distanceKm > 0 ? ` (${distanceKm}km)` : ""}</span>
                    <span className="font-semibold">{fmtRs(distanceCost)}</span>
                  </div>
                )}
                {isFreeService ? (
                  <div className="flex justify-between px-4 py-3 bg-emerald-50 dark:bg-emerald-950/20">
                    <span className="font-black text-sm text-emerald-700">Total (FREE)</span>
                    <span className="font-black text-lg text-emerald-600">Rs. 0</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 px-3 py-2.5 bg-primary/5">
                    <span className="font-black text-sm flex-1">Total</span>
                    {totalOverridden ? (
                      <button type="button" onClick={() => setTotalOverridden(false)}
                        className="text-[10px] text-primary hover:underline font-bold shrink-0">auto</button>
                    ) : (
                      <button type="button" onClick={() => { setTotalOverride(computedTotal); setTotalOverridden(true); }}
                        className="text-[10px] text-muted-foreground hover:text-primary font-bold shrink-0">override</button>
                    )}
                    <Input
                      type="number" min={0}
                      value={totalOverridden ? (totalOverride || "") : computedTotal}
                      onChange={e => { setTotalOverride(Number(e.target.value) || 0); setTotalOverridden(true); }}
                      className={cn("h-8 text-base font-black text-right w-32 rounded-lg text-primary border-primary/30",
                        totalOverridden && "border-amber-400 bg-amber-50 dark:bg-amber-950/20 text-amber-700")}
                    />
                  </div>
                )}
              </div>
            </div>
          </div>

          {savedService ? (
            <div className="rounded-2xl border border-emerald-200 dark:border-emerald-900 bg-emerald-50 dark:bg-emerald-950/20 p-5 space-y-4">
              <div className="flex items-start gap-3">
                <div className="p-2 rounded-xl bg-emerald-100 dark:bg-emerald-900/40 shrink-0">
                  <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                </div>
                <div>
                  <p className="font-black text-emerald-800 dark:text-emerald-300">Service request created!</p>
                  <p className="text-xs text-emerald-700 dark:text-emerald-400 mt-0.5 font-mono">{savedService.invoiceNo}</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Button variant="outline" size="sm" className="gap-1.5 text-xs rounded-xl border-emerald-200 hover:bg-emerald-100/50"
                  onClick={() => router.push(`/services/${savedService.serviceId}`)}>
                  View Service
                </Button>
                <Button size="sm" className="gap-1.5 text-xs rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white"
                  onClick={() => router.push(`/print/service/${savedService.invoiceId}`)}>
                  <Receipt className="h-3.5 w-3.5" /> Print Invoice
                </Button>
              </div>
              <Button variant="ghost" size="sm" className="w-full text-xs text-muted-foreground rounded-xl"
                onClick={() => router.push("/services")}>
                ← Back to Services
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              <Button onClick={handleSave} disabled={saving || !projectNo} size="lg"
                className="w-full gap-2 rounded-xl h-12 font-bold text-base shadow-sm">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                {saving ? "Creating…" : "Create Service Request"}
              </Button>
              {!projectNo && (
                <p className="text-center text-xs text-muted-foreground">Search and select a project above first.</p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
    </div>
  );
}
