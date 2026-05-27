"use client";

import { useEffect, useState, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  doc, getDoc, updateDoc, addDoc, collection, query, where,
  onSnapshot, serverTimestamp, orderBy,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  ArrowLeft, Wrench, MapPin, Sun, User, Receipt,
  Calendar, Zap, CheckCircle2, Loader2, Edit, Navigation, Pencil, X, Save, Plus,
  MessageSquare, ClipboardList, Trash2, ShieldCheck,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import Link from "next/link";

const LABOUR_RATE_PER_KW = 2500;
const PER_KM_RATE = 80;

const fmtRs  = (n: number) => `Rs. ${Math.round(n).toLocaleString()}`;
const fmtDate = (s: string) => {
  try { return new Date(s).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }); }
  catch { return s; }
};
const fmtTs = (ts: any): string => {
  if (!ts) return "";
  try {
    const d = ts?.toDate ? ts.toDate() : new Date(ts);
    return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
  } catch { return ""; }
};

const SERVICE_TYPE_ICONS: Record<string, string> = {
  maintenance: "🔧", troubleshoot: "🩺", expansion: "➕", repair: "🛠️",
  inspection: "🔍", emergency: "⚡", upgrade: "⬆️", other: "📋",
};

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  pending:             { label: "Pending",           color: "bg-slate-100 text-slate-700 border-slate-200" },
  in_progress:         { label: "In Progress",       color: "bg-amber-100 text-amber-700 border-amber-200" },
  completed:           { label: "Completed",         color: "bg-emerald-100 text-emerald-700 border-emerald-200" },
  quotation_generated: { label: "Invoice Generated", color: "bg-blue-100 text-blue-700 border-blue-200" },
  invoice_generated:   { label: "Paid",              color: "bg-emerald-100 text-emerald-700 border-emerald-200" },
};

const NOTE_TYPES: Record<string, { label: string; cardColor: string; badge: string; icon: string }> = {
  technician_remark:     { label: "Technician Remark",     cardColor: "border-blue-200 bg-blue-50/60 dark:bg-blue-950/20 dark:border-blue-900",             badge: "bg-blue-100 text-blue-700 border-blue-200",       icon: "🔧" },
  engineer_confirmation: { label: "Engineer Confirmation", cardColor: "border-emerald-200 bg-emerald-50/60 dark:bg-emerald-950/20 dark:border-emerald-900", badge: "bg-emerald-100 text-emerald-700 border-emerald-200", icon: "✅" },
  admin_note:            { label: "Admin Note",            cardColor: "border-amber-200 bg-amber-50/60 dark:bg-amber-950/20 dark:border-amber-900",         badge: "bg-amber-100 text-amber-700 border-amber-200",     icon: "📋" },
  general:               { label: "Note",                  cardColor: "border-border bg-muted/20",                                                          badge: "bg-slate-100 text-slate-600 border-slate-200",     icon: "💬" },
};

interface MaterialLine { name: string; qty: string; unitPrice: string; }

