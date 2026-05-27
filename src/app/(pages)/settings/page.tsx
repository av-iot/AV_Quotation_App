"use client";

import { useEffect, useState } from "react";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { cn } from "@/lib/utils";
import { db } from "@/lib/firebase";
import { ref, list, getDownloadURL } from "firebase/storage";
import { storage } from "@/lib/firebase";
import { useAuth } from "@/lib/auth-context";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Sliders, User, Mail, Phone, Briefcase, ShieldAlert,
  Save, Loader2, CheckCircle2, FileText, Landmark, CalendarOff,
  Plus, Trash2, UploadCloud, Camera, HardDrive, RefreshCw, Image,
  Wrench, Cloud, Check, Download,
} from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import UsersPage from "@/app/(pages)/users/page";
import LanguageToggle from "@/components/LanguageToggle";

interface EngineerConfig {
  name: string;
  designation: string;
  phone: string;
  email: string;
}

interface BankConfig {
  accountName: string;
  bankName: string;
  branch: string;
  accountNumber: string;
  isDefault?: boolean;
}

interface LetterHistoryEntry {
  replacedAt: string;
  previousExpiryDate: string;
}

interface LetterConfig {
  id: string;
  name: string;
  expiryDate: string;
  fileName?: string;
  noExpiry?: boolean;
  attachToProposal?: boolean;
  sendViaEmailWhatsapp?: boolean;
  history?: LetterHistoryEntry[];
}

interface SettingsState {
  engineer1: EngineerConfig;
  engineer2: EngineerConfig;
  bank: BankConfig;
  banks?: BankConfig[];
  addresses?: string[];
  letterExpiryDate: string;
  letters?: LetterConfig[];
  companyEmail?: string;
  companyWhatsapp?: string;
  vatRegNo?: string;
}

