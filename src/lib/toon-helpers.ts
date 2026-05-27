// TOON (Token-Oriented Object Notation) Query Helpers
// Converts compact Firestore storage back to readable format

export interface ProjectData {
  projectNo: string;
  customerName: string;
  address: string;
  phone: string;
  email: string;
  solarCapacity: number;
  inverterBrand?: string;
  inverterModel?: string;
  inverterCapacity?: number;
  inverterSN?: string;
  latitude?: number;
  longitude?: number;
  utility?: string;
  panelModel?: string;
  panelType?: string;
  panelWattage?: number;
  panelQty?: number;
  wifiUsername?: string;
  wifiPassword?: string;
  nic?: string;
  remarks?: string;
  installDate?: string;
  adbCash?: string;
  roofType?: string;
  mountType?: string;
  uploadedAt?: string;
}

export interface ServiceRecord {
  round: number;
  date?: string;
  remarks?: string;
}

export interface PaidService {
  number: number;
  date?: string;
  remarks?: string;
}

export interface ServiceData {
  projectNo: string;
  serviceYearsAgreement?: string;
  serviceRoundsAgreement?: string;
  freeServiceDone?: string;
  paymentUpdate?: string;
  services?: ServiceRecord[];
  paidServices?: PaidService[];
  breakdownNotes?: string;
  uploadedAt?: string;
}

// Convert TOON project data back to readable format
export function expandProjectToon(toon: any): ProjectData {
  return {
    projectNo: toon.pn || "",
    customerName: toon.n || "",
    address: toon.a || "",
    phone: toon.ph || "",
    email: toon.em || "",
    solarCapacity: toon.cap || 0,
    inverterBrand: toon.inv_b,
    inverterModel: toon.inv_m,
    inverterCapacity: toon.inv_c,
    inverterSN: toon.inv_sn,
    latitude: toon.lat,
    longitude: toon.lng,
    utility: toon.uh,
    panelModel: toon.pan_m,
    panelType: toon.pan_t,
    panelWattage: toon.pan_w,
    panelQty: toon.pan_q,
    wifiUsername: toon.wifi_u,
    wifiPassword: toon.wifi_p,
    nic: toon.nic,
    remarks: toon.rmk,
    installDate: toon.pid,
    adbCash: toon.adb,
    roofType: toon.roof_t,
    mountType: toon.mount_t,
    uploadedAt: toon._m,
  };
}

// Convert TOON service data back to readable format
export function expandServiceToon(toon: any): ServiceData {
  const services: ServiceRecord[] = (toon.svcs || []).map((s: any) => ({
    round: s.r,
    date: s.d,
    remarks: s.m,
  }));

  const paidServices: PaidService[] = (toon.paid_svcs || []).map((p: any) => ({
    number: p.n,
    date: p.d,
    remarks: p.m,
  }));

  return {
    projectNo: toon.pn || "",
    serviceYearsAgreement: toon.svc_yrs,
    serviceRoundsAgreement: toon.svc_rnds,
    freeServiceDone: toon.free_done,
    paymentUpdate: toon.pay_upd,
    services: services.length > 0 ? services : undefined,
    paidServices: paidServices.length > 0 ? paidServices : undefined,
    breakdownNotes: toon.brk,
    uploadedAt: toon._m,
  };
}

// Query project by projectNo
export async function getProjectByNo(db: any, projectNo: string): Promise<ProjectData | null> {
  try {
    const doc = await db.collection("old_project_data").doc(projectNo).get();
    if (!doc.exists) return null;
    return expandProjectToon(doc.data());
  } catch (err) {
    console.error("Error fetching project:", err);
    return null;
  }
}

// Query service by projectNo
export async function getServiceByNo(db: any, projectNo: string): Promise<ServiceData | null> {
  try {
    const doc = await db.collection("old_service").doc(projectNo).get();
    if (!doc.exists) return null;
    return expandServiceToon(doc.data());
  } catch (err) {
    console.error("Error fetching service:", err);
    return null;
  }
}

// Get all projects (with optional limit)
export async function getAllProjects(db: any, limit = 100): Promise<ProjectData[]> {
  try {
    const snap = await db.collection("old_project_data").limit(limit).get();
    return snap.docs.map((doc: any) => expandProjectToon(doc.data()));
  } catch (err) {
    console.error("Error fetching projects:", err);
    return [];
  }
}

// Get all services (with optional limit)
export async function getAllServices(db: any, limit = 100): Promise<ServiceData[]> {
  try {
    const snap = await db.collection("old_service").limit(limit).get();
    return snap.docs.map((doc: any) => expandServiceToon(doc.data()));
  } catch (err) {
    console.error("Error fetching services:", err);
    return [];
  }
}
