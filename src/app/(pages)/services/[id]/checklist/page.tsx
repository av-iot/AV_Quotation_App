"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/auth-context";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import {
  ArrowLeft, Save, Send, Loader2, CheckCircle2,
  Sun, Zap, MapPin, Wifi, User, Wrench, Settings, Pencil,
} from "lucide-react";
import type { ServiceChecklistData, SystemType } from "@/types";

// ── Constants ─────────────────────────────────────────────────────────────────
const DC_COUNT  = 8;
const AC_PHASES = ["L1-N", "L2-N", "L3-N", "L1-L2", "L2-L3", "L1-L3", "N-E"] as const;

const TABS = [
  { key: "info",      label: "Info",       icon: <Sun className="h-3.5 w-3.5" />      },
  { key: "dc",        label: "DC Strings", icon: <Zap className="h-3.5 w-3.5" />      },
  { key: "ac",        label: "AC + Power", icon: <Zap className="h-3.5 w-3.5" />      },
  { key: "site",      label: "Site Work",  icon: <Wrench className="h-3.5 w-3.5" />   },
  { key: "panel",     label: "Main Panel", icon: <Settings className="h-3.5 w-3.5" /> },
  { key: "handover",  label: "Handover",   icon: <User className="h-3.5 w-3.5" />     },
] as const;
type TabKey = typeof TABS[number]["key"];

function emptyArr(n: number): string[] { return Array(n).fill(""); }

function makeEmpty(
  serviceId: string,
  projectNo: string,
  systemType: SystemType,
  userId: string,
): Omit<ServiceChecklistData, "id"> {
  return {
    serviceId, projectNo, systemType,
    serviceRound: "", checklistDate: new Date().toISOString().split("T")[0],
    customerName: "", systemCapacity: "", inverterSerialNos: "",
    inverterCapacity: "", batterySerialNos: "", longitude: "", latitude: "",
    dcOCVoltage: emptyArr(DC_COUNT), dcLoadVoltage: emptyArr(DC_COUNT), dcLoadCurrent: emptyArr(DC_COUNT),
    acOCVoltage: emptyArr(7), acLoadVoltage: emptyArr(7), acLoadCurrent: emptyArr(7),
    power: "", powerTime: "", wifiConnectivity: "", captureLightBill: "",
    customerNIC: "", customerContactNumber: "", customerEmail: "",
    customerSignatureObtained: false, specialNotes: "",
    cloudiness: "", panelService: "", structureService: "", nutBoltsCondition: "",
    shadow: "", panelMC4Condition: "", tookPhotosRoof: "", roofComments: {},
    cebExportReading: "", cebImportReading: "", groundResistance: "",
    earthingRodChecked: "", outdoorComments: {},
    onlineGridVoltage: "", offlineGridVoltage: "", inverterServiceFanTime: "",
    breakerService: "", dcSurgeArrestors: "", acSurgeArrestors: "",
    inverterConnectionMC4: "", lowVoltageRange: "", highVoltageRange: "",
    lowFrequencyRange: "", highFrequencyRange: "", inverterStartupTime: "",
    eTodayInverter: "", eTotalInverter: "", wifiConfigDone: "",
    powerBulbBlinkingStyle: "", routerUsername: "", routerPassword: "",
    routerSerialNumber: "", serviceSticker: "", tookPhotosMainPanel: "",
    mainPanelComments: {},
    teamLeaderName: "", teamMembers: "",
    status: "draft", submittedBy: userId,
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  };
}

// ── Sub-components ────────────────────────────────────────────────────────────

function Row({ label, children, unit }: { label: string; children: React.ReactNode; unit?: string }) {
  return (
    <div className="flex items-center justify-between py-2.5 border-b border-border/40 last:border-0 gap-3">
      <Label className="text-xs font-semibold text-muted-foreground shrink-0 leading-snug" style={{ maxWidth: "45%" }}>
        {label}{unit && <span className="font-normal text-muted-foreground/60 ml-1">({unit})</span>}
      </Label>
      <div className="flex justify-end flex-1 min-w-0">{children}</div>
    </div>
  );
}

function SmInput({ value, onChange, unit, placeholder, type = "text", w = "w-32", disabled }: {
  value: string; onChange: (v: string) => void;
  unit?: string; placeholder?: string; type?: string; w?: string; disabled?: boolean;
}) {
  return (
    <div className="flex items-center gap-1">
      <Input
        type={type} value={value} onChange={e => onChange(e.target.value)}
        placeholder={placeholder ?? "—"}
        disabled={disabled}
        className={`${w} h-8 text-sm text-right font-mono rounded-lg`}
      />
      {unit && <span className="text-xs text-muted-foreground font-medium shrink-0">{unit}</span>}
    </div>
  );
}

