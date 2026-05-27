"use client";

import { useEffect, useState, useMemo, Fragment } from "react";
import { collection, onSnapshot, query, orderBy, where, doc, addDoc, updateDoc, deleteDoc, getDocs, serverTimestamp, setDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/auth-context";
import { motion, AnimatePresence } from "framer-motion";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import Link from "next/link";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  FolderOpen, Search, Loader2, MapPin, Phone,
  CheckCircle, Clock, Star, Sun, Plus, Trash2, Edit, Map, User, Settings, Check, Globe, SlidersHorizontal, Info, Upload,
  AlertTriangle, ArrowUpDown, ArrowUp, ArrowDown, Wrench
} from "lucide-react";
import { generateSiteNumber } from "@/lib/project-utils";
import { Pagination } from "@/components/ui/pagination";


interface LegacyProject {
  systemOn: string;
  harmonicMeter: string;
  projectNo: string;
  projectInstallationDate: string;
  customerName: string;
  promoterTender: string;
  siteEngineerContractor: string;
  category: string;
  electricityBillName: string;
  contactNumber: string;
  emailAddress: string;
  address: string;
  scheme: string;
  utilityProvider: string;
  areaOffice: string;
  utilityAccountNo: string;
  paymentMethod: string;
  nic: string;
  solarPanelModel: string;
  panelModelCode: string;
  panelType: string;
  panelWattage: number;
  noOfPanels: number;
  solarPanelCapacity: number;
  inverterBrand: string;
  inverterModelNo: string;
  inverterCapacity: number;
  latitude: number;
  longitude: number;
  wifiUsername: string;
  wifiPassword: string;
  invSerialNo: string;
  invCheckCode: string;
  remarks?: string;
}

// Legacy data is now fetched dynamically from the /api/projects/legacy endpoint

// ─── Stage config ─────────────────────────────────────────────────────────────
const STAGE_CONFIG: Record<string, { label: string; color: string }> = {
  advance_pending:       { label: "Advance Pending",    color: "text-amber-600 bg-amber-50 border-amber-250 dark:bg-amber-950/20 dark:text-amber-400 dark:border-amber-900/30" },
  confirmed:             { label: "Confirmed",           color: "text-blue-600 bg-blue-50 border-blue-250 dark:bg-blue-950/20 dark:text-blue-400 dark:border-blue-900/30" },
  installation:          { label: "Installation",        color: "text-purple-600 bg-purple-50 border-purple-250 dark:bg-purple-950/20 dark:text-purple-400 dark:border-purple-900/30" },
  installation_complete: { label: "Installed",           color: "text-indigo-600 bg-indigo-50 border-indigo-250 dark:bg-indigo-950/20 dark:text-indigo-400 dark:border-indigo-900/30" },
  commissioned:          { label: "Commissioned",        color: "text-emerald-600 bg-emerald-50 border-emerald-250 dark:bg-emerald-950/20 dark:text-emerald-400 dark:border-emerald-900/30" },
  fully_settled:         { label: "In Operation",        color: "text-teal-700 bg-teal-50 border-teal-200 dark:bg-teal-900/20 dark:text-teal-300 dark:border-teal-800/30" },
  legacy:                { label: "In Operation",        color: "text-teal-700 bg-teal-50 border-teal-200 dark:bg-teal-900/20 dark:text-teal-300 dark:border-teal-800/30" },
};

type DisplayRow = {
  id: string;
  projectNo: string;
  customerName: string;
  address: string;
  phone: string;
  inverterCapacity: number;
  inverterBrand: string;
  inverterModel: string;
  noOfPanels: number;
  panelWattage: number;
  solarCapacity: number;
  utilityProvider: string;
  areaOffice: string;
  installDate: string;
  systemOnDate: string;
  stage: string;
  isLegacy: boolean;
  firestoreId?: string;
  engineer?: string;
  panelModel?: string;
  wifiUsername?: string;
  wifiPassword?: string;
  invSerialNo?: string;
  invCheckCode?: string;
  latitude?: number;
  longitude?: number;
  systemType?: string;
  mountType?: string;
  isOtherCompany?: boolean;
  plusCode?: string;
  lastServiceDate?: string;
  remarks?: string;
};

function legacyToRow(p: LegacyProject): DisplayRow {
  return {
    id: `legacy-${p.projectNo}`,
    projectNo: p.projectNo,
    customerName: p.customerName,
    address: p.address,
    phone: p.contactNumber,
    inverterCapacity: p.inverterCapacity,
    inverterBrand: p.inverterBrand,
    inverterModel: p.inverterModelNo,
    noOfPanels: p.noOfPanels,
    panelWattage: p.panelWattage,
    solarCapacity: p.solarPanelCapacity,
    utilityProvider: p.utilityProvider || "",
    areaOffice: p.areaOffice || detectAreaOffice(p.address || ""),
    installDate: p.projectInstallationDate,
    systemOnDate: p.systemOn,
    stage: "legacy",
    isLegacy: true,
    engineer: p.siteEngineerContractor,
    panelModel: p.panelModelCode,
    wifiUsername: p.wifiUsername,
    wifiPassword: p.wifiPassword,
    invSerialNo: p.invSerialNo,
    invCheckCode: p.invCheckCode,
    latitude: p.latitude,
    longitude: p.longitude,
    remarks: p.remarks,
  };
}

// ─── Auto-detect nearest CEB/LECO area office from address ───────────────────
function detectAreaOffice(address: string): string {
  const addr = address.toLowerCase();
  const regions: [string[], string][] = [
    [["matara", "weligama", "mirissa", "dickwella", "akuressa", "hakmana", "nupe", "deniyaya"], "Matara"],
    [["galle", "hikkaduwa", "unawatuna", "ambalangoda", "elpitiya", "karandeniya"], "Galle"],
    [["tangalle", "hambantota", "tissamaharama", "beliatta", "weeraketiya", "walasmulla"], "Tangalle"],
    [["colombo", "dehiwala", "moratuwa", "maharagama", "nugegoda", "kesbewa", "homagama", "boralesgamuwa", "piliyandala"], "Colombo"],
    [["kandy", "peradeniya", "katugastota", "gampola", "nawalapitiya"], "Kandy"],
    [["kurunegala", "kuliyapitiya", "maho", "nikaweratiya"], "Kurunegala"],
    [["ratnapura", "embilipitiya", "balangoda", "pelmadulla"], "Ratnapura"],
    [["kalutara", "panadura", "horana", "aluthgama", "beruwala", "bandaragama"], "Kalutara"],
    [["negombo", "ja-ela", "wattala", "kadawatha", "gampaha", "minuwangoda", "ragama"], "Gampaha"],
    [["ampara", "batticaloa", "kalmunai", "akkraipattu"], "Ampara"],
    [["trincomalee", "trinco", "kantale"], "Trincomalee"],
    [["jaffna", "point pedro", "chavakachcheri", "nallur"], "Jaffna"],
    [["anuradhapura", "mihintale", "kekirawa"], "Anuradhapura"],
    [["polonnaruwa", "hingurakgoda"], "Polonnaruwa"],
    [["badulla", "bandarawela", "ella", "welimada", "haputale"], "Badulla"],
    [["nuwara eliya", "hatton", "dimbula", "talawakele"], "Nuwara Eliya"],
    [["kegalle", "mawanella", "warakapola", "rambukkana"], "Kegalle"],
    [["puttalam", "chilaw", "marawila", "wennappuwa"], "Puttalam"],
    [["matale", "dambulla", "sigiriya", "galewela"], "Matale"],
    [["moneragala", "wellawaya", "buttala"], "Moneragala"],
  ];
  for (const [keywords, office] of regions) {
    if (keywords.some((k) => addr.includes(k))) return office;
  }
  return "";
}

// ─── Parse a location string (lat,lng or Plus Code) ──────────────────────────
function parseLocation(input: string): { lat: number | null; lng: number | null; plusCode: string | null } {
  const trimmed = input.trim();
  if (!trimmed) return { lat: null, lng: null, plusCode: null };
  const m = trimmed.match(/^(-?\d+\.?\d*)[,\s]+(-?\d+\.?\d*)$/);
  if (m) return { lat: parseFloat(m[1]), lng: parseFloat(m[2]), plusCode: null };
  return { lat: null, lng: null, plusCode: trimmed };
}

// ─── Infer inverter capacity from model name ────────────────────────────────
function inferInverterCapacity(model: string | undefined): number {
  if (!model || typeof model !== "string") return 0;
  const clean = model.trim().toUpperCase();
  if (!clean || clean === "—" || clean === "PENDING" || clean === "N/A" || clean === "UNKNOWN") return 0;

  // Pattern 1: look for "XX48" (e.g. 5048, 3048, 5048D)
  const match48 = clean.match(/(?:^|[^0-9.])(\d{2})48(?:$|[^0-9.])/);
  if (match48) {
    const cap = parseFloat(match48[1]) / 10;
    if (cap > 0) return cap;
  }

  // Pattern 2: look for numbers followed by K (e.g. 10K, 15K, 20K, 20KN, 5K, 8K)
  const matchK = clean.match(/(?:^|[^0-9.])(\d+(?:\.\d+)?)\s*K/);
  if (matchK) {
    const cap = parseFloat(matchK[1]);
    if (cap > 0) return cap;
  }

  // Pattern 3: look for 4-digit wattage (e.g. 3000, 5000, 6000, 4200, 3600)
  const matchWatts = clean.match(/(?:^|[^0-9.])(\d{2}00)(?:$|[^0-9.])/) || clean.match(/(?:^|[^0-9.])(10000)(?:$|[^0-9.])/);
  if (matchWatts) {
    const cap = parseFloat(matchWatts[1]) / 1000;
    if (cap > 0) return cap;
  }

  // Pattern 4: check for explicit capacity in name like "5kW" or "10 kW" or "4.2kW"
  const matchKW = clean.match(/(?:^|[^0-9.])(\d+(?:\.\d+)?)\s*(?:KW|KWP)(?:$|[^0-9.])/);
  if (matchKW) {
    const cap = parseFloat(matchKW[1]);
    if (cap > 0) return cap;
  }

  // Pattern 5: if the model itself is just a number (e.g. "5", "10", "15", "4.2")
  const matchNum = clean.match(/^\s*(\d+(?:\.\d+)?)\s*$/);
  if (matchNum) {
    return parseFloat(matchNum[1]);
  }

  return 0;
}

// ─── Service helpers ──────────────────────────────────────────────────────────
function parseServiceDate(s: string): Date | null {
  if (!s || s === "---" || s === "—") return null;
  const p = s.trim().split(/[/\-]/);
  if (p.length === 3) {
    // D/M/YYYY or DD/MM/YYYY
    const [d, m, y] = p.map(Number);
    if (y > 1000) return new Date(y, m - 1, d);
    // YYYY-MM-DD
    const [yr, mo, dy] = p.map(Number);
    return new Date(yr, mo - 1, dy);
  }
  const dt = new Date(s);
  return isNaN(dt.getTime()) ? null : dt;
}

function monthsBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24 * 30.44));
}

function getServiceInfo(legacyRec: any) {
  const milestones: any[] = (legacyRec?.milestones ?? []).filter((m: any) => m.date && m.date !== "---");
  const totalCount = milestones.length;
  const roundsRaw = (legacyRec?.serviceRounds || "").trim();
  const yearsRaw = (legacyRec?.serviceYears || "").trim();
  const freeTotal = parseInt(roundsRaw) || 0;
  // Infer free services done from actual milestone count rather than unreliable CSV field
  const freeDone = freeTotal > 0 ? Math.min(totalCount, freeTotal) : 0;
  return { milestones, totalCount, freeDone, freeTotal, yearsRaw, roundsRaw };
}

