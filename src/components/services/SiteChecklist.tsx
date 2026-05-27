"use client";
/**
 * SiteChecklist — full on-site service checklist component
 * Handles: task completion, photo uploads, string monitoring,
 * GPS capture, WiFi notes, customer sign-off + signature.
 */
import { useState, useEffect, useCallback, useRef } from "react";
import { doc, setDoc, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import {
  ChecklistTask,
  getTasksForSite,
  TASK_CATEGORY_LABELS, PHOTO_PHASE_CONFIG,
  SYSTEM_TYPE_LABELS, SERVICE_SCOPE_LABELS, SITE_CATEGORY_LABELS,
  SystemType, ServiceScope, SiteCategory, TaskCategory,
} from "@/lib/checklistTasks";
import type { PhotoMeta } from "@/lib/photoUpload";
import PhotoUploadButton from "./PhotoUploadButton";
import SignaturePad from "./SignaturePad";
import { cn } from "@/lib/utils";
import {
  CheckSquare, MapPin, Wifi, WifiOff, Plus, Trash2,
  ChevronDown, ChevronRight, Check, Loader2, AlertTriangle,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

// ── Types ─────────────────────────────────────────────────────────────────────
export interface TaskState {
  checked:         boolean;
  startedAt?:      string;
  checkedAt?:      string;
  durationSecs?:   number;
  loggedByName?:   string;     // who completed this task
  loggedByUid?:    string;
  editedByName?:   string;     // if an admin/engineer later edited it
  editedByUid?:    string;
  editedAt?:       string;
  textValue?:      string;
  notes?:          string;
  photos:          Record<string, PhotoMeta[]>;
}

export interface StringReading {
  id:           string;
  label:        string;  // "String 1", "String 2" …
  voltage:      string;  // V (Voc)
  current:      string;  // A (Isc)
  power:        string;  // W
  gToN:         string;  // G-to-N voltage (V)
  remarks:      string;
}

export interface WiFiInfo {
  connected: boolean;
  ssid:      string;
  password:  string;
}

export interface CustomerSignoff {
  name:      string;
  nic:       string;
  phone:     string;
  signatureDataUrl?: string;
  signedAt?: string;
}

export interface SiteChecklistState {
  systemType:    SystemType;
  serviceScope:  ServiceScope;
  siteCategory:  SiteCategory;
  tasks:         Record<string, TaskState>;
  strings:       StringReading[];
  wifi:          WiFiInfo;
  gpsLat?:       number;
  gpsLng?:       number;
  gpsUpdatedAt?: string;
  customer:      CustomerSignoff;
}

interface Props {
  checklistId: string;      // "{planId}_{projectNo}"
  planId:      string;
  projectNo:   string;
  projectName: string;
  planNo:      string;
  serviceDate: string;
  uploaderName: string;
  uploadedBy:  string;
  locked:      boolean;     // approved — read-only
  readOnly?:   boolean;     // config selectors locked (technician role)
  siteNote?:   string;      // per-site instructions from plan
  initialState?: Partial<SiteChecklistState>;
  onStateChange?: (s: SiteChecklistState) => void;
}

// ── Defaults ──────────────────────────────────────────────────────────────────
const DEFAULT_STATE: SiteChecklistState = {
  systemType:   "ongrid",
  serviceScope: "full",
  siteCategory: "standard",
  tasks: {},
  strings: [],
  wifi: { connected: false, ssid: "", password: "" },
  customer: { name: "", nic: "", phone: "" },
};

function newString(idx: number): StringReading {
  return { id: crypto.randomUUID(), label: `String ${idx + 1}`, voltage: "", current: "", power: "", gToN: "", remarks: "" };
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function SiteChecklist({
  checklistId, planId, projectNo, projectName, planNo, serviceDate,
  uploaderName, uploadedBy, locked, readOnly, siteNote, initialState, onStateChange,
}: Props) {
  const { toast } = useToast();
  const [state, setState] = useState<SiteChecklistState>(() => ({
    ...DEFAULT_STATE,
    ...(initialState || {}),
    tasks:    initialState?.tasks    ?? {},
    strings:  initialState?.strings  ?? [],
    wifi:     initialState?.wifi     ?? { connected: false, ssid: "", password: "" },
    customer: initialState?.customer ?? { name: "", nic: "", phone: "" },
  }));
  const [saveStatus,   setSaveStatus]   = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [gpsLoading,   setGpsLoading]   = useState(false);
  const [collapsed,    setCollapsed]    = useState<Set<string>>(new Set());
  const [lang,         setLang]         = useState<"en" | "si" | "ta">("en");
  const isMounted = useRef(false);

  // Sync to parent
  useEffect(() => { onStateChange?.(state); }, [state]);

  // ── Autosave (2s debounce, skip initial load) ─────────────────────────────
  const autoSave = useCallback(async (s: SiteChecklistState) => {
    setSaveStatus("saving");
    try {
      // Clean undefined values which cause Firestore to throw "Save failed"
      const cleanState = JSON.parse(JSON.stringify(s));
      await setDoc(doc(db, "service_checklists", checklistId), {
        id: checklistId, planId, projectNo,
        checklistV2: cleanState,
        updatedAt: serverTimestamp(),
      }, { merge: true });
      setSaveStatus("saved");
      setTimeout(() => setSaveStatus("idle"), 2000);
    } catch (err: any) {
      console.error("Autosave error:", err);
      setSaveStatus("error");
    }
  }, [checklistId, planId, projectNo]);

  useEffect(() => {
    if (!isMounted.current) { isMounted.current = true; return; }
    if (locked) return;
    const timer = setTimeout(() => autoSave(state), 2000);
    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  // ── Helpers ──────────────────────────────────────────────────────────────────
  const tasks = getTasksForSite(state.systemType, state.serviceScope, state.siteCategory);

  const label = (t: { label: string; labelSi: string; labelTa: string }) =>
    lang === "si" ? t.labelSi : lang === "ta" ? t.labelTa : t.label;

  const totalRequired = tasks.filter(t => t.isRequired).length;
  const doneRequired  = tasks.filter(t => t.isRequired && state.tasks[t.id]?.checked).length;
  const totalAll      = tasks.length;
  const doneAll       = tasks.filter(t => state.tasks[t.id]?.checked).length;

  // ── Task helpers ──────────────────────────────────────────────────────────────
  const updateTask = useCallback((id: string, patch: Partial<TaskState>) => {
    setState(s => {
      const base: TaskState = s.tasks[id] ?? { photos: {} as Record<string, PhotoMeta[]>, checked: false };
      return { ...s, tasks: { ...s.tasks, [id]: { ...base, ...patch } } };
    });
  }, []);

  const toggleTask = (task: ChecklistTask) => {
    if (locked) return;
    const cur = state.tasks[task.id];
    const now = new Date().toISOString();
    if (!cur?.startedAt && !cur?.checked) {
      // idle → started
      updateTask(task.id, { startedAt: now, checked: false, checkedAt: undefined, durationSecs: undefined, loggedByName: undefined, loggedByUid: undefined });
    } else if (cur?.startedAt && !cur?.checked) {
      // started → done: stamp who completed it
      const durationSecs = Math.round((Date.now() - new Date(cur.startedAt).getTime()) / 1000);
      updateTask(task.id, { checked: true, checkedAt: now, durationSecs, loggedByName: uploaderName || uploadedBy, loggedByUid: uploadedBy });
    } else {
      // done → idle: clear all
      updateTask(task.id, { checked: false, startedAt: undefined, checkedAt: undefined, durationSecs: undefined, loggedByName: undefined, loggedByUid: undefined, editedByName: undefined, editedByUid: undefined, editedAt: undefined });
    }
  };

  const addPhoto = (taskId: string, phase: string, photo: PhotoMeta) => {
    setState(s => {
      const cur = s.tasks[taskId] ?? { checked: false, photos: {} };
      const phasePhotos = cur.photos?.[phase] ?? [];
      return {
        ...s,
        tasks: {
          ...s.tasks,
          [taskId]: { ...cur, photos: { ...cur.photos, [phase]: [...phasePhotos, photo] } },
        },
      };
    });
  };

  const removePhoto = (taskId: string, phase: string, storagePath: string) => {
    setState(s => {
      const cur = s.tasks[taskId];
      if (!cur) return s;
      return {
        ...s,
        tasks: {
          ...s.tasks,
          [taskId]: {
            ...cur,
            photos: {
              ...cur.photos,
              [phase]: (cur.photos?.[phase] ?? []).filter(p => p.storagePath !== storagePath),
            },
          },
        },
      };
    });
  };

  // ── GPS ───────────────────────────────────────────────────────────────────────
  const captureGps = () => {
    if (!navigator.geolocation) { toast({ title: "GPS not available on this device", variant: "destructive" }); return; }
    setGpsLoading(true);
    navigator.geolocation.getCurrentPosition(
      pos => {
        setState(s => ({ ...s, gpsLat: pos.coords.latitude, gpsLng: pos.coords.longitude, gpsUpdatedAt: new Date().toISOString() }));
        setGpsLoading(false);
        toast({ title: "GPS location captured" });
      },
      () => { setGpsLoading(false); toast({ title: "GPS failed — try again or check permissions", variant: "destructive" }); },
      { enableHighAccuracy: true, timeout: 12000 }
    );
  };

  // ── String monitoring ─────────────────────────────────────────────────────────
  const addString = () => setState(s => ({ ...s, strings: [...s.strings, newString(s.strings.length)] }));
  const removeString = (id: string) => setState(s => ({ ...s, strings: s.strings.filter(st => st.id !== id) }));
  const updateString = (id: string, field: keyof StringReading, value: string) =>
    setState(s => ({ ...s, strings: s.strings.map(st => st.id === id ? { ...st, [field]: value } : st) }));

  // ── Helpers ───────────────────────────────────────────────────────────────────
  const fmtTime = (iso: string) =>
    new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const fmtDuration = (secs: number) => {
    if (secs < 60) return `${secs}s`;
    const m = Math.floor(secs / 60), s = secs % 60;
    return s > 0 ? `${m}m ${s}s` : `${m}m`;
  };

  // ── Upload context ────────────────────────────────────────────────────────────
  const uploadContext = { projectNo, projectName, planNo, serviceDate, uploaderName, uploadedBy };

  // ── Section collapse ──────────────────────────────────────────────────────────
  const toggleSection = (cat: string) =>
    setCollapsed(s => { const n = new Set(s); n.has(cat) ? n.delete(cat) : n.add(cat); return n; });

  // ── Group tasks by category ───────────────────────────────────────────────────
  const grouped: Partial<Record<TaskCategory, ChecklistTask[]>> = {};
  for (const t of tasks) {
    if (!grouped[t.category]) grouped[t.category] = [];
    grouped[t.category]!.push(t);
  }

  // ── Category order ────────────────────────────────────────────────────────────
  const CAT_ORDER: TaskCategory[] = [
    "serial", "shutdown",
    "roof", "outdoor", "battery", "main_panel",
    "wifi_router", "handover",
    "troubleshooting", "repair", "expansion_checks",
  ];

  return (
    <div className="space-y-4 text-sm">

      {/* ── Language + Config bar ── */}
      <div className="flex items-center gap-2 flex-wrap">
        {/* Lang */}
        <div className="flex rounded-lg border border-border/60 overflow-hidden text-[10px] font-black">
          {(["en","si","ta"] as const).map(l => (
            <button key={l} onClick={() => setLang(l)}
              className={cn("px-2.5 py-1.5 uppercase transition-colors",
                lang === l ? "bg-primary text-primary-foreground" : "hover:bg-muted text-muted-foreground"
              )}>
              {l === "en" ? "ENG" : l === "si" ? "සිං" : "தமி"}
            </button>
          ))}
        </div>

        <div className="flex-1 min-w-0 flex gap-1.5 flex-wrap">
          {/* System type */}
          <select
            value={state.systemType}
            onChange={e => setState(s => ({ ...s, systemType: e.target.value as SystemType }))}
            disabled={locked || readOnly}
            className="h-8 text-xs rounded-lg border border-input bg-background px-2 font-semibold focus:outline-none disabled:opacity-70 disabled:cursor-not-allowed"
          >
            {(Object.keys(SYSTEM_TYPE_LABELS) as SystemType[]).map(k => (
              <option key={k} value={k}>{SYSTEM_TYPE_LABELS[k].label}</option>
            ))}
          </select>
          {/* Visit type */}
          <div className="flex items-center gap-1">
            <span className="text-[9px] font-black uppercase text-muted-foreground/60 shrink-0">Visit</span>
            <select
              value={state.serviceScope}
              onChange={e => setState(s => ({ ...s, serviceScope: e.target.value as ServiceScope }))}
              disabled={locked || readOnly}
              className="h-8 text-xs rounded-lg border border-primary/40 bg-background px-2 font-semibold text-primary focus:outline-none disabled:opacity-70 disabled:cursor-not-allowed"
            >
              {(Object.keys(SERVICE_SCOPE_LABELS) as ServiceScope[]).map(k => (
                <option key={k} value={k}>{SERVICE_SCOPE_LABELS[k].label}</option>
              ))}
            </select>
          </div>
          {/* Site category */}
          <select
            value={state.siteCategory}
            onChange={e => setState(s => ({ ...s, siteCategory: e.target.value as SiteCategory }))}
            disabled={locked || readOnly}
            className="h-8 text-xs rounded-lg border border-input bg-background px-2 font-semibold focus:outline-none disabled:opacity-70 disabled:cursor-not-allowed"
          >
            {(Object.keys(SITE_CATEGORY_LABELS) as SiteCategory[]).map(k => (
              <option key={k} value={k}>{SITE_CATEGORY_LABELS[k].label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* ── Site-specific instructions ── */}
      {siteNote && (
        <div className="flex items-start gap-2 rounded-xl border border-amber-300 bg-amber-50 dark:border-amber-800/50 dark:bg-amber-950/20 px-3 py-2.5">
          <AlertTriangle className="h-3.5 w-3.5 text-amber-600 shrink-0 mt-0.5" />
          <p className="text-xs font-semibold text-amber-800 dark:text-amber-300 leading-snug">{siteNote}</p>
        </div>
      )}

      {/* ── Progress bar ── */}
      <div className="space-y-1">
        <div className="flex justify-between text-[10px] text-muted-foreground">
          <span>{doneAll}/{totalAll} tasks · {doneRequired}/{totalRequired} required</span>
          <div className="flex items-center gap-2">
            {saveStatus === "saving" && <span className="flex items-center gap-1 text-amber-600 font-bold"><Loader2 className="h-2.5 w-2.5 animate-spin" />Saving…</span>}
            {saveStatus === "saved"  && <span className="flex items-center gap-1 text-emerald-600 font-bold"><Check className="h-2.5 w-2.5" />Saved</span>}
            {saveStatus === "error"  && <span className="flex items-center gap-1 text-red-500 font-bold"><AlertTriangle className="h-2.5 w-2.5" />Save failed</span>}
            <span className="font-bold text-foreground">{totalAll > 0 ? Math.round((doneAll/totalAll)*100) : 0}%</span>
          </div>
        </div>
        <div className="h-2 bg-muted rounded-full overflow-hidden">
          <div className="h-full bg-emerald-500 rounded-full transition-all"
               style={{ width: `${totalAll > 0 ? (doneAll/totalAll)*100 : 0}%` }} />
        </div>
        {doneRequired < totalRequired && (
          <p className="text-[9px] text-amber-600 font-bold flex items-center gap-1">
            <AlertTriangle className="h-3 w-3" /> {totalRequired - doneRequired} required task{totalRequired - doneRequired !== 1 ? "s" : ""} not done
          </p>
        )}
      </div>

      {/* ── GPS capture ── */}
      <div className={cn("rounded-xl border p-3 space-y-2",
        state.gpsLat ? "border-emerald-200 bg-emerald-50/50 dark:border-emerald-900/40 dark:bg-emerald-950/20"
                     : "border-border bg-muted/10")}>
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
            <MapPin className="h-3 w-3" /> GPS Location
          </span>
          {state.gpsLat && (
            <span className="text-[9px] text-emerald-600 font-bold">
              {state.gpsLat.toFixed(5)}, {state.gpsLng?.toFixed(5)}
            </span>
          )}
        </div>
        {!locked && (
          <button onClick={captureGps} disabled={gpsLoading}
            className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg border-2 border-dashed border-emerald-400 text-emerald-700 text-xs font-bold hover:bg-emerald-50 transition-colors disabled:opacity-60">
            {gpsLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <MapPin className="h-3.5 w-3.5" />}
            {state.gpsLat ? "Update GPS Location" : "Capture GPS Location"}
          </button>
        )}
        {state.gpsUpdatedAt && (
          <p className="text-[9px] text-muted-foreground">
            Captured {new Date(state.gpsUpdatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          </p>
        )}
      </div>

      {/* ── Task sections ── */}
      {CAT_ORDER.filter(cat => grouped[cat]).map(cat => {
        const catTasks = grouped[cat] || [];
        const catMeta  = TASK_CATEGORY_LABELS[cat];
        const catDone  = catTasks.filter(t => state.tasks[t.id]?.checked).length;
        const isOpen   = !collapsed.has(cat);
        return (
          <div key={cat} className="rounded-xl border border-border/60 overflow-hidden">
            {/* Section header */}
            <button
              className="w-full flex items-center gap-2 px-3 py-2.5 bg-muted/30 hover:bg-muted/50 transition-colors text-left"
              onClick={() => toggleSection(cat)}
            >
              <span className="text-base">{catMeta.icon}</span>
              <div className="flex-1 min-w-0">
                <span className="text-xs font-black text-foreground">{label(catMeta)}</span>
              </div>
              <span className={cn("text-[10px] font-bold px-1.5 py-0.5 rounded-full",
                catDone === catTasks.length
                  ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400"
                  : "bg-muted text-muted-foreground"
              )}>
                {catDone}/{catTasks.length}
              </span>
              {isOpen ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
            </button>

            {isOpen && (
              <div className="divide-y divide-border/40">
                {catTasks.map(task => {
                  const ts         = state.tasks[task.id] ?? { checked: false, photos: {} };
                  const isStarted  = !!ts.startedAt && !ts.checked;
                  const isDone     = ts.checked;
                  return (
                    <div key={task.id} className={cn("p-3 space-y-2.5",
                      isDone    ? "bg-emerald-50/40 dark:bg-emerald-950/10" :
                      isStarted ? "bg-amber-50/40 dark:bg-amber-950/10" : "")}>

                      {/* Checkbox row */}
                      <div className="flex items-start gap-3">
                        <button
                          onClick={() => toggleTask(task)}
                          disabled={locked}
                          className={cn(
                            "mt-0.5 h-5 w-5 rounded-md border-2 shrink-0 flex items-center justify-center transition-colors",
                            isDone    ? "bg-emerald-600 border-emerald-600" :
                            isStarted ? "border-amber-500 bg-amber-100 dark:bg-amber-950/40" :
                                        "border-muted-foreground/40 hover:border-primary"
                          )}
                        >
                          {isDone    && <Check className="h-3 w-3 text-white" />}
                          {isStarted && <span className="h-2 w-2 rounded-full bg-amber-500 animate-pulse" />}
                        </button>
                        <div className="flex-1 min-w-0">
                          <p className={cn("text-[11px] font-semibold leading-snug",
                            isDone ? "text-emerald-800 dark:text-emerald-300 line-through decoration-emerald-400" :
                            isStarted ? "text-amber-800 dark:text-amber-300" : "text-foreground"
                          )}>{label(task)}</p>
                          {/* Timing + attribution */}
                          {isDone && ts.startedAt && ts.checkedAt && (
                            <span className="text-[9px] text-emerald-600 font-mono font-bold flex items-center gap-1 mt-0.5">
                              {fmtTime(ts.startedAt)} → {fmtTime(ts.checkedAt)}
                              {ts.durationSecs !== undefined && <span className="text-emerald-500">· {fmtDuration(ts.durationSecs)}</span>}
                            </span>
                          )}
                          {isDone && ts.loggedByName && (
                            <span className="text-[9px] text-muted-foreground flex items-center gap-1">
                              by <span className="font-bold text-foreground">{ts.loggedByName}</span>
                              {ts.editedByName && <span className="text-amber-600 font-bold">· edited by {ts.editedByName}</span>}
                            </span>
                          )}
                          {isStarted && ts.startedAt && (
                            <span className="text-[9px] text-amber-600 font-bold mt-0.5 flex items-center gap-1">
                              Started {fmtTime(ts.startedAt)} — tap to complete
                            </span>
                          )}
                          {!isDone && !isStarted && task.isRequired && (
                            <span className="text-[9px] text-amber-600 font-bold">Required</span>
                          )}
                        </div>
                      </div>

                      {/* Text input (serial no, meter reading, notes, etc.) */}
                      {task.hasTextInput && (
                        <div className="ml-8 space-y-1">
                          <label className="text-[10px] font-bold text-muted-foreground">{task.inputLabel}</label>
                          {task.inputType === "textarea" ? (
                            <textarea
                              value={ts.textValue || ""}
                              onChange={e => updateTask(task.id, { textValue: e.target.value })}
                              disabled={locked}
                              placeholder={task.inputPlaceholder}
                              rows={3}
                              className="w-full text-xs rounded-lg border border-border/60 bg-background px-2.5 py-2 focus:outline-none focus:ring-1 focus:ring-primary/40 resize-y placeholder:text-muted-foreground/50"
                            />
                          ) : (
                            <input
                              type={task.inputType === "number" ? "number" : "text"}
                              value={ts.textValue || ""}
                              onChange={e => updateTask(task.id, { textValue: e.target.value })}
                              disabled={locked}
                              placeholder={task.inputPlaceholder}
                              step={task.inputType === "number" ? "any" : undefined}
                              className="w-full text-xs rounded-lg border border-border/60 bg-background px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-primary/40 font-mono"
                            />
                          )}
                        </div>
                      )}

                      {/* Photo uploads */}
                      {task.requiresPhoto && task.photoPhases && (
                        <div className="ml-8 space-y-2">
                          {task.photoPhases.map(phase => (
                            <PhotoUploadButton
                              key={phase}
                              phase={phase}
                              taskId={task.id}
                              suggestions={[
                                ...(lang === "si" ? (task.photoCommentSuggestionsSi || task.photoCommentSuggestions || []) :
                                    lang === "ta" ? (task.photoCommentSuggestionsTa || task.photoCommentSuggestions || []) :
                                    (task.photoCommentSuggestions || [])),
                              ]}
                              existingPhotos={ts.photos?.[phase] ?? []}
                              onUploaded={photo => addPhoto(task.id, phase, photo)}
                              onRemove={path => removePhoto(task.id, phase, path)}
                              uploadContext={uploadContext}
                              disabled={locked}
                            />
                          ))}
                        </div>
                      )}

                      {/* Notes field for issue-type photos */}
                      {task.photoPhases?.includes("issue") && (
                        <div className="ml-8">
                          <textarea
                            value={ts.notes || ""}
                            onChange={e => updateTask(task.id, { notes: e.target.value })}
                            disabled={locked}
                            placeholder="Describe the issue or condition found…"
                            rows={2}
                            className="w-full text-xs rounded-lg border border-border/60 bg-background px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-primary/40 resize-none placeholder:text-muted-foreground/50"
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}

      {/* ── PV String Monitoring ── */}
      <div className="rounded-xl border border-border/60 overflow-hidden">
        <button
          className="w-full flex items-center gap-2 px-3 py-2.5 bg-muted/30 hover:bg-muted/50 transition-colors text-left"
          onClick={() => toggleSection("strings")}
        >
          <span className="text-base">📊</span>
          <div className="flex-1 min-w-0">
            <span className="text-xs font-black text-foreground">
              {lang === "si" ? "PV String Monitoring" : lang === "ta" ? "PV நாண் கண்காணிப்பு" : "PV String Monitoring"}
            </span>
          </div>
          <span className="text-[10px] text-muted-foreground font-bold">{state.strings.length} string{state.strings.length !== 1 ? "s" : ""}</span>
          {collapsed.has("strings") ? <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />}
        </button>

        {!collapsed.has("strings") && (
          <div className="p-3 space-y-3">
            {state.strings.length === 0 && (
              <p className="text-xs text-muted-foreground text-center py-2">No strings added yet. Add String 1 below.</p>
            )}
            {state.strings.map((st, idx) => (
              <div key={st.id} className="rounded-xl border border-border/50 p-3 space-y-2.5">
                <div className="flex items-center justify-between">
                  <input
                    type="text"
                    value={st.label}
                    onChange={e => updateString(st.id, "label", e.target.value)}
                    disabled={locked}
                    className="text-xs font-black bg-transparent border-0 outline-none text-foreground w-24"
                  />
                  {!locked && (
                    <button onClick={() => removeString(st.id)}
                      className="h-6 w-6 flex items-center justify-center text-muted-foreground hover:text-destructive rounded">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {([
                    { field: "voltage", label: "Voltage (V)", placeholder: "e.g. 420.5" },
                    { field: "current", label: "Current (A)", placeholder: "e.g. 8.2" },
                    { field: "power",   label: "Power (W)",   placeholder: "e.g. 3444" },
                    { field: "gToN",    label: "G-N Voltage (V)", placeholder: "e.g. 0.5" },
                  ] as const).map(f => (
                    <div key={f.field} className="space-y-0.5">
                      <label className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">{f.label}</label>
                      <input
                        type="number"
                        value={st[f.field]}
                        onChange={e => updateString(st.id, f.field, e.target.value)}
                        disabled={locked}
                        placeholder={f.placeholder}
                        step="any"
                        className="w-full text-xs rounded-lg border border-border/60 bg-background px-2 py-1.5 font-mono focus:outline-none focus:ring-1 focus:ring-primary/40"
                      />
                    </div>
                  ))}
                </div>
                <div className="space-y-0.5">
                  <label className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">
                    {lang === "si" ? "සටහන" : lang === "ta" ? "கருத்துகள்" : "Remarks"}
                  </label>
                  <input
                    type="text"
                    value={st.remarks}
                    onChange={e => updateString(st.id, "remarks", e.target.value)}
                    disabled={locked}
                    placeholder="e.g. Normal, Low voltage, Shading on row 2…"
                    className="w-full text-xs rounded-lg border border-border/60 bg-background px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-primary/40"
                  />
                </div>
              </div>
            ))}
            {!locked && (
              <button onClick={addString}
                className="w-full flex items-center justify-center gap-1.5 py-2 rounded-xl border-2 border-dashed border-primary/40 text-primary text-xs font-bold hover:bg-primary/5 transition-colors">
                <Plus className="h-3.5 w-3.5" /> Add String
              </button>
            )}
          </div>
        )}
      </div>

      {/* ── WiFi ── */}
      <div className="rounded-xl border border-border/60 p-3 space-y-2.5">
        <div className="flex items-center gap-2">
          {state.wifi.connected
            ? <Wifi className="h-4 w-4 text-emerald-600" />
            : <WifiOff className="h-4 w-4 text-muted-foreground" />}
          <span className="text-xs font-black">
            {lang === "si" ? "WiFi / Monitoring" : lang === "ta" ? "WiFi / கண்காணிப்பு" : "WiFi / Monitoring"}
          </span>
          <div className="ml-auto flex rounded-lg border border-border/60 overflow-hidden text-[10px] font-bold">
            <button
              onClick={() => !locked && setState(s => ({ ...s, wifi: { ...s.wifi, connected: true } }))}
              className={cn("px-2.5 py-1 transition-colors",
                state.wifi.connected ? "bg-emerald-600 text-white" : "hover:bg-muted text-muted-foreground")}>
              {lang === "si" ? "සම්බන්ධ" : lang === "ta" ? "இணைந்தது" : "Connected"}
            </button>
            <button
              onClick={() => !locked && setState(s => ({ ...s, wifi: { ...s.wifi, connected: false } }))}
              className={cn("px-2.5 py-1 transition-colors",
                !state.wifi.connected ? "bg-slate-500 text-white" : "hover:bg-muted text-muted-foreground")}>
              {lang === "si" ? "නොමැත" : lang === "ta" ? "இல்லை" : "Not found"}
            </button>
          </div>
        </div>
        {state.wifi.connected && (
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-0.5">
              <label className="text-[9px] font-black uppercase text-muted-foreground">SSID / Network Name</label>
              <input type="text" value={state.wifi.ssid}
                onChange={e => setState(s => ({ ...s, wifi: { ...s.wifi, ssid: e.target.value } }))}
                disabled={locked} placeholder="e.g. HomeNetwork"
                className="w-full text-xs rounded-lg border border-border/60 bg-background px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-primary/40" />
            </div>
            <div className="space-y-0.5">
              <label className="text-[9px] font-black uppercase text-muted-foreground">Password</label>
              <input type="text" value={state.wifi.password}
                onChange={e => setState(s => ({ ...s, wifi: { ...s.wifi, password: e.target.value } }))}
                disabled={locked} placeholder="WiFi password"
                className="w-full text-xs rounded-lg border border-border/60 bg-background px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-primary/40 font-mono" />
            </div>
          </div>
        )}
      </div>

      {/* ── Customer Sign-off ── */}
      <div className="rounded-xl border border-border/60 p-3 space-y-3">
        <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
          🤝 {lang === "si" ? "පාරිභෝගික භාරදීම" : lang === "ta" ? "வாடிக்கையாளர் ஒப்படைப்பு" : "Customer Sign-off"}
        </p>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          {([
            { field: "name",  label: lang === "si" ? "නම" : lang === "ta" ? "பெயர்" : "Full Name",   placeholder: "Customer name" },
            { field: "nic",   label: lang === "si" ? "NIC" : lang === "ta" ? "NIC" : "NIC / ID No.",  placeholder: "e.g. 199012345678" },
            { field: "phone", label: lang === "si" ? "දුරකථනය" : lang === "ta" ? "தொலைபேசி" : "Phone", placeholder: "e.g. 0771234567" },
          ] as const).map(f => (
            <div key={f.field} className="space-y-0.5">
              <label className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">{f.label}</label>
              <input type="text" value={state.customer[f.field]}
                onChange={e => setState(s => ({ ...s, customer: { ...s.customer, [f.field]: e.target.value } }))}
                disabled={locked} placeholder={f.placeholder}
                className="w-full text-xs rounded-lg border border-border/60 bg-background px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-primary/40" />
            </div>
          ))}
        </div>
        <div className="space-y-1">
          <label className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">
            {lang === "si" ? "ඩිජිටල් අත්සන" : lang === "ta" ? "டிஜிட்டல் கையொப்பம்" : "Digital Signature"}
          </label>
          <SignaturePad
            onSave={dataUrl => setState(s => ({ ...s, customer: { ...s.customer, signatureDataUrl: dataUrl, signedAt: new Date().toISOString() } }))}
            existingDataUrl={state.customer.signatureDataUrl}
            disabled={locked}
          />
        </div>
      </div>

      {/* Autosave — no manual button needed */}
    </div>
  );
}