function YNToggle({ value, onChange, disabled }: { value: string; onChange: (v: string) => void; disabled?: boolean }) {
  return (
    <div className="flex gap-1">
      {(["YES", "NO"] as const).map(opt => (
        <button key={opt} type="button"
          disabled={disabled}
          onClick={() => onChange(value === opt ? "" : opt)}
          className={`px-3 py-1 rounded-lg text-xs font-black border transition-colors ${
            value === opt
              ? opt === "YES"
                ? "bg-emerald-600 border-emerald-700 text-white"
                : "bg-red-500 border-red-600 text-white"
              : "border-border text-muted-foreground hover:border-primary/40 hover:text-foreground"
          } disabled:opacity-50 disabled:cursor-not-allowed`}
        >
          {opt}
        </button>
      ))}
    </div>
  );
}

function CondToggle({ value, onChange, disabled }: { value: string; onChange: (v: string) => void; disabled?: boolean }) {
  const opts = [
    { val: "Done",  cls: "bg-emerald-600 border-emerald-700 text-white" },
    { val: "Issue", cls: "bg-amber-500 border-amber-600 text-white"     },
    { val: "N/A",   cls: "bg-slate-500 border-slate-600 text-white"     },
  ];
  return (
    <div className="flex gap-1">
      {opts.map(({ val, cls }) => (
        <button key={val} type="button"
          disabled={disabled}
          onClick={() => onChange(value === val ? "" : val)}
          className={`px-2.5 py-1 rounded-lg text-xs font-black border transition-colors ${
            value === val ? cls : "border-border text-muted-foreground hover:border-primary/40 hover:text-foreground"
          } disabled:opacity-50 disabled:cursor-not-allowed`}
        >
          {val}
        </button>
      ))}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-4">
      <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1 px-1">{title}</p>
      <div className="bg-card border border-border/50 rounded-xl px-3 shadow-sm">{children}</div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function ServiceChecklistPage() {
  const { id } = useParams<{ id: string }>();
  const router  = useRouter();
  const { user, firebaseUser } = useAuth();
  const { toast } = useToast();

  const [service,   setService]   = useState<any>(null);
  const [loading,   setLoading]   = useState(true);
  const [saving,    setSaving]    = useState(false);
  const [tab,       setTab]       = useState<TabKey>("info");
  const [data,      setData]      = useState<Omit<ServiceChecklistData, "id"> | null>(null);
  const [originalData, setOriginalData] = useState<Omit<ServiceChecklistData, "id"> | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  // Load service + existing checklist
  useEffect(() => {
    if (!id) return;
    Promise.all([
      getDoc(doc(db, "services", id)),
      getDoc(doc(db, "serviceChecklistData", id)),
    ]).then(([sSnap, cSnap]) => {
      const svc: any = sSnap.exists() ? { id: sSnap.id, ...sSnap.data() } : null;
      setService(svc);

      if (cSnap.exists()) {
        const existing = cSnap.data() as ServiceChecklistData;
        // Ensure array fields are the right length
        const fix = (arr: string[], n: number) => arr?.length === n ? arr : emptyArr(n);
        const loaded = {
          ...existing,
          dcOCVoltage:   fix(existing.dcOCVoltage, DC_COUNT),
          dcLoadVoltage: fix(existing.dcLoadVoltage, DC_COUNT),
          dcLoadCurrent: fix(existing.dcLoadCurrent, DC_COUNT),
          acOCVoltage:   fix(existing.acOCVoltage, 7),
          acLoadVoltage: fix(existing.acLoadVoltage, 7),
          acLoadCurrent: fix(existing.acLoadCurrent, 7),
        };
        setData(loaded);
        setOriginalData(loaded);
        setSubmitted(existing.status === "submitted");
        setIsEditing(existing.status !== "submitted");
      } else if (svc) {
        const d = makeEmpty(id, svc.projectNo || "", svc.systemType || "ongrid", firebaseUser?.uid || "");
        const initial = {
          ...d,
          serviceRound:          svc.serviceRound || "",
          checklistDate:         svc.scheduledDate || d.checklistDate,
          customerName:          svc.customer?.name || "",
          systemCapacity:        String(svc.capacity || ""),
          inverterSerialNos:     svc.inverterSerialNos || "",
          batterySerialNos:      svc.batterySerialNos || "",
          longitude:             String(svc.location?.lng || ""),
          latitude:              String(svc.location?.lat || ""),
          customerContactNumber: svc.customer?.phone || "",
          customerEmail:         svc.customer?.email || "",
          teamLeaderName:        user?.displayName || "",
          submittedBy:           firebaseUser?.uid || "",
          submittedByName:       user?.displayName || "",
        };
        setData(initial);
        setOriginalData(initial);
        setIsEditing(true);
      }
      setLoading(false);
    });
  }, [id, user, firebaseUser]);

  const set = useCallback(<K extends keyof Omit<ServiceChecklistData, "id">>(
    key: K, value: Omit<ServiceChecklistData, "id">[K]
  ) => setData(prev => prev ? { ...prev, [key]: value } : prev), []);

  type ArrKey = "dcOCVoltage" | "dcLoadVoltage" | "dcLoadCurrent" | "acOCVoltage" | "acLoadVoltage" | "acLoadCurrent";
  const setArr = useCallback((key: ArrKey, idx: number, value: string) => {
    setData(prev => {
      if (!prev) return prev;
      const arr = [...prev[key]];
      arr[idx] = value;
      return { ...prev, [key]: arr };
    });
  }, []);

  const save = async (finalStatus: "draft" | "submitted" = "draft") => {
    if (!data) return;
    setSaving(true);
    try {
      const isEngineer = ["engineer", "admin", "superadmin"].includes(user?.role || "");
      const approvedFields = (finalStatus === "submitted" && isEngineer) ? {
        approvedBy: firebaseUser?.uid || "",
        approvedByName: user?.displayName || user?.email || "Unknown Engineer",
        approvedAt: new Date().toISOString(),
      } : {};

      const savedData = {
        id, ...data,
        ...approvedFields,
        status: finalStatus,
        updatedAt: serverTimestamp(),
        ...(finalStatus === "submitted" && !data.submittedAt ? { submittedAt: new Date().toISOString() } : {}),
      };

      await setDoc(doc(db, "serviceChecklistData", id), savedData);

      const localSaved = {
        ...savedData,
        updatedAt: new Date().toISOString(),
      } as any;

      setOriginalData(localSaved);

      if (finalStatus === "submitted") {
        setSubmitted(true);
        toast({ title: "Checklist submitted", description: "Measurement data saved successfully." });
        router.push(`/services/${id}`);
      } else {
        toast({ title: "Draft saved" });
      }
    } catch (err: any) {
      toast({ title: "Save failed", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleEditClick = () => {
    const ok = window.confirm("Warning: Any changes you make will be recorded in the edit history. Do you still need to edit?");
    if (ok) {
      setIsEditing(true);
    }
  };

  const handleCancelEdit = () => {
    if (originalData) {
      setData(originalData);
    }
    setIsEditing(false);
  };

  const handleSaveChanges = async () => {
    if (!data || !originalData) return;
    setSaving(true);
    try {
      const diffs: Record<string, { old: any; new: any }> = {};
      for (const key in data) {
        if (["history", "updatedAt", "createdAt", "id"].includes(key)) continue;
        const oldVal = (originalData as any)[key];
        const newVal = (data as any)[key];
        if (JSON.stringify(oldVal) !== JSON.stringify(newVal)) {
          diffs[key] = { old: oldVal ?? "", new: newVal ?? "" };
        }
      }

      const hasChanges = Object.keys(diffs).length > 0;
      let updatedHistory = data.history || [];
      if (hasChanges) {
        const historyEntry = {
          editedBy: firebaseUser?.uid || "",
          editedByName: user?.displayName || user?.email || "Unknown User",
          editedAt: new Date().toISOString(),
          changes: diffs,
        };
        updatedHistory = [...updatedHistory, historyEntry];
      }

      const isEngineer = ["engineer", "admin", "superadmin"].includes(user?.role || "");
      const approvedFields = isEngineer ? {
        approvedBy: firebaseUser?.uid || "",
        approvedByName: user?.displayName || user?.email || "Unknown Engineer",
        approvedAt: new Date().toISOString(),
      } : {};

      const updatedData = {
        id,
        ...data,
        ...approvedFields,
        history: updatedHistory,
        updatedAt: serverTimestamp(),
      };

      await setDoc(doc(db, "serviceChecklistData", id), updatedData);

      const finalSavedData = {
        ...updatedData,
        updatedAt: new Date().toISOString(),
      } as any;

      setData(finalSavedData);
      setOriginalData(finalSavedData);
      setIsEditing(false);

      toast({ title: "Changes saved", description: "Edit history has been updated." });
    } catch (err: any) {
      toast({ title: "Save failed", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const tabIdx  = TABS.findIndex(t => t.key === tab);
  const hasPrev = tabIdx > 0;
  const hasNext = tabIdx < TABS.length - 1;
  const goNext  = async () => {
    await save("draft");
    setTab(TABS[tabIdx + 1].key);
    window.scrollTo(0, 0);
  };
  const goPrev  = () => { setTab(TABS[tabIdx - 1].key); window.scrollTo(0, 0); };

  if (loading) return (
    <div className="flex h-screen items-center justify-center">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    </div>
  );
  if (!data) return (
    <div className="flex h-screen flex-col items-center justify-center gap-2 text-muted-foreground">
      <p className="text-sm font-medium">Service not found.</p>
      <Button variant="outline" size="sm" onClick={() => router.push("/services")}>Back</Button>
    </div>
  );

  const isHybridOrOffgrid = ["hybrid", "hybrid-offgrid", "offgrid", "grid-backup"].includes(data.systemType);

  // ── Tab content ────────────────────────────────────────────────────────────
  const content: Record<TabKey, React.ReactNode> = {

    // ── INFO ──────────────────────────────────────────────────────────────────
    info: (
      <div>
        {/* Metadata Section: Submitted by Technician & Approved/Changed by Engineer */}
        <Section title="Submission & Approval Details">
          <Row label="Entered by (Technician)">
            <span className="text-xs font-semibold text-muted-foreground">{data.submittedByName || "—"}</span>
          </Row>
          {data.submittedAt && (
            <Row label="Submitted At">
              <span className="text-xs font-mono text-muted-foreground">
                {new Date(data.submittedAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
              </span>
            </Row>
          )}
          <Row label="Approved/Changed by (Engineer)">
            <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">{data.approvedByName || "—"}</span>
          </Row>
          {data.approvedAt && (
            <Row label="Approved At">
              <span className="text-xs font-mono text-muted-foreground">
                {new Date(data.approvedAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
              </span>
            </Row>
          )}
        </Section>

        {/* Change History Section */}
        {data.history && data.history.length > 0 && (
          <Section title="Edit History">
            <div className="space-y-2.5 py-2">
              {data.history.map((h: any, idx: number) => (
                <div key={idx} className="text-[11px] border-b border-border/40 last:border-0 pb-2 last:pb-0">
                  <p className="font-semibold text-foreground">Edited by: {h.editedByName}</p>
                  <p className="text-muted-foreground font-mono text-[10px]">
                    {new Date(h.editedAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                  </p>
                  <div className="mt-1 bg-muted/30 rounded-lg p-1.5 font-mono text-[10px] space-y-0.5 max-h-40 overflow-y-auto">
                    {Object.entries(h.changes || {}).map(([field, delta]: any) => (
                      <div key={field} className="truncate">
                        <span className="font-semibold text-primary">{field}:</span>{" "}
                        <span className="text-red-500/80 line-through">{String(JSON.stringify(delta.old))}</span> →{" "}
                        <span className="text-emerald-600 font-bold">{String(JSON.stringify(delta.new))}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </Section>
        )}

        <Section title="Service Details">
          <Row label="Service Round">
            <SmInput value={data.serviceRound} onChange={v => set("serviceRound", v)} placeholder="e.g. 1st Free" w="w-36" disabled={!isEditing} />
          </Row>
          <Row label="Checklist Date">
            <Input type="date" value={data.checklistDate} onChange={e => set("checklistDate", e.target.value)}
              disabled={!isEditing} className="w-40 h-8 text-sm rounded-lg" />
          </Row>
          <Row label="System Type">
            <select value={data.systemType} onChange={e => set("systemType", e.target.value as SystemType)}
              disabled={!isEditing}
              className="h-8 rounded-lg border border-input bg-background px-2 text-sm font-semibold w-36 focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:opacity-50">
              <option value="ongrid">On-Grid</option>
              <option value="hybrid">Hybrid</option>
              <option value="hybrid-offgrid">Hybrid Off-Grid</option>
              <option value="offgrid">Off-Grid</option>
              <option value="grid-backup">Grid Backup</option>
            </select>
          </Row>
        </Section>

        <Section title="System Info">
          <Row label="Customer Name">
            <Input value={data.customerName} onChange={e => set("customerName", e.target.value)}
              disabled={!isEditing} className="w-44 h-8 text-sm rounded-lg" placeholder="Customer name" />
          </Row>
          <Row label="System Capacity" unit="kWp">
            <SmInput value={data.systemCapacity} onChange={v => set("systemCapacity", v)} unit="kWp" placeholder="e.g. 5.4" w="w-24" disabled={!isEditing} />
          </Row>
          <Row label="Inverter Capacity" unit="kW">
            <SmInput value={data.inverterCapacity} onChange={v => set("inverterCapacity", v)} unit="kW" placeholder="e.g. 5.0" w="w-24" disabled={!isEditing} />
          </Row>
          <Row label="Inverter Serial No.">
            <Input value={data.inverterSerialNos} onChange={e => set("inverterSerialNos", e.target.value)}
              disabled={!isEditing} className="w-44 h-8 text-sm rounded-lg font-mono" placeholder="Serial number(s)" />
          </Row>
          {isHybridOrOffgrid && (
            <Row label="Battery Serial No.">
              <Input value={data.batterySerialNos} onChange={e => set("batterySerialNos", e.target.value)}
                disabled={!isEditing} className="w-44 h-8 text-sm rounded-lg font-mono" placeholder="Serial number(s)" />
            </Row>
          )}
        </Section>

        <Section title="GPS Coordinates">
          <Row label="Latitude">
            <SmInput value={data.latitude} onChange={v => set("latitude", v)} placeholder="6.9271" w="w-32" disabled={!isEditing} />
          </Row>
          <Row label="Longitude">
            <SmInput value={data.longitude} onChange={v => set("longitude", v)} placeholder="79.8612" w="w-32" disabled={!isEditing} />
          </Row>
          {isEditing && (
            <div className="py-2">
              <button type="button"
                onClick={() => {
                  if (!navigator.geolocation) return;
                  navigator.geolocation.getCurrentPosition(pos => {
                    set("latitude",  String(pos.coords.latitude.toFixed(6)));
                    set("longitude", String(pos.coords.longitude.toFixed(6)));
                  });
                }}
                className="flex items-center gap-1.5 text-xs font-bold text-primary hover:underline">
                <MapPin className="h-3.5 w-3.5" /> Use Current GPS Location
              </button>
            </div>
          )}
        </Section>
      </div>
    ),

    // ── DC STRINGS ────────────────────────────────────────────────────────────
    dc: (
      <div>
        <p className="text-xs text-muted-foreground mb-3 px-1">
          Record DC string measurements at the inverter input terminals. OC = open-circuit, Load = under load.
        </p>
        {/* Header row */}
        <div className="grid grid-cols-[2rem_1fr_1fr_1fr] gap-1 px-1 mb-1">
          <div />
          <p className="text-[10px] font-black uppercase text-muted-foreground text-center">OC Volt<br/>(V)</p>
          <p className="text-[10px] font-black uppercase text-muted-foreground text-center">Load Volt<br/>(V)</p>
          <p className="text-[10px] font-black uppercase text-muted-foreground text-center">Load Curr<br/>(A)</p>
        </div>
        <div className="space-y-1">
          {Array.from({ length: DC_COUNT }, (_, i) => (
            <div key={i} className="grid grid-cols-[2rem_1fr_1fr_1fr] gap-1 items-center bg-card border border-border/50 rounded-xl px-2 py-1.5">
              <span className="text-[11px] font-black text-muted-foreground/60 text-center">{i + 1}</span>
              <Input type="number" value={data.dcOCVoltage[i]}
                onChange={e => setArr("dcOCVoltage", i, e.target.value)}
                disabled={!isEditing}
                placeholder="—" className="h-8 text-sm text-center font-mono rounded-lg px-1" />
              <Input type="number" value={data.dcLoadVoltage[i]}
                onChange={e => setArr("dcLoadVoltage", i, e.target.value)}
                disabled={!isEditing}
                placeholder="—" className="h-8 text-sm text-center font-mono rounded-lg px-1" />
              <Input type="number" value={data.dcLoadCurrent[i]}
                onChange={e => setArr("dcLoadCurrent", i, e.target.value)}
                disabled={!isEditing}
                placeholder="—" className="h-8 text-sm text-center font-mono rounded-lg px-1" />
            </div>
          ))}
        </div>
      </div>
    ),

    // ── AC + POWER ────────────────────────────────────────────────────────────
    ac: (
      <div>
        <p className="text-xs text-muted-foreground mb-3 px-1">
          AC output measurements at the inverter AC terminals.
        </p>
        <div className="grid grid-cols-[3rem_1fr_1fr_1fr] gap-1 px-1 mb-1">
          <div />
          <p className="text-[10px] font-black uppercase text-muted-foreground text-center">OC Volt<br/>(V)</p>
          <p className="text-[10px] font-black uppercase text-muted-foreground text-center">Load Volt<br/>(V)</p>
          <p className="text-[10px] font-black uppercase text-muted-foreground text-center">Load Curr<br/>(A)</p>
        </div>
        <div className="space-y-1 mb-5">
          {AC_PHASES.map((phase, i) => (
            <div key={phase} className="grid grid-cols-[3rem_1fr_1fr_1fr] gap-1 items-center bg-card border border-border/50 rounded-xl px-2 py-1.5">
              <span className="text-[10px] font-black text-muted-foreground text-center leading-tight">{phase}</span>
              <Input type="number" value={data.acOCVoltage[i]}
                onChange={e => setArr("acOCVoltage", i, e.target.value)}
                disabled={!isEditing}
                placeholder="—" className="h-8 text-sm text-center font-mono rounded-lg px-1" />
              <Input type="number" value={data.acLoadVoltage[i]}
                onChange={e => setArr("acLoadVoltage", i, e.target.value)}
                disabled={!isEditing}
                placeholder="—" className="h-8 text-sm text-center font-mono rounded-lg px-1" />
              <Input type="number" value={data.acLoadCurrent[i]}
                onChange={e => setArr("acLoadCurrent", i, e.target.value)}
                disabled={!isEditing}
                placeholder="—" className="h-8 text-sm text-center font-mono rounded-lg px-1" />
            </div>
          ))}
        </div>

        <Section title="Power & Connectivity">
          <Row label="Power Output" unit="W">
            <SmInput value={data.power} onChange={v => set("power", v)} unit="W" placeholder="e.g. 4200" w="w-28" disabled={!isEditing} />
          </Row>
          <Row label="Power Time">
            <Input type="time" value={data.powerTime} onChange={e => set("powerTime", e.target.value)}
              disabled={!isEditing} className="w-32 h-8 text-sm rounded-lg" />
          </Row>
          <Row label="WiFi Connectivity">
            <YNToggle value={data.wifiConnectivity} onChange={v => set("wifiConnectivity", v)} disabled={!isEditing} />
          </Row>
          <Row label="Capture Light Bill">
            <YNToggle value={data.captureLightBill} onChange={v => set("captureLightBill", v)} disabled={!isEditing} />
          </Row>
        </Section>
      </div>
    ),

    // ── SITE WORK ─────────────────────────────────────────────────────────────
    site: (
      <div>
        <Section title="Roof Work">
          <Row label="Cloudiness">
            <CondToggle value={data.cloudiness} onChange={v => set("cloudiness", v)} disabled={!isEditing} />
          </Row>
          <Row label="Panel Service / Cleaning">
            <CondToggle value={data.panelService} onChange={v => set("panelService", v)} disabled={!isEditing} />
          </Row>
          <Row label="Structure Service">
            <CondToggle value={data.structureService} onChange={v => set("structureService", v)} disabled={!isEditing} />
          </Row>
          <Row label="Nut / Bolts Condition">
            <CondToggle value={data.nutBoltsCondition} onChange={v => set("nutBoltsCondition", v)} disabled={!isEditing} />
          </Row>
          <Row label="Shadow / Shading">
            <CondToggle value={data.shadow} onChange={v => set("shadow", v)} disabled={!isEditing} />
          </Row>
          <Row label="Panel MC4 Condition">
            <CondToggle value={data.panelMC4Condition} onChange={v => set("panelMC4Condition", v)} disabled={!isEditing} />
          </Row>
          <Row label="Took Photos (Roof)">
            <YNToggle value={data.tookPhotosRoof} onChange={v => set("tookPhotosRoof", v)} disabled={!isEditing} />
          </Row>
          <div className="py-2">
            <Label className="text-[10px] font-semibold text-muted-foreground mb-1 block">Roof Comments</Label>
            <Textarea rows={2} placeholder="Panel condition notes, shadow sources, etc."
              value={data.roofComments?.general || ""}
              disabled={!isEditing}
              onChange={e => set("roofComments", { ...data.roofComments, general: e.target.value })}
              className="resize-none text-sm rounded-xl" />
          </div>
        </Section>

        <Section title="Outdoor Work">
          <Row label="CEB Export Reading" unit="kWh">
            <SmInput value={data.cebExportReading} onChange={v => set("cebExportReading", v)} placeholder="0000" w="w-28" disabled={!isEditing} />
          </Row>
          <Row label="CEB Import Reading" unit="kWh">
            <SmInput value={data.cebImportReading} onChange={v => set("cebImportReading", v)} placeholder="0000" w="w-28" disabled={!isEditing} />
          </Row>
          <Row label="Ground Resistance" unit="Ω">
            <SmInput value={data.groundResistance} onChange={v => set("groundResistance", v)} placeholder="e.g. 4.2" unit="Ω" w="w-24" disabled={!isEditing} />
          </Row>
          <Row label="Earthing Rod Checked">
            <CondToggle value={data.earthingRodChecked} onChange={v => set("earthingRodChecked", v)} disabled={!isEditing} />
          </Row>
          <div className="py-2">
            <Label className="text-[10px] font-semibold text-muted-foreground mb-1 block">Outdoor Comments</Label>
            <Textarea rows={2} placeholder="Earthing condition, CEB meter notes, etc."
              value={data.outdoorComments?.general || ""}
              disabled={!isEditing}
              onChange={e => set("outdoorComments", { ...data.outdoorComments, general: e.target.value })}
              className="resize-none text-sm rounded-xl" />
          </div>
        </Section>
      </div>
    ),

    // ── MAIN PANEL ────────────────────────────────────────────────────────────
    panel: (
      <div>
        <Section title="Grid Voltage & Inverter">
          <Row label="Online Grid Voltage" unit="V">
            <SmInput value={data.onlineGridVoltage} onChange={v => set("onlineGridVoltage", v)} unit="V" w="w-24" disabled={!isEditing} />
          </Row>
          <Row label="Offline Grid Voltage" unit="V">
            <SmInput value={data.offlineGridVoltage} onChange={v => set("offlineGridVoltage", v)} unit="V" w="w-24" disabled={!isEditing} />
          </Row>
          <Row label="Inverter Fan Service Time">
            <SmInput value={data.inverterServiceFanTime} onChange={v => set("inverterServiceFanTime", v)} placeholder="hh:mm" w="w-28" disabled={!isEditing} />
          </Row>
          <Row label="Breaker Service">
            <CondToggle value={data.breakerService} onChange={v => set("breakerService", v)} disabled={!isEditing} />
          </Row>
          <Row label="DC Surge Arrestors">
            <CondToggle value={data.dcSurgeArrestors} onChange={v => set("dcSurgeArrestors", v)} disabled={!isEditing} />
          </Row>
          <Row label="AC Surge Arrestors">
            <CondToggle value={data.acSurgeArrestors} onChange={v => set("acSurgeArrestors", v)} disabled={!isEditing} />
          </Row>
          <Row label="Inverter MC4 Connection">
            <CondToggle value={data.inverterConnectionMC4} onChange={v => set("inverterConnectionMC4", v)} disabled={!isEditing} />
          </Row>
        </Section>

        <Section title="Inverter Voltage / Frequency Range">
          <Row label="Low Voltage Range" unit="V">
            <SmInput value={data.lowVoltageRange} onChange={v => set("lowVoltageRange", v)} unit="V" w="w-24" disabled={!isEditing} />
          </Row>
          <Row label="High Voltage Range" unit="V">
            <SmInput value={data.highVoltageRange} onChange={v => set("highVoltageRange", v)} unit="V" w="w-24" disabled={!isEditing} />
          </Row>
          <Row label="Low Frequency Range" unit="Hz">
            <SmInput value={data.lowFrequencyRange} onChange={v => set("lowFrequencyRange", v)} unit="Hz" w="w-24" disabled={!isEditing} />
          </Row>
          <Row label="High Frequency Range" unit="Hz">
            <SmInput value={data.highFrequencyRange} onChange={v => set("highFrequencyRange", v)} unit="Hz" w="w-24" disabled={!isEditing} />
          </Row>
          <Row label="Inverter Startup Time">
            <SmInput value={data.inverterStartupTime} onChange={v => set("inverterStartupTime", v)} placeholder="seconds" w="w-28" disabled={!isEditing} />
          </Row>
          <Row label="E-Today (Inverter)" unit="kWh">
            <SmInput value={data.eTodayInverter} onChange={v => set("eTodayInverter", v)} unit="kWh" w="w-24" disabled={!isEditing} />
          </Row>
          <Row label="E-Total (Inverter)" unit="kWh">
            <SmInput value={data.eTotalInverter} onChange={v => set("eTotalInverter", v)} unit="kWh" w="w-24" disabled={!isEditing} />
          </Row>
        </Section>

        <Section title="WiFi / Router Config">
          <Row label="WiFi Config Done">
            <YNToggle value={data.wifiConfigDone} onChange={v => set("wifiConfigDone", v)} disabled={!isEditing} />
          </Row>
          <Row label="Power Bulb Blink Style">
            <SmInput value={data.powerBulbBlinkingStyle} onChange={v => set("powerBulbBlinkingStyle", v)} placeholder="e.g. slow blink" w="w-36" disabled={!isEditing} />
          </Row>
          <Row label="Router Username">
            <Input value={data.routerUsername} onChange={e => set("routerUsername", e.target.value)}
              disabled={!isEditing} className="w-36 h-8 text-sm rounded-lg font-mono" placeholder="username" />
          </Row>
          <Row label="Router Password">
            <Input value={data.routerPassword} onChange={e => set("routerPassword", e.target.value)}
              disabled={!isEditing} className="w-36 h-8 text-sm rounded-lg font-mono" placeholder="password" />
          </Row>
          <Row label="Router Serial No.">
            <Input value={data.routerSerialNumber} onChange={e => set("routerSerialNumber", e.target.value)}
              disabled={!isEditing} className="w-36 h-8 text-sm rounded-lg font-mono" placeholder="serial" />
          </Row>
          <Row label="Service Sticker Placed">
            <YNToggle value={data.serviceSticker} onChange={v => set("serviceSticker", v)} disabled={!isEditing} />
          </Row>
          <Row label="Took Photos (Panel)">
            <YNToggle value={data.tookPhotosMainPanel} onChange={v => set("tookPhotosMainPanel", v)} disabled={!isEditing} />
          </Row>
          <div className="py-2">
            <Label className="text-[10px] font-semibold text-muted-foreground mb-1 block">Main Panel Comments</Label>
            <Textarea rows={2} placeholder="Inverter faults, cabling issues, settings changed, etc."
              value={data.mainPanelComments?.general || ""}
              disabled={!isEditing}
              onChange={e => set("mainPanelComments", { ...data.mainPanelComments, general: e.target.value })}
              className="resize-none text-sm rounded-xl" />
          </div>
        </Section>
      </div>
    ),

    // ── HANDOVER ──────────────────────────────────────────────────────────────
    handover: (
      <div>
        <Section title="Customer Info">
          <Row label="Customer NIC">
            <Input value={data.customerNIC} onChange={e => set("customerNIC", e.target.value)}
              disabled={!isEditing} className="w-44 h-8 text-sm rounded-lg font-mono" placeholder="NIC number" />
          </Row>
          <Row label="Contact Number">
            <Input value={data.customerContactNumber} onChange={e => set("customerContactNumber", e.target.value)}
              disabled={!isEditing} className="w-40 h-8 text-sm rounded-lg" placeholder="07X XXX XXXX" />
          </Row>
          <Row label="Email">
            <Input value={data.customerEmail} onChange={e => set("customerEmail", e.target.value)}
              disabled={!isEditing} className="w-44 h-8 text-sm rounded-lg" placeholder="email@domain.com" />
          </Row>
          <Row label="Signature Obtained">
            <YNToggle
              value={data.customerSignatureObtained ? "YES" : "NO"}
              disabled={!isEditing}
              onChange={v => set("customerSignatureObtained", v === "YES")}
            />
          </Row>
        </Section>

        <Section title="Team">
          <Row label="Team Leader">
            <Input value={data.teamLeaderName} onChange={e => set("teamLeaderName", e.target.value)}
              disabled={!isEditing} className="w-44 h-8 text-sm rounded-lg" placeholder="Leader name" />
          </Row>
          <div className="py-2">
            <Label className="text-[10px] font-semibold text-muted-foreground mb-1 block">Team Members</Label>
            <Textarea rows={2} placeholder="Member 1, Member 2, ..."
              value={data.teamMembers}
              disabled={!isEditing}
              onChange={e => set("teamMembers", e.target.value)}
              className="resize-none text-sm rounded-xl" />
          </div>
        </Section>

        <Section title="Special Notes">
          <div className="py-2">
            <Textarea rows={3} placeholder="Handover observations, customer concerns, follow-up actions…"
              value={data.specialNotes}
              disabled={!isEditing}
              onChange={e => set("specialNotes", e.target.value)}
              className="resize-none text-sm rounded-xl" />
          </div>
        </Section>

        {submitted && (
          <div className="flex items-center gap-2 bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900/40 rounded-xl px-4 py-3 mb-4">
            <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
            <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">This checklist has been submitted.</p>
          </div>
        )}
      </div>
    ),
  };

  return (
    <div className="flex flex-col min-h-screen max-w-lg mx-auto bg-background">

      {/* ── Header ── */}
      <div className="bg-emerald-600 text-white px-4 py-3.5 sticky top-0 z-20 flex items-center gap-3 shadow-md">
        <button onClick={() => router.back()} className="p-1.5 -ml-1 rounded-full hover:bg-white/20 transition-colors shrink-0">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="text-sm font-black leading-tight truncate">
            Service Checklist · #{service?.projectNo || id.slice(0, 8).toUpperCase()}
          </h1>
          <p className="text-emerald-100 text-[11px]">
            {service?.customer?.name} · {data.checklistDate}
            {data.status === "submitted" && " · ✓ Submitted"}
          </p>
        </div>
        {data.status === "submitted" ? (
          isEditing ? (
            <div className="flex gap-1.5 shrink-0">
              <button type="button" onClick={handleCancelEdit} disabled={saving}
                className="bg-white/10 hover:bg-white/20 text-white px-2.5 py-1.5 rounded-lg text-xs font-bold transition-colors">
                Cancel
              </button>
              <button type="button" onClick={handleSaveChanges} disabled={saving}
                className="flex items-center gap-1 bg-white hover:bg-slate-50 text-emerald-700 px-2.5 py-1.5 rounded-lg text-xs font-black transition-colors shrink-0 disabled:opacity-50">
                {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                Save
              </button>
            </div>
          ) : (
            <button type="button" onClick={handleEditClick}
              className="flex items-center gap-1 bg-white/20 hover:bg-white/30 text-white px-2.5 py-1.5 rounded-lg text-xs font-bold transition-colors shrink-0">
              <Pencil className="h-3.5 w-3.5" />
              Edit
            </button>
          )
        ) : (
          <button type="button" onClick={() => save("draft")} disabled={saving}
            className="flex items-center gap-1 bg-white/20 hover:bg-white/30 text-white px-2.5 py-1.5 rounded-lg text-xs font-bold transition-colors shrink-0 disabled:opacity-50">
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            Save
          </button>
        )}
      </div>

      {/* ── Tab Bar ── */}
      <div className="flex overflow-x-auto bg-card border-b border-border/50 sticky top-[3.75rem] z-10 gap-0 px-1">
        {TABS.map((t, i) => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`flex items-center gap-1 px-3 py-2.5 text-xs font-bold whitespace-nowrap border-b-2 transition-colors shrink-0 ${
              tab === t.key
                ? "border-emerald-600 text-emerald-700 dark:text-emerald-400"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {t.icon}
            <span className="hidden sm:inline">{t.label}</span>
            <span className="sm:hidden text-[10px]">{i + 1}</span>
          </button>
        ))}
      </div>

      {/* ── Content ── */}
      <div className="flex-1 overflow-y-auto p-4">
        <h2 className="text-sm font-black mb-3 flex items-center gap-2 text-foreground">
          {TABS[tabIdx].icon}
          {TABS[tabIdx].label}
        </h2>
        {content[tab]}
      </div>

      {/* ── Footer Navigation ── */}
      <div className="bg-card border-t border-border/50 px-4 py-3 flex gap-2 sticky bottom-0 z-10">
        {hasPrev && (
          <Button variant="outline" onClick={goPrev} className="gap-1 rounded-xl">
            ← Prev
          </Button>
        )}
        <div className="flex-1" />
        {hasNext ? (
          <Button onClick={goNext} disabled={saving} className="gap-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl">
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            Next →
          </Button>
        ) : (
          data.status === "submitted" ? (
            isEditing ? (
              <div className="flex gap-2">
                <Button variant="outline" onClick={handleCancelEdit} disabled={saving} className="rounded-xl">
                  Cancel
                </Button>
                <Button onClick={handleSaveChanges} disabled={saving} className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl">
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  Save Changes
                </Button>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 text-emerald-600 font-bold text-xs px-3">
                <CheckCircle2 className="h-4 w-4" /> Submitted
              </div>
            )
          ) : (
            <Button onClick={() => save("submitted")} disabled={saving || submitted}
              className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              {submitted ? "Already Submitted" : "Submit Checklist"}
            </Button>
          )
        )}
      </div>
    </div>
  );
}
