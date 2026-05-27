import { NextRequest, NextResponse } from "next/server";
import { verifyIdToken, adminDb } from "@/lib/firebase-admin";

// TOON (Token-Oriented Object Notation) schema for minimal storage
// Field mapping for compact storage

interface ProjectToon {
  pn: string;        // projectNo
  n: string;         // customerName
  a: string;         // address
  ph: string;        // phone
  em: string;        // email
  cap: number;       // solar capacity (kW)
  inv_b?: string;    // inverter brand
  inv_m?: string;    // inverter model
  inv_c?: number;    // inverter capacity (kW)
  inv_sn?: string;   // inverter serial number
  lat?: number;      // latitude
  lng?: number;      // longitude
  uh?: string;       // utility (CEB/LECO)
  pan_m?: string;    // panel model
  pan_t?: string;    // panel type
  pan_w?: number;    // panel wattage
  pan_q?: number;    // panel qty
  wifi_u?: string;   // wifi username
  wifi_p?: string;   // wifi password
  nic?: string;      // NIC
  rmk?: string;      // remarks
  pid?: string;      // Project Installation Date
  adb?: string;      // ADB/Cash
  roof_t?: string;   // roof type
  mount_t?: string;  // mount type
  doc?: Record<string, any>; // documentation flags
  _m?: string;       // metadata: upload timestamp
}

interface ServiceToon {
  pn: string;        // projectNo
  svc_yrs?: string;  // service years
  svc_rnds?: string; // service rounds
  free_done?: string; // free service done
  pay_upd?: string;  // payment update
  svcs?: Array<{     // service rounds 1-8
    r: number;       // round
    d?: string;      // date
    m?: string;      // remarks
  }>;
  paid_svcs?: Array<{
    n: number;       // paid service number
    d?: string;      // date
    m?: string;      // remarks
  }>;
  brk?: string;      // breakdown notes
  _m?: string;       // metadata: upload timestamp
}

// Map all CSV header variations to standard field names
function normalizeProjectHeaders(csvHeaders: string[]): Record<string, number> {
  const mapping: Record<string, number> = {};
  const headerMap: Record<string, string[]> = {
    projectNo: ["project no", "projectno", "project_no", "project no."],
    customerName: ["customer name", "customername", "customer_name"],
    address: ["address"],
    phone: ["contact number", "phone", "contact_number", "contactnumber"],
    email: ["email address", "email"],
    solarCapacity: ["solar panel capacity", "capacity", "kw", "solar_panel_capacity"],
    inverterBrand: ["inverter brand", "inverterbrand", "inverter_brand"],
    inverterModel: ["invertor model no", "inverter model", "invertermodel", "inverter_model"],
    inverterCapacity: ["inverter capacity", "invertercapacity", "inverter_capacity"],
    inverterSN: ["inv. serial no", "inv serial no", "inverter serial number", "inv_sn"],
    latitude: ["lattitude", "latitude"],
    longitude: ["longitude"],
    utility: ["ceb / leco", "utility", "ceb/leco"],
    panelModel: ["solar panel model", "panel model", "panel_model"],
    panelType: ["panel type (mono/poly)", "panel type"],
    panelWattage: ["wattage of panel", "wattage", "panel_wattage"],
    panelQty: ["no of panels", "panel qty", "panel_qty"],
    wifiUsername: ["wifi username"],
    wifiPassword: ["password"],
    nic: ["nic"],
    remarks: ["remarks"],
    installDate: ["project installation date", "installation_date"],
    adbCash: ["adb/cash", "adb"],
    systemOn: ["system on"],
  };

  csvHeaders.forEach((header, idx) => {
    const normalized = header.trim().toLowerCase();
    for (const [key, variations] of Object.entries(headerMap)) {
      if (variations.some(v => normalized.includes(v))) {
        mapping[key] = idx;
        break;
      }
    }
  });

  return mapping;
}

function normalizeServiceHeaders(csvHeaders: string[]): Record<string, number> {
  const mapping: Record<string, number> = {};
  const headerMap: Record<string, string[]> = {
    projectNo: ["project no", "projectno"],
    serviceYears: ["service years in agreement", "service_years"],
    serviceRounds: ["service rounds in agreement", "service_rounds"],
    freeDone: ["free service done", "free_done"],
    paymentUpdate: ["payment update", "payment_update"],
    breakdownNotes: ["breakdown notes", "breakdown_notes"],
  };

  csvHeaders.forEach((header, idx) => {
    const normalized = header.trim().toLowerCase();
    for (const [key, variations] of Object.entries(headerMap)) {
      if (variations.some(v => normalized.includes(v))) {
        mapping[key] = idx;
        break;
      }
    }
  });

  // Map service dates and paid services
  csvHeaders.forEach((header, idx) => {
    const norm = header.trim().toLowerCase();
    if (norm.match(/^\d+(st|nd|rd|th)\s+service\s+date/i) || norm.match(/^(\d+)(st|nd|rd|th)\s+service\s+date/i)) {
      const match = header.match(/^(\d+)/);
      if (match) {
        const num = parseInt(match[1]);
        mapping[`svcDate${num}`] = idx;
      }
    }
    if (norm.match(/^\d+(st|nd|rd|th)\s+service.+note/i)) {
      const match = header.match(/^(\d+)/);
      if (match) {
        const num = parseInt(match[1]);
        mapping[`svcNote${num}`] = idx;
      }
    }
    if (norm.match(/^paid\s+service\s+\d+/i)) {
      const match = header.match(/paid\s+service\s+(\d+)/i);
      if (match) {
        const num = parseInt(match[1]);
        mapping[`paidSvc${num}`] = idx;
      }
    }
    if (norm.includes("remarks") && norm.includes("paid")) {
      const match = header.match(/paid\s+service\s+(\d+)/i) ||
                    (header.includes("paid") ? /1/.test(header) ? "1" : null : null);
      if (match) {
        mapping[`paidSvcRemark${match}`] = idx;
      }
    }
  });

  return mapping;
}