// Helper to compute numeric capacity of a DisplayRow
function getRowCapacity(row: DisplayRow): number {
  const computed = row.noOfPanels > 0 && row.panelWattage > 0
    ? (row.noOfPanels * row.panelWattage) / 1000
    : 0;
  const cap = row.solarCapacity > 0 ? row.solarCapacity : computed;
  if (cap > 0) return cap;
  if (row.inverterCapacity > 0) return row.inverterCapacity;
  return 0;
}

// Helper to compare values for sorting
function compareValues(a: DisplayRow, b: DisplayRow, field: keyof DisplayRow, order: "asc" | "desc"): number {
  let valA = a[field];
  let valB = b[field];

  if (field === "solarCapacity") {
    valA = getRowCapacity(a);
    valB = getRowCapacity(b);
  }

  // Handle null/undefined/empty/dashes/Pending
  const isSpecialA = valA === undefined || valA === null || valA === "—" || valA === "" || valA === "Pending";
  const isSpecialB = valB === undefined || valB === null || valB === "—" || valB === "" || valB === "Pending";

  if (isSpecialA && isSpecialB) return 0;
  if (isSpecialA) return 1; // Always push special values to the end
  if (isSpecialB) return -1;

  if (typeof valA === "number" && typeof valB === "number") {
    return order === "asc" ? valA - valB : valB - valA;
  }

  // String comparison
  const strA = String(valA).toLowerCase();
  const strB = String(valB).toLowerCase();

  // Natural alphanumeric sort for projectNo
  if (field === "projectNo") {
    return order === "asc"
      ? strA.localeCompare(strB, undefined, { numeric: true, sensitivity: 'base' })
      : strB.localeCompare(strA, undefined, { numeric: true, sensitivity: 'base' });
  }

  return order === "asc"
    ? strA.localeCompare(strB)
    : strB.localeCompare(strA);
}