const formatPdfName = (filename: string) => {
  const base = filename.replace(/\.pdf$/i, "");
  return base
    .split(/[-_]+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
};

const DEFAULT_SETTINGS: SettingsState = {
  engineer1: {
    name: "Wikum Wijesinghe",
    designation: "B.Sc. Eng. (Hons), AMIESL",
    phone: "077 208 3894",
    email: "wikumw@altavision.lk"
  },
  engineer2: {
    name: "Oshada Ranawaka",
    designation: "B.Sc. Eng. (Hons), AMIESL",
    phone: "077 204 7891",
    email: "oshader@altavision.lk"
  },
  bank: {
    accountName: "Alta Vision (Pvt) Ltd",
    bankName: "NTB",
    branch: "Tangalle",
    accountNumber: "1008 9000 8235"
  },
  banks: [
    {
      accountName: "Alta Vision (Pvt) Ltd",
      bankName: "Sampath Bank",
      branch: "Beliatta",
      accountNumber: "1180 1400 0782",
      isDefault: false
    },
    {
      accountName: "Alta Vision (Pvt) Ltd",
      bankName: "Bank Of Ceylon (Matara Super)",
      branch: "Matara Super",
      accountNumber: "822 393 94",
      isDefault: false
    },
    {
      accountName: "Alta Vision (Pvt) Ltd",
      bankName: "NTB",
      branch: "Tangalle",
      accountNumber: "100890008235",
      isDefault: true
    },
    {
      accountName: "Alta Vision (Pvt) Ltd",
      bankName: "NTB",
      branch: "Tangalle",
      accountNumber: "100890008572",
      isDefault: false
    },
    {
      accountName: "Altavision Pvt Ltd",
      bankName: "Commercial bank",
      branch: "Deniyaya",
      accountNumber: "1000 310 632",
      isDefault: false
    }
  ],
  addresses: [
    "No 23D, Sri Rathanapala Mawatha, Nupe, Matara",
    "42, Ruhunusiri Garden, Hakmana Road, Matara",
    "298A, Borella Road, Habarakada, Homagama"
  ],
  letterExpiryDate: "2026-12-31",
  letters: [
    { id: "sea", name: "Sustainable Energy Authority (SEA) Registration Letter", expiryDate: "2026-12-31" },
    { id: "ceb", name: "Ceylon Electricity Board (CEB) Registry Letter", expiryDate: "2026-06-30" },
    { id: "leco", name: "Lanka Electricity Company (LECO) Registry Letter", expiryDate: "2026-08-15" }
  ],
  companyEmail: "quotations@altavision.lk",
  companyWhatsapp: "0742681807"
};

export default function SettingsPage() {
  const { user, firebaseUser } = useAuth();
  const { toast } = useToast();
  const isAdmin = user?.role && ["superadmin", "admin"].includes(user.role);

  const [settings, setSettings] = useState<SettingsState>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [availablePdfs, setAvailablePdfs] = useState<string[]>([]);
  const [isDocDirty, setIsDocDirty] = useState(false);

  const [confirmText, setConfirmText] = useState("");
  const [clearingDb, setClearingDb] = useState(false);
  const [clearingPlans, setClearingPlans] = useState(false);
  const [clearingHistory, setClearingHistory] = useState(false);
  const [downloadingBackup, setDownloadingBackup] = useState(false);

  // Backup/Restore/Cleanup
  const [backupLoading, setBackupLoading] = useState(false);
  const [restoreLoading, setRestoreLoading] = useState(false);
  const [restoreFile, setRestoreFile] = useState<File | null>(null);
  const [cleanupLoading, setCleanupLoading] = useState(false);
  const [cleanupConfirm, setCleanupConfirm] = useState(false);
  const [cleanupConfirmText, setCleanupConfirmText] = useState("");

  // Service settings — Storage
  type PhotoEntry = { name: string; url: string; path: string; };
  const [storageStatus, setStorageStatus]   = useState<"idle" | "checking" | "ok" | "error">("idle");
  const [storageError,  setStorageError]    = useState("");
  const [recentPhotos,  setRecentPhotos]    = useState<PhotoEntry[]>([]);
  const [loadingPhotos, setLoadingPhotos]   = useState(false);

  // Cloud provider config
  type CloudProvider = "firebase" | "google_drive" | "onedrive" | "mega";
  const [cloudProvider,         setCloudProvider]         = useState<CloudProvider>("firebase");
  const [cloudGDriveFolderId,   setCloudGDriveFolderId]   = useState("");
  const [cloudGDriveServiceEmail, setCloudGDriveServiceEmail] = useState("");
  const [cloudOneDriveTenant,   setCloudOneDriveTenant]   = useState("");
  const [cloudOneDriveClient,   setCloudOneDriveClient]   = useState("");
  const [cloudOneDrivePath,     setCloudOneDrivePath]     = useState("");
  const [cloudMegaEmail,        setCloudMegaEmail]        = useState("");
  const [cloudMegaPath,         setCloudMegaPath]         = useState("/AltaVision/ServicePhotos");
  const [savingCloud,           setSavingCloud]           = useState(false);

  const testStorageConnection = async () => {
    setStorageStatus("checking"); setStorageError("");
    try {
      const folderRef = ref(storage, "service_photos");
      await list(folderRef, { maxResults: 1 });
      setStorageStatus("ok");
    } catch (e: any) {
      setStorageStatus("error");
      setStorageError(e?.message || "Unknown error");
    }
  };

  const loadRecentPhotos = async () => {
    setLoadingPhotos(true);
    try {
      const folderRef = ref(storage, "service_photos");
      const result = await list(folderRef, { maxResults: 5 });
      // Recursively list one level of prefixes to get actual files
      const fileRefs: any[] = [];
      for (const prefix of result.prefixes.slice(0, 3)) {
        const sub = await list(prefix, { maxResults: 3 });
        for (const sub2 of sub.prefixes.slice(0, 2)) {
          const sub3 = await list(sub2, { maxResults: 3 });
          for (const sub4 of sub3.prefixes.slice(0, 2)) {
            const files = await list(sub4, { maxResults: 5 });
            fileRefs.push(...files.items.slice(0, 5));
          }
          fileRefs.push(...sub3.items.slice(0, 5));
        }
        fileRefs.push(...sub.items.slice(0, 5));
      }
      const entries: PhotoEntry[] = await Promise.all(
        fileRefs.slice(0, 20).map(async (r) => ({
          name: r.name,
          path: r.fullPath,
          url: await getDownloadURL(r),
        }))
      );
      setRecentPhotos(entries);
      if (storageStatus !== "ok") setStorageStatus("ok");
    } catch (e: any) {
      setStorageError(e?.message || "Failed to list photos");
      setStorageStatus("error");
    } finally {
      setLoadingPhotos(false);
    }
  };

  // Load cloud config from Firestore
  useEffect(() => {
    getDoc(doc(db, "settings", "service_config")).then(snap => {
      if (!snap.exists()) return;
      const d = snap.data();
      if (d.cloudProvider)         setCloudProvider(d.cloudProvider as CloudProvider);
      if (d.gdriveFolderId)        setCloudGDriveFolderId(d.gdriveFolderId);
      if (d.gdriveServiceEmail)    setCloudGDriveServiceEmail(d.gdriveServiceEmail);
      if (d.onedriveTenant)        setCloudOneDriveTenant(d.onedriveTenant);
      if (d.onedriveClient)        setCloudOneDriveClient(d.onedriveClient);
      if (d.onedrivePath)          setCloudOneDrivePath(d.onedrivePath);
      if (d.megaEmail)             setCloudMegaEmail(d.megaEmail);
      if (d.megaPath)              setCloudMegaPath(d.megaPath);
    }).catch(() => {});
  }, []);

  const saveCloudConfig = async () => {
    setSavingCloud(true);
    try {
      await setDoc(doc(db, "settings", "service_config"), {
        cloudProvider,
        gdriveFolderId:     cloudGDriveFolderId.trim(),
        gdriveServiceEmail: cloudGDriveServiceEmail.trim(),
        onedriveTenant:     cloudOneDriveTenant.trim(),
        onedriveClient:     cloudOneDriveClient.trim(),
        onedrivePath:       cloudOneDrivePath.trim(),
        megaEmail:          cloudMegaEmail.trim(),
        megaPath:           cloudMegaPath.trim(),
        updatedAt:          serverTimestamp(),
        updatedBy:          user?.uid || "",
      }, { merge: true });
      toast({ title: "Cloud Settings Saved", description: `Photos will be stored in ${cloudProvider === "firebase" ? "Firebase Storage" : cloudProvider === "google_drive" ? "Google Drive" : cloudProvider === "onedrive" ? "OneDrive" : "Mega"}.` });
    } catch (err: any) {
      toast({ title: "Save Failed", description: err.message, variant: "destructive" });
    } finally {
      setSavingCloud(false);
    }
  };

  const isDevEnv = process.env.NODE_ENV === "development" || (typeof window !== "undefined" && (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1"));

  const handleDownloadBackup = async () => {
    setDownloadingBackup(true);
    try {
      const idToken = firebaseUser ? await firebaseUser.getIdToken() : "dev_session_token";
      const res = await fetch("/api/backup", {
        method: "GET",
        headers: { "Authorization": `Bearer ${idToken}` }
      });
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || "Failed to download backup");
      }
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `firestore_backup_${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      toast({ title: "Backup Downloaded", description: "Database backup downloaded successfully." });
    } catch (err: any) {
      toast({ title: "Backup Failed", description: err.message, variant: "destructive" });
    } finally {
      setDownloadingBackup(false);
    }
  };

  const handleClearDb = async () => {
    if (confirmText !== "CLEAR") return;
    if (!isAdmin) {
      toast({
        title: "Permission Denied",
        description: "Only administrators can perform database actions.",
        variant: "destructive"
      });
      return;
    }

    if (!confirm("Are you absolutely sure you want to delete all transaction documents and reset counters? This cannot be undone!")) {
      return;
    }

    try {
      setClearingDb(true);
      
      let idToken = "dev_session_token";
      if (firebaseUser) {
        idToken = await firebaseUser.getIdToken();
      }

      const res = await fetch("/api/dev/clear-db", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${idToken}`,
          "Content-Type": "application/json"
        }
      });

      const data = await res.json();

      if (res.ok && data.success) {
        toast({
          title: "Database Cleared",
          description: data.message || "All transactions cleared and sequence counters reset.",
          variant: "default",
          className: "bg-emerald-50 text-emerald-900 border-emerald-200 font-bold"
        });
        setConfirmText("");
      } else {
        toast({
          title: "Clear Database Failed",
          description: data.error || "An error occurred while clearing database.",
          variant: "destructive"
        });
      }
    } catch (err: any) {
      console.error("Clear database error:", err);
      toast({
        title: "Request Error",
        description: err.message || "Failed to submit request.",
        variant: "destructive"
      });
    } finally {
      setClearingDb(false);
    }
  };

  const handleClearServicePlans = async () => {
    if (!confirm("Delete ALL service plans? This cannot be undone.")) return;
    setClearingPlans(true);
    try {
      const { collection: col, getDocs: gDocs, deleteDoc: dDoc, doc: fDoc } = await import("firebase/firestore");
      const snap = await gDocs(col(db, "servicePlans"));
      await Promise.all(snap.docs.map(d => dDoc(fDoc(db, "servicePlans", d.id))));
      toast({ title: "Service Plans Cleared", description: `${snap.size} plan${snap.size !== 1 ? "s" : ""} deleted.` });
    } catch (err: any) {
      toast({ title: "Failed", description: err.message, variant: "destructive" });
    } finally {
      setClearingPlans(false);
    }
  };

  const handleClearPricingHistory = () => {
    if (!confirm("Clear all saved pricing history from this browser? The current pricing rules will remain but history snapshots will be wiped.")) return;
    setClearingHistory(true);
    try {
      localStorage.removeItem("servicePricingHistory");
      toast({ title: "Pricing History Cleared", description: "All pricing snapshots removed from this browser." });
    } finally {
      setClearingHistory(false);
    }
  };

  // TOON Backup/Restore/Cleanup handlers
  const handleDownloadToonBackup = async () => {
    setBackupLoading(true);
    try {
      const idToken = firebaseUser ? await firebaseUser.getIdToken() : "dev_session_token";
      const res = await fetch("/api/backup", {
        method: "GET",
        headers: { "Authorization": `Bearer ${idToken}` }
      });
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || "Failed to download backup");
      }
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `toon-backup-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      toast({ title: "TOON Backup Downloaded", description: "Legacy data backup saved successfully." });
    } catch (err: any) {
      toast({ title: "Backup Failed", description: err.message, variant: "destructive" });
    } finally {
      setBackupLoading(false);
    }
  };

  const handleRestoreFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) setRestoreFile(file);
  };

  const handleRestoreBackup = async () => {
    if (!restoreFile) return;
    if (!confirm("Restore TOON data from backup file? This will merge with existing data.")) return;

    setRestoreLoading(true);
    try {
      const text = await restoreFile.text();
      const backup = JSON.parse(text);

      const idToken = firebaseUser ? await firebaseUser.getIdToken() : "dev_session_token";
      const res = await fetch("/api/backup", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${idToken}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(backup)
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || "Failed to restore backup");
      }

      const data = await res.json();
      toast({
        title: "TOON Restore Complete",
        description: `Restored ${data.projectsRestored} projects and ${data.servicesRestored} services.`
      });
      setRestoreFile(null);
    } catch (err: any) {
      toast({ title: "Restore Failed", description: err.message, variant: "destructive" });
    } finally {
      setRestoreLoading(false);
    }
  };

  const handleCleanupDatabase = async () => {
    if (cleanupConfirmText !== "CLEANUP") return;

    setCleanupLoading(true);
    try {
      const idToken = firebaseUser ? await firebaseUser.getIdToken() : "dev_session_token";
      const res = await fetch("/api/backup/cleanup", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${idToken}`,
          "x-confirm-cleanup": "true"
        }
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || "Failed to cleanup database");
      }

      const data = await res.json();
      toast({
        title: "Database Cleanup Complete",
        description: "All transactional data deleted. User and system data preserved.",
        className: "bg-emerald-50 text-emerald-900 border-emerald-200 font-bold"
      });
      setCleanupConfirm(false);
      setCleanupConfirmText("");
    } catch (err: any) {
      toast({ title: "Cleanup Failed", description: err.message, variant: "destructive" });
    } finally {
      setCleanupLoading(false);
    }
  };

  useEffect(() => {
    async function fetchSettings() {
      try {
        const docRef = doc(db, "settings", "engineers");
        const snap = await getDoc(docRef);
        if (snap.exists()) {
          const data = snap.data() || {};
          setSettings({
            ...DEFAULT_SETTINGS,
            ...data,
            engineer1: { ...DEFAULT_SETTINGS.engineer1, ...data.engineer1 },
            engineer2: { ...DEFAULT_SETTINGS.engineer2, ...data.engineer2 },
            bank: { ...DEFAULT_SETTINGS.bank, ...data.bank },
            banks: data.banks || DEFAULT_SETTINGS.banks,
            addresses: data.addresses || DEFAULT_SETTINGS.addresses,
            letters: data.letters || DEFAULT_SETTINGS.letters,
          });
        } else {
          // Initialize DB with defaults if it doesn't exist yet
          if (isAdmin) {
            await setDoc(docRef, DEFAULT_SETTINGS);
          }
        }
      } catch (err) {
        console.error("Failed to load settings:", err);
        toast({
          title: "Load Error",
          description: "Could not retrieve engineer contact configurations.",
          variant: "destructive",
        });
      } finally {
        setLoading(false);
      }
    }

    async function fetchPdfs() {
      try {
        const res = await fetch("/api/docs/attachments");
        const data = await res.json();
        if (data.pdfs) {
          setAvailablePdfs(data.pdfs);
        }
      } catch (err) {
        console.error("Failed to load attachments:", err);
      }
    }

    fetchSettings();
    fetchPdfs();
  }, [user, isAdmin, toast]);

  const handleUploadFile = async (file: File) => {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".pdf")) {
      toast({ title: "Invalid File", description: "Only PDF files are allowed.", variant: "destructive" });
      return;
    }
    const formData = new FormData();
    formData.append("file", file);
    try {
      setSaving(true);
      const res = await fetch("/api/docs/attachments", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setAvailablePdfs(prev => prev.includes(data.fileName) ? prev : [...prev, data.fileName]);
        
        // Update configuration and replacement history
        setSettings((prev) => {
          const letters = [...(prev.letters || [])];
          const idx = letters.findIndex((l) => l.fileName === data.fileName);
          if (idx !== -1) {
            const existing = letters[idx];
            const historyEntry: LetterHistoryEntry = {
              replacedAt: new Date().toISOString(),
              previousExpiryDate: existing.expiryDate || (existing.noExpiry ? "No Expiry" : "None")
            };
            letters[idx] = {
              ...existing,
              history: [...(existing.history || []), historyEntry],
              // Optionally clear expiry so user configures the new one, but let's keep it and let them change if needed
            };
          } else {
            letters.push({
              id: data.fileName,
              fileName: data.fileName,
              name: formatPdfName(data.fileName),
              expiryDate: "",
              noExpiry: false,
              attachToProposal: true,
              sendViaEmailWhatsapp: false,
              history: []
            });
          }
          return { ...prev, letters };
        });

        toast({ title: "Upload Success", description: `Successfully uploaded ${data.fileName}` });
      } else {
        toast({ title: "Upload Failed", description: data.error || "Failed to upload file", variant: "destructive" });
      }
    } catch (err: any) {
      toast({ title: "Upload Error", description: err.message || "An error occurred during upload", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteFile = async (fileName: string) => {
    if (!confirm(`Are you sure you want to permanently delete "${fileName}" from the system?`)) return;
    try {
      setSaving(true);
      const res = await fetch(`/api/docs/attachments?file=${encodeURIComponent(fileName)}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setAvailablePdfs((prev) => prev.filter((f) => f !== fileName));
        setSettings((prev) => ({
          ...prev,
          letters: (prev.letters || []).filter((l) => l.fileName !== fileName),
        }));
        toast({ title: "Deleted Successfully", description: `File ${fileName} has been deleted.` });
      } else {
        toast({ title: "Delete Failed", description: data.error || "Failed to delete file", variant: "destructive" });
      }
    } catch (err: any) {
      toast({ title: "Delete Error", description: err.message || "An error occurred during deletion", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const saveLetterConfig = async (updatedLetters?: LetterConfig[]) => {
    if (!isAdmin) return;
    setSaving(true);
    try {
      const docRef = doc(db, "settings", "engineers");
      const targetLetters = updatedLetters || settings.letters;
      await setDoc(docRef, {
        ...settings,
        letters: targetLetters
      });
      setIsDocDirty(false);
      toast({
        title: "Document Settings Saved",
        description: "Legal document configurations updated successfully.",
      });
    } catch (err: any) {
      toast({
        title: "Save Error",
        description: err.message || "Failed to save document configurations.",
        variant: "destructive"
      });
    } finally {
      setSaving(false);
    }
  };

  const updateLetterConfig = (pdfName: string, fields: Partial<LetterConfig>, autoSave = false) => {
    let newLetters: LetterConfig[] = [];
    setSettings((prev) => {
      const letters = [...(prev.letters || [])];
      const idx = letters.findIndex((l) => l.fileName === pdfName);
      if (idx !== -1) {
        letters[idx] = { ...letters[idx], ...fields };
      } else {
        letters.push({
          id: pdfName,
          fileName: pdfName,
          name: formatPdfName(pdfName),
          expiryDate: "",
          noExpiry: false,
          attachToProposal: true,
          sendViaEmailWhatsapp: false,
          ...fields,
        });
      }
      newLetters = letters;
      return { ...prev, letters };
    });
    setIsDocDirty(true);

    if (autoSave) {
      saveLetterConfig(newLetters);
    }
  };

  const handleChange = (engineerKey: "engineer1" | "engineer2" | "bank", field: string, value: string) => {
    setSettings((prev) => ({
      ...prev,
      [engineerKey]: {
        ...(prev[engineerKey] as any),
        [field]: value
      }
    }));
  };

  const handleRootChange = (field: keyof SettingsState, value: string) => {
    setSettings((prev) => ({
      ...prev,
      [field]: value
    }));
  };

  const handleSave = async () => {
    if (!isAdmin) {
      toast({
        title: "Permission Denied",
        description: "Only administrators can modify system settings.",
        variant: "destructive",
      });
      return;
    }

    setSaving(true);
    try {
      const docRef = doc(db, "settings", "engineers");
      await setDoc(docRef, settings);

      // Log this action client-side
      const { logActivityClient } = await import("@/lib/audit-logger-client");
      await logActivityClient(user, "SETTINGS_UPDATE_ENGINEERS", {
        updatedSettings: settings,
      });

      setIsDocDirty(false);
      toast({
        title: "Settings Saved",
        description: "Engineer profile settings updated successfully.",
      });
    } catch (err: any) {
      toast({
        title: "Save Failed",
        description: err.message || "An unexpected error occurred while saving.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-[60vh] flex-col items-center justify-center gap-2 text-muted-foreground p-6">
        <Loader2 className="h-10 w-10 animate-spin text-emerald-500 mb-2" />
        <p className="text-sm font-semibold">Loading system settings...</p>
      </div>
    );
  }

  const previewBank = settings.banks?.find((b: any) => b.isDefault) || settings.banks?.[0] || settings.bank || {};

  return (
    <div className="max-w-7xl mx-auto space-y-8 p-6">
      
      {/* Header Banner */}
      <div className="relative bg-gradient-to-r from-emerald-600 via-teal-700 to-slate-900 rounded-3xl p-8 text-white shadow-lg overflow-hidden">
        <div className="absolute top-0 right-0 w-[400px] h-[200px] bg-white/5 rounded-bl-[200px] pointer-events-none" />
        <div className="relative flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 bg-white/10 px-3.5 py-1 rounded-full text-xs font-semibold tracking-wider uppercase border border-white/10 backdrop-blur-md">
              <Sliders className="h-3 w-3 text-emerald-300" /> Admin Settings Control
            </div>
            <h1 className="text-3xl font-black tracking-tight md:text-4xl">System Configurations</h1>
            <p className="text-emerald-100 text-sm max-w-2xl font-medium">
              Manage the default corporate Engineers, contact designations, numbers and official emails printed on the front profile of all customized client Quotation proposals.
            </p>
          </div>
          
          {isAdmin ? (
            <Button
              onClick={handleSave}
              disabled={saving}
              className="bg-white hover:bg-emerald-50 text-emerald-800 font-extrabold text-sm px-6 py-6 rounded-2xl shadow-md transition-all hover:scale-[1.02] flex items-center gap-2 border border-emerald-100"
            >
              {saving ? <Loader2 className="h-5 w-5 animate-spin" /> : <Save className="h-5 w-5" />}
              {saving ? "Saving Changes..." : "Save Settings"}
            </Button>
          ) : (
            <div className="inline-flex items-center gap-2 bg-amber-500/20 text-amber-200 border border-amber-500/30 px-5 py-3 rounded-2xl text-xs font-bold backdrop-blur-md">
              <ShieldAlert className="h-4 w-4 shrink-0" /> READ-ONLY MODE (Admin required to edit)
            </div>
          )}
        </div>
      </div>

      {/* Settings Subcategories */}
      <Tabs defaultValue="system" className="w-full">
        <TabsList className="mb-6 bg-slate-100/50 dark:bg-slate-800/50 p-1 rounded-xl flex-wrap h-auto gap-1">
          <TabsTrigger value="system" className="rounded-lg px-6 py-2.5 text-sm font-semibold data-[state=active]:bg-white dark:data-[state=active]:bg-slate-900 data-[state=active]:text-emerald-700 dark:data-[state=active]:text-emerald-400 data-[state=active]:shadow-sm">System Configurations</TabsTrigger>
          <TabsTrigger value="account" className="rounded-lg px-6 py-2.5 text-sm font-semibold data-[state=active]:bg-white dark:data-[state=active]:bg-slate-900 data-[state=active]:text-blue-700 dark:data-[state=active]:text-blue-400 data-[state=active]:shadow-sm">User Account</TabsTrigger>
          <TabsTrigger value="service" className="rounded-lg px-6 py-2.5 text-sm font-semibold data-[state=active]:bg-white dark:data-[state=active]:bg-slate-900 data-[state=active]:text-amber-700 dark:data-[state=active]:text-amber-400 data-[state=active]:shadow-sm">Service Settings</TabsTrigger>
          {user?.role === "superadmin" && (
            <TabsTrigger value="data" className="rounded-lg px-6 py-2.5 text-sm font-semibold data-[state=active]:bg-white dark:data-[state=active]:bg-slate-900 data-[state=active]:text-cyan-700 dark:data-[state=active]:text-cyan-400 data-[state=active]:shadow-sm">Data Management</TabsTrigger>
          )}
          {user?.role === "superadmin" && (
            <TabsTrigger value="users" className="rounded-lg px-6 py-2.5 text-sm font-semibold data-[state=active]:bg-white dark:data-[state=active]:bg-slate-900 data-[state=active]:text-purple-700 dark:data-[state=active]:text-purple-400 data-[state=active]:shadow-sm">User Management</TabsTrigger>
          )}
          {isDevEnv && (
            <TabsTrigger value="dev" className="rounded-lg px-6 py-2.5 text-sm font-semibold data-[state=active]:bg-white dark:data-[state=active]:bg-slate-900 data-[state=active]:text-rose-700 dark:data-[state=active]:text-rose-400 data-[state=active]:shadow-sm">Dev Environment</TabsTrigger>
          )}
        </TabsList>
        
        <TabsContent value="system" className="mt-0">
          {/* Main Grid: Form on the left, Premium Live Preview on the right */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            
            {/* Forms Block */}
            <div className="lg:col-span-7 space-y-8">
          
          {/* Engineer 1 Card */}
           <Card className="border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm rounded-2xl overflow-hidden">
            <CardHeader className="bg-slate-50 dark:bg-slate-950/30 border-b border-slate-100 dark:border-slate-800 p-6 flex flex-row items-center gap-4">
              <div className="bg-emerald-500/10 p-3 rounded-xl"><User className="h-6 w-6 text-emerald-600" /></div>
              <div>
                <CardTitle className="text-lg font-black text-slate-800 dark:text-slate-100">Primary Engineer (Engineer 1)</CardTitle>
                <CardDescription className="text-xs mt-0.5">Primary engineer appearing on the first card of contact profile page.</CardDescription>
              </div>
            </CardHeader>
            <CardContent className="p-6 space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div className="space-y-2">
                  <Label className="text-xs font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1.5"><User className="h-3.5 w-3.5"/> Full Name</Label>
                  <Input
                    value={settings.engineer1.name}
                    disabled={!isAdmin}
                    onChange={(e) => handleChange("engineer1", "name", e.target.value)}
                    placeholder="e.g. Wikum Wijesinghe"
                    className="rounded-xl border-slate-200 focus:ring-emerald-500"
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-xs font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1.5"><Briefcase className="h-3.5 w-3.5"/> Designation / Degrees</Label>
                  <Input
                    value={settings.engineer1.designation}
                    disabled={!isAdmin}
                    onChange={(e) => handleChange("engineer1", "designation", e.target.value)}
                    placeholder="e.g. B.Sc. Eng. (Hons), AMIESL"
                    className="rounded-xl border-slate-200 focus:ring-emerald-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div className="space-y-2">
                  <Label className="text-xs font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1.5"><Phone className="h-3.5 w-3.5"/> Contact Phone</Label>
                  <Input
                    value={settings.engineer1.phone}
                    disabled={!isAdmin}
                    onChange={(e) => handleChange("engineer1", "phone", e.target.value)}
                    placeholder="e.g. 077 208 3894"
                    className="rounded-xl border-slate-200 focus:ring-emerald-500"
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-xs font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1.5"><Mail className="h-3.5 w-3.5"/> Direct Email</Label>
                  <Input
                    value={settings.engineer1.email}
                    disabled={!isAdmin}
                    onChange={(e) => handleChange("engineer1", "email", e.target.value)}
                    placeholder="e.g. wikumw@altavision.lk"
                    className="rounded-xl border-slate-200 focus:ring-emerald-500"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Engineer 2 Card */}
          <Card className="border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm rounded-2xl overflow-hidden">
            <CardHeader className="bg-slate-50 dark:bg-slate-950/30 border-b border-slate-100 dark:border-slate-800 p-6 flex flex-row items-center gap-4">
              <div className="bg-emerald-500/10 p-3 rounded-xl"><User className="h-6 w-6 text-emerald-600" /></div>
              <div>
                <CardTitle className="text-lg font-black text-slate-800 dark:text-slate-100">Secondary Engineer (Engineer 2)</CardTitle>
                <CardDescription className="text-xs mt-0.5">Secondary engineer appearing on the second card of contact profile page.</CardDescription>
              </div>
            </CardHeader>
            <CardContent className="p-6 space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div className="space-y-2">
                  <Label className="text-xs font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1.5"><User className="h-3.5 w-3.5"/> Full Name</Label>
                  <Input
                    value={settings.engineer2.name}
                    disabled={!isAdmin}
                    onChange={(e) => handleChange("engineer2", "name", e.target.value)}
                    placeholder="e.g. Oshada Ranawaka"
                    className="rounded-xl border-slate-200 focus:ring-emerald-500"
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-xs font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1.5"><Briefcase className="h-3.5 w-3.5"/> Designation / Degrees</Label>
                  <Input
                    value={settings.engineer2.designation}
                    disabled={!isAdmin}
                    onChange={(e) => handleChange("engineer2", "designation", e.target.value)}
                    placeholder="e.g. B.Sc. Eng. (Hons), AMIESL"
                    className="rounded-xl border-slate-200 focus:ring-emerald-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div className="space-y-2">
                  <Label className="text-xs font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1.5"><Phone className="h-3.5 w-3.5"/> Contact Phone</Label>
                  <Input
                    value={settings.engineer2.phone}
                    disabled={!isAdmin}
                    onChange={(e) => handleChange("engineer2", "phone", e.target.value)}
                    placeholder="e.g. 077 204 7891"
                    className="rounded-xl border-slate-200 focus:ring-emerald-500"
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-xs font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1.5"><Mail className="h-3.5 w-3.5"/> Direct Email</Label>
                  <Input
                    value={settings.engineer2.email}
                    disabled={!isAdmin}
                    onChange={(e) => handleChange("engineer2", "email", e.target.value)}
                    placeholder="e.g. oshader@altavision.lk"
                    className="rounded-xl border-slate-200 focus:ring-emerald-500"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Legal Document Settings */}
          <Card className="border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm rounded-2xl overflow-hidden">
            <CardHeader className="bg-slate-50 dark:bg-slate-950/30 border-b border-slate-100 dark:border-slate-800 p-6 flex flex-row items-center gap-4">
              <div className="bg-emerald-500/10 p-3 rounded-xl"><FileText className="h-6 w-6 text-emerald-600" /></div>
              <div>
                <CardTitle className="text-lg font-black text-slate-800 dark:text-slate-100">Legal Document Expiries</CardTitle>
                <CardDescription className="text-xs mt-0.5">Manage attached authorization letters and their legal expiry dates.</CardDescription>
              </div>
            </CardHeader>
            <CardContent className="p-6">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <Label className="text-xs font-black text-slate-700 dark:text-slate-200 uppercase tracking-widest flex items-center gap-1.5">
                      <CalendarOff className="h-4 w-4 text-destructive"/> Legal PDF Attachments (docs folder)
                    </Label>
                    <CardDescription className="text-[10px] mt-1 text-slate-500 dark:text-slate-400">
                      Files are read directly from the server's local docs folder. Set their friendly names and exprises below.
                    </CardDescription>
                  </div>
                  {isAdmin && (
                    <div>
                      <input 
                        type="file" 
                        accept=".pdf" 
                        className="hidden" 
                        id="global_upload_pdf" 
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) handleUploadFile(file);
                        }}
                      />
                      <label 
                        htmlFor="global_upload_pdf" 
                        className="cursor-pointer inline-flex items-center gap-1.5 px-4 py-2 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white rounded-xl text-xs font-bold shadow-md hover:shadow-lg transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] select-none whitespace-nowrap"
                      >
                        <Plus className="h-4 w-4" /> Upload PDF
                      </label>
                    </div>
                  )}
                </div>

                <div className="space-y-3">
                  {availablePdfs.length === 0 ? (
                    <div className="text-center py-6 border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-xl text-slate-400 text-xs">
                      No PDF letters found in the docs folder. Upload one above to get started.
                    </div>
                  ) : (
                    availablePdfs.map((pdfName) => {
                      const letObj = (settings.letters || []).find((l) => l.fileName === pdfName) || {
                        id: pdfName,
                        fileName: pdfName,
                        name: formatPdfName(pdfName),
                        expiryDate: "",
                        noExpiry: false,
                        attachToProposal: true,
                        sendViaEmailWhatsapp: false
                      };
                      const isExpired = !letObj.noExpiry && letObj.expiryDate && new Date(letObj.expiryDate) < new Date(new Date().setHours(0,0,0,0));

                      return (
                        <div key={pdfName} className="bg-slate-50 dark:bg-slate-900/50 p-4 rounded-xl border border-slate-200 dark:border-slate-800/80 space-y-4">
                          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
                            
                            {/* Left Column: Display Name & Filename Badge (5 cols) */}
                            <div className="lg:col-span-5 space-y-2">
                              <div className="space-y-1">
                                <Label className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Friendly Display Name</Label>
                                <Input
                                  value={letObj.name}
                                  placeholder={formatPdfName(pdfName)}
                                  disabled={!isAdmin}
                                  onChange={(e) => updateLetterConfig(pdfName, { name: e.target.value })}
                                  className="h-9 text-xs font-semibold rounded-lg bg-white dark:bg-slate-950 border-slate-200 dark:border-slate-850 w-full"
                                />
                              </div>
                              <div className="flex items-center gap-1.5 text-[9px] text-slate-450 font-mono bg-white dark:bg-slate-950 px-2 py-1 rounded border border-slate-200/50 dark:border-slate-850/50 w-fit">
                                <FileText className="h-3.5 w-3.5 text-slate-400" />
                                {pdfName}
                              </div>
                            </div>

                            {/* Middle Column: Checkboxes (4 cols) */}
                            <div className="lg:col-span-4 space-y-1">
                              <Label className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Document Settings</Label>
                              <div className="flex flex-col gap-2 bg-white dark:bg-slate-950 p-2.5 rounded-lg border border-slate-200/60 dark:border-slate-850/60">
                                <label className="flex items-center gap-2 cursor-pointer text-[11px] font-bold text-slate-600 dark:text-slate-400 select-none">
                                  <input
                                    type="checkbox"
                                    checked={letObj.noExpiry || false}
                                    disabled={!isAdmin}
                                    onChange={(e) => updateLetterConfig(pdfName, { noExpiry: e.target.checked })}
                                    className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 h-4 w-4 bg-white dark:bg-slate-950 dark:border-slate-800"
                                  />
                                  <span>Ignore Expiry Date</span>
                                </label>
                                
                                <label className="flex items-center gap-2 cursor-pointer text-[11px] font-bold text-slate-600 dark:text-slate-400 select-none">
                                  <input
                                    type="checkbox"
                                    checked={letObj.attachToProposal !== false}
                                    disabled={!isAdmin}
                                    onChange={(e) => updateLetterConfig(pdfName, { attachToProposal: e.target.checked })}
                                    className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 h-4 w-4 bg-white dark:bg-slate-950 dark:border-slate-800"
                                  />
                                  <span>Attach to Proposal at End</span>
                                </label>

                                <label className="flex items-center gap-2 cursor-pointer text-[11px] font-bold text-slate-600 dark:text-slate-400 select-none">
                                  <input
                                    type="checkbox"
                                    checked={letObj.sendViaEmailWhatsapp || false}
                                    disabled={!isAdmin}
                                    onChange={(e) => updateLetterConfig(pdfName, { sendViaEmailWhatsapp: e.target.checked })}
                                    className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 h-4 w-4 bg-white dark:bg-slate-950 dark:border-slate-800"
                                  />
                                  <span>Email / WhatsApp Shareable</span>
                                </label>
                              </div>
                            </div>

                            {/* Right Column: Expiry & Actions (3 cols) */}
                            <div className="lg:col-span-3 space-y-2">
                              <div className="space-y-1">
                                <Label className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider block">Expiry Date</Label>
                                <div className={`w-full ${letObj.noExpiry ? "opacity-30 pointer-events-none" : ""}`}>
                                  <Input
                                    type="date"
                                    value={letObj.expiryDate || ""}
                                    disabled={!isAdmin || letObj.noExpiry}
                                    onChange={(e) => updateLetterConfig(pdfName, { expiryDate: e.target.value })}
                                    className={`h-9 text-xs rounded-lg bg-white dark:bg-slate-950 border-slate-200 dark:border-slate-850 w-full ${isExpired ? "border-red-300 text-red-700 dark:text-red-400 bg-red-50/20" : ""}`}
                                  />
                                </div>
                              </div>
                              
                              <div className="flex flex-col gap-2 pt-0.5">
                                <div className="flex gap-1 flex-wrap items-center">
                                  {letObj.attachToProposal === false && (
                                    <Badge className="bg-slate-100 dark:bg-slate-900 text-slate-650 dark:text-slate-400 font-bold text-[9px] uppercase tracking-wider py-0.5 px-1.5 border border-slate-200 dark:border-slate-800 rounded-md">External Only</Badge>
                                  )}
                                  {letObj.sendViaEmailWhatsapp && (
                                    <Badge className="bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 font-bold text-[9px] uppercase tracking-wider py-0.5 px-1.5 border border-blue-200/50 dark:border-blue-800 rounded-md">Email/WA Share</Badge>
                                  )}
                                  {letObj.noExpiry ? (
                                    <Badge className="bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 font-bold text-[9px] uppercase tracking-wider py-0.5 px-1.5 border border-emerald-200 dark:border-emerald-800 rounded-md">No Expiry</Badge>
                                  ) : isExpired ? (
                                    <Badge className="bg-red-500 hover:bg-red-650 text-white font-bold text-[9px] uppercase tracking-wider py-0.5 px-1.5 rounded-md">Expired</Badge>
                                  ) : letObj.expiryDate ? (
                                    <Badge className="bg-blue-100 dark:bg-blue-950/40 text-blue-700 dark:text-blue-400 font-bold text-[9px] uppercase tracking-wider py-0.5 px-1.5 border border-blue-200 dark:border-blue-800 rounded-md">Active</Badge>
                                  ) : (
                                    <Badge className="bg-amber-100 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 font-bold text-[9px] uppercase tracking-wider py-0.5 px-1.5 border border-amber-200 dark:border-amber-800 rounded-md">Needs Expiry</Badge>
                                  )}
                                </div>

                                {isAdmin && (
                                  <div className="flex items-center gap-1.5 w-full">
                                    <input 
                                      type="file" 
                                      accept=".pdf" 
                                      className="hidden" 
                                      id={`replace_${pdfName}`} 
                                      onChange={(e) => {
                                        const file = e.target.files?.[0];
                                        if (file) {
                                          const renamedFile = new File([file], pdfName, { type: file.type });
                                          handleUploadFile(renamedFile);
                                        }
                                      }}
                                    />
                                    <label 
                                      htmlFor={`replace_${pdfName}`} 
                                      className="cursor-pointer flex-grow inline-flex items-center justify-center gap-1.5 h-8 px-2.5 rounded-xl border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-350 hover:bg-slate-105 dark:hover:bg-slate-900/60 text-[11px] font-bold bg-white dark:bg-slate-950 shadow-sm transition-all hover:scale-[1.02] active:scale-[0.98] select-none shrink-0"
                                    >
                                      <UploadCloud className="h-3.5 w-3.5 text-slate-400" />
                                      Replace File
                                    </label>
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      className="h-8 w-8 p-0 text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-xl transition-all select-none border border-slate-200 dark:border-slate-800 dark:hover:border-red-950/40 flex items-center justify-center shrink-0"
                                      onClick={() => handleDeleteFile(pdfName)}
                                    >
                                      <Trash2 className="h-4 w-4" />
                                    </Button>
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>

                          {letObj.history && letObj.history.length > 0 && (
                            <div className="text-[10px] bg-white dark:bg-slate-950 p-2.5 rounded-lg border border-slate-200/50 dark:border-slate-850/50 space-y-1">
                              <p className="font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider text-[8px]">Replacement History</p>
                              <div className="divide-y divide-slate-100 dark:divide-slate-900">
                                {letObj.history.slice(-3).reverse().map((h, i) => (
                                  <div key={i} className="flex justify-between py-1 text-slate-550 dark:text-slate-400 font-semibold font-mono">
                                    <span>Replaced on {new Date(h.replacedAt).toLocaleDateString()}</span>
                                    <span>Previous Expiry: {h.previousExpiryDate === "No Expiry" ? "No Expiry" : h.previousExpiryDate ? new Date(h.previousExpiryDate).toLocaleDateString() : "None"}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>

                <p className="text-[10px] text-muted-foreground leading-relaxed mt-2 bg-yellow-50/50 dark:bg-yellow-950/10 border border-yellow-100 dark:border-yellow-900/40 p-2.5 rounded-lg">
                  <strong>Important Compliance Check:</strong> If any configured letter has passed its expiry date, proposal creation, preview generation, and PDF conversion will be locked until an administrator uploads the new legal certificate/letter and updates its expiry date above. Letters set to "Ignore Expiry" will bypass this check.
                </p>

                {isDocDirty && (
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-emerald-500/10 dark:bg-emerald-950/30 border border-emerald-500/25 p-3.5 rounded-xl animate-pulse mt-4">
                    <span className="text-xs font-bold text-emerald-800 dark:text-emerald-400">
                      ⚠️ Document settings have unsaved changes!
                    </span>
                    <Button
                      onClick={() => saveLetterConfig()}
                      disabled={saving}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs px-4 py-2 rounded-xl shadow-md flex items-center gap-1.5 self-end sm:self-auto"
                    >
                      {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                      Save Document Settings
                    </Button>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Company Contact Settings Card */}
          <Card className="border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm rounded-2xl overflow-hidden">
            <CardHeader className="bg-slate-50 dark:bg-slate-950/30 border-b border-slate-100 dark:border-slate-800 p-6 flex flex-row items-center gap-4">
              <div className="bg-blue-500/10 p-3 rounded-xl"><Mail className="h-6 w-6 text-blue-600" /></div>
              <div>
                <CardTitle className="text-lg font-black text-slate-800 dark:text-slate-100">Company Contact Settings</CardTitle>
                <CardDescription className="text-xs mt-0.5">Configure default official company email and WhatsApp number printed on payment instructions.</CardDescription>
              </div>
            </CardHeader>
            <CardContent className="p-6 space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div className="space-y-2">
                  <Label className="text-xs font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1.5"><Mail className="h-3.5 w-3.5"/> Payment Receipt Email</Label>
                  <Input
                    value={settings.companyEmail || ""}
                    disabled={!isAdmin}
                    onChange={(e) => {
                      setSettings({ ...settings, companyEmail: e.target.value });
                      setIsDocDirty(true);
                    }}
                    placeholder="e.g. quotations@altavision.lk"
                    className="rounded-xl border-slate-200 focus:ring-emerald-500"
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-xs font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1.5"><Phone className="h-3.5 w-3.5"/> Payment Receipt WhatsApp</Label>
                  <Input
                    value={settings.companyWhatsapp || ""}
                    disabled={!isAdmin}
                    onChange={(e) => {
                      setSettings({ ...settings, companyWhatsapp: e.target.value });
                      setIsDocDirty(true);
                    }}
                    placeholder="e.g. 0742681807"
                    className="rounded-xl border-slate-200 focus:ring-emerald-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div className="space-y-2">
                  <Label className="text-xs font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1.5">VAT Registration Number</Label>
                  <Input
                    value={settings.vatRegNo || ""}
                    disabled={!isAdmin}
                    onChange={(e) => {
                      setSettings({ ...settings, vatRegNo: e.target.value });
                      setIsDocDirty(true);
                    }}
                    placeholder="e.g. 174909482 - 7000"
                    className="rounded-xl border-slate-200 focus:ring-emerald-500"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Company Addresses Card */}
          <Card className="border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm rounded-2xl overflow-hidden">
            <CardHeader className="bg-slate-50 dark:bg-slate-950/30 border-b border-slate-100 dark:border-slate-800 p-6 flex flex-row items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="bg-emerald-500/10 p-3 rounded-xl"><Sliders className="h-6 w-6 text-emerald-600" /></div>
                <div>
                  <CardTitle className="text-lg font-black text-slate-800 dark:text-slate-100">Predefined Company Addresses</CardTitle>
                  <CardDescription className="text-xs mt-0.5">Addresses selectable in the quotation top header.</CardDescription>
                </div>
              </div>
              {isAdmin && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="rounded-xl border-emerald-600/20 text-emerald-700 hover:bg-emerald-50/60 font-bold"
                  onClick={() => {
                    const currentAddresses = settings.addresses || [];
                    setSettings({
                      ...settings,
                      addresses: [...currentAddresses, "New Company Address"]
                    });
                    setIsDocDirty(true);
                  }}
                >
                  <Plus className="h-4 w-4 mr-1.5" /> Add Address
                </Button>
              )}
            </CardHeader>
            <CardContent className="p-6 space-y-4">
              {(settings.addresses || []).length === 0 ? (
                <div className="text-center py-6 border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-xl text-slate-400 text-xs">
                  No company addresses configured. Add one above.
                </div>
              ) : (
                <div className="space-y-3">
                  {(settings.addresses || []).map((addr, idx) => (
                    <div key={idx} className="flex items-center gap-3">
                      <Input
                        value={addr}
                        disabled={!isAdmin}
                        onChange={(e) => {
                          const newAddresses = [...(settings.addresses || [])];
                          newAddresses[idx] = e.target.value;
                          setSettings({
                            ...settings,
                            addresses: newAddresses
                          });
                          setIsDocDirty(true);
                        }}
                        placeholder="Company Address"
                        className="rounded-xl border-slate-200 focus:ring-emerald-500"
                      />
                      {isAdmin && (
                        <Button
                          type="button"
                          variant="ghost"
                          className="h-9 w-9 p-0 text-red-500 hover:text-red-650 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-xl transition-all border border-slate-200 dark:border-slate-800 shrink-0"
                          onClick={() => {
                            if (!confirm("Are you sure you want to delete this address?")) return;
                            const newAddresses = (settings.addresses || []).filter((_, i) => i !== idx);
                            setSettings({
                              ...settings,
                              addresses: newAddresses
                            });
                            setIsDocDirty(true);
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Multiple Bank Accounts Card */}
          <Card className="border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm rounded-2xl overflow-hidden">
            <CardHeader className="bg-slate-50 dark:bg-slate-950/30 border-b border-slate-100 dark:border-slate-800 p-6 flex flex-row items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="bg-blue-500/10 p-3 rounded-xl"><Landmark className="h-6 w-6 text-blue-600" /></div>
                <div>
                  <CardTitle className="text-lg font-black text-slate-800 dark:text-slate-100">Predefined Bank Accounts</CardTitle>
                  <CardDescription className="text-xs mt-0.5">Predefined bank accounts selectable for EFT payments on quotes.</CardDescription>
                </div>
              </div>
              {isAdmin && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="rounded-xl border-blue-600/20 text-blue-700 hover:bg-blue-50/60 font-bold"
                  onClick={() => {
                    const currentBanks = settings.banks || [];
                    setSettings({
                      ...settings,
                      banks: [
                        ...currentBanks,
                        {
                          accountName: "Alta Vision (Pvt) Ltd",
                          bankName: "",
                          branch: "",
                          accountNumber: "",
                          isDefault: currentBanks.length === 0
                        }
                      ]
                    });
                    setIsDocDirty(true);
                  }}
                >
                  <Plus className="h-4 w-4 mr-1.5" /> Add Bank
                </Button>
              )}
            </CardHeader>
            <CardContent className="p-6 space-y-6">
              {(settings.banks || []).length === 0 ? (
                <div className="text-center py-6 border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-xl text-slate-400 text-xs">
                  No bank accounts configured. Add one above.
                </div>
              ) : (
                <div className="space-y-6 divide-y divide-slate-100 dark:divide-slate-800">
                  {(settings.banks || []).map((b, idx) => (
                    <div key={idx} className={`space-y-4 ${idx > 0 ? "pt-6" : ""}`}>
                      <div className="flex justify-between items-center">
                        <div className="flex items-center gap-2">
                          <Badge className="bg-blue-500/10 text-blue-600 dark:text-blue-400 font-bold uppercase tracking-wider text-[9px] py-1 px-2.5 rounded-md">
                            Account #{idx + 1}
                          </Badge>
                          {b.isDefault ? (
                            <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 font-bold uppercase tracking-wider text-[9px] py-1 px-2.5 rounded-md border border-emerald-500/20 flex items-center gap-1">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                              Default Payment Account
                            </Badge>
                          ) : (
                            isAdmin && (
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="h-6 text-[9px] font-extrabold text-slate-500 hover:text-blue-650 hover:bg-blue-50/50 rounded-md border border-slate-200"
                                onClick={() => {
                                  const newBanks = (settings.banks || []).map((bank, i) => ({
                                    ...bank,
                                    isDefault: i === idx
                                  }));
                                  setSettings({ ...settings, banks: newBanks });
                                  setIsDocDirty(true);
                                }}
                              >
                                Set as Default
                              </Button>
                            )
                          )}
                        </div>
                        {isAdmin && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-8 text-red-500 hover:text-red-650 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-lg border border-slate-200 dark:border-slate-800"
                            onClick={() => {
                              if (!confirm("Are you sure you want to delete this bank account?")) return;
                              const newBanks = (settings.banks || []).filter((_, i) => i !== idx);
                              if (b.isDefault && newBanks.length > 0) {
                                newBanks[0].isDefault = true;
                              }
                              setSettings({
                                ...settings,
                                banks: newBanks
                              });
                              setIsDocDirty(true);
                            }}
                          >
                            <Trash2 className="h-3.5 w-3.5 mr-1" /> Delete Account
                          </Button>
                        )}
                      </div>
                      
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                          <Label className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Account Name</Label>
                          <Input
                            value={b.accountName}
                            disabled={!isAdmin}
                            onChange={(e) => {
                              const newBanks = [...(settings.banks || [])];
                              newBanks[idx] = { ...newBanks[idx], accountName: e.target.value };
                              setSettings({ ...settings, banks: newBanks });
                              setIsDocDirty(true);
                            }}
                            placeholder="e.g. Alta Vision (Pvt) Ltd"
                            className="h-9 text-xs rounded-xl"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Bank Name</Label>
                          <Input
                            value={b.bankName}
                            disabled={!isAdmin}
                            onChange={(e) => {
                              const newBanks = [...(settings.banks || [])];
                              newBanks[idx] = { ...newBanks[idx], bankName: e.target.value };
                              setSettings({ ...settings, banks: newBanks });
                              setIsDocDirty(true);
                            }}
                            placeholder="e.g. NTB"
                            className="h-9 text-xs rounded-xl"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Branch</Label>
                          <Input
                            value={b.branch}
                            disabled={!isAdmin}
                            onChange={(e) => {
                              const newBanks = [...(settings.banks || [])];
                              newBanks[idx] = { ...newBanks[idx], branch: e.target.value };
                              setSettings({ ...settings, banks: newBanks });
                              setIsDocDirty(true);
                            }}
                            placeholder="e.g. Tangalle"
                            className="h-9 text-xs rounded-xl"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Account Number</Label>
                          <Input
                            value={b.accountNumber}
                            disabled={!isAdmin}
                            onChange={(e) => {
                              const newBanks = [...(settings.banks || [])];
                              newBanks[idx] = { ...newBanks[idx], accountNumber: e.target.value };
                              setSettings({ ...settings, banks: newBanks });
                              setIsDocDirty(true);
                            }}
                            placeholder="e.g. 100890008235"
                            className="h-9 text-xs rounded-xl font-mono"
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

        </div>

        {/* Live Preview Column */}
        <div className="lg:col-span-5 space-y-6">
          <div className="sticky top-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-black text-slate-400 uppercase tracking-wider flex items-center gap-2">
                <FileText className="h-4 w-4 text-emerald-500" /> Page 2 Live Preview
              </h3>
              <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-600 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full uppercase tracking-wider">
                <CheckCircle2 className="h-3 w-3 shrink-0" /> Dynamic Sync
              </span>
            </div>

            <div className="bg-slate-100 dark:bg-slate-950 p-6 rounded-3xl border border-slate-200/80 shadow-inner flex justify-center items-center overflow-hidden">
              
              {/* Scaled letterhead container mimicking Page 2 layout */}
              <div className="w-[380px] bg-white border border-slate-300 shadow-md p-6 flex flex-col space-y-5 rounded-2xl relative overflow-hidden select-none select-none pointer-events-none transform scale-95 transition-all">
                
                {/* Accent */}
                <div className="absolute top-0 right-0 w-[120px] h-[30px] bg-emerald-500/10 rounded-bl-[30px] flex items-center justify-end pr-3 pb-1">
                  <span className="text-[5px] font-bold text-emerald-800 tracking-wider uppercase">Alta Vision Solar</span>
                </div>

                <div className="flex flex-col items-center justify-center text-center mt-2">
                  <img src="/logo.png" alt="Alta Vision" className="h-6 object-contain mb-1" />
                  <p className="text-[6px] text-slate-400 font-bold uppercase mt-0.5">Business Reg: PV 90948</p>
                </div>

                {/* 3-Column Offices (Compact) */}
                <div className="grid grid-cols-3 gap-1.5">
                  <div className="bg-slate-50 border border-slate-200/60 rounded p-1.5 text-[5px] space-y-1">
                    <p className="font-extrabold text-emerald-700 uppercase">Reg. Office</p>
                    <p className="text-slate-500 leading-tight">42, Ruhunusiri Garden, Hakmana Road, Matara.</p>
                  </div>
                  <div className="bg-slate-50 border border-slate-200/60 rounded p-1.5 text-[5px] space-y-1">
                    <p className="font-extrabold text-emerald-700 uppercase">Main Office</p>
                    <p className="text-slate-500 leading-tight">No 23D, Sri Rathanapala Mawatha, Nupe, Matara.</p>
                  </div>
                  <div className="bg-slate-50 border border-slate-200/60 rounded p-1.5 text-[5px] space-y-1">
                    <p className="font-extrabold text-emerald-700 uppercase">Head Office</p>
                    <p className="text-slate-500 leading-tight">298A, Borella Road, Habarakada, Nupe.</p>
                  </div>
                </div>

                {/* Engineer Cards (Interactive Live Mirror!) */}
                <div className="space-y-2">
                  <p className="text-center font-bold text-slate-400 uppercase tracking-widest text-[5px]">Engineers / Contact Us</p>
                  
                  <div className="grid grid-cols-2 gap-2">
                    <div className="bg-white border border-slate-200 shadow-sm rounded-lg p-2.5 relative overflow-hidden flex flex-col justify-between min-h-[65px]">
                      <div className="absolute top-0 left-0 w-full h-[1.5px] bg-emerald-500"></div>
                      <div>
                        <p className="font-black text-slate-800 text-[7px] truncate">{settings.engineer1.name || "Wikum Wijesinghe"}</p>
                        <p className="text-[5px] text-slate-400 font-bold uppercase truncate mt-0.5">{settings.engineer1.designation || "B.Sc. Eng. (Hons), AMIESL"}</p>
                      </div>
                      <div className="mt-2 pt-1 border-t border-slate-100 text-[6px] text-slate-600 space-y-0.5 font-medium">
                        <p className="text-slate-800 truncate">📞 {settings.engineer1.phone || "077 208 3894"}</p>
                        <p className="text-slate-500 truncate">✉️ {settings.engineer1.email || "wikumw@altavision.lk"}</p>
                      </div>
                    </div>

                    <div className="bg-white border border-slate-200 shadow-sm rounded-lg p-2.5 relative overflow-hidden flex flex-col justify-between min-h-[65px]">
                      <div className="absolute top-0 left-0 w-full h-[1.5px] bg-emerald-500"></div>
                      <div>
                        <p className="font-black text-slate-800 text-[7px] truncate">{settings.engineer2.name || "Oshada Ranawaka"}</p>
                        <p className="text-[5px] text-slate-400 font-bold uppercase truncate mt-0.5">{settings.engineer2.designation || "B.Sc. Eng. (Hons), AMIESL"}</p>
                      </div>
                      <div className="mt-2 pt-1 border-t border-slate-100 text-[6px] text-slate-600 space-y-0.5 font-medium">
                        <p className="text-slate-800 truncate">📞 {settings.engineer2.phone || "077 204 7891"}</p>
                        <p className="text-slate-500 truncate">✉️ {settings.engineer2.email || "oshader@altavision.lk"}</p>
                      </div>
                    </div>
                  </div>
                </div>
                {/* Footer disclaimer (scaled preview) */}
                <div className="bg-slate-50 border border-slate-200/60 rounded p-2 text-[4.5px] text-slate-400 text-justify leading-tight">
                  No part of this publication may be reproduced or transmitted without prior written permission from Alta Vision (Pvt) Ltd.
                </div>

              </div>

            </div>

            <p className="text-xs text-slate-400 font-medium text-center mt-3 mb-6">
              This preview matches the dynamic design, layout alignment, and typography of Page 2 of the printable client proposal.
            </p>

            {/* Quotation Bank Account Live Preview */}
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-black text-slate-400 uppercase tracking-wider flex items-center gap-2">
                <Landmark className="h-4 w-4 text-blue-500" /> Quotation Bank Live Preview
              </h3>
              <span className="inline-flex items-center gap-1 text-[10px] font-bold text-blue-600 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-full uppercase tracking-wider">
                <CheckCircle2 className="h-3 w-3 shrink-0" /> Dynamic Sync
              </span>
            </div>

            <div className="bg-slate-100 dark:bg-slate-950 p-6 rounded-3xl border border-slate-200/80 shadow-inner flex justify-center items-center">
              <div className="w-[380px] bg-white border border-slate-300 shadow-md p-6 flex flex-col space-y-4 rounded-2xl relative overflow-hidden select-none pointer-events-none">
                <div className="absolute top-0 left-0 w-full h-[3.5px] bg-blue-600"></div>
                <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                  <span className="text-[7px] font-black text-blue-800 uppercase tracking-wider">Payment Details</span>
                  <img src="/logo.png" alt="Alta Vision" className="h-4 object-contain" />
                </div>
                <div className="space-y-2.5 text-[6.5px]">
                  <div className="grid grid-cols-3 gap-1">
                    <span className="text-slate-400 font-extrabold uppercase col-span-1">Account Name:</span>
                    <span className="font-extrabold text-slate-800 col-span-2">{previewBank?.accountName || "Alta Vision (Pvt) Ltd"}</span>
                  </div>
                  <div className="grid grid-cols-3 gap-1">
                    <span className="text-slate-400 font-extrabold uppercase col-span-1">Bank Name:</span>
                    <span className="font-extrabold text-slate-800 col-span-2">{previewBank?.bankName || "NTB"}</span>
                  </div>
                  <div className="grid grid-cols-3 gap-1">
                    <span className="text-slate-400 font-extrabold uppercase col-span-1">Branch Name:</span>
                    <span className="font-extrabold text-slate-800 col-span-2">{previewBank?.branch || "Tangalle"}</span>
                  </div>
                  <div className="grid grid-cols-3 gap-1">
                    <span className="text-slate-400 font-extrabold uppercase col-span-1">Account Number:</span>
                    <span className="font-black text-blue-700 text-[7px] col-span-2">{previewBank?.accountNumber || "1008 9000 8235"}</span>
                  </div>
                </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </TabsContent>

        <TabsContent value="account" className="mt-0">
          <Card className="border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm rounded-2xl overflow-hidden max-w-2xl">
            <CardHeader className="bg-slate-50 dark:bg-slate-950/30 border-b border-slate-100 dark:border-slate-800 p-6 flex flex-row items-center gap-4">
              <div className="bg-blue-500/10 p-3 rounded-xl"><User className="h-6 w-6 text-blue-600" /></div>
              <div>
                <CardTitle className="text-lg font-black text-slate-800 dark:text-slate-100">My Profile</CardTitle>
                <CardDescription className="text-xs mt-0.5">Manage your personal account details and preferences.</CardDescription>
              </div>
            </CardHeader>
            <CardContent className="p-6 space-y-5">
              <div className="space-y-4">
                <div className="grid gap-2">
                  <Label className="text-xs font-bold text-slate-500 uppercase tracking-widest">Full Name</Label>
                  <div className="flex items-center gap-3 p-3 bg-slate-50 dark:bg-slate-950/40 rounded-xl border border-slate-100 dark:border-slate-800">
                    <User className="h-5 w-5 text-slate-400" />
                    <span className="text-sm font-medium text-slate-700 dark:text-slate-350">{user?.displayName || "No name set"}</span>
                  </div>
                </div>

                <div className="grid gap-2">
                  <Label className="text-xs font-bold text-slate-500 uppercase tracking-widest">Email Address</Label>
                  <div className="flex items-center gap-3 p-3 bg-slate-50 dark:bg-slate-950/40 rounded-xl border border-slate-100 dark:border-slate-800">
                    <Mail className="h-5 w-5 text-slate-400" />
                    <span className="text-sm font-medium text-slate-700 dark:text-slate-350">{user?.email || "No email available"}</span>
                  </div>
                </div>
                
                <div className="grid gap-2">
                  <Label className="text-xs font-bold text-slate-500 uppercase tracking-widest">Account Role</Label>
                  <div className="flex items-center gap-3 p-3 bg-slate-50 dark:bg-slate-950/40 rounded-xl border border-slate-100 dark:border-slate-800">
                    <ShieldAlert className="h-5 w-5 text-slate-400" />
                    <span className="text-sm font-medium text-slate-700 dark:text-slate-350 capitalize">{user?.role || "user"}</span>
                  </div>
                </div>

                <div className="grid gap-2">
                  <Label className="text-xs font-bold text-slate-500 uppercase tracking-widest">Language Preference / භාෂාව</Label>
                  <div className="max-w-xs notranslate">
                    <LanguageToggle />
                  </div>
                </div>
                
                <div className="pt-4 border-t border-slate-100">
                  <p className="text-xs text-slate-500 leading-relaxed">
                    If you need to change your email or update your account permissions, please contact a system administrator. Role upgrades must be approved by management.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
        
        {/* ── Service Settings ── */}
        <TabsContent value="service" className="mt-0 animate-in fade-in-50 duration-200">
          <div className="max-w-2xl space-y-6">

            {/* Cloud Storage Provider */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-black flex items-center gap-2">
                  <Cloud className="h-4 w-4 text-amber-600" /> Cloud Storage
                </CardTitle>
                <CardDescription className="text-xs">
                  Select where service photos are uploaded. Photos are compressed to 300–400 KB before upload.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">

                {/* Provider picker */}
                <div className="grid grid-cols-2 gap-2">
                  {([
                    { id: "firebase",     name: "Firebase Storage", emoji: "🔥", desc: "Internal · No setup needed" },
                    { id: "google_drive", name: "Google Drive",      emoji: "🟡", desc: "Google Workspace folder" },
                    { id: "onedrive",     name: "OneDrive",          emoji: "🔵", desc: "Microsoft 365 account" },
                    { id: "mega",         name: "Mega",              emoji: "🔴", desc: "Mega.nz cloud storage" },
                  ] as { id: CloudProvider; name: string; emoji: string; desc: string }[]).map(p => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setCloudProvider(p.id)}
                      className={cn(
                        "relative flex items-start gap-3 rounded-xl border-2 p-3 text-left transition-all",
                        cloudProvider === p.id
                          ? "border-amber-400 bg-amber-50 dark:bg-amber-950/20 shadow-sm"
                          : "border-border/50 hover:border-border bg-background hover:bg-muted/30"
                      )}
                    >
                      {cloudProvider === p.id && (
                        <span className="absolute top-2 right-2 h-4 w-4 rounded-full bg-amber-500 flex items-center justify-center">
                          <Check className="h-2.5 w-2.5 text-white" />
                        </span>
                      )}
                      <span className="text-xl shrink-0 leading-none mt-0.5">{p.emoji}</span>
                      <div className="min-w-0">
                        <p className="text-xs font-black text-foreground leading-tight">{p.name}</p>
                        <p className="text-[10px] text-muted-foreground mt-0.5">{p.desc}</p>
                      </div>
                    </button>
                  ))}
                </div>

                {/* ── Firebase config ── */}
                {cloudProvider === "firebase" && (
                  <>
                    <div className="flex items-center gap-3">
                      <div className={`h-2.5 w-2.5 rounded-full shrink-0 ${
                        storageStatus === "ok"       ? "bg-emerald-500" :
                        storageStatus === "error"    ? "bg-red-500" :
                        storageStatus === "checking" ? "bg-amber-400 animate-pulse" : "bg-slate-300"
                      }`} />
                      <span className="text-sm font-semibold">
                        {storageStatus === "ok" ? "Connected" : storageStatus === "error" ? "Connection failed" : storageStatus === "checking" ? "Checking…" : "Not tested"}
                      </span>
                      {storageStatus === "error" && storageError && (
                        <span className="text-xs text-red-600 truncate max-w-xs">{storageError}</span>
                      )}
                      <div className="ml-auto flex gap-2">
                        <Button size="sm" variant="outline" className="gap-1.5 h-8 text-xs font-bold"
                          onClick={testStorageConnection} disabled={storageStatus === "checking"}>
                          {storageStatus === "checking" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                          Test Connection
                        </Button>
                        <Button size="sm" className="gap-1.5 h-8 text-xs font-bold bg-amber-600 hover:bg-amber-700 text-white"
                          onClick={loadRecentPhotos} disabled={loadingPhotos}>
                          {loadingPhotos ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Camera className="h-3.5 w-3.5" />}
                          Load Recent
                        </Button>
                      </div>
                    </div>
                    <div className="rounded-lg border border-border/50 bg-muted/20 px-3 py-2 text-xs text-muted-foreground space-y-0.5">
                      <p><span className="font-bold">Path:</span> <code className="font-mono text-[10px]">service_photos/&#123;projectNo&#125;/&#123;planNo&#125;_&#123;date&#125;/&#123;taskId&#125;_&#123;phase&#125;/&#123;timestamp&#125;.jpg</code></p>
                      <p><span className="font-bold">Compression:</span> 300–400 KB per photo (HD quality)</p>
                    </div>
                    {recentPhotos.length > 0 && (
                      <div className="space-y-2">
                        <h4 className="text-xs font-black uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
                          <Image className="h-3.5 w-3.5" /> Recent Uploads ({recentPhotos.length})
                        </h4>
                        <div className="grid grid-cols-4 gap-2">
                          {recentPhotos.map((p, i) => (
                            <a key={i} href={p.url} target="_blank" rel="noopener noreferrer" className="group relative">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={p.url} alt={p.name} className="w-full h-20 object-cover rounded-lg border border-border/50 group-hover:border-amber-400 transition-colors" />
                              <div className="absolute inset-x-0 bottom-0 bg-black/60 rounded-b-lg px-1 py-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                <p className="text-[8px] text-white truncate">{p.name}</p>
                              </div>
                            </a>
                          ))}
                        </div>
                      </div>
                    )}
                    {storageStatus === "idle" && recentPhotos.length === 0 && (
                      <p className="text-xs text-muted-foreground text-center py-3">
                        Click &quot;Test Connection&quot; to verify access, or &quot;Load Recent&quot; to view uploaded photos.
                      </p>
                    )}
                  </>
                )}

                {/* ── Google Drive config ── */}
                {cloudProvider === "google_drive" && (
                  <div className="space-y-3">
                    <div className="rounded-xl border border-blue-200 dark:border-blue-900/40 bg-blue-50/50 dark:bg-blue-950/10 p-3 text-xs space-y-1.5">
                      <p className="font-black text-blue-900 dark:text-blue-300">Setup Steps</p>
                      <ol className="list-decimal list-inside space-y-1 text-blue-800 dark:text-blue-400">
                        <li>Create a Google Cloud project and enable the Drive API</li>
                        <li>Create a Service Account and download its JSON key</li>
                        <li>Share your target Drive folder with the service account email (Editor)</li>
                        <li>Enter the Folder ID from the Drive URL and the service account email below</li>
                      </ol>
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Google Drive Folder ID</label>
                      <Input value={cloudGDriveFolderId} onChange={e => setCloudGDriveFolderId(e.target.value)}
                        placeholder="e.g. 1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74"
                        className="font-mono text-sm h-9" />
                      <p className="text-[10px] text-muted-foreground">From Drive URL: drive.google.com/drive/folders/<strong>FOLDER_ID</strong></p>
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Service Account Email</label>
                      <Input value={cloudGDriveServiceEmail} onChange={e => setCloudGDriveServiceEmail(e.target.value)}
                        placeholder="e.g. alta-vision@project-id.iam.gserviceaccount.com"
                        className="text-sm h-9" />
                      <p className="text-[10px] text-muted-foreground">Share the Drive folder with this email as Editor</p>
                    </div>
                  </div>
                )}

                {/* ── OneDrive config ── */}
                {cloudProvider === "onedrive" && (
                  <div className="space-y-3">
                    <div className="rounded-xl border border-blue-200 dark:border-blue-900/40 bg-blue-50/50 dark:bg-blue-950/10 p-3 text-xs space-y-1.5">
                      <p className="font-black text-blue-900 dark:text-blue-300">Setup Steps</p>
                      <ol className="list-decimal list-inside space-y-1 text-blue-800 dark:text-blue-400">
                        <li>Register an app in Azure Active Directory (portal.azure.com)</li>
                        <li>Grant <code className="font-mono bg-blue-100 dark:bg-blue-900/40 px-1 rounded">Files.ReadWrite.All</code> permission under Microsoft Graph</li>
                        <li>Enter your Tenant ID, Client ID, and the destination folder path below</li>
                      </ol>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Tenant ID</label>
                        <Input value={cloudOneDriveTenant} onChange={e => setCloudOneDriveTenant(e.target.value)}
                          placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" className="font-mono text-xs h-9" />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Client ID</label>
                        <Input value={cloudOneDriveClient} onChange={e => setCloudOneDriveClient(e.target.value)}
                          placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" className="font-mono text-xs h-9" />
                      </div>
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Upload Folder Path</label>
                      <Input value={cloudOneDrivePath} onChange={e => setCloudOneDrivePath(e.target.value)}
                        placeholder="e.g. /AltaVision/ServicePhotos" className="text-sm h-9" />
                    </div>
                  </div>
                )}

                {/* ── Mega config ── */}
                {cloudProvider === "mega" && (
                  <div className="space-y-3">
                    <div className="rounded-xl border border-amber-200 dark:border-amber-900/40 bg-amber-50/50 dark:bg-amber-950/10 p-3 text-xs space-y-1 text-amber-900 dark:text-amber-300">
                      <p className="font-black">Mega.nz Account</p>
                      <p>Enter the Mega account email and upload folder path. The account password is requested securely on each engineer&apos;s device at upload time — it is never stored on the server.</p>
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Mega Account Email</label>
                      <Input value={cloudMegaEmail} onChange={e => setCloudMegaEmail(e.target.value)}
                        type="email" placeholder="e.g. altavision.photos@mega.nz" className="text-sm h-9" />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Upload Folder Path</label>
                      <Input value={cloudMegaPath} onChange={e => setCloudMegaPath(e.target.value)}
                        placeholder="e.g. /AltaVision/ServicePhotos" className="text-sm h-9" />
                    </div>
                  </div>
                )}

                {/* Save button */}
                {isAdmin && (
                  <div className="flex items-center justify-between pt-2 border-t border-border/40">
                    <p className="text-[10px] text-muted-foreground">
                      {cloudProvider !== "firebase" && "Upload integration for this provider requires server-side API keys. Contact your developer to complete the setup."}
                    </p>
                    <Button size="sm" onClick={saveCloudConfig} disabled={savingCloud}
                      className="gap-1.5 h-8 text-xs font-bold bg-amber-600 hover:bg-amber-700 text-white shrink-0">
                      {savingCloud ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                      Save Cloud Settings
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Checklist System */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-black flex items-center gap-2">
                  <Wrench className="h-4 w-4 text-amber-600" /> Checklist System
                </CardTitle>
                <CardDescription className="text-xs">
                  Dynamic checklists adapt to system type, service scope, and site category.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3 text-xs text-muted-foreground">

                  {/* System types */}
                  <div className="rounded-lg border border-border/50 bg-muted/20 p-3 space-y-2">
                    <p className="font-black text-foreground uppercase tracking-wider text-[10px]">System Types (5)</p>
                    <div className="space-y-1">
                      {[
                        { label: "On-Grid",         desc: "Solar + Grid, no battery" },
                        { label: "Hybrid",           desc: "Solar + Grid + Battery" },
                        { label: "Hybrid Off-Grid",  desc: "Solar + Battery, no grid connection" },
                        { label: "Off-Grid",         desc: "Solar + Battery, fully standalone" },
                        { label: "Grid Backup",      desc: "Grid + Battery, no solar panels" },
                      ].map(s => (
                        <div key={s.label} className="flex items-center gap-2">
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />
                          <span className="font-bold text-foreground">{s.label}</span>
                          <span className="text-muted-foreground">— {s.desc}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Scopes + Categories */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-lg border border-border/50 bg-muted/20 p-3 space-y-1">
                      <p className="font-black text-foreground uppercase tracking-wider text-[10px]">Service Scopes</p>
                      <p>Full Service</p>
                      <p>Panel Work Only</p>
                      <p>Inverter Work Only</p>
                    </div>
                    <div className="rounded-lg border border-border/50 bg-muted/20 p-3 space-y-1">
                      <p className="font-black text-foreground uppercase tracking-wider text-[10px]">Site Categories</p>
                      <p>Standard (Rooftop)</p>
                      <p>BOC Site — 1× SEC1000</p>
                      <p>Ground Mount — 2× SEC3000</p>
                    </div>
                  </div>

                  {/* Photo phases */}
                  <div className="rounded-lg border border-border/50 bg-muted/20 p-3 space-y-2">
                    <p className="font-black text-foreground uppercase tracking-wider text-[10px]">Photo Phases per Task</p>
                    <div className="flex flex-wrap gap-1.5">
                      {["Before", "During", "After", "Data / Reading", "Issue / Defect"].map(ph => (
                        <span key={ph} className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300 text-[10px] font-semibold">{ph}</span>
                      ))}
                    </div>
                  </div>

                  {/* Languages */}
                  <div className="rounded-lg border border-border/50 bg-muted/20 p-3 space-y-2">
                    <p className="font-black text-foreground uppercase tracking-wider text-[10px]">Languages</p>
                    <div className="flex gap-2 flex-wrap">
                      {[["EN", "English"], ["SI", "සිංහල"], ["TA", "தமிழ்"]].map(([code, name]) => (
                        <span key={code} className="px-2.5 py-1 rounded-full bg-primary/10 text-primary text-[10px] font-bold">{code} · {name}</span>
                      ))}
                    </div>
                  </div>

                </div>
              </CardContent>
            </Card>

          </div>
        </TabsContent>

        {user?.role === "superadmin" && (
          <TabsContent value="data" className="mt-0 animate-in fade-in-50 duration-200">
            <div className="max-w-4xl space-y-6">

              {/* Backup TOON Data */}
              <Card className="border-cyan-200 dark:border-cyan-900/40 bg-white dark:bg-slate-900 shadow-sm rounded-2xl overflow-hidden">
                <CardHeader className="bg-cyan-50/60 dark:bg-cyan-950/10 border-b border-cyan-100 dark:border-cyan-950/30 p-6 flex flex-row items-center gap-4">
                  <div className="bg-cyan-500/10 p-3 rounded-xl"><Download className="h-6 w-6 text-cyan-600" /></div>
                  <div>
                    <CardTitle className="text-lg font-black text-cyan-900 dark:text-cyan-100">Download Backup</CardTitle>
                    <CardDescription className="text-xs mt-0.5 text-cyan-700/70 dark:text-cyan-400/70">
                      Export legacy project and service data (TOON format) as JSON file.
                    </CardDescription>
                  </div>
                </CardHeader>
                <CardContent className="p-6">
                  <Button onClick={handleDownloadToonBackup} disabled={backupLoading} className="gap-2">
                    {backupLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                    {backupLoading ? "Preparing..." : "Download TOON Backup"}
                  </Button>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">
                    Includes old_project_data and old_service collections. Use to backup before cleanup.
                  </p>
                </CardContent>
              </Card>

              {/* Restore from Backup */}
              <Card className="border-blue-200 dark:border-blue-900/40 bg-white dark:bg-slate-900 shadow-sm rounded-2xl overflow-hidden">
                <CardHeader className="bg-blue-50/60 dark:bg-blue-950/10 border-b border-blue-100 dark:border-blue-950/30 p-6 flex flex-row items-center gap-4">
                  <div className="bg-blue-500/10 p-3 rounded-xl"><Cloud className="h-6 w-6 text-blue-600" /></div>
                  <div>
                    <CardTitle className="text-lg font-black text-blue-900 dark:text-blue-100">Restore Backup</CardTitle>
                    <CardDescription className="text-xs mt-0.5 text-blue-700/70 dark:text-blue-400/70">
                      Restore legacy data from previously downloaded backup file.
                    </CardDescription>
                  </div>
                </CardHeader>
                <CardContent className="p-6 space-y-4">
                  <div>
                    <Label className="text-xs font-bold text-slate-700 dark:text-slate-300 mb-2 block">Select backup file:</Label>
                    <Input type="file" accept=".json" id="restore-file" className="hidden" onChange={handleRestoreFile} />
                    <Button variant="outline" onClick={() => document.getElementById('restore-file')?.click()} className="w-full gap-2">
                      <UploadCloud className="h-4 w-4" />
                      Choose File
                    </Button>
                  </div>
                  <Button onClick={handleRestoreBackup} disabled={restoreLoading || !restoreFile} className="w-full gap-2">
                    {restoreLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                    {restoreLoading ? "Restoring..." : "Restore from File"}
                  </Button>
                  {restoreFile && <p className="text-xs text-blue-600 dark:text-blue-400">File selected: {restoreFile.name}</p>}
                </CardContent>
              </Card>

              {/* Database Cleanup */}
              <Card className="border-red-200 dark:border-red-900/40 bg-white dark:bg-slate-900 shadow-sm rounded-2xl overflow-hidden">
                <CardHeader className="bg-red-50/60 dark:bg-red-950/10 border-b border-red-100 dark:border-red-950/30 p-6 flex flex-row items-center gap-4">
                  <div className="bg-red-500/10 p-3 rounded-xl"><Trash2 className="h-6 w-6 text-red-600" /></div>
                  <div>
                    <CardTitle className="text-lg font-black text-red-900 dark:text-red-100">Database Cleanup</CardTitle>
                    <CardDescription className="text-xs mt-0.5 text-red-700/70 dark:text-red-400/70">
                      Delete all transactional data. Preserves users, products, and settings.
                    </CardDescription>
                  </div>
                </CardHeader>
                <CardContent className="p-6 space-y-4">
                  <div className="bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/40 rounded-xl p-4">
                    <p className="text-sm font-bold text-red-900 dark:text-red-100 mb-2">⚠️ This action will DELETE:</p>
                    <ul className="text-xs text-red-800 dark:text-red-200 space-y-1 ml-4 list-disc">
                      <li>All Proposals</li>
                      <li>All Quotations & Invoices</li>
                      <li>All Payment Receipts</li>
                      <li>All Projects & Services</li>
                      <li>All Service Plans & Checklists</li>
                      <li>Print Metadata & Sequence Counters</li>
                    </ul>
                  </div>
                  <div className="bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-900/40 rounded-xl p-4">
                    <p className="text-sm font-bold text-green-900 dark:text-green-100 mb-2">✓ This action will PRESERVE:</p>
                    <ul className="text-xs text-green-800 dark:text-green-200 space-y-1 ml-4 list-disc">
                      <li>User Accounts & Roles</li>
                      <li>Activity Logs</li>
                      <li>Product Inventory</li>
                      <li>Company Settings & Bank Info</li>
                      <li>Legacy TOON Data (old_project_data, old_service)</li>
                    </ul>
                  </div>
                  {cleanupConfirm ? (
                    <div className="space-y-3">
                      <p className="text-xs font-bold text-slate-700 dark:text-slate-300">Type CLEANUP to confirm:</p>
                      <Input
                        value={cleanupConfirmText}
                        onChange={(e) => setCleanupConfirmText(e.target.value)}
                        placeholder="Type CLEANUP to confirm"
                        className="font-mono text-sm"
                      />
                      <div className="flex gap-2">
                        <Button
                          variant="destructive"
                          onClick={handleCleanupDatabase}
                          disabled={cleanupLoading || cleanupConfirmText !== "CLEANUP"}
                          className="flex-1 gap-2"
                        >
                          {cleanupLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                          Confirm Cleanup
                        </Button>
                        <Button variant="outline" onClick={() => { setCleanupConfirm(false); setCleanupConfirmText(""); }}>
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <Button variant="destructive" onClick={() => setCleanupConfirm(true)} className="w-full gap-2">
                      <Trash2 className="h-4 w-4" />
                      Proceed with Cleanup
                    </Button>
                  )}
                </CardContent>
              </Card>

            </div>
          </TabsContent>
        )}

        {user?.role === "superadmin" && (
          <TabsContent value="users" className="mt-0">
            <div className="-mx-6 -mt-6">
              <UsersPage />
            </div>
          </TabsContent>
        )}

        {isDevEnv && (
          <TabsContent value="dev" className="mt-0 animate-in fade-in-50 duration-200">
            <div className="max-w-2xl space-y-6">

              {/* Data & Backup */}
              <Card className="border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm rounded-2xl overflow-hidden">
                <CardHeader className="bg-slate-50 dark:bg-slate-950/20 border-b border-slate-100 dark:border-slate-800 p-6 flex flex-row items-center gap-4">
                  <div className="bg-blue-500/10 p-3 rounded-xl">
                    <Save className="h-6 w-6 text-blue-600" />
                  </div>
                  <div>
                    <CardTitle className="text-lg font-black text-slate-900 dark:text-slate-100">Data & Backup</CardTitle>
                    <CardDescription className="text-xs mt-0.5 text-slate-500">
                      Export full database snapshots.
                    </CardDescription>
                  </div>
                </CardHeader>
                <CardContent className="p-6">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="text-sm font-bold text-slate-800 dark:text-slate-200">Generate Full Backup</p>
                      <p className="text-[11px] text-slate-500 mt-0.5 max-w-[250px]">
                        Downloads a complete JSON snapshot of all collections (projects, services, etc).
                      </p>
                    </div>
                    <Button onClick={handleDownloadBackup} disabled={downloadingBackup} className="font-bold">
                      {downloadingBackup ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Download className="h-4 w-4 mr-2" />}
                      Download JSON
                    </Button>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-rose-200 dark:border-rose-900/40 bg-white dark:bg-slate-900 shadow-sm rounded-2xl overflow-hidden">
                <CardHeader className="bg-rose-50 dark:bg-rose-950/20 border-b border-rose-100 dark:border-rose-950/30 p-6 flex flex-row items-center gap-4">
                  <div className="bg-rose-500/10 p-3 rounded-xl">
                    <ShieldAlert className="h-6 w-6 text-rose-600" />
                  </div>
                  <div>
                    <CardTitle className="text-lg font-black text-rose-900 dark:text-rose-455">Developer Danger Zone</CardTitle>
                    <CardDescription className="text-xs mt-0.5 text-rose-700/70 dark:text-rose-400/70">
                      Destructive tools for local database reset and developer testing.
                    </CardDescription>
                  </div>
                </CardHeader>
                <CardContent className="p-6 space-y-6">
                  <div className="bg-rose-500/5 border border-rose-200/50 dark:border-rose-900/30 rounded-xl p-4 space-y-3">
                    <h4 className="text-sm font-bold text-rose-800 dark:text-rose-400 flex items-center gap-1.5">
                      ⚠️ Destructive Action Notice
                    </h4>
                    <p className="text-xs text-rose-750 dark:text-rose-400/90 leading-relaxed">
                      Clearing the database is a permanent action. All transaction documents, sequences, and generated PDF metadata will be deleted from the database.
                    </p>
                    
                    <div className="grid grid-cols-2 gap-4 pt-2 text-xs">
                      <div className="space-y-1.5">
                        <span className="font-bold text-slate-500 block uppercase tracking-wider text-[10px]">What gets DELETED:</span>
                        <ul className="list-disc list-inside text-rose-700 dark:text-rose-400 space-y-1 font-semibold">
                          <li>Proposals</li>
                          <li>Quotations & Invoices</li>
                          <li>Payment Receipts</li>
                          <li>Projects & Services</li>
                          <li>PDF Print Metadata</li>
                          <li>Sequence Counters (reset to 50000)</li>
                          <li>Service Plans</li>
                        </ul>
                      </div>
                      <div className="space-y-1.5">
                        <span className="font-bold text-slate-500 block uppercase tracking-wider text-[10px]">What is PRESERVED:</span>
                        <ul className="list-disc list-inside text-emerald-700 dark:text-emerald-450 space-y-1 font-semibold">
                          <li>User Accounts</li>
                          <li>System Activity Log</li>
                          <li>Product Inventory</li>
                          <li>Company Settings & Bank Info</li>
                        </ul>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label className="text-xs font-bold text-slate-500 uppercase tracking-widest block">
                        Confirm Action
                      </Label>
                      <p className="text-xs text-muted-foreground">
                        To confirm this action, please type <strong className="font-mono text-rose-600 dark:text-rose-455 font-black">CLEAR</strong> below.
                      </p>
                      <Input
                        type="text"
                        value={confirmText}
                        onChange={(e) => setConfirmText(e.target.value)}
                        placeholder="Type CLEAR to unlock button"
                        className="rounded-xl border-slate-200 focus:ring-rose-500 text-sm font-semibold max-w-md h-11"
                        disabled={clearingDb}
                      />
                    </div>

                    <div className="pt-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-4">
                      <p className="text-[11px] text-slate-500 leading-normal max-w-sm">
                        This action will require administrative authorization token. Make sure you are logged in with admin privileges.
                      </p>
                      <Button
                        type="button"
                        onClick={handleClearDb}
                        disabled={confirmText !== "CLEAR" || clearingDb || (!user?.role || !["superadmin", "admin"].includes(user.role))}
                        className={`font-extrabold text-sm px-6 py-6 rounded-2xl shadow-md transition-all hover:scale-[1.02] active:scale-[0.98] flex items-center gap-2 ${
                          confirmText === "CLEAR" && !clearingDb && (user?.role && ["superadmin", "admin"].includes(user.role))
                            ? "bg-gradient-to-r from-rose-550 to-red-650 hover:from-rose-650 hover:to-red-750 text-white shadow-rose-200 dark:shadow-none"
                            : "bg-slate-100 dark:bg-slate-850 text-slate-400 cursor-not-allowed"
                        }`}
                      >
                        {clearingDb ? (
                          <>
                            <Loader2 className="h-5 w-5 animate-spin" />
                            Clearing Database...
                          </>
                        ) : (
                          <>
                            <Trash2 className="h-5 w-5" />
                            Clear Database
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* ── Targeted destructive actions ── */}
              <Card className="border-rose-200 dark:border-rose-900/40 bg-white dark:bg-slate-900 shadow-sm rounded-2xl overflow-hidden">
                <CardHeader className="bg-rose-50/60 dark:bg-rose-950/10 border-b border-rose-100 dark:border-rose-950/30 p-4">
                  <CardTitle className="text-sm font-black text-rose-800 dark:text-rose-400">Targeted Cleanup</CardTitle>
                  <CardDescription className="text-xs text-rose-700/60 dark:text-rose-500/60 mt-0.5">
                    Delete specific data without wiping the whole database.
                  </CardDescription>
                </CardHeader>
                <CardContent className="p-4 space-y-4">
                  {/* Clear service plans */}
                  <div className="flex items-center justify-between gap-4 rounded-xl border border-rose-100 dark:border-rose-900/40 bg-rose-500/5 p-4">
                    <div>
                      <p className="text-sm font-bold text-rose-800 dark:text-rose-400">Service Plans</p>
                      <p className="text-[11px] text-rose-700/70 dark:text-rose-500/70 mt-0.5">
                        Deletes all service plan documents from Firestore. Cannot be undone.
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={handleClearServicePlans}
                      disabled={clearingPlans || !isAdmin}
                      className="shrink-0 gap-1.5 font-bold"
                    >
                      {clearingPlans ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                      Clear Plans
                    </Button>
                  </div>

                  {/* Clear pricing history */}
                  <div className="flex items-center justify-between gap-4 rounded-xl border border-rose-100 dark:border-rose-900/40 bg-rose-500/5 p-4">
                    <div>
                      <p className="text-sm font-bold text-rose-800 dark:text-rose-400">Pricing History</p>
                      <p className="text-[11px] text-rose-700/70 dark:text-rose-500/70 mt-0.5">
                        Removes all saved pricing snapshots from this browser's localStorage.
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={handleClearPricingHistory}
                      disabled={clearingHistory}
                      className="shrink-0 gap-1.5 font-bold"
                    >
                      {clearingHistory ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                      Clear History
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        )}
      </Tabs>

    </div>
  );
}
