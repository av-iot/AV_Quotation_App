"use client";

import { useEffect, useState, useMemo, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  doc,
  getDoc,
  updateDoc,
  deleteDoc,
  collection,
  query,
  where,
  getDocs,
  addDoc,
  serverTimestamp
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  ArrowLeft,
  FolderOpen,
  User,
  CreditCard,
  CheckCircle2,
  AlertCircle,
  FileText,
  Printer,
  Plus,
  Loader2,
  Phone,
  TrendingUp,
  Wrench,
  AlertTriangle,
  BadgeCheck,
  Banknote,
  Trash2,
  MapPin,
  Wifi,
  Zap,
  Camera,
  Navigation,
  X,
  CloudUpload,
  Cpu,
  PackagePlus,
} from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import Link from "next/link";
import { generateSiteNumber } from "@/lib/project-utils";
import { formatQtnNo } from "@/lib/format-qtn";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth-context";

const fmtRs = (n: number) =>
  "Rs. " + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const STAGES = [
  { id: "advance_pending", label: "Advance Pending", desc: "Awaiting first payment" },
  { id: "confirmed", label: "Confirmed", desc: "Advance paid, job confirmed" },
  { id: "installation", label: "Installation", desc: "In progress on site" },
  { id: "installation_complete", label: "Installed", desc: "Structure & panels done" },
  { id: "commissioned", label: "Commissioned", desc: "Grid connected & tested" },
  { id: "monitoring", label: "Monitoring", desc: "2-week online monitoring" },
  { id: "fully_settled", label: "In Operation", desc: "System in normal operation" }
];