export default function ServiceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const { toast } = useToast();

  // Core
  const [service,  setService]  = useState<any>(null);
  const [invoice,  setInvoice]  = useState<any>(null);
  const [receipts, setReceipts] = useState<any[]>([]);
  const [loading,  setLoading]  = useState(true);

  // Notes
  const [notes,      setNotes]      = useState<any[]>([]);
  const [addingNote, setAddingNote] = useState(false);
  const [noteForm,   setNoteForm]   = useState({ text: "", type: "general" });
  const [savingNote, setSavingNote] = useState(false);

  // Checklist
  const [checklist, setChecklist] = useState<any>(null);

  // Cost editing
  const [editingCosts, setEditingCosts] = useState(false);
  const [costForm, setCostForm] = useState({
    labourCost: "", distanceCost: "",
    materials: [] as MaterialLine[],
    isFreeService: false,
  });
  const [savingCosts, setSavingCosts] = useState(false);

  // Service number editing
  const [fixingNo,         setFixingNo]         = useState(false);
  const [editingServiceNo, setEditingServiceNo] = useState(false);
  const [seqInput,         setSeqInput]         = useState("");
  const [savingServiceNo,  setSavingServiceNo]  = useState(false);

  // Invoice total editing
  const [editingInvoiceTotal, setEditingInvoiceTotal] = useState(false);
  const [invoiceTotalInput,   setInvoiceTotalInput]   = useState("");
  const [savingInvoiceTotal,  setSavingInvoiceTotal]  = useState(false);

  const [creatingInvoice, setCreatingInvoice] = useState(false);

  useEffect(() => {
    if (!id) return;

    getDoc(doc(db, "services", id)).then(snap => {
      if (!snap.exists()) { setLoading(false); return; }
      setService({ id: snap.id, ...snap.data() });
      setLoading(false);
    });

    const unsubInv = onSnapshot(
      query(collection(db, "serviceInvoices"), where("serviceId", "==", id)),
      snap => { if (!snap.empty) setInvoice({ id: snap.docs[0].id, ...snap.docs[0].data() }); }
    );
    const unsubRec = onSnapshot(
      query(collection(db, "receipts"), where("serviceId", "==", id)),
      snap => setReceipts(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    );
    const unsubNotes = onSnapshot(
      query(collection(db, "serviceNotes"), where("serviceId", "==", id), orderBy("createdAt", "asc")),
      snap => setNotes(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    );
    const unsubCl = onSnapshot(
      query(collection(db, "service_checklists"), where("serviceId", "==", id)),
      snap => { if (!snap.empty) setChecklist({ id: snap.docs[0].id, ...snap.docs[0].data() }); }
    );

    return () => { unsubInv(); unsubRec(); unsubNotes(); unsubCl(); };
  }, [id]);

  // ── Service Number ────────────────────────────────────────────
  const fixServiceNo = async () => {
    if (!service) return;
    setFixingNo(true);
    try {
      const { getDocs, collection: col, query: q, where: wh } = await import("firebase/firestore");
      const byProjectSnap = await getDocs(q(col(db, "services"), wh("projectNo", "==", service.projectNo)));
      let maxSeq = 0;
      byProjectSnap.forEach(d => {
        if (d.id === id) return;
        maxSeq++;
        const no: string = d.data().serviceNo || "";
        const prefix = `SRV-${service.projectNo}/`;
        if (no.startsWith(prefix)) {
          const n = parseInt(no.split("/")[1] || "0", 10);
          if (n > maxSeq) maxSeq = n;
        }
      });
      setSeqInput(String(maxSeq + 1).padStart(3, "0"));
      setEditingServiceNo(true);
    } catch (err: any) {
      toast({ title: "Failed to calculate", description: err.message, variant: "destructive" });
    } finally { setFixingNo(false); }
  };

  const saveServiceNo = async () => {
    const rawSeq = seqInput.trim();
    if (!rawSeq || !service) return;
    const seq = /^\d+$/.test(rawSeq) ? rawSeq.padStart(3, "0") : rawSeq;
    const suffix        = service.isFreeService ? "F" : "P";
    const cleanServiceNo  = `SRV-${service.projectNo}/${seq}/${suffix}`;
    const derivedInvoiceNo = `SINV/${service.projectNo}/${seq}/${suffix}`;
    setSavingServiceNo(true);
    try {
      await updateDoc(doc(db, "services", id), { serviceNo: cleanServiceNo, invoiceNo: derivedInvoiceNo, updatedAt: serverTimestamp() });
      setService((prev: any) => ({ ...prev, serviceNo: cleanServiceNo, invoiceNo: derivedInvoiceNo }));
      if (invoice) {
        await updateDoc(doc(db, "serviceInvoices", invoice.id), { invoiceNo: derivedInvoiceNo, serviceNo: cleanServiceNo, updatedAt: serverTimestamp() });
      }
      for (const rec of receipts) {
        await updateDoc(doc(db, "receipts", rec.id), { serviceNo: cleanServiceNo });
      }
      setEditingServiceNo(false);
      toast({ title: "Service number updated", description: cleanServiceNo });
    } catch (err: any) {
      toast({ title: "Failed to update service number", description: err.message, variant: "destructive" });
    } finally { setSavingServiceNo(false); }
  };

  // ── Invoice Total ─────────────────────────────────────────────
  const saveInvoiceTotal = async () => {
    if (!invoice) return;
    const total = parseFloat(invoiceTotalInput) || 0;
    setSavingInvoiceTotal(true);
    try {
      await updateDoc(doc(db, "serviceInvoices", invoice.id), { total, updatedAt: serverTimestamp() });
      setEditingInvoiceTotal(false);
      toast({ title: "Invoice total updated", description: fmtRs(total) });
    } catch (err: any) {
      toast({ title: "Failed", description: err.message, variant: "destructive" });
    } finally { setSavingInvoiceTotal(false); }
  };

  // ── Costs ─────────────────────────────────────────────────────
  const startEditCosts = () => {
    const c = service?.costs || {};
    setCostForm({
      labourCost:    c.labourCost?.toString()   || "",
      distanceCost:  c.distanceCost?.toString() || "",
      materials: (c.materials || []).map((m: any) => ({
        name: m.name || "", qty: String(m.qty || 1), unitPrice: String(m.unitPrice || 0),
      })),
      isFreeService: !!service?.isFreeService,
    });
    setEditingCosts(true);
  };

  const addMaterialRow = () =>
    setCostForm(p => ({ ...p, materials: [...p.materials, { name: "", qty: "1", unitPrice: "0" }] }));

  const removeMaterialRow = (i: number) =>
    setCostForm(p => ({ ...p, materials: p.materials.filter((_, idx) => idx !== i) }));

  const updateMaterial = (i: number, field: keyof MaterialLine, val: string) =>
    setCostForm(p => {
      const ms = [...p.materials];
      ms[i] = { ...ms[i], [field]: val };
      return { ...p, materials: ms };
    });

  const saveCosts = async () => {
    if (!service) return;
    setSavingCosts(true);
    try {
      const labour   = parseFloat(costForm.labourCost)   || 0;
      const distance = parseFloat(costForm.distanceCost) || 0;
      const materials = costForm.materials
        .filter(m => m.name.trim())
        .map(m => ({ name: m.name.trim(), qty: parseFloat(m.qty) || 1, unitPrice: parseFloat(m.unitPrice) || 0 }));
      const materialCost = materials.reduce((s, m) => s + m.qty * m.unitPrice, 0);
      const total    = labour + distance + materialCost;
      const isFree   = costForm.isFreeService;
      const newCosts = {
        ...(service.costs || {}),
        labourCost: labour, distanceCost: distance,
        materialCost, materials, totalCost: total,
        perKmRate: PER_KM_RATE,
      };
      await updateDoc(doc(db, "services", id), { costs: newCosts, isFreeService: isFree, updatedAt: serverTimestamp() });
      if (invoice) {
        await updateDoc(doc(db, "serviceInvoices", invoice.id), {
          total: isFree ? 0 : total,
          labourCost: labour, travelCost: distance, materialCost,
          isFreeService: isFree, updatedAt: serverTimestamp(),
        });
      }
      setService((prev: any) => ({ ...prev, costs: newCosts, isFreeService: isFree }));
      setEditingCosts(false);
      toast({ title: "Costs updated", description: isFree ? "Free service" : `Total: ${fmtRs(total)}` });
    } catch (err: any) {
      toast({ title: "Failed to save costs", description: err.message, variant: "destructive" });
    } finally { setSavingCosts(false); }
  };

  // ── Notes ─────────────────────────────────────────────────────
  const saveNote = async () => {
    if (!noteForm.text.trim() || !service) return;
    setSavingNote(true);
    try {
      await addDoc(collection(db, "serviceNotes"), {
        serviceId: id,
        projectNo: service.projectNo,
        text: noteForm.text.trim(),
        type: noteForm.type,
        authorId:   user?.uid || "",
        authorName: (user as any)?.displayName || user?.email || "Unknown",
        authorRole: user?.role || "unknown",
        createdAt: serverTimestamp(),
      });
      setNoteForm({ text: "", type: "general" });
      setAddingNote(false);
      toast({ title: "Note added" });
    } catch (err: any) {
      toast({ title: "Failed to add note", description: err.message, variant: "destructive" });
    } finally { setSavingNote(false); }
  };

  // ── Mark Complete / Create Invoice ────────────────────────────
  const markComplete = async () => {
    await updateDoc(doc(db, "services", id), { status: "completed", completedAt: new Date().toISOString(), updatedAt: serverTimestamp() });
    toast({ title: "Service marked complete" });
    setService((prev: any) => ({ ...prev, status: "completed" }));
  };

  const createInvoice = async () => {
    if (!service) return;
    setCreatingInvoice(true);
    try {
      const costs = service.costs || {};
      const totalCost = service.isFreeService ? 0 : (costs.totalCost || 0);
      const freeOrPaid = service.isFreeService ? "F" : "P";
      const projectNo = service.projectNo || "";
      const seqNo = (service.serviceNo || "").split("/")[1] || "001";
      const invoiceNo = `SINV/${projectNo}/${seqNo}/${freeOrPaid}`;
      const items = [
        ...(costs.labourCost > 0 ? [{ description: `Labour — ${service.serviceType || "Service"}`, amount: costs.labourCost }] : []),
        ...(costs.materials || []).filter((m: any) => m.name?.trim()).map((m: any) => ({
          description: m.name, qty: m.qty, unitPrice: m.unitPrice, amount: (m.qty || 0) * (m.unitPrice || 0),
        })),
        ...(costs.distanceCost > 0 ? [{ description: "Transport", amount: costs.distanceCost }] : []),
      ];
      const invRef = await addDoc(collection(db, "serviceInvoices"), {
        invoiceNo, serviceId: id, serviceNo: service.serviceNo, projectNo,
        type: "service", serviceType: service.serviceType, scheduledDate: service.scheduledDate,
        customer: service.customer || {},
        items, labourCost: costs.labourCost || 0, materialCost: costs.materialCost || 0,
        travelCost: costs.distanceCost || 0, total: totalCost,
        paymentStatus: service.isFreeService ? "free" : "pending_payment",
        paidAmount: 0, isFreeService: !!service.isFreeService,
        createdBy: user?.uid || "", createdAt: serverTimestamp(),
      });
      await updateDoc(doc(db, "services", id), { invoiceId: invRef.id, invoiceNo, updatedAt: serverTimestamp() });
      toast({ title: "Invoice created", description: invoiceNo });
    } catch (err: any) {
      toast({ title: "Failed to create invoice", description: err.message, variant: "destructive" });
    } finally { setCreatingInvoice(false); }
  };

  // ── Derived ───────────────────────────────────────────────────
  const checklistStats = useMemo(() => {
    if (!checklist?.tasks) return null;
    const tasks = Object.values(checklist.tasks) as any[];
    const total = tasks.length;
    const done  = tasks.filter((t: any) => t.done).length;
    return { total, done, pct: total > 0 ? Math.round(done / total * 100) : 0 };
  }, [checklist]);

  const allowedNoteTypes = useMemo(() => {
    const role = user?.role;
    if (role === "superadmin" || role === "admin") return Object.keys(NOTE_TYPES);
    if (role === "engineer") return ["engineer_confirmation", "general"];
    if (role === "technician") return ["technician_remark", "general"];
    return ["general"];
  }, [user?.role]);

  const costFormTotal = useMemo(() => {
    const labour   = parseFloat(costForm.labourCost)   || 0;
    const distance = parseFloat(costForm.distanceCost) || 0;
    const mats     = costForm.materials.reduce((s, m) => s + (parseFloat(m.qty) || 0) * (parseFloat(m.unitPrice) || 0), 0);
    return labour + distance + mats;
  }, [costForm]);

  const autoLabour   = service ? (service.capacity || 0) * LABOUR_RATE_PER_KW : 0;
  const autoTravel   = service?.location?.distanceKm ? service.location.distanceKm * 2 * PER_KM_RATE : 0;

  // ── Loading / Not Found ───────────────────────────────────────
  if (loading) return (
    <div className="flex h-screen items-center justify-center">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    </div>
  );
  if (!service) return (
    <div className="flex flex-col h-screen items-center justify-center gap-3">
      <Wrench className="h-10 w-10 text-muted-foreground/30" />
      <p className="text-muted-foreground font-medium">Service record not found.</p>
      <Button variant="outline" size="sm" onClick={() => router.push("/services")}>Back to Services</Button>
    </div>
  );

  const costs        = service.costs || {};
  const statusCfg    = STATUS_CONFIG[service.status] || STATUS_CONFIG.pending;
  const totalPaid    = receipts.reduce((s: number, r: any) => s + (r.amount || 0), 0);
  const invoiceTotal = invoice?.total ?? costs.totalCost ?? 0;
  const balance      = invoiceTotal - totalPaid;
  const isFullyPaid  = !service.isFreeService && invoiceTotal > 0 && balance <= 0;
  const isFree       = !!service.isFreeService;
  const isAdmin      = user?.role === "superadmin" || user?.role === "admin";

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto space-y-5">

      {/* ── Header ─────────────────────────────────────────────── */}
      <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => router.push("/services")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex-1 min-w-0">
            {editingServiceNo ? (
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="font-mono text-sm font-black text-muted-foreground/60 select-none">SRV-{service.projectNo}/</span>
                <Input className="h-8 font-mono text-sm w-20 text-center" value={seqInput}
                  onChange={e => setSeqInput(e.target.value.replace(/[^0-9a-zA-Z]/g, ""))}
                  placeholder="002" maxLength={6} autoFocus />
                <span className={`font-mono text-xs font-black px-2 py-1 rounded-lg border select-none ${isFree ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-blue-50 text-blue-700 border-blue-200"}`}>
                  /{isFree ? "F" : "P"}
                </span>
                <Button size="sm" className="h-8 text-xs gap-1" onClick={saveServiceNo} disabled={savingServiceNo || !seqInput.trim()}>
                  {savingServiceNo ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}Save
                </Button>
                <Button size="sm" variant="outline" className="h-8 text-xs px-2" onClick={() => setEditingServiceNo(false)}>
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
            ) : (
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-xl md:text-2xl font-black tracking-tight">{service.serviceNo || "Draft"}</h1>
                <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-full border ${statusCfg.color}`}>{statusCfg.label}</span>
                {isFree && <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full border bg-emerald-100 text-emerald-700 border-emerald-200">FREE</span>}
                {isFullyPaid && service.status !== "invoice_generated" && <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full border bg-emerald-100 text-emerald-700 border-emerald-200">PAID</span>}
                {user?.role !== "technician" && (
                  <button onClick={() => setEditingServiceNo(true)} className="text-muted-foreground hover:text-foreground">
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            )}
            <p className="text-sm text-muted-foreground mt-0.5">{service.customer?.name} · #{service.projectNo}</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {service.serviceType?.replace("_", " ")} · {fmtDate(service.scheduledDate)}
            </p>
          </div>
          {user?.role !== "technician" && service.projectNo && (
            <Button variant="outline" size="sm" className="hidden sm:flex h-8 gap-1.5 text-xs font-bold text-primary border-primary/20 hover:bg-primary/5" asChild>
              <Link href={`/services/new?projectNo=${service.projectNo}`}><Plus className="h-3.5 w-3.5" /> New Req</Link>
            </Button>
          )}
        </div>
        <div className="flex gap-2 flex-wrap">
          {isAdmin && !editingServiceNo && (
            <Button size="sm" variant="outline" className="gap-1.5 text-xs border-amber-200 text-amber-700 hover:bg-amber-50"
              onClick={fixServiceNo} disabled={fixingNo} title="Auto-calculate or manually enter service number">
              {fixingNo ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Edit className="h-3.5 w-3.5" />}Fix No.
            </Button>
          )}
          {!invoice && (
            <Button size="sm" variant="outline" className="gap-1.5 text-xs border-blue-200 text-blue-700 hover:bg-blue-50"
              onClick={createInvoice} disabled={creatingInvoice}>
              {creatingInvoice ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Receipt className="h-3.5 w-3.5" />}Create Invoice
            </Button>
          )}
          {invoice && (
            <Button variant="outline" size="sm" className={`gap-1.5 text-xs ${isFullyPaid || isFree ? "border-emerald-300 text-emerald-700 hover:bg-emerald-50" : ""}`} asChild>
              <Link href={`/print/service/${invoice.id}`}>
                <Receipt className="h-3.5 w-3.5" />
                {isFullyPaid || isFree ? "Receipt" : "Invoice"}
              </Link>
            </Button>
          )}
          {service.status === "pending" && (
            <Button size="sm" className="gap-1.5 text-xs bg-emerald-600 hover:bg-emerald-700" onClick={markComplete}>
              <CheckCircle2 className="h-3.5 w-3.5" /> Mark Complete
            </Button>
          )}
        </div>
      </div>

      {/* ── 2-col Grid ─────────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">

        {/* Customer */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-[11px] font-black uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
              <User className="h-3.5 w-3.5" /> Customer
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <p className="font-bold text-base">{service.customer?.name}</p>
            {service.customer?.phone && <p className="text-sm text-muted-foreground">{service.customer.phone}</p>}
            {service.customer?.email && <p className="text-sm text-muted-foreground">{service.customer.email}</p>}
            {service.customer?.address && (
              <p className="text-sm text-muted-foreground flex items-start gap-1.5">
                <MapPin className="h-3.5 w-3.5 shrink-0 mt-0.5 text-muted-foreground/60" />{service.customer.address}
              </p>
            )}
            {service.location?.lat && service.location?.lng && (
              <a href={`https://www.google.com/maps/search/?api=1&query=${service.location.lat},${service.location.lng}`}
                target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs text-sky-600 hover:underline font-medium mt-1">
                <Navigation className="h-3 w-3" /> View on Maps
              </a>
            )}
          </CardContent>
        </Card>

        {/* System Info */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-[11px] font-black uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
              <Sun className="h-3.5 w-3.5" /> System Info
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Project</span>
              <span className="font-bold font-mono">#{service.projectNo}</span>
            </div>
            {service.capacity && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Capacity</span>
                <span className="font-semibold flex items-center gap-1"><Zap className="h-3 w-3 text-amber-500" />{service.capacity} kWp</span>
              </div>
            )}
            {service.inverter && (
              <div className="flex justify-between gap-2">
                <span className="text-muted-foreground shrink-0">Inverter</span>
                <span className="font-medium text-right truncate">{service.inverter}</span>
              </div>
            )}
            {service.panel && (
              <div className="flex justify-between gap-2">
                <span className="text-muted-foreground shrink-0">Panels</span>
                <span className="font-medium text-right truncate">{service.panelCount ? `${service.panelCount}× ` : ""}{service.panel}</span>
              </div>
            )}
            {service.battery && (
              <div className="flex justify-between gap-2">
                <span className="text-muted-foreground shrink-0">Battery</span>
                <span className="font-medium text-right truncate">{service.battery}</span>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Service Details */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-[11px] font-black uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
              <Wrench className="h-3.5 w-3.5" /> Service Details
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Type</span>
              <span className="font-semibold capitalize">
                {SERVICE_TYPE_ICONS[service.serviceType] || "🔧"} {service.serviceType}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Priority</span>
              <span className={`font-bold text-xs capitalize px-2 py-0.5 rounded-full border ${
                service.priority === "critical" ? "bg-red-100 text-red-700 border-red-200" :
                service.priority === "urgent"   ? "bg-amber-100 text-amber-700 border-amber-200" :
                                                   "bg-slate-100 text-slate-600 border-slate-200"
              }`}>
                {service.priority || "Normal"}
              </span>
            </div>
            {service.serviceRound != null && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Service Round</span>
                <span className="font-semibold">Visit #{service.serviceRound}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-muted-foreground">Date</span>
              <span className="font-medium flex items-center gap-1">
                <Calendar className="h-3 w-3" />{fmtDate(service.scheduledDate)}
              </span>
            </div>
            {service.assignedTo && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Assigned To</span>
                <span className="font-medium">{service.assignedTo}</span>
              </div>
            )}
            {service.description && (
              <div className="pt-1 border-t">
                <p className="text-xs text-muted-foreground font-medium mb-1">Description</p>
                <p className="text-sm">{service.description}</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Cost Summary */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-[11px] font-black uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
                <Receipt className="h-3.5 w-3.5" /> Cost Summary
              </CardTitle>
              <div className="flex items-center gap-2">
                {invoice && <span className="text-[10px] font-mono text-muted-foreground">{invoice.invoiceNo}</span>}
                {isAdmin && !editingCosts && !isFree && (
                  <button onClick={startEditCosts} className="text-muted-foreground hover:text-foreground transition-colors" title="Edit costs">
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {editingCosts ? (
              <div className="space-y-3">
                {/* Auto-suggest row */}
                {(autoLabour > 0 || autoTravel > 0) && (
                  <div className="flex flex-wrap gap-1.5 p-2 rounded-lg bg-muted/30 border border-dashed border-border/60">
                    <span className="text-[10px] text-muted-foreground w-full font-semibold mb-0.5">Auto-suggest</span>
                    {autoLabour > 0 && (
                      <button
                        onClick={() => setCostForm(p => ({ ...p, labourCost: String(autoLabour) }))}
                        className="text-[10px] px-2 py-0.5 rounded-full border bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100 font-bold">
                        Labour: {fmtRs(autoLabour)} ({service.capacity} kW × Rs.{LABOUR_RATE_PER_KW})
                      </button>
                    )}
                    {autoTravel > 0 && (
                      <button
                        onClick={() => setCostForm(p => ({ ...p, distanceCost: String(autoTravel) }))}
                        className="text-[10px] px-2 py-0.5 rounded-full border bg-sky-50 text-sky-700 border-sky-200 hover:bg-sky-100 font-bold">
                        Travel: {fmtRs(autoTravel)} ({service.location.distanceKm}km × Rs.{PER_KM_RATE} × 2)
                      </button>
                    )}
                  </div>
                )}

                {/* Labour + Travel */}
                {[
                  { label: "Labour (Rs.)",    key: "labourCost"   },
                  { label: "Travel (Rs.)",    key: "distanceCost" },
                ].map(({ label, key }) => (
                  <div key={key} className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground w-28 shrink-0">{label}</span>
                    <Input type="number" min="0" step="100" className="h-8 text-sm" placeholder="0"
                      value={costForm[key as keyof typeof costForm] as string}
                      onChange={e => setCostForm(p => ({ ...p, [key]: e.target.value }))} />
                  </div>
                ))}

                {/* Materials / Parts */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-muted-foreground">Parts / Repairs / New Items</span>
                    <button onClick={addMaterialRow} className="text-[10px] text-primary hover:underline font-bold flex items-center gap-0.5">
                      <Plus className="h-3 w-3" /> Add row
                    </button>
                  </div>
                  {costForm.materials.length === 0 && (
                    <p className="text-[10px] text-muted-foreground/60 italic px-1">No parts added yet</p>
                  )}
                  {costForm.materials.map((m, i) => (
                    <div key={i} className="grid grid-cols-[1fr_3rem_5rem_1.5rem] gap-1 items-center">
                      <Input className="h-7 text-xs" placeholder="Description" value={m.name}
                        onChange={e => updateMaterial(i, "name", e.target.value)} />
                      <Input className="h-7 text-xs text-center" type="number" min="1" placeholder="Qty" value={m.qty}
                        onChange={e => updateMaterial(i, "qty", e.target.value)} />
                      <Input className="h-7 text-xs text-right" type="number" min="0" step="100" placeholder="Unit Rs." value={m.unitPrice}
                        onChange={e => updateMaterial(i, "unitPrice", e.target.value)} />
                      <button onClick={() => removeMaterialRow(i)} className="h-7 flex items-center justify-center text-red-400 hover:text-red-600">
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>

                {/* Free toggle */}
                <div className="flex items-center gap-2 px-1">
                  <input type="checkbox" id="isFreeToggle" checked={costForm.isFreeService}
                    onChange={e => setCostForm(p => ({ ...p, isFreeService: e.target.checked }))}
                    className="rounded border-border text-emerald-600 focus:ring-emerald-600" />
                  <label htmlFor="isFreeToggle" className="text-xs font-semibold cursor-pointer text-emerald-700 dark:text-emerald-500">
                    Mark as Free Service (Warranty / SLA)
                  </label>
                </div>

                {/* Total preview */}
                <div className="flex justify-between items-center pt-2 border-t text-sm font-bold">
                  <span>Total</span>
                  <span className="text-primary">{fmtRs(costFormTotal)}</span>
                </div>

                <div className="flex gap-2 pt-1">
                  <Button size="sm" className="flex-1 gap-1.5 h-8 text-xs" onClick={saveCosts} disabled={savingCosts}>
                    {savingCosts ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}Save Costs
                  </Button>
                  <Button size="sm" variant="outline" className="h-8 text-xs px-3" onClick={() => setEditingCosts(false)} disabled={savingCosts}>
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ) : (
              <div className="rounded-lg border overflow-hidden text-sm">
                {costs.labourCost > 0 && (
                  <div className="flex justify-between px-3 py-2 bg-muted/10">
                    <span className="text-muted-foreground">Labour</span>
                    <span className="font-medium">{fmtRs(costs.labourCost)}</span>
                  </div>
                )}
                {(costs.materials || []).map((m: any, i: number) => (
                  <div key={i} className="flex justify-between px-3 py-2 bg-muted/10">
                    <span className="text-muted-foreground">{m.name}{m.qty > 1 ? ` ×${m.qty}` : ""}</span>
                    <span className="font-medium">{fmtRs(m.qty * m.unitPrice)}</span>
                  </div>
                ))}
                {costs.materialCost > 0 && !(costs.materials?.length) && (
                  <div className="flex justify-between px-3 py-2 bg-muted/10">
                    <span className="text-muted-foreground">Materials</span>
                    <span className="font-medium">{fmtRs(costs.materialCost)}</span>
                  </div>
                )}
                {costs.distanceCost > 0 && (
                  <div className="flex justify-between px-3 py-2 bg-muted/20">
                    <span className="text-muted-foreground">
                      Travel {costs.perKmRate && service.location?.distanceKm ? `(${service.location.distanceKm}km)` : ""}
                    </span>
                    <span className="font-medium">{fmtRs(costs.distanceCost)}</span>
                  </div>
                )}
                {!costs.labourCost && !costs.materialCost && !costs.distanceCost && !isFree && (
                  <div className="flex items-center gap-2 px-3 py-2.5 text-xs text-muted-foreground bg-muted/10">
                    <Pencil className="h-3 w-3" /> No costs entered — click the pencil to add
                  </div>
                )}
                <div className={`flex justify-between px-3 py-2.5 font-bold border-t ${isFree ? "bg-emerald-50 dark:bg-emerald-950/20" : "bg-primary/5"}`}>
                  <span>Total {isFree ? "(FREE)" : ""}</span>
                  <span className={isFree ? "text-emerald-600" : "text-primary"}>
                    {isFree ? "Rs. 0" : fmtRs(costs.totalCost || 0)}
                  </span>
                </div>
              </div>
            )}

            {/* Payment status */}
            {invoice && (
              <div className={`mt-3 flex justify-between items-center px-3 py-2 rounded-lg border text-sm ${
                isFree      ? "bg-emerald-50 border-emerald-200 dark:bg-emerald-950/20 dark:border-emerald-900" :
                isFullyPaid ? "bg-emerald-50 border-emerald-200 dark:bg-emerald-950/20 dark:border-emerald-900" :
                balance < 0 ? "bg-red-50 border-red-200 dark:bg-red-950/20 dark:border-red-900" :
                              "bg-amber-50 border-amber-200 dark:bg-amber-950/20 dark:border-amber-900"
              }`}>
                <div>
                  <span className="font-medium">
                    {isFree ? "Free Service" : isFullyPaid ? "Fully Paid" : balance < 0 ? "Overpaid" : "Balance Due"}
                  </span>
                  {!isFree && totalPaid > 0 && (
                    <p className="text-xs text-muted-foreground mt-0.5">Received: {fmtRs(totalPaid)}</p>
                  )}
                </div>
                <span className={`font-black text-base ${
                  isFree || isFullyPaid ? "text-emerald-700" :
                  balance < 0 ? "text-red-700 dark:text-red-400" : "text-amber-700"
                }`}>
                  {isFree || isFullyPaid ? "Rs. 0" : balance < 0 ? fmtRs(Math.abs(balance)) : fmtRs(balance)}
                </span>
              </div>
            )}

            {invoice && !editingInvoiceTotal && (
              <div className="flex gap-2 mt-3">
                <Button className={`flex-1 gap-1.5 text-xs ${isFullyPaid || isFree ? "border-emerald-300 text-emerald-700 hover:bg-emerald-50" : ""}`} variant="outline" asChild>
                  <Link href={`/print/service/${invoice.id}`}>
                    <Receipt className="h-3.5 w-3.5" />
                    {isFullyPaid || isFree ? "View / Print Receipt" : "View / Print Invoice & Log Payments"}
                  </Link>
                </Button>
                {isAdmin && !isFree && (
                  <Button variant="outline" size="sm" className="h-9 px-3 gap-1 text-xs border-amber-200 text-amber-700 hover:bg-amber-50"
                    title="Manually set invoice total"
                    onClick={() => { setInvoiceTotalInput(String(invoice.total || 0)); setEditingInvoiceTotal(true); }}>
                    <Pencil className="h-3.5 w-3.5" /> Edit Total
                  </Button>
                )}
              </div>
            )}
            {invoice && editingInvoiceTotal && (
              <div className="mt-3 space-y-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground w-24 shrink-0">Invoice Total (Rs.)</span>
                  <Input type="number" min="0" step="100" className="h-8 text-sm"
                    value={invoiceTotalInput} onChange={e => setInvoiceTotalInput(e.target.value)} autoFocus />
                </div>
                <div className="flex gap-2">
                  <Button size="sm" className="flex-1 h-8 text-xs gap-1" onClick={saveInvoiceTotal} disabled={savingInvoiceTotal}>
                    {savingInvoiceTotal ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}Update Invoice
                  </Button>
                  <Button size="sm" variant="outline" className="h-8 px-3 text-xs" onClick={() => setEditingInvoiceTotal(false)} disabled={savingInvoiceTotal}>
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Remarks & Notes ──────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-[11px] font-black uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
              <MessageSquare className="h-3.5 w-3.5" /> Remarks & Notes
            </CardTitle>
            {!addingNote && (
              <button
                onClick={() => { setNoteForm({ text: "", type: allowedNoteTypes[0] || "general" }); setAddingNote(true); }}
                className="text-xs text-primary hover:underline font-bold flex items-center gap-1">
                <Plus className="h-3.5 w-3.5" /> Add Note
              </button>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Add note form */}
          {addingNote && (
            <div className="rounded-xl border border-dashed border-primary/30 bg-primary/[0.03] p-3 space-y-2.5">
              <div className="flex flex-wrap gap-1.5">
                {allowedNoteTypes.map(t => {
                  const cfg = NOTE_TYPES[t];
                  return (
                    <button key={t}
                      onClick={() => setNoteForm(p => ({ ...p, type: t }))}
                      className={`text-[10px] font-bold px-2.5 py-1 rounded-full border transition-all ${
                        noteForm.type === t
                          ? `${cfg.badge} ring-1 ring-offset-1 ring-current`
                          : "bg-muted/40 text-muted-foreground border-border hover:bg-muted/60"
                      }`}>
                      {cfg.icon} {cfg.label}
                    </button>
                  );
                })}
              </div>
              <textarea
                rows={3}
                className="w-full text-sm rounded-lg border border-border bg-background px-3 py-2 focus:outline-none focus:ring-1 focus:ring-primary/40 resize-y placeholder:text-muted-foreground/50"
                placeholder={
                  noteForm.type === "engineer_confirmation" ? "Describe what was verified and confirmed…" :
                  noteForm.type === "technician_remark"     ? "What was found, what was done, items taken back…" :
                  noteForm.type === "admin_note"            ? "Internal admin note…" :
                  "Add a note…"
                }
                value={noteForm.text}
                onChange={e => setNoteForm(p => ({ ...p, text: e.target.value }))}
                autoFocus
              />
              <div className="flex gap-2">
                <Button size="sm" className="h-8 text-xs gap-1.5" onClick={saveNote} disabled={savingNote || !noteForm.text.trim()}>
                  {savingNote ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}Save
                </Button>
                <Button size="sm" variant="outline" className="h-8 text-xs px-3" onClick={() => setAddingNote(false)} disabled={savingNote}>
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          )}

          {/* Notes list */}
          {notes.length === 0 && !addingNote && (
            <p className="text-xs text-muted-foreground/60 italic text-center py-4">
              No remarks yet — technicians, engineers, and admins can add notes here.
            </p>
          )}
          {notes.map(note => {
            const cfg = NOTE_TYPES[note.type] || NOTE_TYPES.general;
            return (
              <div key={note.id} className={`rounded-xl border p-3 space-y-1.5 ${cfg.cardColor}`}>
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-1.5">
                    <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-full border ${cfg.badge}`}>
                      {cfg.icon} {cfg.label}
                    </span>
                    <span className="text-[10px] font-semibold text-foreground/80">{note.authorName}</span>
                    <span className="text-[10px] text-muted-foreground capitalize">({note.authorRole})</span>
                  </div>
                  {note.createdAt && (
                    <span className="text-[10px] text-muted-foreground">{fmtTs(note.createdAt)}</span>
                  )}
                </div>
                <p className="text-sm whitespace-pre-wrap text-foreground/90 leading-relaxed">{note.text}</p>
                {note.type === "engineer_confirmation" && (
                  <div className="flex items-center gap-1 text-[10px] text-emerald-700 font-bold mt-1">
                    <ShieldCheck className="h-3 w-3" /> Engineer Confirmed
                  </div>
                )}
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* ── Checklist Summary ────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-[11px] font-black uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
              <ClipboardList className="h-3.5 w-3.5" /> Checklist
            </CardTitle>
            <Link
              href={`/services/${id}/checklist`}
              className="text-xs text-primary hover:underline font-bold flex items-center gap-1">
              Open Full Checklist →
            </Link>
          </div>
        </CardHeader>
        <CardContent>
          {!checklist && (
            <div className="text-center py-6 space-y-2">
              <ClipboardList className="h-8 w-8 text-muted-foreground/20 mx-auto" />
              <p className="text-xs text-muted-foreground/60">No checklist submitted for this service visit yet.</p>
              <Button variant="outline" size="sm" className="text-xs gap-1.5" asChild>
                <Link href={`/services/${id}/checklist`}><Plus className="h-3.5 w-3.5" /> Start Checklist</Link>
              </Button>
            </div>
          )}
          {checklist && checklistStats && (
            <div className="space-y-4">
              {/* Progress bar */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-foreground/80">Overall Progress</span>
                  <span className={`font-black ${checklistStats.pct === 100 ? "text-emerald-600" : "text-primary"}`}>
                    {checklistStats.done}/{checklistStats.total} ({checklistStats.pct}%)
                  </span>
                </div>
                <div className="w-full h-2 rounded-full bg-muted overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${checklistStats.pct === 100 ? "bg-emerald-500" : "bg-primary"}`}
                    style={{ width: `${checklistStats.pct}%` }}
                  />
                </div>
              </div>

              {/* Task table by category */}
              {(() => {
                const tasks = checklist.tasks as Record<string, any>;
                const catMap: Record<string, { done: number; total: number }> = {};
                Object.entries(tasks).forEach(([taskId, t]) => {
                  const cat = taskId.split("_")[0] || "other";
                  if (!catMap[cat]) catMap[cat] = { done: 0, total: 0 };
                  catMap[cat].total++;
                  if ((t as any).done) catMap[cat].done++;
                });
                return (
                  <div className="rounded-lg border overflow-hidden">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-muted/30 border-b">
                          <th className="text-left px-3 py-2 font-semibold text-muted-foreground">Category</th>
                          <th className="text-center px-3 py-2 font-semibold text-muted-foreground w-16">Done</th>
                          <th className="text-center px-3 py-2 font-semibold text-muted-foreground w-16">Total</th>
                          <th className="text-center px-3 py-2 font-semibold text-muted-foreground w-16">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {Object.entries(catMap).map(([cat, s]) => (
                          <tr key={cat} className="border-b last:border-0 hover:bg-muted/10">
                            <td className="px-3 py-2 font-medium capitalize">{cat.replace(/_/g, " ")}</td>
                            <td className="px-3 py-2 text-center font-semibold">{s.done}</td>
                            <td className="px-3 py-2 text-center text-muted-foreground">{s.total}</td>
                            <td className="px-3 py-2 text-center">
                              {s.done === s.total
                                ? <span className="text-emerald-600 font-bold">✓</span>
                                : <span className="text-amber-600 font-bold">{s.total - s.done} left</span>
                              }
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                );
              })()}

              {/* Customer sign-off */}
              <div className={`flex items-start justify-between gap-3 rounded-lg border px-3 py-2.5 text-sm ${
                checklist.customer?.name
                  ? "bg-emerald-50 border-emerald-200 dark:bg-emerald-950/20 dark:border-emerald-900"
                  : "bg-muted/20 border-border"
              }`}>
                <div>
                  <p className={`text-[10px] font-black uppercase tracking-wider mb-0.5 ${checklist.customer?.name ? "text-emerald-700" : "text-muted-foreground"}`}>
                    Customer Sign-off
                  </p>
                  {checklist.customer?.name
                    ? <p className="font-semibold text-foreground">{checklist.customer.name}
                        {checklist.customer.date && <span className="text-xs text-muted-foreground font-normal ml-2">{checklist.customer.date}</span>}
                      </p>
                    : <p className="text-xs text-muted-foreground">Not signed yet</p>
                  }
                </div>
                {checklist.customer?.name && <CheckCircle2 className="h-5 w-5 text-emerald-500 shrink-0 mt-0.5" />}
              </div>

              {/* Engineer confirmation from checklist */}
              {checklist.engineerConfirmedBy && (
                <div className="flex items-center gap-2 rounded-lg border bg-emerald-50/60 border-emerald-200 px-3 py-2 dark:bg-emerald-950/20 dark:border-emerald-900">
                  <ShieldCheck className="h-4 w-4 text-emerald-600 shrink-0" />
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-wider text-emerald-700">Engineer Confirmed</p>
                    <p className="text-xs text-foreground/80">
                      {checklist.engineerConfirmedBy}
                      {checklist.engineerConfirmedAt && <span className="text-muted-foreground ml-2">{fmtDate(checklist.engineerConfirmedAt)}</span>}
                    </p>
                  </div>
                </div>
              )}

              {/* Submission info */}
              {checklist.submittedBy && (
                <p className="text-[10px] text-muted-foreground text-right">
                  Submitted by {checklist.submittedBy}
                  {checklist.submittedAt && <span> · {fmtTs(checklist.submittedAt)}</span>}
                </p>
              )}

              <Button variant="outline" size="sm" className="w-full text-xs gap-1.5" asChild>
                <Link href={`/services/${id}/checklist`}>
                  <ClipboardList className="h-3.5 w-3.5" /> View / Edit Full Checklist
                </Link>
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