function parseProjectRow(row: string[], mapping: Record<string, number>): ProjectToon | null {
  const get = (key: string) => {
    const idx = mapping[key];
    return idx !== undefined ? (row[idx] || "").trim() : "";
  };

  const pn = get("projectNo");
  if (!pn) return null;

  const cap = parseFloat(get("solarCapacity")) || 0;
  const lat = parseFloat(get("latitude")) || undefined;
  const lng = parseFloat(get("longitude")) || undefined;
  const inv_c = parseFloat(get("inverterCapacity")) || undefined;

  const toon: ProjectToon = {
    pn,
    n: get("customerName") || "",
    a: get("address") || "",
    ph: get("phone") || "",
    em: get("email") || "",
    cap,
    inv_b: get("inverterBrand") || undefined,
    inv_m: get("inverterModel") || undefined,
    inv_c: inv_c || undefined,
    inv_sn: get("inverterSN") || undefined,
    lat: lat || undefined,
    lng: lng || undefined,
    uh: get("utility") || undefined,
    pan_m: get("panelModel") || undefined,
    pan_t: get("panelType") || undefined,
    pan_w: parseFloat(get("panelWattage")) || undefined,
    pan_q: parseInt(get("panelQty")) || undefined,
    wifi_u: get("wifiUsername") || undefined,
    wifi_p: get("wifiPassword") || undefined,
    nic: get("nic") || undefined,
    rmk: get("remarks") || undefined,
    pid: get("installDate") || undefined,
    adb: get("adbCash") || undefined,
    _m: new Date().toISOString(),
  };

  // Remove undefined fields
  Object.keys(toon).forEach(k => toon[k as keyof ProjectToon] === undefined && delete toon[k as keyof ProjectToon]);

  return toon;
}

function parseServiceRow(row: string[], mapping: Record<string, number>): ServiceToon | null {
  const get = (key: string) => {
    const idx = mapping[key];
    return idx !== undefined ? (row[idx] || "").trim() : "";
  };

  const pn = get("projectNo");
  if (!pn) return null;

  const svcs: ServiceToon["svcs"] = [];
  for (let i = 1; i <= 8; i++) {
    const d = get(`svcDate${i}`);
    const m = get(`svcNote${i}`);
    if (d || m) {
      svcs.push({
        r: i,
        d: d || undefined,
        m: m || undefined,
      });
    }
  }

  const paid_svcs: ServiceToon["paid_svcs"] = [];
  for (let i = 1; i <= 4; i++) {
    const d = get(`paidSvc${i}`);
    const m = get(`paidSvcRemark${i}`);
    if (d || m) {
      paid_svcs.push({
        n: i,
        d: d || undefined,
        m: m || undefined,
      });
    }
  }

  const toon: ServiceToon = {
    pn,
    svc_yrs: get("serviceYears") || undefined,
    svc_rnds: get("serviceRounds") || undefined,
    free_done: get("freeDone") || undefined,
    pay_upd: get("paymentUpdate") || undefined,
    svcs: svcs.length > 0 ? svcs : undefined,
    paid_svcs: paid_svcs.length > 0 ? paid_svcs : undefined,
    brk: get("breakdownNotes") || undefined,
    _m: new Date().toISOString(),
  };

  // Remove undefined fields
  Object.keys(toon).forEach(k => toon[k as keyof ServiceToon] === undefined && delete toon[k as keyof ServiceToon]);

  return toon;
}