export default function ProjectDetailPage() {
  const { id } = useParams() as { id: string };
  const router = useRouter();
  const { toast } = useToast();
  const { user } = useAuth();

  const [project, setProject] = useState<any>(null);
  const [proposal, setProposal] = useState<any>(null);
  const [quotations, setQuotations] = useState<any[]>([]);
  const [receipts, setReceipts] = useState<any[]>([]);
  const [serviceHistory, setServiceHistory] = useState<any[]>([]);
  const [availableChecklists, setAvailableChecklists] = useState<Set<string>>(new Set());
  const [proposalPropNo, setProposalPropNo] = useState<string>("");
  const [loading, setLoading] = useState(true);

  // Form states for recording payment
  const [payAmount, setPayAmount] = useState("");
  const [payDate, setPayDate] = useState(new Date().toISOString().split("T")[0]);
  const [payNotes, setPayNotes] = useState("");
  const [recordingPayment, setRecordingPayment] = useState(false);

  // Refund modal states
  const [showRefundModal, setShowRefundModal] = useState(false);
  const [refundAmount, setRefundAmount] = useState("");
  const [refundDate, setRefundDate] = useState(new Date().toISOString().split("T")[0]);
  const [refundMethod, setRefundMethod] = useState("Bank Transfer");
  const [refundReference, setRefundReference] = useState("");
  const [refundNotes, setRefundNotes] = useState("");
  const [savingRefund, setSavingRefund] = useState(false);

  // Receipt delete state
  const [deletingReceiptId, setDeletingReceiptId] = useState<string | null>(null);

  // Customer Edit States
  const [isEditingCustomer, setIsEditingCustomer] = useState(false);
  const [editCustomerAddress, setEditCustomerAddress] = useState("");
  const [editCustomerPhone, setEditCustomerPhone] = useState("");
  const [editCustomerEmail, setEditCustomerEmail] = useState("");
  const [savingCustomer, setSavingCustomer] = useState(false);

  // Equipment / Upgrades States
  const [showEqModal, setShowEqModal] = useState(false);
  const [eqType, setEqType] = useState<"inverter" | "battery" | "panel">("inverter");
  const [eqBrand, setEqBrand] = useState("");
  const [eqModel, setEqModel] = useState("");
  const [eqCapacity, setEqCapacity] = useState("");
  const [eqQty, setEqQty] = useState("1");
  const [eqNotes, setEqNotes] = useState("");
  const [savingEq, setSavingEq] = useState(false);

  // ── Installation Record ──────────────────────────────────────────────────────
  type InverterUnit = { type: "inverter" | "battery" | "secondary"; serialNo: string; checkCode: string };
  type InstRecord = {
    inverters: InverterUnit[];
    gpsLat: number | null;
    gpsLng: number | null;
    gpsAccuracy: number | null;
    gpsTimestamp: string | null;
    wifi: { ssid: string; password: string };
    remarks: string;
    photos: string[];
  };
  const [instRecord, setInstRecord] = useState<InstRecord>({
    inverters: [{ type: "inverter", serialNo: "", checkCode: "" }],
    gpsLat: null, gpsLng: null, gpsAccuracy: null, gpsTimestamp: null,
    wifi: { ssid: "", password: "" },
    remarks: "", photos: [],
  });
  const [instSaveStatus, setInstSaveStatus] = useState<"idle"|"saving"|"saved"|"error">("idle");
  const [capturingGPS, setCapturingGPS] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const instDirtyRef = useRef(false);

  // Fetch all project, quotation and receipt data
  const loadProjectData = async () => {
    try {
      const projSnap = await getDoc(doc(db, "projects", id));
      if (projSnap.exists()) {
        const projData = projSnap.data();
        setProject({ id: projSnap.id, ...projData });

        // Load installation record without triggering autosave
        if (projData.installationRecord) {
          const ir = projData.installationRecord;
          setInstRecord({
            inverters: ir.inverters?.length > 0
              ? ir.inverters.map((u: any) => ({ type: u.type || "inverter", serialNo: u.serialNo || "", checkCode: u.checkCode || "" }))
              : [{ type: "inverter" as const, serialNo: "", checkCode: "" }],
            gpsLat: ir.gpsLat ?? null,
            gpsLng: ir.gpsLng ?? null,
            gpsAccuracy: ir.gpsAccuracy ?? null,
            gpsTimestamp: ir.gpsTimestamp ?? null,
            wifi: ir.wifi || { ssid: "", password: "" },
            remarks: ir.remarks || "",
            photos: ir.photos || [],
          });
        }

        // Query all quotations for this project/proposal
        const qtnSnap = await getDocs(
          query(collection(db, "quotations"), where("proposalId", "==", projData.proposalId))
        );

        // Fetch parent proposal
        if (projData.proposalId) {
          const propSnap = await getDoc(doc(db, "proposals", projData.proposalId));
          if (propSnap.exists()) {
            const pd = propSnap.data();
            setProposalPropNo(pd.propNo || pd.qtnNo || "");
            setProposal({ id: propSnap.id, ...pd });
          }
        }
        const qList = qtnSnap.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .sort((a: any, b: any) => (a.installmentNo ?? 0) - (b.installmentNo ?? 0));

        // Self-heal: cascade carry credit and fix stale paymentStatus in Firestore
        let carry = 0;
        for (const q of qList as any[]) {
          const target = (q.installmentAmount ?? q.total ?? 0) as number;
          const rawPaid = (q.paidAmount ?? 0) as number;
          const effectivePaid = Math.min(rawPaid + carry, target);
          const surplus = rawPaid + carry - target;
          carry = surplus > 0 ? surplus : 0;
          const shouldBeSettled = effectivePaid >= target - 1;
          const shouldBePartial = effectivePaid > 0 && !shouldBeSettled;
          if (shouldBeSettled && q.paymentStatus !== "fully_paid") {
            await updateDoc(doc(db, "quotations", q.id), { paymentStatus: "fully_paid", updatedAt: serverTimestamp() });
            q.paymentStatus = "fully_paid";
          } else if (shouldBePartial && q.paymentStatus === "pending_payment") {
            await updateDoc(doc(db, "quotations", q.id), { paymentStatus: "partial_payment", updatedAt: serverTimestamp() });
            q.paymentStatus = "partial_payment";
          }
        }

        setQuotations(qList);

        // Query all receipts for this project — try proposalId first, then by quotationId
        const recMap = new Map<string, any>();
        if (projData.proposalId) {
          const snap1 = await getDocs(query(collection(db, "receipts"), where("proposalId", "==", projData.proposalId)));
          snap1.docs.forEach(d => recMap.set(d.id, { id: d.id, ...d.data() }));
        }
        // Also fetch by quotationId for each installment (covers receipts without proposalId)
        const qtnIds = qList.map((q: any) => q.id).filter(Boolean);
        for (let i = 0; i < qtnIds.length; i += 10) {
          const chunk = qtnIds.slice(i, i + 10);
          if (chunk.length === 0) break;
          const snap2 = await getDocs(query(collection(db, "receipts"), where("quotationId", "in", chunk)));
          snap2.docs.forEach(d => recMap.set(d.id, { id: d.id, ...d.data() }));
        }
        const rList = Array.from(recMap.values())
          .sort((a, b) => (a.date && b.date ? a.date.localeCompare(b.date) : 0));
        setReceipts(rList);

        // Query service records linked to this project's site number
        const siteNo = projData.siteNo;
        if (siteNo && siteNo !== "Pending") {
          const [svcSnap, checkSnap] = await Promise.all([
            getDocs(query(collection(db, "services"), where("projectNo", "==", siteNo))),
            getDocs(query(collection(db, "serviceChecklistData"), where("projectNo", "==", siteNo)))
          ]);
          const sList = svcSnap.docs
            .map((d) => ({ id: d.id, ...d.data() }))
            .sort((a: any, b: any) => {
              const aTime = a.createdAt?.seconds ?? 0;
              const bTime = b.createdAt?.seconds ?? 0;
              return bTime - aTime;
            });
          setServiceHistory(sList);
          setAvailableChecklists(new Set(checkSnap.docs.map(d => d.id)));
        } else {
          setServiceHistory([]);
          setAvailableChecklists(new Set());
        }
      } else {
        toast({
          title: "Project not found",
          description: "No project document matching this ID.",
          variant: "destructive"
        });
      }
    } catch (err: any) {
      console.error(err);
      toast({
        title: "Load failed",
        description: err.message,
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProjectData();
  }, [id]);

  // Compute stats
  const stats = useMemo(() => {
    if (!project) return { systemTotal: 0, totalPaid: 0, balanceDue: 0, overpaidAmt: 0, progress: 0 };
    const systemTotal = project.systemTotal || 0;
    const totalPaid = receipts.reduce((sum, r) => sum + (r.amount || 0), 0);
    const balanceDue = Math.max(0, systemTotal - totalPaid);
    const overpaidAmt = Math.max(0, totalPaid - systemTotal);
    const progress = systemTotal > 0 ? (totalPaid / systemTotal) * 100 : 0;
    return { systemTotal, totalPaid, balanceDue, overpaidAmt, progress };
  }, [project, receipts]);

  // Carry-credit cascade for invoice table display
  const invoiceRows = useMemo(() => {
    let carry = 0;
    return quotations.map((q) => {
      const target = (q.installmentAmount ?? q.total ?? 0) as number;
      const rawPaid = (q.paidAmount ?? 0) as number;
      const carryIn = carry;
      const effectivePaid = Math.min(rawPaid + carry, target);
      const surplus = rawPaid + carry - target;
      carry = surplus > 0 ? surplus : 0;
      const isSettled = effectivePaid >= target - 1;
      const isPartial = effectivePaid > 0 && !isSettled;
      return { ...q, effectivePaid, isSettled, isPartial, carryIn };
    });
  }, [quotations]);

  // Handle stage transition
  const handleUpdateStage = async (newStage: string) => {
    if (!project) return;
    try {
      const updates: any = {
        stage: newStage,
        updatedAt: serverTimestamp()
      };

      if (newStage === "installation_complete") {
        updates.installedAt = new Date().toISOString();
      } else if (newStage === "commissioned") {
        updates.commissionedAt = new Date().toISOString();
      } else if (newStage === "monitoring") {
        updates.monitoringStartedAt = new Date().toISOString();
      } else if (newStage === "fully_settled") {
        updates.settledAt = new Date().toISOString();
      }

      await updateDoc(doc(db, "projects", id), updates);

      // Audit log stage change
      const { logActivityClient } = await import("@/lib/audit-logger-client");
      await logActivityClient(user, "PROJECT_STAGE_CHANGE", {
        projectId: id,
        siteNo: project.siteNo,
        customerName: project.customer?.name,
        oldStage: project.stage,
        newStage
      });

      setProject((prev: any) => ({ ...prev, ...updates }));
      toast({
        title: "Stage Updated",
        description: `Project transitioned to ${STAGES.find((s) => s.id === newStage)?.label}.`
      });
    } catch (err: any) {
      toast({
        title: "Update failed",
        description: err.message,
        variant: "destructive"
      });
    }
  };

  // ── Installation Record autosave ─────────────────────────────────────────────
  const INST_STAGES = ["installation_complete", "commissioned", "monitoring", "fully_settled"];

  const saveInstallationRecord = useCallback(async (record: InstRecord) => {
    setInstSaveStatus("saving");
    try {
      await updateDoc(doc(db, "projects", id), {
        installationRecord: {
          ...record,
          updatedAt: new Date().toISOString(),
          updatedBy: user?.displayName || user?.email || "unknown",
        },
        updatedAt: serverTimestamp(),
      });
      setInstSaveStatus("saved");
      setTimeout(() => setInstSaveStatus("idle"), 2000);
    } catch {
      setInstSaveStatus("error");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, user?.uid]);

  useEffect(() => {
    if (!instDirtyRef.current || !project || !INST_STAGES.includes(project.stage)) return;
    const timer = setTimeout(() => {
      if (instDirtyRef.current) {
        saveInstallationRecord(instRecord);
        instDirtyRef.current = false;
      }
    }, 1500);
    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [instRecord]);

  const updateInstRecord = (patch: Partial<InstRecord>) => {
    instDirtyRef.current = true;
    setInstRecord(prev => ({ ...prev, ...patch }));
  };

  const updateInverter = (idx: number, field: "type" | "serialNo" | "checkCode", value: string) => {
    instDirtyRef.current = true;
    setInstRecord(prev => {
      const inverters = [...prev.inverters];
      inverters[idx] = { ...inverters[idx], [field]: value };
      return { ...prev, inverters };
    });
  };

  const captureGPS = () => {
    if (!navigator.geolocation) {
      toast({ title: "GPS not available", description: "Geolocation is not supported by this browser.", variant: "destructive" });
      return;
    }
    setCapturingGPS(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCapturingGPS(false);
        updateInstRecord({
          gpsLat: parseFloat(pos.coords.latitude.toFixed(7)),
          gpsLng: parseFloat(pos.coords.longitude.toFixed(7)),
          gpsAccuracy: Math.round(pos.coords.accuracy),
          gpsTimestamp: new Date().toISOString(),
        });
        toast({ title: "GPS captured", description: `±${Math.round(pos.coords.accuracy)}m accuracy` });
      },
      (err) => {
        setCapturingGPS(false);
        toast({ title: "GPS error", description: err.message, variant: "destructive" });
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  };

  const uploadInstallationPhoto = async (files: FileList) => {
    if (!files.length) return;
    setUploadingPhoto(true);
    try {
      const { ref: storageRef, uploadBytes, getDownloadURL } = await import("firebase/storage");
      const { storage } = await import("@/lib/firebase");
      const newUrls: string[] = [];
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const path = `installation_photos/${id}/${Date.now()}_${i}_${file.name}`;
        const sRef = storageRef(storage, path);
        await uploadBytes(sRef, file, { contentType: file.type });
        const url = await getDownloadURL(sRef);
        newUrls.push(url);
      }
      instDirtyRef.current = true;
      setInstRecord(prev => ({ ...prev, photos: [...prev.photos, ...newUrls] }));
      toast({ title: `${newUrls.length} photo${newUrls.length > 1 ? "s" : ""} uploaded` });
    } catch (err: any) {
      toast({ title: "Upload failed", description: err.message, variant: "destructive" });
    } finally {
      setUploadingPhoto(false);
    }
  };

  // Mark a refund as given
  const handleMarkRefund = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!project?.proposalId) return;
    const amt = parseFloat(refundAmount);
    if (isNaN(amt) || amt <= 0) {
      toast({ title: "Invalid amount", variant: "destructive" });
      return;
    }
    setSavingRefund(true);
    try {
      const refundRecord = {
        amount: amt,
        date: refundDate,
        method: refundMethod,
        reference: refundReference || null,
        notes: refundNotes || null,
        markedBy: user?.uid || "",
        markedAt: new Date().toISOString(),
      };
      await updateDoc(doc(db, "proposals", project.proposalId), { refundRecord });
      const { logActivityClient } = await import("@/lib/audit-logger-client");
      await logActivityClient(user, "REFUND_MARKED", {
        projectId: id,
        proposalId: project.proposalId,
        amount: amt,
        customerName: project.customer?.name,
      });
      setProposal((prev: any) => ({ ...prev, refundRecord }));
      setShowRefundModal(false);
      toast({ title: "Refund Recorded", description: `${fmtRs(amt)} refund marked as given.` });
    } catch (err: any) {
      toast({ title: "Failed", description: err.message, variant: "destructive" });
    } finally {
      setSavingRefund(false);
    }
  };

  // Delete a receipt (superadmin only)
  const handleDeleteReceipt = async (receiptId: string, receiptNo: string) => {
    if (!confirm(`Delete receipt ${receiptNo}? This cannot be undone.`)) return;
    setDeletingReceiptId(receiptId);
    try {
      await deleteDoc(doc(db, "receipts", receiptId));
      const { logActivityClient } = await import("@/lib/audit-logger-client");
      await logActivityClient(user, "RECEIPT_DELETE", { receiptId, receiptNo, projectId: id });
      setReceipts((prev) => prev.filter((r) => r.id !== receiptId));
      toast({ title: "Receipt Deleted", description: `${receiptNo} removed.` });
    } catch (err: any) {
      toast({ title: "Delete failed", description: err.message, variant: "destructive" });
    } finally {
      setDeletingReceiptId(null);
    }
  };

  // Update Customer Details
  const handleUpdateCustomer = async () => {
    if (!project) return;
    setSavingCustomer(true);
    try {
      const updatedCustomer = {
        ...project.customer,
        address: editCustomerAddress,
        phone: editCustomerPhone,
        email: editCustomerEmail
      };
      
      await updateDoc(doc(db, "projects", id), {
        customer: updatedCustomer,
        updatedAt: serverTimestamp()
      });
      
      // Also sync it back to the original proposal if it exists
      if (project.proposalId) {
        await updateDoc(doc(db, "proposals", project.proposalId), {
          "customer.address": editCustomerAddress,
          "customer.phone": editCustomerPhone,
          "customer.email": editCustomerEmail,
        });
      }
      
      setProject((prev: any) => ({ ...prev, customer: updatedCustomer }));
      setIsEditingCustomer(false);
      toast({ title: "Customer updated", description: "Customer contact details have been updated." });
    } catch (err: any) {
      toast({ title: "Update failed", description: err.message, variant: "destructive" });
    } finally {
      setSavingCustomer(false);
    }
  };

  const handleAddEquipment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!project) return;
    setSavingEq(true);
    try {
      const newEq = {
        id: Math.random().toString(36).substring(2) + Date.now().toString(36),
        type: eqType,
        brand: eqBrand,
        model: eqModel,
        capacity: parseFloat(eqCapacity) || 0,
        qty: parseInt(eqQty, 10) || 1,
        addedAt: new Date().toISOString(),
        notes: eqNotes
      };
      const updatedEquipment = [...(project.equipment || []), newEq];
      await updateDoc(doc(db, "projects", id), {
        equipment: updatedEquipment,
        updatedAt: serverTimestamp()
      });
      setProject((prev: any) => ({ ...prev, equipment: updatedEquipment }));
      setShowEqModal(false);
      setEqBrand(""); setEqModel(""); setEqCapacity(""); setEqQty("1"); setEqNotes("");
      toast({ title: "Equipment Added", description: "Successfully added to the system." });
    } catch (err: any) {
      toast({ title: "Failed", description: err.message, variant: "destructive" });
    } finally {
      setSavingEq(false);
    }
  };

  const handleDeleteEquipment = async (eqId: string) => {
    if (!project || !confirm("Remove this equipment from the project?")) return;
    try {
      const updatedEquipment = (project.equipment || []).filter((e: any) => e.id !== eqId);
      await updateDoc(doc(db, "projects", id), {
        equipment: updatedEquipment,
        updatedAt: serverTimestamp()
      });
      setProject((prev: any) => ({ ...prev, equipment: updatedEquipment }));
      toast({ title: "Equipment Removed" });
    } catch (err: any) {
      toast({ title: "Failed", description: err.message, variant: "destructive" });
    }
  };

  const eqTotals = useMemo(() => {
    if (!project) return { solar: 0, inverter: 0 };
    const eq = project.equipment || [];
    if (eq.length > 0) {
      let solar = 0; let inverter = 0;
      eq.forEach((e: any) => {
        if (e.type === "panel") solar += (e.capacity || 0) * (e.qty || 1);
        if (e.type === "inverter") inverter += (e.capacity || 0) * (e.qty || 1);
      });
      return { solar, inverter };
    }
    return {
      solar: project.solarCapacity || ((project.noOfPanels || 0) * (project.panelWattage || 0)) / 1000,
      inverter: project.inverterCapacity || 0
    };
  }, [project]);

  // Record a payment against the project and selected quotation
  const handleRecordPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!project || !payAmount) return;
    const amt = parseFloat(payAmount);
    if (isNaN(amt) || amt <= 0) {
      toast({ title: "Invalid amount", description: "Please enter a valid positive number.", variant: "destructive" });
      return;
    }

    setRecordingPayment(true);
    try {
      // Find the first unpaid or partially paid quotation
      const activeQtn = quotations.find(
        (q) => q.paymentStatus === "pending_payment" || q.paymentStatus === "partial_payment"
      ) || quotations[0];

      if (!activeQtn) {
        toast({ title: "No unpaid invoice", description: "All generated installments are already fully paid.", variant: "destructive" });
        setRecordingPayment(false);
        return;
      }

      // 1. Generate Receipt number: REC{YYYYMMDD}{counter}
      const pd = new Date(payDate);
      const dateStr = `${pd.getFullYear()}${String(pd.getMonth() + 1).padStart(2, "0")}${String(pd.getDate()).padStart(2, "0")}`;
      const dayPrefix = `REC${dateStr}`;
      const allRecsSnap = await getDocs(collection(db, "receipts"));
      let maxNo = 0;
      allRecsSnap.forEach((d) => {
        const rNo = d.data().receiptNo;
        if (rNo && rNo.startsWith(dayPrefix)) {
          const num = parseInt(rNo.replace(dayPrefix, ""), 10);
          if (!isNaN(num) && num > maxNo) maxNo = num;
        }
      });
      const receiptNo = `${dayPrefix}${String(maxNo + 1).padStart(2, "0")}`;

      // 2. Write Receipt document
      const receiptDoc = {
        receiptNo,
        quotationId: activeQtn.id,
        proposalId: project.proposalId,
        projectNo: project.siteNo || "Pending",
        amount: amt,
        date: payDate,
        notes: payNotes || "Direct Deposit / Cash Payment",
        createdAt: serverTimestamp()
      };
      const recRef = await addDoc(collection(db, "receipts"), receiptDoc);

      // 3. Update Quotation paidAmount & paymentStatus
      const qtnPaidTotal = (activeQtn.paidAmount || 0) + amt;
      const qtnTargetAmt = activeQtn.installmentAmount || activeQtn.total;
      const isFullyPaid = qtnPaidTotal >= qtnTargetAmt - 1; // buffer for floats
      const newQtnStatus = isFullyPaid ? "fully_paid" : "partial_payment";

      await updateDoc(doc(db, "quotations", activeQtn.id), {
        paidAmount: qtnPaidTotal,
        paymentStatus: newQtnStatus,
        updatedAt: serverTimestamp()
      });

      // 3b. Cascade carry credit — settle downstream invoices whose target is covered by surplus
      {
        const sorted = [...quotations].sort((a: any, b: any) => (a.installmentNo ?? 0) - (b.installmentNo ?? 0));
        let carry = 0;
        for (const q of sorted) {
          const target = (q.installmentAmount ?? q.total ?? 0) as number;
          const rawPaid = q.id === activeQtn.id ? qtnPaidTotal : ((q.paidAmount ?? 0) as number);
          const effectivePaid = Math.min(rawPaid + carry, target);
          const surplus = rawPaid + carry - target;
          carry = surplus > 0 ? surplus : 0;
          if (q.id === activeQtn.id) continue;
          const isNowSettled = effectivePaid >= target - 1;
          const isNowPartial = effectivePaid > 0 && !isNowSettled;
          if (isNowSettled && q.paymentStatus !== "fully_paid") {
            await updateDoc(doc(db, "quotations", q.id), { paymentStatus: "fully_paid", updatedAt: serverTimestamp() });
          } else if (isNowPartial && q.paymentStatus === "pending_payment") {
            await updateDoc(doc(db, "quotations", q.id), { paymentStatus: "partial_payment", updatedAt: serverTimestamp() });
          }
        }
      }

      // 4. Update Project totals and check if we generate Site Number
      let updatedSiteNo = project.siteNo;
      let updatedStage = project.stage;

      const isFirstPayment = !project.siteNo || project.siteNo === "Pending";
      if (isFirstPayment) {
        // Generate site number now!
        const generatedNo = await generateSiteNumber(
          project.systemType || "ongrid",
          project.customer?.address || ""
        );
        updatedSiteNo = generatedNo;
        updatedStage = "confirmed";

        // Update all related quotations with the new site number
        for (const q of quotations) {
          await updateDoc(doc(db, "quotations", q.id), {
            siteNo: generatedNo,
            updatedAt: serverTimestamp()
          });
        }
      }

      const newTotalPaid = stats.totalPaid + amt;
      const newBalanceDue = Math.max(0, stats.systemTotal - newTotalPaid);
      const isProjectFullySettled = newBalanceDue <= 1;

      if (isProjectFullySettled) {
        updatedStage = "fully_settled";
      }

      await updateDoc(doc(db, "projects", id), {
        siteNo: updatedSiteNo,
        stage: updatedStage,
        totalPaid: newTotalPaid,
        balanceDue: newBalanceDue,
        updatedAt: serverTimestamp()
      });

      // 5. Audit Log
      const { logActivityClient } = await import("@/lib/audit-logger-client");
      await logActivityClient(user, "PAYMENT_RECORD", {
        projectId: id,
        siteNo: updatedSiteNo,
        receiptNo,
        amount: amt,
        customerName: project.customer?.name,
        quotationNo: activeQtn.qtnNo
      });

      toast({
        title: "Payment Logged Successfully",
        description: `Receipt ${receiptNo} created. Site No: ${updatedSiteNo}`
      });

      // Reset form
      setPayAmount("");
      setPayNotes("");
      loadProjectData(); // Refresh UI
    } catch (err: any) {
      toast({
        title: "Payment recording failed",
        description: err.message,
        variant: "destructive"
      });
    } finally {
      setRecordingPayment(false);
    }
  };

  const getValidityKey = (v: string) => {
    if (v.includes("3 days")) return "3_days";
    if (v.includes("14 days")) return "14_days";
    if (v.includes("30 days")) return "30_days";
    return "1_week";
  };

  if (loading) {
    return (
      <div className="flex h-[80vh] items-center justify-center gap-2 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin text-emerald-500" />
        <span className="text-sm font-semibold">Loading project workspace...</span>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="flex h-[80vh] flex-col items-center justify-center gap-4 text-muted-foreground">
        <AlertCircle className="h-10 w-10 text-red-500" />
        <p className="font-semibold text-lg">Project not found in system directory.</p>
        <Button asChild>
          <Link href="/projects">Return to Projects Registry</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      {/* Back Button */}
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" className="gap-2" asChild>
          <Link href="/projects">
            <ArrowLeft className="h-4 w-4" />
            Back to Registry
          </Link>
        </Button>
        <div className="flex gap-2">
          <Badge variant="outline" className="font-bold text-xs uppercase bg-emerald-50 border-emerald-250 text-emerald-700">
            Site: {project.siteNo || "Awaiting Advance"}
          </Badge>
        </div>
      </div>

      {/* Title block */}
      <div className="flex justify-between items-start flex-wrap gap-4 border-b border-border pb-4">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-foreground">{project.customer?.name}</h1>
          <p className="text-sm text-muted-foreground mt-1 font-semibold flex items-center gap-2">
            <FolderOpen className="h-4 w-4 text-emerald-600" />
            {proposalPropNo ? (
              <>
                Proposal{" "}
                <a
                  href={`/proposals/${project.proposalId}`}
                  className="text-emerald-700 underline underline-offset-2 hover:text-emerald-800 font-bold font-mono"
                >
                  {proposalPropNo}
                </a>
              </>
            ) : (
              <>Proposal Reference: {project.proposalId}</>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {STAGES.find((s) => s.id === project.stage)?.label && (
            <Badge className="px-3 py-1 text-sm font-bold uppercase tracking-wider bg-emerald-600 hover:bg-emerald-600 text-white border-none shadow-sm">
              {STAGES.find((s) => s.id === project.stage)?.label}
            </Badge>
          )}
        </div>
      </div>

      {/* Stepper timeline */}
      <Card className="border-border bg-card/40">
        <CardHeader className="py-4 border-b border-border/50">
          <CardTitle className="text-xs font-black uppercase tracking-wider text-muted-foreground">Project Stage Timeline</CardTitle>
        </CardHeader>
        <CardContent className="p-6">
          <div className="relative flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
            {/* Background progress line (horizontal on md+, hidden/vertical on mobile) */}
            <div className="absolute left-4 top-4 bottom-4 w-0.5 md:left-6 md:right-6 md:top-6 md:h-1 bg-zinc-200 dark:bg-zinc-800 -z-10 md:w-[calc(100%-3rem)]" />
            
            {STAGES.map((s, idx) => {
              const isActive = project.stage === s.id;
              const isCompleted = STAGES.findIndex((x) => x.id === project.stage) >= idx;
              return (
                <div key={s.id} className="flex md:flex-col items-center text-left md:text-center gap-4 md:gap-2.5 z-10">
                  <div className={`h-8 w-8 md:h-12 md:w-12 rounded-full border-2 flex items-center justify-center font-bold text-xs md:text-sm transition-all duration-300 ${
                    isActive
                      ? "bg-emerald-600 text-white border-emerald-600 ring-4 ring-emerald-600/20"
                      : isCompleted
                      ? "bg-emerald-100 border-emerald-500 text-emerald-700"
                      : "bg-white dark:bg-zinc-950 border-zinc-350 text-zinc-400"
                  }`}>
                    {isCompleted ? <CheckCircle2 className="h-5 w-5" /> : idx + 1}
                  </div>
                  <div>
                    <h4 className={`text-xs md:text-sm font-black ${isActive ? "text-foreground" : isCompleted ? "text-emerald-700 font-bold" : "text-muted-foreground"}`}>{s.label}</h4>
                    <p className="text-[10px] text-muted-foreground font-medium hidden md:block mt-0.5 max-w-[130px] leading-snug">{s.desc}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Add Equipment Modal */}
      {showEqModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-background border border-border rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-black uppercase tracking-wider">Add System Equipment</h3>
              <button onClick={() => setShowEqModal(false)} className="text-muted-foreground hover:text-foreground text-lg leading-none">×</button>
            </div>
            <form onSubmit={handleAddEquipment} className="space-y-3">
              <div className="space-y-1">
                <label className="text-[9px] font-black uppercase text-muted-foreground block">Component Type</label>
                <Select value={eqType} onValueChange={(v: any) => setEqType(v)}>
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="inverter">Inverter</SelectItem>
                    <SelectItem value="battery">Battery</SelectItem>
                    <SelectItem value="panel">Solar Panel</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[9px] font-black uppercase text-muted-foreground block">Brand</label>
                  <Input value={eqBrand} onChange={(e) => setEqBrand(e.target.value)} className="h-9" placeholder="e.g. Growatt" required />
                </div>
                <div className="space-y-1">
                  <label className="text-[9px] font-black uppercase text-muted-foreground block">Model</label>
                  <Input value={eqModel} onChange={(e) => setEqModel(e.target.value)} className="h-9" placeholder="e.g. MIN 5000TL-X" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[9px] font-black uppercase text-muted-foreground block">
                    Capacity {eqType === "panel" ? "(W)" : "(kW)"}
                  </label>
                  <Input type="number" step="any" value={eqCapacity} onChange={(e) => setEqCapacity(e.target.value)} className="h-9 font-mono" placeholder="e.g. 5" />
                </div>
                <div className="space-y-1">
                  <label className="text-[9px] font-black uppercase text-muted-foreground block">Quantity</label>
                  <Input type="number" min="1" value={eqQty} onChange={(e) => setEqQty(e.target.value)} className="h-9 font-mono" required />
                </div>
              </div>
              
              <div className="space-y-1">
                <label className="text-[9px] font-black uppercase text-muted-foreground block">Notes (Optional)</label>
                <Textarea placeholder="e.g. Added as system upgrade" value={eqNotes} onChange={(e) => setEqNotes(e.target.value)} className="text-sm resize-none h-16" />
              </div>
              
              <div className="flex gap-2 pt-2">
                <Button type="button" variant="outline" className="flex-1 text-xs font-bold" onClick={() => setShowEqModal(false)}>Cancel</Button>
                <Button type="submit" disabled={savingEq} className="flex-1 text-xs font-extrabold">
                  {savingEq ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save Equipment"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Main Grid: Info Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left Col: Customer & System Info */}
        <div className="space-y-6 lg:col-span-2">
          {/* Customer Details Card */}
          <Card className="border-border">
            <CardHeader className="py-4 border-b border-border/50 flex flex-row items-center justify-between">
              <div className="flex items-center gap-2">
                <User className="h-4.5 w-4.5 text-primary" />
                <CardTitle className="text-xs font-black uppercase tracking-wider text-muted-foreground">Customer Contacts</CardTitle>
              </div>
              {!isEditingCustomer ? (
                <Button size="sm" variant="ghost" className="h-7 text-[10px] uppercase font-bold" onClick={() => {
                  setEditCustomerAddress(project.customer?.address || "");
                  setEditCustomerPhone(project.customer?.phone || "");
                  setEditCustomerEmail(project.customer?.email || "");
                  setIsEditingCustomer(true);
                }}>
                  Edit
                </Button>
              ) : (
                <div className="flex items-center gap-2">
                  <Button size="sm" variant="outline" className="h-7 text-[10px] uppercase font-bold" onClick={() => setIsEditingCustomer(false)}>Cancel</Button>
                  <Button size="sm" className="h-7 text-[10px] uppercase font-bold" onClick={handleUpdateCustomer} disabled={savingCustomer}>
                    {savingCustomer ? <Loader2 className="h-3 w-3 animate-spin" /> : "Save"}
                  </Button>
                </div>
              )}
            </CardHeader>
            <CardContent className="p-5 space-y-3.5 text-sm">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide block mb-0.5">Billing Address</span>
                  {isEditingCustomer ? (
                    <Textarea className="min-h-[60px] text-xs mt-1 border-slate-200" value={editCustomerAddress} onChange={e => setEditCustomerAddress(e.target.value)} />
                  ) : (
                    <span className="font-semibold text-foreground leading-relaxed">{project.customer?.address}</span>
                  )}
                </div>
                <div className="space-y-3">
                  <div>
                    <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide block mb-0.5">Contact Number</span>
                    {isEditingCustomer ? (
                      <Input className="h-8 text-xs mt-1 border-slate-200" value={editCustomerPhone} onChange={e => setEditCustomerPhone(e.target.value)} />
                    ) : (
                      <span className="font-semibold text-foreground flex items-center gap-1.5">
                        <Phone className="h-3.5 w-3.5 text-muted-foreground" /> {project.customer?.phone}
                      </span>
                    )}
                  </div>
                  <div>
                    <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide block mb-0.5">Email Address</span>
                    {isEditingCustomer ? (
                      <Input type="email" className="h-8 text-xs mt-1 border-slate-200" value={editCustomerEmail} onChange={e => setEditCustomerEmail(e.target.value)} />
                    ) : project.customer?.email ? (
                      <span className="font-semibold text-foreground">{project.customer.email}</span>
                    ) : (
                      <span className="text-muted-foreground/50 text-xs italic">Not provided</span>
                    )}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* System Equipment & Upgrades Card */}
          <Card className="border-border">
            <CardHeader className="py-4 border-b border-border/50 flex flex-row items-center justify-between">
              <div className="flex items-center gap-2">
                <Cpu className="h-4.5 w-4.5 text-primary" />
                <CardTitle className="text-xs font-black uppercase tracking-wider text-muted-foreground">System Equipment & Upgrades</CardTitle>
              </div>
              <Button size="sm" className="h-7 text-[10px] uppercase font-bold" onClick={() => setShowEqModal(true)}>
                <PackagePlus className="h-3 w-3 mr-1" />
                Add Upgrade
              </Button>
            </CardHeader>
            <CardContent className="p-0">
              <div className="bg-muted/10 p-4 border-b border-border/30 flex justify-between items-center text-xs">
                <div>
                  <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide">Total Solar</span>
                  <p className="font-mono font-black text-emerald-600 text-sm">{eqTotals.solar > 0 ? eqTotals.solar.toFixed(2) + " kW" : "—"}</p>
                </div>
                <div className="text-right">
                  <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide">Total Inverter</span>
                  <p className="font-mono font-black text-blue-600 text-sm">{eqTotals.inverter > 0 ? eqTotals.inverter.toFixed(2) + " kW" : "—"}</p>
                </div>
              </div>

              <div className="overflow-x-auto">
                <Table>
                  <TableHeader className="bg-muted/30 border-b border-border/40">
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="text-[9px] font-black uppercase text-muted-foreground tracking-wider h-10 pl-4">Type</TableHead>
                      <TableHead className="text-[9px] font-black uppercase text-muted-foreground tracking-wider h-10">Brand / Model</TableHead>
                      <TableHead className="text-[9px] font-black uppercase text-muted-foreground tracking-wider h-10 text-right">Capacity</TableHead>
                      <TableHead className="text-[9px] font-black uppercase text-muted-foreground tracking-wider h-10 text-right">Qty</TableHead>
                      <TableHead className="text-[9px] font-black uppercase text-muted-foreground tracking-wider h-10 text-right">Added</TableHead>
                      <TableHead className="w-10 pr-4"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(project.equipment || []).length > 0 ? (
                      project.equipment.map((eq: any) => (
                        <TableRow key={eq.id} className="border-b border-border/40 text-xs">
                          <TableCell className="py-2.5 pl-4 font-bold uppercase text-[10px] text-muted-foreground">
                            {eq.type}
                          </TableCell>
                          <TableCell className="py-2.5">
                            <p className="font-bold text-foreground leading-none">{eq.brand}</p>
                            <p className="text-[10px] text-muted-foreground mt-0.5">{eq.model}</p>
                          </TableCell>
                          <TableCell className="py-2.5 text-right font-mono font-medium">
                            {eq.capacity > 0 ? eq.capacity + (eq.type === "panel" ? " W" : " kW") : "—"}
                          </TableCell>
                          <TableCell className="py-2.5 text-right font-mono font-medium">
                            x{eq.qty}
                          </TableCell>
                          <TableCell className="py-2.5 text-right text-[10px] text-muted-foreground">
                            {eq.addedAt ? new Date(eq.addedAt).toLocaleDateString("en-GB") : "—"}
                          </TableCell>
                          <TableCell className="py-2.5 text-right pr-4">
                            <button onClick={() => handleDeleteEquipment(eq.id)} className="text-muted-foreground/50 hover:text-red-500 transition-colors">
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </TableCell>
                        </TableRow>
                      ))
                    ) : (
                      // Fallback to legacy fields if equipment array is empty
                      <>
                        <TableRow className="border-b border-border/40 text-xs">
                          <TableCell className="py-2.5 pl-4 font-bold uppercase text-[10px] text-muted-foreground">INVERTER</TableCell>
                          <TableCell className="py-2.5">
                            <p className="font-bold text-foreground leading-none">{project.inverterBrand || "—"}</p>
                            <p className="text-[10px] text-muted-foreground mt-0.5">{project.inverterModel || "—"}</p>
                          </TableCell>
                          <TableCell className="py-2.5 text-right font-mono font-medium">
                            {project.inverterCapacity > 0 ? project.inverterCapacity + " kW" : "—"}
                          </TableCell>
                          <TableCell className="py-2.5 text-right font-mono font-medium">x1</TableCell>
                          <TableCell className="py-2.5 text-right text-[10px] text-muted-foreground">Initial</TableCell>
                          <TableCell className="py-2.5 pr-4"></TableCell>
                        </TableRow>
                        <TableRow className="border-b border-border/40 text-xs">
                          <TableCell className="py-2.5 pl-4 font-bold uppercase text-[10px] text-muted-foreground">PANEL</TableCell>
                          <TableCell className="py-2.5">
                            <p className="font-bold text-foreground leading-none">{project.panelModel?.split(' ')[0] || "—"}</p>
                            <p className="text-[10px] text-muted-foreground mt-0.5">{project.panelModel || "—"}</p>
                          </TableCell>
                          <TableCell className="py-2.5 text-right font-mono font-medium">
                            {project.panelWattage > 0 ? project.panelWattage + " W" : "—"}
                          </TableCell>
                          <TableCell className="py-2.5 text-right font-mono font-medium">
                            {project.noOfPanels > 0 ? `x${project.noOfPanels}` : "—"}
                          </TableCell>
                          <TableCell className="py-2.5 text-right text-[10px] text-muted-foreground">Initial</TableCell>
                          <TableCell className="py-2.5 pr-4"></TableCell>
                        </TableRow>
                      </>
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          {/* Quotations / Invoices Ledger Card */}
          <Card className="border-border">
            <CardHeader className="py-4 border-b border-border/50 flex flex-row items-center justify-between">
              <div className="flex items-center gap-2">
                <FileText className="h-4.5 w-4.5 text-primary" />
                <CardTitle className="text-xs font-black uppercase tracking-wider text-muted-foreground">Invoices & Proformas</CardTitle>
              </div>
              <Button size="sm" className="h-7 text-[10px] uppercase font-bold" asChild>
                <Link href={`/proposals/${project.proposalId}`}>
                  Generate Invoice
                </Link>
              </Button>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader className="bg-muted/30 border-b border-border/40">
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="text-[9px] font-black uppercase text-muted-foreground tracking-wider h-10 pl-4">Doc No.</TableHead>
                      <TableHead className="text-[9px] font-black uppercase text-muted-foreground tracking-wider h-10">Stage / Title</TableHead>
                      <TableHead className="text-[9px] font-black uppercase text-muted-foreground tracking-wider h-10 text-right">Percent</TableHead>
                      <TableHead className="text-[9px] font-black uppercase text-muted-foreground tracking-wider h-10 text-right">Amount</TableHead>
                      <TableHead className="text-[9px] font-black uppercase text-muted-foreground tracking-wider h-10 text-right">Paid</TableHead>
                      <TableHead className="text-[9px] font-black uppercase text-muted-foreground tracking-wider h-10 text-right">Status</TableHead>
                      <TableHead className="text-[9px] font-black uppercase text-muted-foreground tracking-wider h-10 text-right pr-4">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {invoiceRows.map((q) => {
                      const isFirst = q.installmentNo === 1;
                      const displayTitle = isFirst
                        ? q.installmentPercent === 100
                          ? "Full Payment"
                          : "Advance Payment"
                        : "Progressive Due";
                      const displayNo = formatQtnNo(
                        q.qtnNo || "",
                        q.isSettled,
                        q.installmentNo,
                        q.installmentPercent,
                        project.siteNo,
                        proposalPropNo
                      );

                      return (
                        <TableRow key={q.id} className="border-b border-border/40 hover:bg-muted/5 transition-colors text-xs">
                          <TableCell className="py-3 pl-4 font-mono font-bold text-foreground">#{displayNo}</TableCell>
                          <TableCell className="py-3 font-semibold text-foreground">
                            <div className="flex flex-col gap-0.5">
                              <span>{displayTitle}</span>
                              {q.carryIn > 0 && (
                                <span className="text-[9px] font-bold text-amber-600 dark:text-amber-400">
                                  +{fmtRs(q.carryIn)} carry credit
                                </span>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="py-3 text-right font-mono font-medium">{q.installmentPercent}%</TableCell>
                          <TableCell className="py-3 text-right font-mono font-bold text-foreground">{fmtRs(q.installmentAmount || q.total)}</TableCell>
                          <TableCell className="py-3 text-right font-mono font-bold text-emerald-600">
                            {fmtRs(q.effectivePaid)}
                          </TableCell>
                          <TableCell className="py-3 text-right">
                            <Badge
                              variant={q.isSettled ? "default" : q.isPartial ? "outline" : "secondary"}
                              className="text-[10px] uppercase py-0 px-2 font-black"
                            >
                              {q.isSettled ? "Paid" : q.isPartial ? "Partial" : "Unpaid"}
                            </Badge>
                          </TableCell>
                          <TableCell className="py-3 text-right pr-4">
                            <Button size="sm" variant="outline" className="h-6 font-bold text-[10px]" asChild>
                              <Link href={`/quotations/${q.id}`}>View PDF</Link>
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          {/* Receipts History Card */}
          <Card className="border-border">
            <CardHeader className="py-4 border-b border-border/50 flex flex-row items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <CreditCard className="h-4.5 w-4.5 text-primary" />
                <CardTitle className="text-xs font-black uppercase tracking-wider text-muted-foreground">Payment Receipts Sub-Ledger</CardTitle>
              </div>
              <span className="text-[10px] font-bold text-muted-foreground bg-muted/40 px-2 py-0.5 rounded-full border">
                {receipts.length} Receipt{receipts.length !== 1 ? "s" : ""}
              </span>
            </CardHeader>
            <CardContent className="p-4">
              {receipts.length === 0 ? (
                <div className="py-8 text-center text-xs text-muted-foreground font-semibold">
                  No payment receipts recorded for this project yet.
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {receipts.map((r) => (
                    <div
                      key={r.id}
                      className="rounded-xl border border-border/60 bg-muted/20 hover:bg-muted/40 transition-colors p-4 flex flex-col gap-2.5"
                    >
                      {/* Top row: receipt no + badge */}
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono font-black text-sm text-foreground tracking-tight">
                          #{r.receiptNo}
                        </span>
                        <span className="text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-900/40">
                          Logged
                        </span>
                      </div>

                      {/* Amount */}
                      <p className="text-lg font-black text-emerald-600 leading-none">
                        {fmtRs(r.amount)}
                      </p>

                      {/* Date + notes */}
                      <div className="space-y-1">
                        <p className="text-[10px] font-semibold text-muted-foreground">{r.date}</p>
                        {r.notes && (
                          <p className="text-[10px] text-muted-foreground/80 truncate">{r.notes}</p>
                        )}
                      </div>

                      {/* Print + Delete buttons */}
                      <div className="flex gap-2 mt-auto">
                        <Button
                          size="sm"
                          variant="outline"
                          className="flex-1 h-7 font-bold text-[10px] border-border/60 hover:bg-background"
                          asChild
                        >
                          <Link href={`/receipts/${r.id}`}>
                            <Printer className="h-3 w-3 mr-1.5" />
                            Print
                          </Link>
                        </Button>
                        {user?.role === "superadmin" && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 font-bold text-[10px] border-red-200 text-red-600 hover:bg-red-50 dark:border-red-900/40 dark:hover:bg-red-950/30"
                            disabled={deletingReceiptId === r.id}
                            onClick={() => handleDeleteReceipt(r.id, r.receiptNo)}
                          >
                            {deletingReceiptId === r.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
          {/* ── Installation Record Card ── */}
          {INST_STAGES.includes(project.stage) && (
            <Card className="border-border overflow-hidden">
              <CardHeader className="py-3 px-5 border-b border-border/50 flex flex-row items-center justify-between bg-card/60">
                <div className="flex items-center gap-2">
                  <Zap className="h-4 w-4 text-amber-500" />
                  <CardTitle className="text-xs font-black uppercase tracking-wider text-muted-foreground">Installation Record</CardTitle>
                </div>
                {/* Autosave status */}
                <div className="flex items-center gap-1.5 text-[10px] font-bold">
                  {instSaveStatus === "saving" && <><Loader2 className="h-3 w-3 animate-spin text-amber-500" /><span className="text-amber-600">Saving…</span></>}
                  {instSaveStatus === "saved"  && <><CheckCircle2 className="h-3 w-3 text-emerald-500" /><span className="text-emerald-600">Saved</span></>}
                  {instSaveStatus === "error"  && <><AlertTriangle className="h-3 w-3 text-red-500" /><span className="text-red-600">Save failed</span></>}
                  {instSaveStatus === "idle" && instDirtyRef.current && <span className="text-muted-foreground/50">Unsaved</span>}
                </div>
              </CardHeader>
              <CardContent className="p-5 space-y-6">

                {/* Inverters */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
                      <Zap className="h-3 w-3 text-amber-500" /> Inverter Serial Numbers
                    </p>
                    <button type="button"
                      onClick={() => { instDirtyRef.current = true; setInstRecord(prev => ({ ...prev, inverters: [...prev.inverters, { type: "inverter" as const, serialNo: "", checkCode: "" }] })); }}
                      className="flex items-center gap-1 text-[10px] font-bold text-primary hover:underline">
                      <Plus className="h-3 w-3" /> Add Unit
                    </button>
                  </div>
                  <div className="rounded-xl border border-border/60 overflow-hidden">
                    <div className="grid grid-cols-[1.5rem_6rem_1fr_1fr_1.5rem] bg-muted/40 border-b border-border/50 px-3 py-1.5 text-[9px] font-black uppercase tracking-widest text-muted-foreground">
                      <span>#</span><span>Type</span><span>Serial Number</span><span>Check Code</span><span />
                    </div>
                    {instRecord.inverters.map((inv, idx) => (
                      <div key={idx} className="grid grid-cols-[1.5rem_6rem_1fr_1fr_1.5rem] items-center gap-1 px-2.5 py-1.5 border-b border-border/30 last:border-0">
                        <span className="text-[10px] font-black text-muted-foreground/60">{idx + 1}</span>
                        <select
                          value={inv.type}
                          onChange={e => updateInverter(idx, "type", e.target.value)}
                          className="h-8 text-[10px] font-bold rounded-lg border border-border/60 bg-background px-1.5 focus:outline-none focus:ring-1 focus:ring-primary/40 w-full"
                        >
                          <option value="inverter">Inverter</option>
                          <option value="battery">Battery</option>
                          <option value="secondary">Secondary</option>
                        </select>
                        <input
                          value={inv.serialNo}
                          onChange={e => updateInverter(idx, "serialNo", e.target.value)}
                          placeholder="e.g. SN2024001234"
                          className="h-8 text-xs font-mono rounded-lg border border-border/60 bg-background px-2.5 focus:outline-none focus:ring-1 focus:ring-primary/40 w-full"
                        />
                        <input
                          value={inv.checkCode}
                          onChange={e => updateInverter(idx, "checkCode", e.target.value)}
                          placeholder="e.g. CHK-789"
                          className="h-8 text-xs font-mono rounded-lg border border-border/60 bg-background px-2.5 focus:outline-none focus:ring-1 focus:ring-primary/40 w-full"
                        />
                        <button type="button" onClick={() => {
                          instDirtyRef.current = true;
                          setInstRecord(prev => ({ ...prev, inverters: prev.inverters.filter((_, i) => i !== idx) }));
                        }} className="h-6 w-6 flex items-center justify-center rounded text-muted-foreground/50 hover:text-destructive hover:bg-destructive/10 transition-colors">
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                {/* GPS */}
                <div className="space-y-2">
                  <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
                    <MapPin className="h-3 w-3 text-emerald-500" /> GPS Location
                  </p>
                  <div className="flex items-center gap-3 flex-wrap">
                    <Button type="button" size="sm" variant="outline" className="gap-1.5 h-8 text-xs font-bold"
                      onClick={captureGPS} disabled={capturingGPS}>
                      {capturingGPS ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Navigation className="h-3.5 w-3.5 text-emerald-500" />}
                      {capturingGPS ? "Getting GPS…" : "Capture GPS"}
                    </Button>
                    {instRecord.gpsLat && instRecord.gpsLng ? (
                      <div className="flex items-center gap-2 text-xs bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900/40 rounded-lg px-2.5 py-1.5 flex-wrap">
                        <MapPin className="h-3 w-3 text-emerald-600 shrink-0" />
                        <span className="font-mono font-bold text-emerald-800 dark:text-emerald-300">{instRecord.gpsLat.toFixed(6)}, {instRecord.gpsLng.toFixed(6)}</span>
                        {instRecord.gpsAccuracy && <span className="text-[10px] text-emerald-600">±{instRecord.gpsAccuracy}m</span>}
                        <a href={`https://www.google.com/maps?q=${instRecord.gpsLat},${instRecord.gpsLng}`}
                          target="_blank" rel="noopener noreferrer"
                          className="text-[10px] font-bold text-emerald-700 hover:underline underline-offset-2 shrink-0">
                          Maps ↗
                        </a>
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">No GPS captured yet</span>
                    )}
                  </div>
                </div>

                {/* WiFi */}
                <div className="space-y-2">
                  <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
                    <Wifi className="h-3 w-3 text-blue-500" /> WiFi Credentials
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <label className="text-[10px] text-muted-foreground font-semibold">Network Name (SSID)</label>
                      <input value={instRecord.wifi.ssid}
                        onChange={e => updateInstRecord({ wifi: { ...instRecord.wifi, ssid: e.target.value } })}
                        placeholder="e.g. AltaVision_Site"
                        className="w-full h-8 text-xs rounded-lg border border-border/60 bg-background px-2.5 focus:outline-none focus:ring-1 focus:ring-primary/40" />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] text-muted-foreground font-semibold">Password</label>
                      <input value={instRecord.wifi.password}
                        onChange={e => updateInstRecord({ wifi: { ...instRecord.wifi, password: e.target.value } })}
                        placeholder="WiFi password"
                        className="w-full h-8 text-xs font-mono rounded-lg border border-border/60 bg-background px-2.5 focus:outline-none focus:ring-1 focus:ring-primary/40" />
                    </div>
                  </div>
                </div>

                {/* Remarks */}
                <div className="space-y-2">
                  <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
                    <FileText className="h-3 w-3 text-muted-foreground" /> Remarks
                  </p>
                  <Textarea value={instRecord.remarks}
                    onChange={e => updateInstRecord({ remarks: e.target.value })}
                    placeholder="Installation notes, issues found, materials used, work done…"
                    rows={3} className="text-sm resize-none rounded-xl" />
                </div>

                {/* Photos */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
                      <Camera className="h-3 w-3 text-muted-foreground" /> Installation Photos
                      {instRecord.photos.length > 0 && <span className="font-semibold normal-case text-muted-foreground/60">({instRecord.photos.length})</span>}
                    </p>
                    <label className="cursor-pointer flex items-center gap-1.5 text-[10px] font-bold text-primary hover:underline">
                      {uploadingPhoto ? <Loader2 className="h-3 w-3 animate-spin" /> : <CloudUpload className="h-3 w-3" />}
                      Upload Photos
                      <input type="file" accept="image/*" multiple className="hidden"
                        onChange={e => e.target.files && uploadInstallationPhoto(e.target.files)} />
                    </label>
                  </div>
                  {instRecord.photos.length > 0 ? (
                    <div className="grid grid-cols-4 gap-2">
                      {instRecord.photos.map((url, i) => (
                        <div key={i} className="relative group">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={url} alt={`Photo ${i+1}`}
                            className="w-full h-20 object-cover rounded-lg border border-border/50 group-hover:border-primary/40 transition-colors cursor-pointer"
                            onClick={() => window.open(url, "_blank")} />
                          <button onClick={() => updateInstRecord({ photos: instRecord.photos.filter((_, j) => j !== i) })}
                            className="absolute top-1 right-1 h-5 w-5 bg-black/70 hover:bg-red-600 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                            <X className="h-2.5 w-2.5 text-white" />
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="rounded-xl border-2 border-dashed border-border/40 py-8 flex flex-col items-center gap-2 text-muted-foreground">
                      <Camera className="h-6 w-6 opacity-30" />
                      <p className="text-xs font-semibold">No photos yet</p>
                      <p className="text-[10px]">Upload before / during / after installation photos</p>
                    </div>
                  )}
                </div>

              </CardContent>
            </Card>
          )}

          {/* Service History Card */}
          <Card className="border-border">
            <CardHeader className="py-4 border-b border-border/50 flex flex-row items-center justify-between">
              <div className="flex items-center gap-2">
                <Wrench className="h-4.5 w-4.5 text-primary" />
                <CardTitle className="text-xs font-black uppercase tracking-wider text-muted-foreground">Service History</CardTitle>
              </div>
              {project.siteNo && project.siteNo !== "Pending" && (
                <Button size="sm" className="h-7 text-[10px] uppercase font-bold" asChild>
                  <Link href={`/services/new?projectNo=${encodeURIComponent(project.siteNo)}`}>
                    <Plus className="h-3 w-3 mr-1" />
                    New Service
                  </Link>
                </Button>
              )}
            </CardHeader>
            <CardContent className="p-0">
              {serviceHistory.length === 0 ? (
                <div className="p-8 text-center text-xs text-muted-foreground font-semibold">
                  {project.siteNo && project.siteNo !== "Pending"
                    ? "No service records found for this site."
                    : "Site number not yet assigned — service history available after advance payment."}
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader className="bg-muted/30 border-b border-border/40">
                      <TableRow className="hover:bg-transparent">
                        <TableHead className="text-[9px] font-black uppercase text-muted-foreground tracking-wider h-10 pl-4">Service No.</TableHead>
                        <TableHead className="text-[9px] font-black uppercase text-muted-foreground tracking-wider h-10">Date</TableHead>
                        <TableHead className="text-[9px] font-black uppercase text-muted-foreground tracking-wider h-10">Notes</TableHead>
                        <TableHead className="text-[9px] font-black uppercase text-muted-foreground tracking-wider h-10 text-right">Cost</TableHead>
                        <TableHead className="text-[9px] font-black uppercase text-muted-foreground tracking-wider h-10 text-right">Status</TableHead>
                        <TableHead className="text-[9px] font-black uppercase text-muted-foreground tracking-wider h-10 text-right pr-4">Action</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {serviceHistory.map((svc) => {
                        const createdDate = svc.createdAt?.seconds
                          ? new Date(svc.createdAt.seconds * 1000).toLocaleDateString("en-GB")
                          : svc.dueDate || "—";
                        const isCompleted = svc.status === "completed";
                        return (
                          <TableRow key={svc.id} className="border-b border-border/40 hover:bg-muted/5 transition-colors text-xs">
                            <TableCell className="py-3 pl-4 font-mono font-bold text-foreground">#{svc.serviceNo || "Draft"}</TableCell>
                            <TableCell className="py-3 font-semibold text-muted-foreground">{createdDate}</TableCell>
                            <TableCell className="py-3 text-muted-foreground max-w-[180px] truncate">{svc.notes || "—"}</TableCell>
                            <TableCell className="py-3 text-right font-mono font-bold text-foreground">
                              {svc.costs?.totalCost ? `LKR ${svc.costs.totalCost.toLocaleString()}` : "—"}
                            </TableCell>
                            <TableCell className="py-3 text-right">
                              <Badge
                                variant={isCompleted ? "default" : "secondary"}
                                className="text-[10px] uppercase py-0 px-2 font-black"
                              >
                                {isCompleted ? "Completed" : svc.status || "Pending"}
                              </Badge>
                            </TableCell>
                            <TableCell className="py-3 text-right pr-4">
                              <div className="flex items-center justify-end gap-1.5">
                                <Button size="sm" variant="outline" className="h-6 font-bold text-[10px]" asChild>
                                  <Link href={`/services/${svc.id}`}>View</Link>
                                </Button>
                                {availableChecklists.has(svc.id) && (
                                  <Button size="sm" variant="outline" className="h-6 font-bold text-[10px] gap-1 border-blue-200 text-blue-700 hover:bg-blue-50 dark:border-blue-900 dark:text-blue-400 dark:hover:bg-blue-950/20" asChild>
                                    <Link href={`/services/${svc.id}/checklist`}>
                                      <FileText className="h-3 w-3" />
                                      Service Sheet
                                    </Link>
                                  </Button>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right Col: Financial Overview + Record Payment Panel */}
        <div className="space-y-6">
          {/* Financial Summary card */}
          <Card className="border-border bg-gradient-to-br from-zinc-50 to-zinc-100/50 dark:from-zinc-950 dark:to-zinc-900">
            <CardHeader className="py-4 border-b border-border/50">
              <CardTitle className="text-xs font-black uppercase tracking-wider text-muted-foreground flex items-center justify-between">
                <span>Financial Ledger</span>
                <span className={`text-[10px] font-bold flex items-center gap-1 ${stats.overpaidAmt > 0 && !proposal?.refundRecord ? "text-red-600" : "text-emerald-600"}`}>
                  <TrendingUp className="h-3 w-3" /> {stats.progress.toFixed(0)}% Received
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-5 space-y-4">
              <div className="space-y-3.5">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-muted-foreground font-semibold uppercase">System Total:</span>
                  <span className="font-mono font-black text-foreground">{fmtRs(stats.systemTotal)}</span>
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className="text-muted-foreground font-semibold uppercase">Total Received:</span>
                  <span className="font-mono font-black text-emerald-600">{fmtRs(stats.totalPaid)}</span>
                </div>
                <div className="h-px bg-border/80" />
                {stats.overpaidAmt > 0 && !proposal?.refundRecord ? (
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-black text-red-600 uppercase">Refund Due:</span>
                    <span className="font-mono font-black text-red-600 text-lg">{fmtRs(stats.overpaidAmt)}</span>
                  </div>
                ) : stats.overpaidAmt > 0 ? (
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-black text-emerald-600 uppercase">Refunded:</span>
                    <span className="font-mono font-black text-emerald-600 text-lg">{fmtRs(stats.overpaidAmt)}</span>
                  </div>
                ) : (
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-black text-muted-foreground uppercase">Balance Due:</span>
                    <span className="font-mono font-black text-amber-700 text-lg">{fmtRs(stats.balanceDue)}</span>
                  </div>
                )}
              </div>

              <div className="space-y-1.5 pt-1.5">
                <Progress
                  value={Math.min(100, stats.progress)}
                  className={`h-2.5 bg-muted ${stats.overpaidAmt > 0 && !proposal?.refundRecord ? "[&>div]:bg-red-500" : ""}`}
                />
              </div>

              {/* Overpayment banner */}
              {stats.overpaidAmt > 0 && (
                proposal?.refundRecord ? (
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50 dark:bg-emerald-950/30 dark:border-emerald-900/40 p-3 flex items-start gap-2.5">
                    <BadgeCheck className="h-4 w-4 text-emerald-600 mt-0.5 shrink-0" />
                    <div className="text-[11px] space-y-0.5">
                      <p className="font-black text-emerald-700 dark:text-emerald-400">Refund Given</p>
                      <p className="font-bold text-emerald-600">{fmtRs(proposal.refundRecord.amount)} · {proposal.refundRecord.method}</p>
                      <p className="text-emerald-600/70">{proposal.refundRecord.date}</p>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-xl border border-red-200 bg-red-50 dark:bg-red-950/30 dark:border-red-900/40 p-3 space-y-2.5">
                    <div className="flex items-start gap-2.5">
                      <AlertTriangle className="h-4 w-4 text-red-600 mt-0.5 shrink-0" />
                      <div className="text-[11px]">
                        <p className="font-black text-red-700 dark:text-red-400">Customer Overpaid</p>
                        <p className="font-semibold text-red-600">Refund {fmtRs(stats.overpaidAmt)} to customer</p>
                      </div>
                    </div>
                    {user?.role === "superadmin" || user?.role === "admin" || user?.role === "authorized" ? (
                      <Button
                        size="sm"
                        variant="outline"
                        className="w-full h-7 text-[11px] font-bold border-red-300 text-red-700 hover:bg-red-100"
                        onClick={() => {
                          setRefundAmount(stats.overpaidAmt.toFixed(2));
                          setShowRefundModal(true);
                        }}
                      >
                        <Banknote className="h-3.5 w-3.5 mr-1.5" />
                        Mark Refund Given
                      </Button>
                    ) : null}
                  </div>
                )
              )}
            </CardContent>
          </Card>

          {/* Refund Modal */}
          {showRefundModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
              <div className="bg-background border border-border rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-black uppercase tracking-wider">Mark Refund Given</h3>
                  <button onClick={() => setShowRefundModal(false)} className="text-muted-foreground hover:text-foreground text-lg leading-none">×</button>
                </div>
                <form onSubmit={handleMarkRefund} className="space-y-3">
                  <div className="space-y-1">
                    <label className="text-[9px] font-black uppercase text-muted-foreground block">Refund Amount (LKR)</label>
                    <Input type="number" step="0.01" value={refundAmount} onChange={(e) => setRefundAmount(e.target.value)} className="h-9 font-mono font-black" required />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[9px] font-black uppercase text-muted-foreground block">Date Refunded</label>
                    <Input type="date" value={refundDate} onChange={(e) => setRefundDate(e.target.value)} className="h-9" required />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[9px] font-black uppercase text-muted-foreground block">Method</label>
                    <Select value={refundMethod} onValueChange={setRefundMethod}>
                      <SelectTrigger className="h-9 text-sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Bank Transfer">Bank Transfer</SelectItem>
                        <SelectItem value="Cash">Cash</SelectItem>
                        <SelectItem value="Cheque">Cheque</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[9px] font-black uppercase text-muted-foreground block">Reference / Slip No.</label>
                    <Input placeholder="Optional" value={refundReference} onChange={(e) => setRefundReference(e.target.value)} className="h-9 text-sm" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[9px] font-black uppercase text-muted-foreground block">Notes</label>
                    <Textarea placeholder="Optional" value={refundNotes} onChange={(e) => setRefundNotes(e.target.value)} className="text-sm resize-none h-16" />
                  </div>
                  <div className="flex gap-2 pt-1">
                    <Button type="button" variant="outline" className="flex-1 text-xs font-bold" onClick={() => setShowRefundModal(false)}>Cancel</Button>
                    <Button type="submit" disabled={savingRefund} className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-extrabold">
                      {savingRefund ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save Refund"}
                    </Button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* Record Payment Form */}
          <Card className="border-border">
            <CardHeader className="py-4 border-b border-border/50">
              <CardTitle className="text-xs font-black uppercase tracking-wider text-muted-foreground">Log New Payment</CardTitle>
            </CardHeader>
            <CardContent className="p-5">
              <form onSubmit={handleRecordPayment} className="space-y-4">
                <div className="space-y-1">
                  <label className="text-[9px] font-black uppercase text-muted-foreground block">Amount Paid (LKR)</label>
                  <Input
                    type="number"
                    step="0.01"
                    placeholder="Enter received value..."
                    className="h-9 font-mono font-black"
                    value={payAmount}
                    onChange={(e) => setPayAmount(e.target.value)}
                    required
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[9px] font-black uppercase text-muted-foreground block">Payment Date</label>
                  <Input
                    type="date"
                    className="h-9 font-semibold"
                    value={payDate}
                    onChange={(e) => setPayDate(e.target.value)}
                    required
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[9px] font-black uppercase text-muted-foreground block">Notes / Method / Slip Ref</label>
                  <Input
                    placeholder="e.g. Sampath bank transfer slip #5521"
                    className="h-9 text-xs font-semibold"
                    value={payNotes}
                    onChange={(e) => setPayNotes(e.target.value)}
                  />
                </div>

                <Button
                  type="submit"
                  disabled={recordingPayment}
                  className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs py-2 shadow-sm"
                >
                  {recordingPayment ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Recording...
                    </>
                  ) : (
                    "Record & Issue Receipt"
                  )}
                </Button>
              </form>
            </CardContent>
          </Card>

          {/* Monitoring Progress Card */}
          {project.stage === "monitoring" && (() => {
            const startDate = project.monitoringStartedAt ? new Date(project.monitoringStartedAt) : new Date();
            const daysElapsed = Math.floor((Date.now() - startDate.getTime()) / 86400000);
            const daysRemaining = Math.max(0, 14 - daysElapsed);
            const pct = Math.min(100, (daysElapsed / 14) * 100);
            const isComplete = daysElapsed >= 14;
            const endDate = new Date(startDate.getTime() + 14 * 86400000);
            return (
              <Card className="border-blue-200 dark:border-blue-900/40 bg-gradient-to-br from-blue-50/60 to-indigo-50/30 dark:from-blue-950/20 dark:to-indigo-950/10">
                <CardHeader className="py-4 border-b border-blue-200/60 dark:border-blue-900/30">
                  <CardTitle className="text-xs font-black uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                    <TrendingUp className="h-4 w-4 text-blue-500" />
                    Online Monitoring Period
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-5 space-y-4">
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-xs font-semibold text-muted-foreground">
                      <span>Day {Math.min(daysElapsed, 14)} of 14</span>
                      <span>{daysRemaining} day{daysRemaining !== 1 ? "s" : ""} remaining</span>
                    </div>
                    <Progress value={pct} className="h-2.5" />
                  </div>
                  <div className="text-[10px] text-muted-foreground space-y-0.5">
                    <p><span className="font-bold text-foreground">Started:</span> {startDate.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</p>
                    <p><span className="font-bold text-foreground">Expected end:</span> {endDate.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</p>
                  </div>
                  {isComplete && (
                    <div className="rounded-xl border border-emerald-200 bg-emerald-50 dark:bg-emerald-950/30 dark:border-emerald-900/40 p-3 flex items-center gap-2">
                      <BadgeCheck className="h-4 w-4 text-emerald-600 shrink-0" />
                      <p className="text-xs font-bold text-emerald-700 dark:text-emerald-400">14-day monitoring complete — ready to go live!</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })()}

          {/* Workflow Stage Transitions Override Panel */}
          <Card className="border-border">
            <CardHeader className="py-4 border-b border-border/50">
              <CardTitle className="text-xs font-black uppercase tracking-wider text-muted-foreground">Milestone Management Actions</CardTitle>
            </CardHeader>
            <CardContent className="p-5 space-y-2">
              {[
                { stageId: "installation", label: "Start Site Installation", cond: project.stage === "confirmed" },
                { stageId: "installation_complete", label: "Mark Installation Complete", cond: project.stage === "installation" },
                { stageId: "commissioned", label: "Mark System Commissioned", cond: project.stage === "installation_complete" },
                { stageId: "monitoring", label: "Start 2-Week Monitoring", cond: project.stage === "commissioned" },
                { stageId: "fully_settled", label: "Mark as In Operation", cond: project.stage === "monitoring" }
              ].map((act) => (
                <Button
                  key={act.stageId}
                  disabled={!act.cond}
                  onClick={() => handleUpdateStage(act.stageId)}
                  variant={act.cond ? "default" : "outline"}
                  className={`w-full text-xs font-extrabold py-2 ${
                    act.cond
                      ? "bg-primary hover:bg-primary/95 text-white"
                      : "text-muted-foreground/60 border-zinc-200 dark:border-zinc-800"
                  }`}
                >
                  {act.label}
                </Button>
              ))}
            </CardContent>
          </Card>

        </div>
      </div>
    </div>
  );
}