export default function ProjectsPage() {
  const { user, firebaseUser } = useAuth();
  const { toast } = useToast();
  const [firestoreProjects, setFirestoreProjects] = useState<any[]>([]);
  const [legacy, setLegacy] = useState<LegacyProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploadingCSV, setUploadingCSV] = useState(false);
  const [search, setSearch] = useState("");
  const [stageFilter, setStageFilter] = useState("all");
  const [showLegacy, setShowLegacy] = useState(true);
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const [servicesByProject, setServicesByProject] = useState<Record<string, any[]>>({});
  const [loadingServices, setLoadingServices] = useState<string | null>(null);
  const [legacyServiceRecords, setLegacyServiceRecords] = useState<any[]>([]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(100);
  const [sortField, setSortField] = useState<keyof DisplayRow | null>(null);
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");

  // Dialog forms state
  const [isOpenForm, setIsOpenForm] = useState(false);
  const [selectedProj, setSelectedProj] = useState<DisplayRow | null>(null);

  const fetchLegacy = async () => {
    try {
      const res = await fetch(`/api/projects/legacy?t=${Date.now()}`, {
        cache: "no-store",
      });
      if (!res.ok) throw new Error("Failed to fetch legacy projects");
      const data = await res.json();
      if (Array.isArray(data)) {
        setLegacy(data);
      }
    } catch (err) {
      console.error("Failed to load legacy projects:", err);
    }
  };

  useEffect(() => {
    fetchLegacy();
    fetch(`/api/services/legacy?t=${Date.now()}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => { if (Array.isArray(d)) setLegacyServiceRecords(d); })
      .catch(() => {});
  }, []);



  const handleCSVUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    // Validate that all files are CSV
    for (let i = 0; i < files.length; i++) {
      if (!files[i].name.toLowerCase().endsWith(".csv")) {
        toast({
          title: "Invalid file format",
          description: `File "${files[i].name}" is not a valid CSV file (.csv)`,
          variant: "destructive",
        });
        return;
      }
    }

    setUploadingCSV(true);

    // Helper to read file as text wrapped in a Promise
    const readFileAsText = (file: File): Promise<string> => {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (event) => resolve((event.target?.result as string) || "");
        reader.onerror = () => reject(new Error(`Failed to read file ${file.name}`));
        reader.readAsText(file);
      });
    };

    try {
      const idToken = firebaseUser ? await firebaseUser.getIdToken() : "dev_session_token";

      // Upload each file sequentially to ensure server-side merge completes atomically
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const text = await readFileAsText(file);

        if (!text || !text.trim()) {
          toast({
            title: "Empty file skipped",
            description: `The file "${file.name}" is empty and was skipped.`,
            variant: "destructive",
          });
          continue;
        }

        const res = await fetch("/api/projects/upload", {
          method: "POST",
          headers: {
            "Content-Type": "text/plain",
            "Authorization": `Bearer ${idToken}`,
            "X-Filename": file.name,           // ← pass original filename to server
          },
          body: text,
        });

        const result = await res.json();

        if (res.status === 409) {
          // File already uploaded — warn but continue with remaining files
          toast({
            title: "File already uploaded",
            description: result.error || `"${file.name}" was skipped — it has already been uploaded.`,
            variant: "destructive",
          });
          continue;
        }

        if (!res.ok) {
          throw new Error(result.error || `Failed to upload "${file.name}"`);
        }

        if (result.changelog && result.changelog.length > 0) {
          toast({
            title: `Updated: ${file.name}`,
            description: (
              <div className="mt-2 w-[340px] max-h-40 overflow-y-auto bg-slate-950 text-slate-50 p-2 rounded text-[10px] font-mono whitespace-pre-wrap">
                {result.changelog.join("\n")}
              </div>
            ),
          });
        }
      }

      toast({
        title: "Upload Successful",
        description: files.length === 1 
          ? "Legacy projects CSV database updated successfully"
          : `Successfully uploaded and merged ${files.length} CSV files`,
      });

      fetchLegacy();
    } catch (err: any) {
      console.error(err);
      toast({
        title: "Upload Failed",
        description: err.message || "Failed to save the CSV files to server",
        variant: "destructive",
      });
    } finally {
      setUploadingCSV(false);
      e.target.value = "";
    }
  };
  
  // Form fields
  const [formSiteNo, setFormSiteNo] = useState("");
  const [formCustName, setFormCustName] = useState("");
  const [formCustPhone, setFormCustPhone] = useState("");
  const [formCustAddress, setFormCustAddress] = useState("");
  const [formSysType, setFormSysType] = useState("ongrid");
  const [formMountType, setFormMountType] = useState("roof");
  const [formIsOtherCompany, setFormIsOtherCompany] = useState(false);
  const [formStage, setFormStage] = useState("advance_pending");
  const [formInverterBrand, setFormInverterBrand] = useState("");
  const [formInverterModel, setFormInverterModel] = useState("");
  const [formInverterCapacity, setFormInverterCapacity] = useState("");
  const [inverterProducts, setInverterProducts] = useState<any[]>([]);
  const [formNoOfPanels, setFormNoOfPanels] = useState("");
  const [formPanelWattage, setFormPanelWattage] = useState("");
  const [formPanelModel, setFormPanelModel] = useState("");
  const [formUtility, setFormUtility] = useState("CEB");
  const [formAreaOffice, setFormAreaOffice] = useState("");
  const [formEngineer, setFormEngineer] = useState("");
  const [formWifiUsername, setFormWifiUsername] = useState("");
  const [formWifiPassword, setFormWifiPassword] = useState("");
  const [formSerialNo, setFormSerialNo] = useState("");
  const [formCheckCode, setFormCheckCode] = useState("");
  const [formLat, setFormLat] = useState("");
  const [formLng, setFormLng] = useState("");
  const [formLocation, setFormLocation] = useState(""); // unified: "lat,lng" OR plus code
  const [formInstallDate, setFormInstallDate] = useState("");
  const [formSystemOnDate, setFormSystemOnDate] = useState("");

  const [saving, setSaving] = useState(false);

  // Load inverter products once for brand/model autocomplete
  useEffect(() => {
    getDocs(query(collection(db, "products"), where("type", "==", "inverter")))
      .then(snap => setInverterProducts(snap.docs.map(d => ({ id: d.id, ...d.data() }))))
      .catch(() => {});
  }, []);

  const [leafletLoaded, setLeafletLoaded] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if ((window as any).L) {
      setLeafletLoaded(true);
      return;
    }

    // Load Leaflet CSS
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
    link.integrity = "sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=";
    link.crossOrigin = "";
    document.head.appendChild(link);

    // Load Leaflet JS
    const script = document.createElement("script");
    script.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
    script.integrity = "sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=";
    script.crossOrigin = "";
    script.onload = () => {
      setLeafletLoaded(true);
    };
    document.body.appendChild(script);
  }, []);

  // Map and marker lifecycle inside the Form Dialog
  useEffect(() => {
    if (!isOpenForm || !leafletLoaded) return;

    // Use a small timeout to make sure the modal container is fully rendered in the DOM
    const timer = setTimeout(() => {
      const container = document.getElementById("dialog-map");
      if (!container) return;

      const L = (window as any).L;
      if (!L) return;

      // Fix Leaflet's default marker icon paths (broken in Webpack/React by default)
      delete L.Icon.Default.prototype._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
        iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
        shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
      });

      // Parse current location coordinates or default to Sri Lanka
      const loc = parseLocation(formLocation);
      const hasCoords = loc.lat !== null && loc.lng !== null;
      const initialLat = hasCoords ? loc.lat! : 7.8731;
      const initialLng = hasCoords ? loc.lng! : 80.7718;
      const initialZoom = hasCoords ? 14 : 7;

      // Initialize map
      const map = L.map("dialog-map").setView([initialLat, initialLng], initialZoom);

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      }).addTo(map);

      // Add a draggable marker
      const marker = L.marker([initialLat, initialLng], {
        draggable: true,
      }).addTo(map);

      const updateCoordinates = (lat: number, lng: number) => {
        setFormLocation(`${lat.toFixed(6)},${lng.toFixed(6)}`);
      };

      // Sync marker drag back to unified location input
      marker.on("dragend", (e: any) => {
        const pos = marker.getLatLng();
        updateCoordinates(pos.lat, pos.lng);
      });

      // Allow clicking on map to place/move marker
      map.on("click", (e: any) => {
        const { lat, lng } = e.latlng;
        marker.setLatLng([lat, lng]);
        updateCoordinates(lat, lng);
      });

      // Save instances globally/environmentally for the update effect
      (window as any)._dialogMap = map;
      (window as any)._dialogMarker = marker;
      
      // Call map.invalidateSize() to ensure full rendering inside the dialog
      map.invalidateSize();
    }, 200);

    return () => {
      clearTimeout(timer);
      const map = (window as any)._dialogMap;
      if (map) {
        map.remove();
        (window as any)._dialogMap = null;
        (window as any)._dialogMarker = null;
      }
    };
  }, [isOpenForm, leafletLoaded]);

  // Sync map view if user manually types coords in the Site Location field
  useEffect(() => {
    const map = (window as any)._dialogMap;
    const marker = (window as any)._dialogMarker;
    if (!map || !marker) return;

    const loc = parseLocation(formLocation);
    if (loc.lat !== null && loc.lng !== null) {
      const currentMarkerLatLng = marker.getLatLng();
      if (
        Math.abs(currentMarkerLatLng.lat - loc.lat) > 0.00001 ||
        Math.abs(currentMarkerLatLng.lng - loc.lng) > 0.00001
      ) {
        marker.setLatLng([loc.lat, loc.lng]);
        map.setView([loc.lat, loc.lng], map.getZoom());
      }
    }
  }, [formLocation]);

  // Check admin rights
  const isAdmin = useMemo(() => {
    return user?.role === "superadmin" || user?.role === "admin" || user?.role === "authorized";
  }, [user]);

  // Load projects from database
  useEffect(() => {
    if (!firebaseUser) { setLoading(false); return; }
    const q = query(collection(db, "projects"), orderBy("createdAt", "desc"));
    const unsub = onSnapshot(q, (snap) => {
      setFirestoreProjects(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setLoading(false);
    }, () => setLoading(false));
    return unsub;
  }, [firebaseUser]);

  // Convert Firestore projects + legacy into displayable rows
  const allRows = useMemo<DisplayRow[]>(() => {
    const newRows: DisplayRow[] = firestoreProjects.map((p: any) => {
      let eqInverterCapacity = 0;
      let eqSolarCapacity = 0;
      let eqInverterBrands: string[] = [];
      let eqInverterModels: string[] = [];
      
      if (p.equipment && p.equipment.length > 0) {
        p.equipment.forEach((eq: any) => {
          if (eq.type === "inverter") {
            eqInverterCapacity += (eq.capacity || 0) * (eq.qty || 1);
            if (eq.brand) eqInverterBrands.push(eq.brand);
            if (eq.model) eqInverterModels.push(eq.model);
          } else if (eq.type === "panel") {
            eqSolarCapacity += (eq.capacity || 0) * (eq.qty || 1);
          }
        });
      }

      const invBrand = eqInverterBrands.length > 0 ? Array.from(new Set(eqInverterBrands)).join(", ") : (p.inverterBrand || "—");
      const invModel = eqInverterModels.length > 0 ? Array.from(new Set(eqInverterModels)).join(", ") : (p.inverterModel || "—");
      const invCap = eqInverterCapacity > 0 ? eqInverterCapacity : (p.inverterCapacity || 0);
      const solCap = eqSolarCapacity > 0 ? eqSolarCapacity / 1000 : (p.solarCapacity || 0);

      return {
        id: `proj-${p.id}`,
        projectNo: p.siteNo || p.id.slice(0, 8),
        customerName: p.customer?.name || "—",
        address: p.customer?.address || "—",
        phone: p.customer?.phone || "—",
        inverterCapacity: invCap,
        inverterBrand: invBrand,
        inverterModel: invModel,
        noOfPanels: p.noOfPanels || 0,
        panelWattage: p.panelWattage || 0,
        solarCapacity: solCap,
        utilityProvider: (p.utilityProvider && p.utilityProvider !== "—") ? p.utilityProvider : "",
        areaOffice: (p.areaOffice && p.areaOffice !== "—") ? p.areaOffice : detectAreaOffice(p.customer?.address || ""),
        installDate: p.installedAt || "—",
        systemOnDate: p.commissionedAt || "—",
        stage: p.stage || "advance_pending",
        isLegacy: false,
        firestoreId: p.id,
        engineer: p.siteEngineer || "—",
        panelModel: p.panelModel || "—",
        wifiUsername: p.wifiUsername || "",
        wifiPassword: p.wifiPassword || "",
        invSerialNo: p.invSerialNo || "",
        invCheckCode: p.invCheckCode || "",
        latitude: p.latitude || undefined,
        longitude: p.longitude || undefined,
        plusCode: p.plusCode || undefined,
        lastServiceDate: p.lastServiceDate || undefined,
        systemType: p.systemType || "ongrid",
        mountType: p.mountType || "roof",
        isOtherCompany: p.isOtherCompany || false,
      };
    });
    const legacyRows = showLegacy ? [...legacy].reverse().map(legacyToRow) : [];
    return [...newRows, ...legacyRows];
  }, [firestoreProjects, legacy, showLegacy]);

  // Filter projects by search and stage
  const filtered = useMemo(() => {
    let rows = allRows;
    if (search.trim()) {
      const q = search.toLowerCase();
      rows = rows.filter(r =>
        (r.customerName || "").toLowerCase().includes(q) ||
        (r.projectNo || "").toLowerCase().includes(q) ||
        (r.address || "").toLowerCase().includes(q) ||
        (r.phone || "").toLowerCase().includes(q) ||
        (r.areaOffice || "").toLowerCase().includes(q) ||
        (r.engineer || "").toLowerCase().includes(q) ||
        (r.inverterBrand || "").toLowerCase().includes(q) ||
        (r.installDate || "").toLowerCase().includes(q) ||
        (r.systemOnDate || "").toLowerCase().includes(q)
      );
    }
    if (stageFilter !== "all") {
      // Legacy projects use stage "legacy" but should appear under the "Commissioned" tab
      rows = rows.filter(r =>
        r.stage === stageFilter ||
        (stageFilter === "commissioned" && r.stage === "legacy")
      );
    }
    return rows;
  }, [allRows, search, stageFilter]);

  // Sort projects if a sort field is active
  const sortedAndFiltered = useMemo(() => {
    let rows = [...filtered];
    if (sortField) {
      rows.sort((a, b) => compareValues(a, b, sortField, sortOrder));
    }
    return rows;
  }, [filtered, sortField, sortOrder]);

  // Reset to page 1 whenever filters change
  useEffect(() => { setPage(1); }, [search, stageFilter, showLegacy, sortField, sortOrder]);

  // Slice filtered rows for current page
  const pagedRows = useMemo(
    () => sortedAndFiltered.slice((page - 1) * pageSize, page * pageSize),
    [sortedAndFiltered, page, pageSize]
  );

  const stats = useMemo(() => ({
    total: allRows.length,
    newProjects: firestoreProjects.length,
    legacyCount: legacy.length,
    pending: firestoreProjects.filter((p: any) => p.stage === "advance_pending").length,
  }), [allRows, firestoreProjects]);

  // Open modal for Create/Edit
  const handleOpenForm = (proj?: DisplayRow) => {
    if (proj) {
      // Edit mode
      setSelectedProj(proj);
      setFormSiteNo(proj.projectNo);
      setFormCustName(proj.customerName);
      setFormCustPhone(proj.phone !== "—" ? proj.phone : "");
      setFormCustAddress(proj.address !== "—" ? proj.address : "");
      setFormSysType(proj.systemType || "ongrid");
      setFormMountType(proj.mountType || "roof");
      setFormIsOtherCompany(proj.isOtherCompany || false);
      setFormStage(proj.stage);
      setFormInverterBrand(proj.inverterBrand !== "—" ? proj.inverterBrand : "");
      setFormInverterModel(proj.inverterModel !== "—" ? proj.inverterModel : "");
      setFormInverterCapacity(proj.inverterCapacity > 0 ? String(proj.inverterCapacity) : "");
      setFormNoOfPanels(proj.noOfPanels > 0 ? String(proj.noOfPanels) : "");
      setFormPanelWattage(proj.panelWattage > 0 ? String(proj.panelWattage) : "");
      setFormPanelModel(proj.panelModel && proj.panelModel !== "—" ? proj.panelModel : "");
      setFormUtility(proj.utilityProvider !== "—" ? proj.utilityProvider : "CEB");
      setFormAreaOffice(proj.areaOffice !== "—" ? proj.areaOffice : "");
      setFormEngineer(proj.engineer && proj.engineer !== "—" ? proj.engineer : "");
      setFormWifiUsername(proj.wifiUsername || "");
      setFormWifiPassword(proj.wifiPassword || "");
      setFormSerialNo(proj.invSerialNo || "");
      setFormCheckCode(proj.invCheckCode || "");
      setFormLat(proj.latitude ? String(proj.latitude) : "");
      setFormLng(proj.longitude ? String(proj.longitude) : "");
      // Populate unified location field
      if (proj.latitude && proj.longitude) {
        setFormLocation(`${proj.latitude},${proj.longitude}`);
      } else if (proj.plusCode) {
        setFormLocation(proj.plusCode);
      } else {
        setFormLocation("");
      }
      setFormInstallDate(proj.installDate !== "—" ? proj.installDate : "");
      setFormSystemOnDate(proj.systemOnDate !== "—" && proj.systemOnDate !== "Pending" ? proj.systemOnDate : "");
    } else {
      // Create mode
      setSelectedProj(null);
      setFormSiteNo("");
      setFormCustName("");
      setFormCustPhone("");
      setFormCustAddress("");
      setFormSysType("ongrid");
      setFormMountType("roof");
      setFormIsOtherCompany(false);
      setFormStage("advance_pending");
      setFormInverterBrand("");
      setFormInverterModel("");
      setFormInverterCapacity("");
      setFormNoOfPanels("");
      setFormPanelWattage("");
      setFormPanelModel("");
      setFormUtility("CEB");
      setFormAreaOffice("");
      setFormEngineer("");
      setFormWifiUsername("");
      setFormWifiPassword("");
      setFormSerialNo("");
      setFormCheckCode("");
      setFormLat("");
      setFormLng("");
      setFormLocation("");
      setFormInstallDate("");
      setFormSystemOnDate("");
    }
    setIsOpenForm(true);
  };

  // Handle Save
  const handleSaveProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formCustName.trim()) {
      toast({ title: "Validation Error", description: "Customer name is required", variant: "destructive" });
      return;
    }

    setSaving(true);
    try {
      const invCap = parseFloat(formInverterCapacity) || 0;
      const panCount = parseInt(formNoOfPanels) || 0;
      const panWatt = parseInt(formPanelWattage) || 0;
      const solCap = parseFloat(((panCount * panWatt) / 1000).toFixed(3)) || 0;

      const projectData: any = {
        customer: {
          name: formCustName.trim(),
          phone: formCustPhone.trim() || "—",
          address: formCustAddress.trim() || "—",
        },
        systemType: formSysType,
        mountType: formMountType,
        isOtherCompany: formIsOtherCompany,
        stage: formStage,
        inverterBrand: formInverterBrand.trim() || "—",
        inverterModel: formInverterModel.trim() || "—",
        inverterCapacity: invCap,
        noOfPanels: panCount,
        panelWattage: panWatt,
        panelModel: formPanelModel.trim() || "—",
        solarCapacity: solCap,
        utilityProvider: formUtility,
        areaOffice: formAreaOffice.trim() || "—",
        siteEngineer: formEngineer.trim() || "—",
        wifiUsername: formWifiUsername.trim(),
        wifiPassword: formWifiPassword.trim(),
        invSerialNo: formSerialNo.trim(),
        invCheckCode: formCheckCode.trim(),
        ...(() => { const loc = parseLocation(formLocation); return { latitude: loc.lat, longitude: loc.lng, plusCode: loc.plusCode }; })(),
        installedAt: formInstallDate || "—",
        commissionedAt: formSystemOnDate || "—",
        updatedAt: serverTimestamp(),
      };

      if (selectedProj) {
        // Edit mode - update doc
        const siteNo = formSiteNo.trim() || selectedProj.projectNo;
        projectData.siteNo = siteNo;

        if (selectedProj.firestoreId) {
          // New project in projects collection
          await updateDoc(doc(db, "projects", selectedProj.firestoreId), projectData);
        } else if (selectedProj.isLegacy) {
          // Legacy project in old_project_data collection
          // Convert to TOON format for storage
          const toonData: any = {
            pn: siteNo,
            n: projectData.customer.name,
            a: projectData.customer.address,
            ph: projectData.customer.phone,
            cap: projectData.solarCapacity,
            inv_b: projectData.inverterBrand,
            inv_m: projectData.inverterModel,
            inv_c: projectData.inverterCapacity,
            pan_m: projectData.panelModel,
            pan_w: projectData.panelWattage,
            pan_q: projectData.noOfPanels,
            uh: projectData.utilityProvider,
            inv_sn: projectData.invSerialNo,
            wifi_u: projectData.wifiUsername,
            wifi_p: projectData.wifiPassword,
            lat: projectData.latitude,
            lng: projectData.longitude,
            rmk: `Updated: ${new Date().toISOString()}`,
          };

          await setDoc(doc(db, "old_project_data", selectedProj.projectNo), toonData, { merge: true });
        }

        toast({ title: "Success", description: `Project #${siteNo} updated successfully` });
      } else {
        // Create mode
        // Auto-generate site number if not entered
        let siteNo = formSiteNo.trim();
        if (!siteNo) {
          siteNo = await generateSiteNumber(formSysType, formMountType, formIsOtherCompany);
        }
        projectData.siteNo = siteNo;
        projectData.createdAt = serverTimestamp();

        const docRef = await addDoc(collection(db, "projects"), projectData);
        toast({ title: "Created", description: `New project #${siteNo} registered successfully` });
      }

      setIsOpenForm(false);
    } catch (err: any) {
      console.error(err);
      toast({ title: "Database error", description: err.message || "Failed to save project document", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  // Handle Delete (Admin only)
  const handleDeleteProject = async (id: string, siteNo: string, isLegacy: boolean = false) => {
    if (!isAdmin) {
      toast({ title: "Access denied", description: "Only administrators can delete projects", variant: "destructive" });
      return;
    }

    if (!confirm(`Are you absolutely sure you want to permanently delete project #${siteNo}? This action is irreversible.`)) {
      return;
    }

    try {
      if (isLegacy) {
        await deleteDoc(doc(db, "old_project_data", siteNo));
      } else {
        await deleteDoc(doc(db, "projects", id));
      }
      toast({ title: "Deleted", description: `Project #${siteNo} deleted successfully` });
      if (expandedRow === `proj-${id}`) {
        setExpandedRow(null);
      }
    } catch (err: any) {
      console.error(err);
      toast({ title: "Failed to delete", description: err.message || "Failed to remove database record", variant: "destructive" });
    }
  };

  const handleExpandRow = async (rowId: string, projectNo: string) => {
    const next = expandedRow === rowId ? null : rowId;
    setExpandedRow(next);
    if (next && !servicesByProject[projectNo]) {
      setLoadingServices(projectNo);
      try {
        const snap = await getDocs(
          query(collection(db, "services"), where("projectNo", "==", projectNo))
        );
        const list = snap.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .sort((a: any, b: any) => (b.createdAt?.seconds ?? 0) - (a.createdAt?.seconds ?? 0));
        setServicesByProject((prev) => ({ ...prev, [projectNo]: list }));
      } catch (err) {
        console.error("Failed to load services for project:", err);
        setServicesByProject((prev) => ({ ...prev, [projectNo]: [] }));
      } finally {
        setLoadingServices(null);
      }
    }
  };

  const handleSort = (field: keyof DisplayRow) => {
    if (sortField === field) {
      if (sortOrder === "asc") {
        setSortOrder("desc");
      } else {
        setSortField(null);
      }
    } else {
      setSortField(field);
      setSortOrder("asc");
    }
  };

  const renderSortHeader = (label: string, field: keyof DisplayRow, className?: string) => {
    const isSorted = sortField === field;
    return (
      <TableHead
        className={`text-[10px] font-black uppercase tracking-widest h-10 cursor-pointer select-none transition-colors text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-100 ${className || ""}`}
        onClick={() => handleSort(field)}
      >
        <div className="flex items-center gap-1">
          <span>{label}</span>
          {isSorted ? (
            sortOrder === "asc" ? (
              <ArrowUp className="h-3 w-3 text-emerald-500 shrink-0" />
            ) : (
              <ArrowDown className="h-3 w-3 text-emerald-500 shrink-0" />
            )
          ) : (
            <ArrowUpDown className="h-2.5 w-2.5 shrink-0 opacity-30" />
          )}
        </div>
      </TableHead>
    );
  };

  return (
    <div className="p-6 max-w-[1600px] mx-auto space-y-6">

      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-600 dark:text-emerald-500 mb-3 bg-emerald-500/10 px-3 py-1.5 rounded-full border border-emerald-500/20">
            <FolderOpen className="h-3.5 w-3.5" />
            Project Registry
          </div>
          <h1 className="text-3xl font-black tracking-tight text-foreground">Solar Installations</h1>
          <p className="text-muted-foreground mt-1 text-sm font-medium">
            Enterprise database of legacy client records + active new system deployments
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            className={`h-9 text-xs font-semibold transition-all ${showLegacy ? "bg-muted text-muted-foreground border-zinc-300" : ""}`}
            onClick={() => setShowLegacy(v => !v)}
          >
            {showLegacy ? "Hide" : "Show"} Legacy ({legacy.length})
          </Button>
          {isAdmin && (
            <div className="relative">
              <Button
                variant="outline"
                size="sm"
                className="h-9 text-xs font-semibold border-zinc-350 hover:bg-zinc-100 flex items-center gap-1.5 cursor-pointer relative"
                asChild
              >
                <label htmlFor="csv-upload-input" className="cursor-pointer flex items-center gap-1.5">
                  <Upload className="h-4 w-4 text-emerald-600" />
                  Upload CSV
                  <input
                    id="csv-upload-input"
                    type="file"
                    accept=".csv"
                    className="hidden"
                    onChange={handleCSVUpload}
                    disabled={uploadingCSV}
                    multiple
                  />
                </label>
              </Button>
              {uploadingCSV && (
                <div className="absolute inset-0 bg-white/70 dark:bg-zinc-950/70 flex items-center justify-center rounded">
                  <Loader2 className="h-4 w-4 animate-spin text-primary" />
                </div>
              )}
            </div>
          )}
          {isAdmin && (
            <Button
              size="sm"
              className="h-9 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm flex items-center gap-1.5"
              onClick={() => handleOpenForm()}
            >
              <Plus className="h-4 w-4" />
              Add Installation
            </Button>
          )}
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: "Aggregate Installs", value: stats.total, icon: FolderOpen, color: "text-blue-600", bg: "bg-blue-50", border: "border-blue-200/60", grad: "from-blue-50/40" },
          { label: "New Active Systems", value: stats.newProjects, icon: Star, color: "text-emerald-600", bg: "bg-emerald-50", border: "border-emerald-200/60", grad: "from-emerald-50/40" },
          { label: "Legacy Records", value: stats.legacyCount, icon: CheckCircle, color: "text-zinc-500", bg: "bg-zinc-100", border: "border-zinc-200/60", grad: "from-zinc-50/40" },
          { label: "Pending Mobilization", value: stats.pending, icon: Clock, color: "text-amber-600", bg: "bg-amber-50", border: "border-amber-200/60", grad: "from-amber-50/40" },
        ].map(({ label, value, icon: Icon, color, bg, border, grad }, i) => (
          <motion.div key={label} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06, type: "spring", stiffness: 300, damping: 24 }}>
            <Card className={`shadow-sm border dark:border-zinc-800/80 bg-gradient-to-br ${grad} to-white dark:from-zinc-900 dark:to-zinc-900 hover:shadow-md transition-shadow duration-200 ${border}`}>
              <CardContent className="p-5 flex items-center justify-between">
                <div>
                  <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5">{label}</p>
                  <p className="text-2xl font-black tabular-nums text-slate-800 dark:text-slate-100">{value.toLocaleString()}</p>
                </div>
                <div className={`p-3 rounded-xl ${bg} dark:bg-zinc-800/60 border ${border} dark:border-zinc-700/40`}>
                  <Icon className={`h-5 w-5 ${color} dark:opacity-80`} />
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      {/* Auto Range Index Reference Banner */}
      <Card className="border-emerald-250 bg-emerald-50/20 dark:border-emerald-900/30 dark:bg-emerald-950/10">
        <CardContent className="p-4 flex flex-row items-center gap-3">
          <Info className="h-5 w-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
          <div className="flex-grow space-y-1">
            <p className="text-xs font-extrabold text-emerald-800 dark:text-emerald-400 uppercase tracking-wider">New System Site IDs</p>
            <div className="flex flex-wrap gap-2.5 text-xs text-muted-foreground font-semibold">
              <span className="flex items-center gap-1">On-Grid: <strong className="text-zinc-800 dark:text-zinc-200 font-mono bg-zinc-150/40 px-1 py-0.5 rounded">1600+</strong></span>
              <span className="flex items-center gap-1">· Hybrid: <strong className="text-zinc-800 dark:text-zinc-200 font-mono bg-zinc-150/40 px-1 py-0.5 rounded">5400+</strong></span>
              <span className="flex items-center gap-1">· Off-Grid: <strong className="text-zinc-800 dark:text-zinc-200 font-mono bg-zinc-150/40 px-1 py-0.5 rounded">10000+</strong></span>
              <span className="flex items-center gap-1">· Ground Mount: <strong className="text-zinc-800 dark:text-zinc-200 font-mono bg-zinc-150/40 px-1 py-0.5 rounded">GM-0002+</strong></span>
              <span className="flex items-center gap-1">· Subcontract/Other: <strong className="text-zinc-800 dark:text-zinc-200 font-mono bg-zinc-150/40 px-1 py-0.5 rounded">OCP100+</strong></span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Table Registry Container */}
      <Card className="shadow-sm border-border/80 dark:border-zinc-800/80 bg-white dark:bg-zinc-900">
        <CardHeader className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 border-b border-border/50">
          <CardTitle className="text-base font-bold flex items-center gap-2 text-slate-800 dark:text-slate-100">
            <span>Project Index</span>
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-zinc-100 text-zinc-650 dark:bg-zinc-800 dark:text-zinc-300">
              {filtered.length} matching records
            </span>
          </CardTitle>
          <div className="flex flex-wrap gap-3 items-center w-full sm:w-auto">
            {/* Quick Filters */}
            <div className="flex gap-1 flex-wrap items-center bg-zinc-100/80 dark:bg-zinc-800/60 p-1 rounded-xl border border-zinc-200/60 dark:border-zinc-700/40">
              {[
                { val: "all", lbl: "All", dot: null },
                { val: "advance_pending", lbl: "Pending", dot: "bg-amber-400" },
                { val: "confirmed", lbl: "Confirmed", dot: "bg-blue-400" },
                { val: "installation", lbl: "Installing", dot: "bg-purple-400" },
                { val: "installation_complete", lbl: "Installed", dot: "bg-indigo-400" },
                { val: "commissioned", lbl: "Commissioned", dot: "bg-emerald-400" },
                { val: "fully_settled", lbl: "In Operation", dot: "bg-teal-600" },
              ].map(({ val, lbl, dot }) => (
                <button
                  key={val}
                  onClick={() => setStageFilter(val)}
                  className={`px-3 py-1.5 rounded-lg text-[10px] font-extrabold uppercase tracking-wider transition-all duration-150 flex items-center gap-1.5 ${
                    stageFilter === val
                      ? "bg-white dark:bg-zinc-700 text-slate-800 dark:text-zinc-100 shadow-sm border border-zinc-200/80 dark:border-zinc-600"
                      : "text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-white/60 dark:hover:bg-zinc-700/40"
                  }`}
                >
                  {dot && <span className={`h-1.5 w-1.5 rounded-full ${dot} shrink-0`} />}
                  {lbl}
                </button>
              ))}
            </div>

            {/* Search Input */}
            <div className="relative w-full sm:w-72">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-9 h-9 text-xs bg-white dark:bg-zinc-800/60 border-zinc-200 dark:border-zinc-700 focus:bg-white focus:ring-1 focus:ring-emerald-400/30 text-black dark:text-white rounded-lg shadow-sm"
                placeholder="Search customer, ID, phone, brand…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex h-48 items-center justify-center gap-2.5 text-muted-foreground">
              <Loader2 className="h-6 w-6 animate-spin text-emerald-500" />
              <span className="text-sm font-semibold">Refreshing installation directory…</span>
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex h-40 flex-col items-center justify-center text-muted-foreground gap-2">
              <p className="text-sm font-bold">{search ? "No installations found matching query." : "No project records exist."}</p>
              <p className="text-xs">Try adjusting your filters or search keywords.</p>
            </div>
          ) : (
            <div className="overflow-x-auto select-text">
              <Table>
                <TableHeader className="bg-gradient-to-b from-zinc-50 to-zinc-50/50 dark:from-zinc-800/60 dark:to-zinc-800/20 border-b border-zinc-200/70 dark:border-zinc-700/50">
                  <TableRow className="hover:bg-transparent">
                    {renderSortHeader("Site ID", "projectNo", "w-28 pl-4")}
                    {renderSortHeader("Client", "customerName")}
                    {renderSortHeader("System Capacity", "solarCapacity")}
                    {renderSortHeader("Location / Region", "areaOffice")}
                    {renderSortHeader("Grid Vendor", "utilityProvider")}
                    {renderSortHeader("Status", "stage")}
                    <TableHead className="text-[10px] font-black uppercase tracking-widest h-10 text-zinc-500 dark:text-zinc-400">Services</TableHead>
                    <TableHead className="text-[10px] font-black uppercase tracking-widest h-10 text-right pr-6 text-zinc-500 dark:text-zinc-400">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <AnimatePresence>
                    {pagedRows.map((row, i) => {
                      const stageCfg = STAGE_CONFIG[row.stage] || STAGE_CONFIG.legacy;
                      const isExpanded = expandedRow === row.id;
                      return (
                        <Fragment key={row.id}>
                          <tr
                            className={`border-b border-zinc-100 dark:border-zinc-800/60 hover:bg-gradient-to-r hover:from-zinc-50/80 hover:to-transparent dark:hover:from-zinc-800/20 dark:hover:to-transparent transition-all duration-100 cursor-pointer group ${row.isLegacy ? "" : "bg-emerald-50/5 dark:bg-emerald-950/5"}`}
                            onClick={() => handleExpandRow(row.id, row.projectNo)}
                          >
                            {/* Project Site ID + date */}
                            <TableCell className="py-3 pl-4 font-semibold" onClick={(e) => { if (!row.isLegacy) e.stopPropagation(); }}>
                              {row.isLegacy ? (
                                <span className="font-mono font-bold text-[11px] px-2.5 py-1 rounded-lg text-zinc-500 bg-zinc-100 dark:bg-zinc-800 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-700 inline-block">
                                  #{row.projectNo}
                                </span>
                              ) : (
                                <Link href={`/projects/${row.firestoreId}`}>
                                  <span className="font-mono font-bold text-[11px] px-2.5 py-1 rounded-lg text-emerald-700 bg-gradient-to-br from-emerald-50 to-emerald-100/50 dark:from-emerald-950/60 dark:to-emerald-900/30 dark:text-emerald-400 hover:from-emerald-100 hover:to-emerald-200/40 transition-all cursor-pointer border border-emerald-300/50 dark:border-emerald-700/40 shadow-sm inline-block">
                                    #{row.projectNo}
                                  </span>
                                </Link>
                              )}
                              {/* Show newest of last service date */}
                              {(() => {
                                const dates = [row.lastServiceDate].filter(d => d && d !== "—" && d !== "Pending");
                                const newest = dates.sort().reverse()[0];
                                if (!newest) return null;
                                return (
                                  <p className="text-[10px] text-emerald-600 font-semibold mt-0.5 font-mono">
                                    {newest}
                                  </p>
                                );
                              })()}
                            </TableCell>
                            
                            {/* Customer Details */}
                            <TableCell className="py-3">
                              <p className="font-bold text-sm text-slate-800 dark:text-slate-100 leading-snug">{row.customerName}</p>
                              {row.phone && row.phone !== "—" && (
                                <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1 font-semibold">
                                  <Phone className="h-3 w-3 text-zinc-400 shrink-0" />
                                  <span>{row.phone.split("/")[0]}</span>
                                </p>
                              )}
                            </TableCell>
                            
                            {/* Capacity and Panels */}
                            <TableCell className="py-3">
                              <div className="flex items-center gap-1.5">
                                <Sun className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                                <span className="text-xs font-extrabold text-slate-800 dark:text-zinc-200">
                                 {(() => {
                                   const computed = row.noOfPanels > 0 && row.panelWattage > 0
                                     ? parseFloat(((row.noOfPanels * row.panelWattage) / 1000).toFixed(2))
                                     : 0;
                                   const cap = row.solarCapacity > 0 ? row.solarCapacity : computed;
                                   if (cap > 0) return `${cap} kWp`;
                                   if (row.inverterCapacity > 0) return `${row.inverterCapacity} kW`;
                                   return "—";
                                 })()}
                                </span>
                              </div>
                              {row.noOfPanels > 0 && (
                                <p className="text-[10px] text-muted-foreground mt-0.5 font-medium">
                                  {row.noOfPanels} Panels × {row.panelWattage}W
                                </p>
                              )}
                            </TableCell>
                            
                            {/* Area / Office */}
                            <TableCell className="py-3">
                              <p className="text-xs text-slate-700 dark:text-zinc-300 flex items-center gap-1 font-semibold">
                                <MapPin className="h-3.5 w-3.5 text-primary shrink-0" />
                                <span>{row.areaOffice || "—"}</span>
                              </p>
                            </TableCell>

                            
                            {/* Utility Vendor */}
                            <TableCell className="py-3">
                              {row.utilityProvider && row.utilityProvider !== "—" ? (
                                <span className={`text-[10px] font-black px-2.5 py-1 rounded-lg border tracking-wider shadow-sm ${
                                  row.utilityProvider === "CEB" ? "text-blue-700 bg-gradient-to-br from-blue-50 to-blue-100/60 border-blue-200 dark:text-blue-300 dark:from-blue-950/30 dark:to-blue-900/10 dark:border-blue-800/40" :
                                  row.utilityProvider === "LECO" ? "text-orange-700 bg-gradient-to-br from-orange-50 to-orange-100/60 border-orange-200 dark:text-orange-300 dark:from-orange-950/30 dark:to-orange-900/10 dark:border-orange-800/40" :
                                  "text-muted-foreground bg-muted border-border"
                                }`}>
                                  {row.utilityProvider}
                                </span>
                              ) : (
                                <span className="text-xs text-zinc-300 dark:text-zinc-600 font-mono">—</span>
                              )}
                            </TableCell>

                            {/* Status Stage Badge */}
                            <TableCell className="py-3">
                              {(() => {
                                const stageCfg = STAGE_CONFIG[row.stage] || STAGE_CONFIG.legacy;
                                const dotColors: Record<string, string> = {
                                  advance_pending: "bg-amber-400",
                                  confirmed: "bg-blue-400",
                                  installation: "bg-purple-400",
                                  installation_complete: "bg-indigo-400",
                                  commissioned: "bg-emerald-400",
                                  fully_settled: "bg-teal-500",
                                  legacy: "bg-teal-500",
                                };
                                const eventDate = row.systemOnDate && row.systemOnDate !== "—" && row.systemOnDate !== "Pending"
                                  ? row.systemOnDate
                                  : row.installDate && row.installDate !== "—" && row.installDate !== "Pending"
                                  ? row.installDate
                                  : null;
                                return (
                                  <div className="space-y-0.5">
                                    <span className={`inline-flex items-center gap-1.5 text-[10px] font-bold px-2.5 py-1 rounded-lg border shadow-sm ${stageCfg.color}`}>
                                      <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${dotColors[row.stage] || "bg-zinc-400"}`} />
                                      {stageCfg.label}
                                    </span>
                                    {eventDate && (
                                      <p className="text-[10px] text-zinc-400 dark:text-zinc-500 font-medium tabular-nums pl-0.5">{eventDate}</p>
                                    )}
                                  </div>
                                );
                              })()}
                            </TableCell>
                            
                            {/* Service Summary Cell */}
                            <TableCell className="py-3" onClick={(e) => e.stopPropagation()}>
                              {(() => {
                                const legacyRec = legacyServiceRecords.find(
                                  (r: any) => String(r.projectNo).toLowerCase() === String(row.projectNo).toLowerCase()
                                );
                                const { milestones: svcMilestones, totalCount, freeDone, freeTotal } = getServiceInfo(legacyRec);
                                if (!legacyRec) return <span className="text-[10px] text-zinc-400 dark:text-zinc-500 italic">Not yet</span>;
                                if (totalCount === 0 && freeTotal === 0) return <span className="text-[10px] text-zinc-400 dark:text-zinc-500 italic">Not yet</span>;
                                const allFreeDone = freeTotal > 0 && freeDone >= freeTotal;
                                const inFree = freeTotal > 0 && freeDone < freeTotal;
                                const lastSvcDate = svcMilestones.length > 0 ? svcMilestones[svcMilestones.length - 1].date : null;
                                return (
                                  <div className="flex flex-col gap-1">
                                    <div className="flex items-center gap-1.5 flex-wrap">
                                      {totalCount > 0 ? (
                                        <span className="inline-flex items-center gap-1 text-[10px] font-black px-2 py-0.5 rounded-lg border bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 border-zinc-200 dark:border-zinc-700 shadow-sm">
                                          <Wrench className="h-2.5 w-2.5" /> {totalCount} service{totalCount !== 1 ? "s" : ""}
                                        </span>
                                      ) : (
                                        <span className="text-[10px] text-zinc-400 italic">No services yet</span>
                                      )}
                                      {freeTotal > 0 && (
                                        <span className={`inline-flex items-center gap-1 text-[10px] font-black px-2 py-0.5 rounded-lg border shadow-sm ${
                                          allFreeDone
                                            ? "bg-zinc-100 text-zinc-500 border-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:border-zinc-700"
                                            : inFree
                                            ? "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/20 dark:text-emerald-400 dark:border-emerald-800/40"
                                            : "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/20 dark:text-amber-400"
                                        }`}>
                                          Free: {freeDone}/{freeTotal}{allFreeDone ? " ✓" : ""}
                                        </span>
                                      )}
                                    </div>
                                    {lastSvcDate && (
                                      <span className="text-[10px] text-zinc-400 dark:text-zinc-500 font-medium tabular-nums">
                                        Last: {lastSvcDate}
                                      </span>
                                    )}
                                  </div>
                                );
                              })()}
                            </TableCell>

                            {/* Action Buttons */}
                            <TableCell className="py-3 text-right pr-5" onClick={(e) => e.stopPropagation()}>
                              <div className="flex items-center justify-end gap-1 opacity-60 group-hover:opacity-100 transition-opacity duration-150">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-7 text-[11px] font-bold border-zinc-200 hover:bg-emerald-50 hover:border-emerald-300 hover:text-emerald-700 transition-all"
                                  onClick={() => handleOpenForm(row)}
                                >
                                  <Edit className="h-3 w-3 mr-1" />
                                  Edit
                                </Button>

                                {isAdmin && (row.firestoreId || row.isLegacy) && (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-7 w-7 p-0 text-zinc-400 hover:text-red-500 hover:bg-red-50 transition-all"
                                    onClick={() => handleDeleteProject(row.firestoreId || row.projectNo, row.projectNo, row.isLegacy)}
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </Button>
                                )}

                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className={`h-7 text-[11px] font-semibold transition-all ${isExpanded ? "text-emerald-600 bg-emerald-50 dark:bg-emerald-950/20" : "text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-200"}`}
                                  onClick={() => handleExpandRow(row.id, row.projectNo)}
                                >
                                  {isExpanded ? "Close" : "Details"}
                                </Button>
                              </div>
                            </TableCell>
                          </tr>

                          {/* Expansion Panel details + MAP VIEW */}
                          {isExpanded && (
                            <tr className="bg-gradient-to-b from-zinc-50/80 to-zinc-50/30 dark:from-zinc-900/50 dark:to-zinc-900/20 border-b border-zinc-200/60 dark:border-zinc-800">
                              <td colSpan={8} className="p-0">
                                <div className="p-6 grid grid-cols-1 lg:grid-cols-12 gap-6 border-l-2 border-emerald-400/30 dark:border-emerald-600/20 ml-0">
                                  
                                  {/* Left Panel: Specifications details */}
                                  <div className="lg:col-span-7 grid grid-cols-1 md:grid-cols-2 gap-y-4 gap-x-6 text-xs font-medium text-slate-700 dark:text-zinc-300">
                                    
                                    <div>
                                      <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1">Customer Address</p>
                                      <p className="font-semibold">{row.address || "—"}</p>
                                    </div>
                                    
                                    <div>
                                      <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1">Inverter Specifications</p>
                                      <p className="font-semibold">
                                        {row.inverterBrand && row.inverterBrand !== "—"
                                          ? `${row.inverterBrand}${row.inverterCapacity > 0 ? ` (${row.inverterCapacity} kW)` : ""}`
                                          : "—"}
                                      </p>
                                      {row.inverterModel && row.inverterModel !== "—" && (
                                        <p className="text-[10px] font-mono text-muted-foreground mt-0.5">Model: {row.inverterModel}</p>
                                      )}
                                    </div>
                                    
                                    <div>
                                      <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1">Solar PV Panels</p>
                                      <p className="font-semibold">
                                        {row.noOfPanels > 0 ? (() => {
                                          const computedKwp = row.panelWattage > 0
                                            ? parseFloat(((row.noOfPanels * row.panelWattage) / 1000).toFixed(2))
                                            : 0;
                                          const kwp = row.solarCapacity > 0 ? row.solarCapacity : computedKwp;
                                          return `${row.noOfPanels} panels${kwp > 0 ? ` (${kwp} kWp DC)` : ""}`;
                                        })() : "—"}
                                      </p>
                                      {row.panelModel && row.panelModel !== "—" && (
                                        <p className="text-[10px] font-mono text-muted-foreground mt-0.5">Model: {row.panelModel}</p>
                                      )}
                                    </div>
                                    
                                    <div>
                                      <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1">Site Engineer / Contractor</p>
                                      <p className="font-semibold flex items-center gap-1">
                                        <User className="h-3.5 w-3.5 text-zinc-400" />
                                        <span>{row.engineer || "—"}</span>
                                      </p>
                                    </div>

                                    {/* Incomplete data warning for installed/commissioned projects */}
                                    {!row.isLegacy && [
                                      "installation_complete", "commissioned", "fully_settled"
                                    ].includes(row.stage) && (
                                      row.inverterCapacity === 0 || row.solarCapacity === 0
                                    ) && (
                                      <div className="md:col-span-2 flex items-start gap-3 p-3 rounded-lg bg-amber-50 border border-amber-200 dark:bg-amber-950/20 dark:border-amber-800/40">
                                        <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                                        <div className="flex-1 min-w-0">
                                          <p className="text-[10px] font-black uppercase text-amber-800 dark:text-amber-400 tracking-wider">Incomplete Technical Data</p>
                                          <p className="text-[11px] text-amber-700 dark:text-amber-500 mt-0.5 font-medium">
                                            Installation is complete but some technical specs are missing.
                                            {row.inverterCapacity === 0 && " Inverter capacity"}
                                            {row.inverterCapacity === 0 && row.solarCapacity === 0 && " &"}
                                            {row.solarCapacity === 0 && " Solar capacity"}
                                            {" "} not recorded.
                                          </p>
                                        </div>
                                        <Button
                                          size="sm"
                                          variant="outline"
                                          className="h-7 text-[10px] font-bold border-amber-300 text-amber-700 hover:bg-amber-100 shrink-0"
                                          onClick={(e) => { e.stopPropagation(); handleOpenForm(row); }}
                                        >
                                          Complete Now
                                        </Button>
                                      </div>
                                    )}
                                    
                                    {/* Wifi & Monitoring info */}
                                    <div className="md:col-span-2 border-t border-zinc-200/60 dark:border-zinc-800 pt-4 mt-1 grid grid-cols-2 gap-4">
                                      <div>
                                        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1">Monitoring WLAN WiFi</p>
                                        {row.wifiUsername ? (
                                          <div className="space-y-0.5 text-[11px] font-mono bg-zinc-100 dark:bg-zinc-800 p-2 rounded border dark:border-zinc-700">
                                            <p>SSID: <strong className="text-foreground">{row.wifiUsername}</strong></p>
                                            <p>Pass: <strong className="text-foreground">{row.wifiPassword || "—"}</strong></p>
                                          </div>
                                        ) : (
                                          <p className="italic text-muted-foreground">No credentials logged</p>
                                        )}
                                      </div>
                                      <div>
                                        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1">Inverter Register ID</p>
                                        {row.invSerialNo ? (
                                          <div className="space-y-0.5 text-[11px] font-mono bg-zinc-100 dark:bg-zinc-800 p-2 rounded border dark:border-zinc-700">
                                            <p>S/N: <strong className="text-foreground">{row.invSerialNo}</strong></p>
                                            <p>Check Code: <strong className="text-foreground">{row.invCheckCode || "—"}</strong></p>
                                          </div>
                                        ) : (
                                          <p className="italic text-muted-foreground">No monitoring register set</p>
                                        )}
                                      </div>
                                    </div>

                                    {/* Service History */}
                                    {(() => {
                                      const legacyRec = legacyServiceRecords.find(
                                        (r: any) => String(r.projectNo).toLowerCase() === String(row.projectNo).toLowerCase()
                                      );
                                      const { milestones: legacyMilestones, totalCount, freeDone, freeTotal, yearsRaw, roundsRaw } = getServiceInfo(legacyRec);
                                      const firestoreSvcs: any[] = servicesByProject[row.projectNo] ?? [];
                                      const hasAny = legacyMilestones.length > 0 || firestoreSvcs.length > 0;
                                      const allFreeDone = freeTotal > 0 && freeDone >= freeTotal;
                                      const inFree = freeTotal > 0 && freeDone < freeTotal;

                                      // Build sorted date list for interval calculation
                                      const allDates: { label: string; date: Date; isFree: boolean }[] = [];
                                      legacyMilestones.forEach((m: any, idx: number) => {
                                        const d = parseServiceDate(m.date);
                                        if (d) allDates.push({ label: m.name, date: d, isFree: idx < freeTotal });
                                      });
                                      allDates.sort((a, b) => a.date.getTime() - b.date.getTime());

                                      return (
                                        <div className="md:col-span-2 border-t border-zinc-200/60 dark:border-zinc-800 pt-4 mt-1 space-y-3">
                                          <div className="flex items-center justify-between">
                                            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest flex items-center gap-1.5">
                                              <Wrench className="h-3.5 w-3.5 text-primary" />
                                              Service History
                                            </p>
                                            <Link
                                              href={`/services/new?projectNo=${encodeURIComponent(row.projectNo)}`}
                                              className="text-[10px] font-bold text-primary hover:underline flex items-center gap-1"
                                              onClick={(e) => e.stopPropagation()}
                                            >
                                              <Plus className="h-3 w-3" /> New Service
                                            </Link>
                                          </div>

                                          {/* Free Service Agreement Status */}
                                          {(freeTotal > 0 || yearsRaw || totalCount > 0) && (
                                            <div className={`flex flex-wrap items-center gap-2 px-3 py-2 rounded-lg border text-[11px] font-semibold ${
                                              allFreeDone
                                                ? "bg-zinc-50 border-zinc-200 dark:bg-zinc-800/40 dark:border-zinc-700"
                                                : inFree
                                                ? "bg-emerald-50/60 border-emerald-200 dark:bg-emerald-950/10 dark:border-emerald-800/30"
                                                : "bg-amber-50/60 border-amber-200/60 dark:bg-amber-950/10 dark:border-amber-800/30"
                                            }`}>
                                              <Wrench className={`h-3.5 w-3.5 shrink-0 ${allFreeDone ? "text-zinc-400" : inFree ? "text-emerald-600" : "text-amber-600"}`} />
                                              <span className={`font-black text-[10px] uppercase tracking-wider ${allFreeDone ? "text-zinc-500" : inFree ? "text-emerald-700 dark:text-emerald-400" : "text-amber-700 dark:text-amber-400"}`}>
                                                {allFreeDone ? "Free services completed" : inFree ? "Free service period active" : freeTotal > 0 ? "Free services pending" : "Service record"}
                                              </span>
                                              {freeTotal > 0 && (
                                                <span className="text-muted-foreground">
                                                  {freeDone}/{freeTotal} free service{freeTotal !== 1 ? "s" : ""} done
                                                  {yearsRaw ? ` · ${yearsRaw}-year agreement` : ""}
                                                </span>
                                              )}
                                              <span className="ml-auto font-black text-foreground">{totalCount} service{totalCount !== 1 ? "s" : ""} total</span>
                                            </div>
                                          )}

                                          {loadingServices === row.projectNo ? (
                                            <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
                                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                              <span>Loading…</span>
                                            </div>
                                          ) : !hasAny ? (
                                            <p className="text-xs text-muted-foreground italic">No service records found for this site.</p>
                                          ) : (
                                            <div className="space-y-1.5">
                                              {/* Legacy CSV milestones with interval badges */}
                                              {legacyMilestones.map((m: any, i: number) => {
                                                const thisDate = parseServiceDate(m.date);
                                                const thisMs = thisDate ? thisDate.getTime() : -1;
                                                const thisDateIdx = allDates.findIndex(d => d.date.getTime() === thisMs);
                                                const prevEntry = thisDateIdx > 0 ? allDates[thisDateIdx - 1] : null;
                                                const gap = thisDate && prevEntry ? monthsBetween(prevEntry.date, thisDate) : null;
                                                const isFreeService = i < freeTotal;
                                                const gapColor = gap === null ? "" : gap <= 6
                                                  ? "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/20 dark:text-emerald-400"
                                                  : gap <= 12
                                                  ? "bg-yellow-50 text-yellow-700 border-yellow-200 dark:bg-yellow-950/20 dark:text-yellow-400"
                                                  : gap <= 24
                                                  ? "bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-950/20 dark:text-orange-400"
                                                  : "bg-red-50 text-red-700 border-red-200 dark:bg-red-950/20 dark:text-red-400";
                                                return (
                                                  <div key={`leg-${i}`} className="flex items-start gap-3 text-[11px] bg-zinc-100 dark:bg-zinc-800 px-3 py-2 rounded border dark:border-zinc-700">
                                                    <span className={`font-black whitespace-nowrap w-28 shrink-0 ${isFreeService ? "text-emerald-700 dark:text-emerald-400" : "text-foreground"}`}>
                                                      {m.name}
                                                    </span>
                                                    {isFreeService && (
                                                      <span className="text-[9px] font-black px-1.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400 border border-emerald-200 shrink-0">FREE</span>
                                                    )}
                                                    <span className="font-mono text-muted-foreground whitespace-nowrap shrink-0">{m.date}</span>
                                                    {gap !== null && (
                                                      <span className={`text-[9px] font-black px-1.5 py-0.5 rounded border shrink-0 whitespace-nowrap ${gapColor}`}>
                                                        +{gap}mo
                                                      </span>
                                                    )}
                                                    {m.notes && (
                                                      <span className="text-muted-foreground leading-snug">{m.notes}</span>
                                                    )}
                                                  </div>
                                                );
                                              })}
                                              {/* Legacy metadata */}
                                              {(row.remarks || (legacyRec && (legacyRec.remarks || legacyRec.breakdownNotes))) && (
                                                <div className="text-[10px] text-muted-foreground bg-amber-50/60 dark:bg-amber-950/10 border border-amber-200/40 rounded px-3 py-2 space-y-0.5">
                                                  {row.remarks && <p><span className="font-bold text-amber-800 dark:text-amber-400">Project Remarks:</span> {row.remarks}</p>}
                                                  {legacyRec?.remarks && <p><span className="font-bold text-amber-800 dark:text-amber-400">Service Remarks:</span> {legacyRec.remarks}</p>}
                                                  {legacyRec?.breakdownNotes && <p><span className="font-bold text-amber-800 dark:text-amber-400">Breakdowns:</span> {legacyRec.breakdownNotes}</p>}
                                                </div>
                                              )}
                                              {/* Firestore services */}
                                              {firestoreSvcs.map((svc: any) => {
                                                const date = svc.createdAt?.seconds
                                                  ? new Date(svc.createdAt.seconds * 1000).toLocaleDateString("en-GB")
                                                  : svc.dueDate || "—";
                                                const isCompleted = svc.status === "completed";
                                                return (
                                                  <div key={svc.id} className="flex items-center justify-between text-[11px] bg-emerald-50/50 dark:bg-emerald-950/10 px-3 py-2 rounded border border-emerald-200/40 dark:border-emerald-800/20">
                                                    <span className="font-mono font-bold text-foreground">#{svc.serviceNo || "Draft"}</span>
                                                    <span className="text-muted-foreground font-medium">{date}</span>
                                                    <span className="text-muted-foreground max-w-[150px] truncate">{svc.notes || "—"}</span>
                                                    <span className="font-bold text-foreground">{svc.costs?.totalCost ? `LKR ${svc.costs.totalCost.toLocaleString()}` : "—"}</span>
                                                    <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase border ${isCompleted ? "bg-emerald-50 text-emerald-700 border-emerald-300" : "bg-zinc-200 text-zinc-600 border-zinc-300"}`}>
                                                      {isCompleted ? "Completed" : svc.status || "Pending"}
                                                    </span>
                                                    <Link href={`/services/${svc.id}`} className="text-[10px] font-bold text-primary hover:underline" onClick={(e) => e.stopPropagation()}>View</Link>
                                                  </div>
                                                );
                                              })}
                                            </div>
                                          )}
                                        </div>
                                      );
                                    })()}
                                  </div>

                                  {/* Right Panel: Exact Location MAP VIEW */}
                                  <div className="lg:col-span-5 border-t lg:border-t-0 lg:border-l border-zinc-200/60 dark:border-zinc-800 lg:pl-6 pt-4 lg:pt-0 flex flex-col lg:grid lg:grid-rows-[auto_1fr] lg:gap-2">
                                    <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-2 flex items-center gap-1.5 shrink-0">
                                      <Globe className="h-3.5 w-3.5 text-primary" />
                                      <span>EXACT SITE LOCATION MAP</span>
                                    </p>
                                    
                                    {row.latitude && row.longitude ? (
                                      <div className="space-y-2 flex-grow flex flex-col lg:grid lg:grid-rows-[1fr_auto] lg:gap-2 lg:space-y-0">
                                        <div className="rounded-xl overflow-hidden border border-zinc-200 dark:border-zinc-800 shadow-sm bg-zinc-100 relative min-h-[300px] lg:min-h-0 w-full h-full">
                                          <iframe
                                            width="100%"
                                            height="100%"
                                            frameBorder="1"
                                            src={`https://maps.google.com/maps?q=${row.latitude},${row.longitude}&z=14&output=embed`}
                                            className="border-none absolute inset-0 w-full h-full"
                                            allowFullScreen
                                          />
                                        </div>
                                        <div className="flex items-center justify-between text-[11px] text-muted-foreground font-semibold pt-1 lg:pt-0 shrink-0">
                                          <span>Coords: {row.latitude.toFixed(6)}, {row.longitude.toFixed(6)}</span>
                                          <a
                                            href={`https://www.google.com/maps/search/?api=1&query=${row.latitude},${row.longitude}`}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="text-primary hover:underline flex items-center gap-1"
                                          >
                                            <span>Open External Maps</span>
                                            <Globe className="h-3 w-3" />
                                          </a>
                                        </div>
                                      </div>
                                    ) : (
                                      <div className="flex-grow min-h-[180px] lg:min-h-0 lg:h-full rounded-xl border border-dashed border-zinc-300 dark:border-zinc-800 flex flex-col items-center justify-center text-center p-4 text-muted-foreground gap-1.5">
                                        <Map className="h-8 w-8 text-zinc-350" />
                                        <p className="text-xs font-bold">GPS Coordinates Missing</p>
                                        <p className="text-[10px] max-w-[200px]">Edit the installation record to provide coordinates to render map.</p>
                                      </div>
                                    )}
                                  </div>

                                </div>
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      );
                    })}
                  </AnimatePresence>
                </TableBody>
              </Table>
            </div>
          )}
          <Pagination
            page={page}
            pageSize={pageSize}
            total={sortedAndFiltered.length}
            pageSizeOptions={[50, 100, 250, 500, "all"]}
            onPageChange={setPage}
            onPageSizeChange={(s) => { setPageSize(s); setPage(1); }}
          />
        </CardContent>
      </Card>

      {/* CRUD Add/Edit Dialog Dialog */}
      <Dialog open={isOpenForm} onOpenChange={setIsOpenForm}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto bg-white dark:bg-zinc-900 border dark:border-zinc-800 rounded-xl p-6">
          <DialogHeader className="border-b border-zinc-150 dark:border-zinc-800 pb-3">
            <DialogTitle className="text-lg font-bold text-slate-800 dark:text-white flex items-center gap-2">
              {selectedProj ? <Edit className="h-5 w-5 text-emerald-600" /> : <Plus className="h-5 w-5 text-emerald-600" />}
              <span>{selectedProj ? `Edit Installation Record: #${selectedProj.projectNo}` : "Register New Installation"}</span>
            </DialogTitle>
            <DialogDescription className="text-xs font-semibold text-muted-foreground mt-1">
              Add details of technical client site deployments.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSaveProject} className="space-y-6 pt-4 text-xs font-semibold">
            
            {/* Section 1: Customer & Site Details */}
            <div className="space-y-4">
              <h3 className="text-[10px] font-black uppercase text-primary tracking-widest border-b border-zinc-100 pb-1">1. Customer & System Classification</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                
                <div className="space-y-1.5">
                  <Label className="text-[10px] font-bold text-muted-foreground uppercase">Customer Name *</Label>
                  <Input
                    className="h-8 bg-zinc-50 dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700 text-black dark:text-white"
                    placeholder="Enter full name"
                    value={formCustName}
                    onChange={(e) => setFormCustName(e.target.value)}
                    required
                  />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-[10px] font-bold text-muted-foreground uppercase">Phone Number</Label>
                  <Input
                    className="h-8 bg-zinc-50 dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700 text-black dark:text-white"
                    placeholder="e.g. 0771234567"
                    value={formCustPhone}
                    onChange={(e) => setFormCustPhone(e.target.value)}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-[10px] font-bold text-muted-foreground uppercase">Custom Site ID (Optional)</Label>
                  <Input
                    className="h-8 bg-zinc-50 border-zinc-200 font-mono text-black dark:text-white"
                    placeholder="e.g. Leave blank to auto-generate"
                    value={formSiteNo}
                    onChange={(e) => setFormSiteNo(e.target.value)}
                  />
                </div>

                <div className="space-y-1.5 md:col-span-3">
                  <Label className="text-[10px] font-bold text-muted-foreground uppercase">Full Project Site Address</Label>
                  <Input
                    className="h-8 bg-zinc-50 dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700 text-black dark:text-white"
                    placeholder="Specify complete install location address"
                    value={formCustAddress}
                    onChange={(e) => {
                      setFormCustAddress(e.target.value);
                      // Auto-detect area office if not manually set
                      const detected = detectAreaOffice(e.target.value);
                      if (detected) setFormAreaOffice(detected);
                    }}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-[10px] font-bold text-muted-foreground uppercase">System Configuration Type</Label>
                  <Select value={formSysType} onValueChange={setFormSysType}>
                    <SelectTrigger className="h-8 bg-zinc-50 border-zinc-200">
                      <SelectValue placeholder="Select type" />
                    </SelectTrigger>
                    <SelectContent className="bg-white dark:bg-zinc-900">
                      <SelectItem value="ongrid">On-Grid (Solar + Grid)</SelectItem>
                      <SelectItem value="hybrid">Hybrid (Solar + Grid + Battery)</SelectItem>
                      <SelectItem value="hybrid-offgrid">Hybrid (Solar + Battery, No Grid)</SelectItem>
                      <SelectItem value="offgrid">Off-Grid (Solar + Battery)</SelectItem>
                      <SelectItem value="grid-backup">Grid Backup (Grid + Battery, No Solar)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-[10px] font-bold text-muted-foreground uppercase">Mount Type</Label>
                  <Select value={formMountType} onValueChange={setFormMountType}>
                    <SelectTrigger className="h-8 bg-zinc-50 border-zinc-200">
                      <SelectValue placeholder="Select mounting" />
                    </SelectTrigger>
                    <SelectContent className="bg-white">
                      <SelectItem value="roof">Roof Mount</SelectItem>
                      <SelectItem value="ground">Ground Mount (GM-0002+)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-[10px] font-bold text-muted-foreground uppercase">Deployment Status</Label>
                  <Select value={formStage} onValueChange={setFormStage}>
                    <SelectTrigger className="h-8 bg-zinc-50 border-zinc-200">
                      <SelectValue placeholder="Select progress" />
                    </SelectTrigger>
                    <SelectContent className="bg-white">
                      <SelectItem value="advance_pending">Advance Pending</SelectItem>
                      <SelectItem value="confirmed">Confirmed</SelectItem>
                      <SelectItem value="installation">Installation Stage</SelectItem>
                      <SelectItem value="installation_complete">Installation Complete</SelectItem>
                      <SelectItem value="commissioned">Commissioned (Active)</SelectItem>
                      <SelectItem value="fully_settled">In Operation</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-[10px] font-bold text-muted-foreground uppercase">Utility Vendor</Label>
                  <Select value={formUtility} onValueChange={setFormUtility}>
                    <SelectTrigger className="h-8 bg-zinc-50 border-zinc-200">
                      <SelectValue placeholder="Select vendor" />
                    </SelectTrigger>
                    <SelectContent className="bg-white">
                      <SelectItem value="CEB">CEB</SelectItem>
                      <SelectItem value="LECO">LECO</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-[10px] font-bold text-muted-foreground uppercase">Area Office / Region</Label>
                  <Input
                    className="h-8 bg-zinc-50 dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700 text-black dark:text-white"
                    placeholder="e.g. Matara, Tangalle"
                    value={formAreaOffice}
                    onChange={(e) => setFormAreaOffice(e.target.value)}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-[10px] font-bold text-muted-foreground uppercase">Site Engineer</Label>
                  <Input
                    className="h-8 bg-zinc-50 dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700 text-black dark:text-white"
                    placeholder="Enter engineer name"
                    value={formEngineer}
                    onChange={(e) => setFormEngineer(e.target.value)}
                  />
                </div>

                <div className="flex items-center space-x-2 pt-6">
                  <input
                    type="checkbox"
                    id="other-company"
                    checked={formIsOtherCompany}
                    onChange={(e) => setFormIsOtherCompany(e.target.checked)}
                    className="h-4 w-4 rounded border-zinc-300 text-emerald-600 focus:ring-emerald-500"
                  />
                  <Label htmlFor="other-company" className="text-[10px] font-bold text-slate-700 dark:text-zinc-300 cursor-pointer">
                    Subcontract / Other Company (OCP100+)
                  </Label>
                </div>
              </div>
            </div>

            {/* Section 2: Technical Specifications */}
            <div className="space-y-4">
              <h3 className="text-[10px] font-black uppercase text-primary tracking-widest border-b border-zinc-100 pb-1">2. Hardware & Inverter Specifications</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                
                <div className="space-y-1.5">
                  <Label className="text-[10px] font-bold text-muted-foreground uppercase">Inverter Brand</Label>
                  <Input
                    list="inv-brands"
                    className="h-8 bg-zinc-50 dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700 text-black dark:text-white"
                    placeholder="e.g. GoodWe, Solis, Deye"
                    value={formInverterBrand}
                    onChange={(e) => {
                      setFormInverterBrand(e.target.value);
                      setFormInverterModel("");
                      setFormInverterCapacity("");
                    }}
                  />
                  <datalist id="inv-brands">
                    {[...new Set(inverterProducts.map((p: any) => p.brand))].sort().map((b: any) => (
                      <option key={b} value={b} />
                    ))}
                  </datalist>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-[10px] font-bold text-muted-foreground uppercase">Inverter Model</Label>
                  <Input
                    list="inv-models"
                    className="h-8 bg-zinc-50 border-zinc-200 font-mono text-black dark:text-white"
                    placeholder="e.g. GW5000-ES-C10"
                    value={formInverterModel}
                    onChange={(e) => {
                      const val = e.target.value;
                      setFormInverterModel(val);
                      // Match against DB first (brand+model or model alone)
                      const dbMatch = inverterProducts.find((p: any) =>
                        p.model?.toLowerCase() === val.toLowerCase() &&
                        (!formInverterBrand || p.brand?.toLowerCase() === formInverterBrand.toLowerCase())
                      ) || inverterProducts.find((p: any) => p.model?.toLowerCase() === val.toLowerCase());
                      if (dbMatch) {
                        if (!formInverterBrand) setFormInverterBrand(dbMatch.brand);
                        const kw = (dbMatch.input_rated_power || 0) / 1000;
                        if (kw > 0) { setFormInverterCapacity(String(kw)); return; }
                      }
                      // Fallback: regex inference
                      const inferred = inferInverterCapacity(val);
                      if (inferred > 0 && (!formInverterCapacity || parseFloat(formInverterCapacity) === 0)) {
                        setFormInverterCapacity(String(inferred));
                      }
                    }}
                  />
                  <datalist id="inv-models">
                    {inverterProducts
                      .filter((p: any) => !formInverterBrand || p.brand?.toLowerCase() === formInverterBrand.toLowerCase())
                      .map((p: any) => (
                        <option key={p.id} value={p.model} label={`${p.brand} — ${(p.input_rated_power / 1000).toFixed(1)} kW`} />
                      ))}
                  </datalist>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-[10px] font-bold text-muted-foreground uppercase">Inverter Capacity (kW)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    className="h-8 bg-zinc-50 border-zinc-200 font-mono text-black dark:text-white"
                    placeholder="Auto-filled from model"
                    value={formInverterCapacity}
                    onChange={(e) => setFormInverterCapacity(e.target.value)}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-[10px] font-bold text-muted-foreground uppercase">No of Panels</Label>
                  <Input
                    type="number"
                    className="h-8 bg-zinc-50 border-zinc-200 font-mono text-black dark:text-white"
                    placeholder="e.g. 36"
                    value={formNoOfPanels}
                    onChange={(e) => setFormNoOfPanels(e.target.value)}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-[10px] font-bold text-muted-foreground uppercase">Panel Wattage (W)</Label>
                  <Input
                    type="number"
                    className="h-8 bg-zinc-50 border-zinc-200 font-mono text-black dark:text-white"
                    placeholder="e.g. 550"
                    value={formPanelWattage}
                    onChange={(e) => setFormPanelWattage(e.target.value)}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-[10px] font-bold text-muted-foreground uppercase">Panel Model Code</Label>
                  <Input
                    className="h-8 bg-zinc-50 border-zinc-200 font-mono text-black dark:text-white"
                    placeholder="e.g. JAM72S30"
                    value={formPanelModel}
                    onChange={(e) => setFormPanelModel(e.target.value)}
                  />
                </div>
              </div>
            </div>

            {/* Section 3: Monitoring & Logging Details */}
            <div className="space-y-4">
              <h3 className="text-[10px] font-black uppercase text-primary tracking-widest border-b border-zinc-100 pb-1">3. Monitoring & WLAN WiFi Parameters</h3>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                
                <div className="space-y-1.5">
                  <Label className="text-[10px] font-bold text-muted-foreground uppercase">Wifi Username / SSID</Label>
                  <Input
                    className="h-8 bg-zinc-50 border-zinc-200 font-mono text-black dark:text-white"
                    placeholder="SSID Name"
                    value={formWifiUsername}
                    onChange={(e) => setFormWifiUsername(e.target.value)}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-[10px] font-bold text-muted-foreground uppercase">Wifi Passphrase</Label>
                  <Input
                    className="h-8 bg-zinc-50 border-zinc-200 font-mono text-black dark:text-white"
                    placeholder="Password"
                    value={formWifiPassword}
                    onChange={(e) => setFormWifiPassword(e.target.value)}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-[10px] font-bold text-muted-foreground uppercase">Inverter Serial S/N</Label>
                  <Input
                    className="h-8 bg-zinc-50 border-zinc-200 font-mono text-black dark:text-white"
                    placeholder="Serial Number"
                    value={formSerialNo}
                    onChange={(e) => setFormSerialNo(e.target.value)}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-[10px] font-bold text-muted-foreground uppercase">Check Code</Label>
                  <Input
                    className="h-8 bg-zinc-50 border-zinc-200 font-mono text-black dark:text-white"
                    placeholder="Validation check"
                    value={formCheckCode}
                    onChange={(e) => setFormCheckCode(e.target.value)}
                  />
                </div>
              </div>
            </div>

            {/* Section 4: Site Map Location */}
            <div className="space-y-4">
              <h3 className="text-[10px] font-black uppercase text-primary tracking-widest border-b border-zinc-100 pb-1">4. Site Map Location & Dates</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

                {/* Unified Location — lat,lng or Plus Code */}
                <div className="space-y-1.5">
                  <Label className="text-[10px] font-bold text-muted-foreground uppercase">Site Location</Label>
                  <Input
                    className="h-8 bg-zinc-50 border-zinc-200 font-mono text-black dark:text-white"
                    placeholder="Lat,Lng (e.g. 5.952,80.532) or Plus Code"
                    value={formLocation}
                    onChange={(e) => setFormLocation(e.target.value)}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-[10px] font-bold text-muted-foreground uppercase">Installation Date</Label>
                  <Input
                    type="date"
                    className="h-8 bg-zinc-50 border-zinc-200 font-mono text-black dark:text-white"
                    value={formInstallDate}
                    onChange={(e) => setFormInstallDate(e.target.value)}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-[10px] font-bold text-muted-foreground uppercase">Commissioning Date</Label>
                  <Input
                    type="date"
                    className="h-8 bg-zinc-50 border-zinc-200 font-mono text-black dark:text-white"
                    value={formSystemOnDate}
                    onChange={(e) => setFormSystemOnDate(e.target.value)}
                  />
                </div>

                {/* Full-width hint spanning all 3 columns */}
                <p className="text-[10px] text-muted-foreground md:col-span-3 -mt-1">
                  Enter <span className="font-mono">lat,lng</span> OR a Google Plus Code — one format only (e.g. <span className="font-mono">6GVW+6H, Minuwangoda</span> or <span className="font-mono">5.952,80.532</span>).
                </p>
              </div>

              {/* Map Selector & Preview */}
              <div className="space-y-2 pt-2">
                {leafletLoaded && (
                  <div className="space-y-1">
                    <Label className="text-[10px] font-bold text-muted-foreground uppercase flex items-center gap-1.5">
                      <MapPin className="h-3.5 w-3.5 text-emerald-600" />
                      <span>Interactive Map Selector (Click to place / Drag marker to adjust)</span>
                    </Label>
                    <div 
                      id="dialog-map" 
                      className="rounded-lg overflow-hidden border border-zinc-200 dark:border-zinc-800 bg-zinc-150 h-[200px] z-10"
                      style={{ position: "relative" }}
                    />
                  </div>
                )}

                {/* Google Maps iframe fallback/preview for Plus Codes */}
                {(() => {
                  const loc = parseLocation(formLocation);
                  const isPlusCode = loc.plusCode !== null;
                  const isNoLeaflet = !leafletLoaded;
                  if (formLocation.trim() && (isPlusCode || isNoLeaflet)) {
                    const mapQuery = loc.lat && loc.lng
                      ? `${loc.lat},${loc.lng}`
                      : encodeURIComponent(formLocation);
                    return (
                      <div className="space-y-1">
                        <Label className="text-[10px] font-bold text-muted-foreground uppercase">
                          {isPlusCode ? "Google Plus Code Preview (Static)" : "Location Preview"}
                        </Label>
                        <div className="rounded-lg overflow-hidden border border-zinc-200 dark:border-zinc-800 bg-zinc-100">
                          <iframe
                            width="100%"
                            height="180"
                            frameBorder="0"
                            src={`https://maps.google.com/maps?q=${mapQuery}&z=13&output=embed`}
                            className="border-none"
                          />
                        </div>
                      </div>
                    );
                  }
                  return null;
                })()}
              </div>
            </div>

            {/* Dialog Footer Actions */}
            <DialogFooter className="border-t border-zinc-150 dark:border-zinc-800 pt-4 flex items-center justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                className="h-9 text-xs font-semibold"
                onClick={() => setIsOpenForm(false)}
                disabled={saving}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                className="h-9 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow"
                disabled={saving}
              >
                {saving ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
                    Saving Changes...
                  </>
                ) : (
                  <>
                    <Check className="h-4 w-4 mr-1.5" />
                    Save Record
                  </>
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

    </div>
  );
}