async function parseAndStoreCsv(text: string, isService: boolean, db: any): Promise<{ stored: number; skipped: number; errors: string[] }> {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) {
    return { stored: 0, skipped: 0, errors: ["CSV has no data rows"] };
  }

  const headers = lines[0].split(",").map(h => h.trim());
  const mapping = isService ? normalizeServiceHeaders(headers) : normalizeProjectHeaders(headers);
  const collection = isService ? "old_service" : "old_project_data";
  const errors: string[] = [];
  let stored = 0;
  let skipped = 0;

  for (let i = 1; i < lines.length; i++) {
    const row = lines[i].split(",").map(c => c.trim());
    let toon: ProjectToon | ServiceToon | null = null;

    if (isService) {
      toon = parseServiceRow(row, mapping);
    } else {
      toon = parseProjectRow(row, mapping);
    }

    if (!toon) {
      skipped++;
      continue;
    }

    try {
      const pn = toon.pn;
      const docRef = db.collection(collection).doc(pn);

      // Check if document exists (deduplication)
      const existingDoc = await docRef.get();
      if (existingDoc.exists) {
        skipped++;
        continue;
      }

      // Store the TOON record
      await docRef.set(toon);
      stored++;
    } catch (err: any) {
      errors.push(`Row ${i}: ${err.message}`);
    }
  }

  return { stored, skipped, errors };
}

// Sanitize a filename: keep alphanumeric, spaces, dots, hyphens, underscores only
function sanitizeFilename(name: string): string {
  return name
    .replace(/[^a-zA-Z0-9.\-_ ]/g, "_")
    .replace(/\.\.+/g, ".")
    .slice(0, 120)
    .trim();
}

export async function POST(req: NextRequest) {
  try {
    // ── 1. Authentication ──────────────────────────────────────────────────────
    const token = req.headers.get("authorization")?.replace("Bearer ", "");

    if (!token) {
      return NextResponse.json(
        { error: "Unauthorized: Missing authentication token" },
        { status: 401 }
      );
    }

    // Allow dev_session_token only if NEXT_PUBLIC_DEV_MODE is enabled
    let decoded: any = null;
    const devModeEnabled = process.env.NEXT_PUBLIC_DEV_MODE === "true";

    if (token === "dev_session_token" && devModeEnabled) {
      decoded = { uid: "dev_user", email: "dev@altavision.lk", role: "superadmin" };
    } else {
      decoded = await verifyIdToken(token);
    }

    if (!decoded) {
      return NextResponse.json(
        { error: "Unauthorized: Invalid authentication token" },
        { status: 401 }
      );
    }

    // ── 2. Authorization ───────────────────────────────────────────────────────
    const db = adminDb();
    let role = "viewer";

    if (decoded.uid !== "dev_user") {
      const userDoc = await db.collection("users").doc(decoded.uid).get();
      if (userDoc.exists) role = userDoc.data()?.role || "viewer";
    } else {
      role = "superadmin";
    }

    const superAdminEmailsStr = (process.env.NEXT_PUBLIC_SUPER_ADMIN_EMAILS as string) || "";
    const superAdminEmails = superAdminEmailsStr.split(",").map(e => e.trim()).filter(e => e);

    if (superAdminEmails.includes(decoded.email)) {
      role = "superadmin";
    }

    if (role !== "superadmin" && role !== "admin") {
      return NextResponse.json(
        { error: "Forbidden: Admin or Superadmin role required" },
        { status: 403 }
      );
    }

    // ── 3. Read CSV body ───────────────────────────────────────────────────────
    const text = await req.text();
    if (!text || !text.trim()) {
      return NextResponse.json(
        { error: "Bad Request: CSV content cannot be empty" },
        { status: 400 }
      );
    }

    // ── 4. Determine file type ─────────────────────────────────────────────────
    const rawFilename = req.headers.get("x-filename") || `upload_${Date.now()}.csv`;
    const sanitized = sanitizeFilename(rawFilename);

    if (!sanitized.toLowerCase().endsWith(".csv")) {
      return NextResponse.json(
        { error: "Invalid file type: only .csv files are accepted" },
        { status: 400 }
      );
    }

    const fileTypeHeader = req.headers.get("x-file-type") || "";
    let isService = fileTypeHeader.toLowerCase() === "service";

    if (!isService) {
      const firstLine = text.split(/\r?\n/)[0] || "";
      const cols = firstLine.split(",").map(c => c.trim().toLowerCase());
      isService = cols.some(c =>
        c.includes("service date") ||
        c.includes("service years") ||
        c.includes("rounds in agreement") ||
        c.includes("1st service") ||
        c.includes("2nd service") ||
        c.includes("paid service")
      );
    }

    // ── 5. Parse and store in Firestore ────────────────────────────────────────
    const result = await parseAndStoreCsv(text, isService, db);

    return NextResponse.json({
      success: true,
      filename: sanitized,
      type: isService ? "service" : "project",
      collection: isService ? "old_service" : "old_project_data",
      stored: result.stored,
      skipped: result.skipped,
      errors: result.errors.length > 0 ? result.errors : undefined,
      message: `Successfully stored ${result.stored} records (${result.skipped} duplicates skipped). ${result.errors.length > 0 ? `${result.errors.length} errors occurred.` : ""}`,
    });
  } catch (error: any) {
    console.error("CSV upload API error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to process CSV upload" },
      { status: 500 }
    );
  }
}
