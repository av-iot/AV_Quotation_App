export type UserRole = "superadmin" | "admin" | "authorized" | "stakeholder" | "viewer" | "engineer" | "site_engineer" | "team_leader" | "technician" | "payment_approver";

export interface AppUser {
  uid: string;
  email: string;
  displayName: string | null;
  photoURL: string | null;
  source: "myiot" | "google";
  role: UserRole;
}

// ─── Products / catalog ──────────────────────────────────────────────────────
export type ProductType = "panel" | "inverter" | "battery";
export type SystemType = "ongrid" | "hybrid" | "hybrid-offgrid" | "offgrid" | "grid-backup";
export type Phase = "1" | "3";
export type InverterType = "ongrid" | "hybrid" | "offgrid";


export interface InverterProduct {
  id: string;
  type: "inverter";
  brand: string;
  model: string;
  origin: string;
  manufacture: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
  // Core specs
  inverter_type: InverterType;
  phase_count: "1" | "3";
  input_rated_power: number;
  max_input_power: number;
  max_input_voltage: number;
  min_input_voltage: number;
  nominal_input_voltage: number;
  pv_string_count: number;
  mppt_count: number;
  max_output_current: number;
  warranty: number;
  qty: number;
  buy_price: number;
  sell_price: number;
  // Hybrid / offgrid only
  battery_type?: string;
  output_power?: number;
  nominal_battery_voltage?: number;
  no_of_battery_inputs?: number;
  max_charging_power?: number;
  max_discharging_power?: number;
  min_battery_voltage?: number;
  max_battery_voltage?: number;
}

export interface BatteryProduct {
  id: string;
  type: "battery";
  brand: string;
  model: string;
  origin: string;
  manufacture: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
  usable_energy: number;
  max_energy: number;
  cell_type: string;
  nominal_voltage: number;
  battery_operating_voltage: string;
  cycle_count: number;
  battery_model_type: string;
  warranty: number;
  qty: number;
 buy_price: number;
  sell_price: number;
}

export interface PanelProduct {
  id: string;
  type: "panel";
  brand: string;
  model: string;
  origin: string;
  manufacture: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
  max_panel_output_power: number;
  panel_type: string;
  max_efficiency: number;
  panel_voltage: number;
  width: number;
  height: number;
  length: number;
  warranty: number;
  qty: number;
  buy_price: number;
  sell_price: number;
}

export type Product = InverterProduct | BatteryProduct | PanelProduct;
// ─── Proposal option ─────────────────────────────────────────────────────────
export interface ComponentSpec {
  brand: string;
  model: string;
  ratingLabel: string;
  qty: number;
  totalCapacity: string;
  warranty: string;
  origin: string;
  manufacture: string;
  productId?: string;
  productSubtype?: string;  // inverter_type (ongrid|hybrid|offgrid) or panel_type (Bifacial|Mono etc)
  dataSheetUrl?: string;
  dataSheetName?: string;
}

export interface OptionPricing {
  estOutput: string;      // e.g. "500 - 600"
  sysPrice: number;
  structPrice?: number;
  installPrice?: number;
  discount?: number;
  totalPrice: number;
  specialStructNote: boolean;
  includeStructInTotal?: boolean;
  includeInstallInTotal?: boolean;
}

export interface ProposalOption {
  label: string;          // "Option 1" | "Option 2"
  panel: ComponentSpec;
  inverter: ComponentSpec;
  battery?: ComponentSpec;
  pricing: OptionPricing;
  expectedGen?: string;
  afterSalesPeriod?: string;
  servicesPerYear?: string;
  hasShading?: boolean;
  shadingReduction?: string;
}

// ─── Proposal ────────────────────────────────────────────────────────────────
export type ProposalStatus =
  | "draft"
  | "sent"
  | "confirmed"
  | "partial"     // at least one installment quotation created, balance still remaining
  | "converted"   // all installments generated, balance = 0
  | "expired";

export interface CustomerInfo {
  name: string;
  address: string;
  phone: string;
  phone2?: string;
  email: string;
  sendFormat?: string[];
  salutation?: string;
}

  export interface Proposal {
    id: string;
    qtnNo: string;
    propNo?: string;
    date: string;           // ISO date string
    customer: CustomerInfo;
    sysType: SystemType;
    utility: "CEB" | "LECO";
    phase: Phase;
    roofType: string;
    cutoutCurrent: string;
    mountType?: string;
    powerScheme: string;
  numOptions: number;
  options: ProposalOption[];
  pay1: string;
  pay2: string;
  pay3: string;
  extraNotes?: string;
  status: ProposalStatus;
  createdBy: string;      // user uid
  createdAt: string;
  updatedAt: string;
  docxUrl?: string;
  pdfUrl?: string;
  cebCharges?: number;
  validityPeriod?: string;
  cebInclusive?: boolean;
  vatInvoice?: boolean;
  vatRate?: number;
  refundRecord?: {
    amount: number;
    date: string;
    method: string;
    reference?: string;
    notes?: string;
    markedBy: string;
    markedAt: string;
  };
}

// ─── Quotation (confirmed order) ─────────────────────────────────────────────
export type QuotationStatus =
  | "pending_payment"
  | "partial_payment"
  | "fully_paid"
  | "scheduled"
  | "installed"
  | "commissioned";

export interface QuotationItem {
  description: string;
  qty: number;
  unitPrice: number;
  total: number;
}

export interface Quotation {
  id: string;
  proposalId: string;     // ref to Proposal
  qtnNo: string;          // e.g. QTN-2025-001/1
  date: string;
  customer: CustomerInfo;
  items: QuotationItem[];
  description?: string;
  subtotal: number;
  total: number;          // = installmentAmount for installment quotations
  selectedOption: number;
  paymentStatus: QuotationStatus;
  confirmedAt: string;
  confirmedBy: string;
  bankDetails: {
    accountName: string;
    bank: string;
    branch: string;
    accountNo: string;
  };
  // Installment tracking
  installmentNo?: number;       // 1, 2, 3 …
  installmentPercent?: number;  // % of systemTotal for this invoice
  installmentAmount?: number;   // amount billed this invoice
  systemTotal?: number;         // full proposal option price (reference)
  totalInvoiced?: number;       // running total including this invoice
  balanceAfter?: number;        // systemTotal − totalInvoiced
  // Warranty / terms fields
  inverterWarranty?: string;
  batteryWarranty?: string;
  panelWarranty?: string;
  validityPeriod?: string;
  paymentTerm?: string;
  docxUrl?: string;
  pdfUrl?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
  // Runtime payment tracking
  paidAmount?: number;
  siteNo?: string;
  companyAddress?: string;
  vatInvoice?: boolean;
  vatRate?: number;
}

// ─── Form types ──────────────────────────────────────────────────────────────
export interface ProposalFormData {
  // Step 1 – customer
  custName: string;
  custSalutation?: string;
  qtnNo: string;
  addr: string;
  phone: string;
  phone2: string;
  email: string;
  date: string;
  sendFormat: string[];
  // Step 2 – site
  sysType: SystemType;
  utility: "CEB" | "LECO";
  phase: Phase;
  roofType: string;
  cutoutCurrent: string;
  powerScheme: string;
  mountType: "roof" | "ground";
  monthlyUsage: string;
  batteryDays: number;
  numOptions: 1 | 2;
  // Step 3 – options (components)
  options: OptionFormData[];
  // Step 4 – pricing
  pay1: string;
  pay2: string;
  pay3: string;
  extraNotes: string;
  cebCharges?: string;
  validityPeriod?: string;
  cebInclusive?: boolean;
  vatInvoice?: boolean;
  vatRate?: string;
}

export interface OptionFormData {
  sysType: SystemType;
  panelProductId: string;
  panelQty: string;
  inverterProductId: string;
  inverterQty: string;
  batteryProductId?: string;
  batteryQty?: string;
  batteryDays?: number;
  coo: string;
  oversize: boolean;
  estOutput: string;
  sysPrice: string;
  structPrice: string;
  installPrice: string;
  discount: string;
  totalPrice: string;
  specialStructNote: boolean;
  includeStructInTotal?: boolean;
  includeInstallInTotal?: boolean;
  afterSalesPeriod?: string;
  servicesPerYear?: string;
  expectedGen?: string;
  hasShading?: boolean;
  shadingReduction?: string;
  shadingMultiplier?: string;
  addShading29kw?: boolean;
}
// ─── API responses ────────────────────────────────────────────────────────────
export interface ApiResponse<T> {
  data?: T;
  error?: string;
}

// ─── Services ────────────────────────────────────────────────────────────────
export interface OfficeLocation {
  id: string;
  name: string;
  lat: number;
  lng: number;
}

export interface ServiceLocation {
  lat: number;
  lng: number;
  address: string;
  distanceKm: number;
  officeId: string;
}

export interface ServiceCosts {
  perKmRate: number;
  distanceCost: number;
  labourCost: number;
  additionalMaterialCost: number;
  totalCost: number;
}

export type ServiceStatus =
  | "pending"
  | "quotation_sent"
  | "quotation_generated"
  | "proforma_generated"
  | "in_plan"
  | "ongoing"
  | "work_completed"
  | "invoice_sent"
  | "payment_received"
  | "invoice_generated"
  | "completed";

export interface ServiceRecord {
  id: string;
  serviceNo: string;
  projectNo: string;
  capacity: string;
  panelCount: string;
  inverter: string;
  battery?: string;
  systemType: SystemType;
  customer: CustomerInfo;
  location: ServiceLocation;
  costs: ServiceCosts;
  status: ServiceStatus;
  notes?: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  dueDate?: string;
  completedAt?: string;
  isFreeService?: boolean;
  serviceRound?: string;
  inverterSerialNos?: string;
  batterySerialNos?: string;
  serviceType?: string;
  scheduledDate?: string;
  invoiceId?: string;
  invoiceNo?: string;
}

// ─── Service Checklist Data (comprehensive on-site measurement form) ──────────
export interface ServiceChecklistData {
  id: string;
  serviceId: string;
  projectNo: string;
  systemType: SystemType;

  // Context
  serviceRound: string;
  checklistDate: string;   // ISO date (YYYY-MM-DD)

  // Details — auto-filled from ServiceRecord, editable on-site
  customerName: string;
  systemCapacity: string;    // kW
  inverterSerialNos: string;
  inverterCapacity: string;  // kW
  batterySerialNos: string;  // offgrid / hybrid only
  longitude: string;
  latitude: string;

  // DC String measurements — 8 strings (index 0-7)
  dcOCVoltage: string[];
  dcLoadVoltage: string[];
  dcLoadCurrent: string[];

  // AC measurements — 7 phases: L1-N, L2-N, L3-N, L1-L2, L2-L3, L1-L3, N-E
  acOCVoltage: string[];
  acLoadVoltage: string[];
  acLoadCurrent: string[];

  // Power & WiFi
  power: string;
  powerTime: string;
  wifiConnectivity: string;   // "YES" | "NO" | ""
  captureLightBill: string;   // "YES" | "NO" | ""

  // Customer sign-off
  customerNIC: string;
  customerContactNumber: string;
  customerEmail: string;
  customerSignatureObtained: boolean;
  specialNotes: string;

  // Roof Work
  cloudiness: string;
  panelService: string;
  structureService: string;
  nutBoltsCondition: string;
  shadow: string;
  panelMC4Condition: string;
  tookPhotosRoof: string;
  roofComments: Record<string, string>;

  // Outdoor Work
  cebExportReading: string;
  cebImportReading: string;
  groundResistance: string;
  earthingRodChecked: string;
  outdoorComments: Record<string, string>;

  // Main Panel
  onlineGridVoltage: string;
  offlineGridVoltage: string;
  inverterServiceFanTime: string;
  breakerService: string;
  dcSurgeArrestors: string;
  acSurgeArrestors: string;
  inverterConnectionMC4: string;
  lowVoltageRange: string;
  highVoltageRange: string;
  lowFrequencyRange: string;
  highFrequencyRange: string;
  inverterStartupTime: string;
  eTodayInverter: string;
  eTotalInverter: string;
  wifiConfigDone: string;
  powerBulbBlinkingStyle: string;
  routerUsername: string;
  routerPassword: string;
  routerSerialNumber: string;
  serviceSticker: string;
  tookPhotosMainPanel: string;
  mainPanelComments: Record<string, string>;

  // Team
  teamLeaderName: string;
  teamMembers: string;

  // Metadata
  status: "draft" | "submitted";
  submittedBy: string;
  submittedByName?: string;
  submittedAt?: string;
  approvedBy?: string;
  approvedByName?: string;
  approvedAt?: string;
  history?: Array<{
    editedBy: string;
    editedByName: string;
    editedAt: string;
    changes: Record<string, { old: any; new: any }>;
  }>;
  createdAt: string;
  updatedAt: string;
}

export interface ServiceChecklistItem {
  id: string;
  label: string;
  labelSi: string;
  labelTa: string;
  checked: boolean;
  notes?: string;
  checkedAt?: string;   // ISO timestamp when checkbox was ticked
}

export interface ServiceChecklist {
  id: string;
  projectNo: string;
  planId: string;
  items: ServiceChecklistItem[];
  status: "pending_approval" | "approved" | "rejected";
  submittedBy: string;
  submittedByName?: string;
  submittedAt: string;
  approvedBy?: string;
  approvedByName?: string;
  approvedAt?: string;
  engineerFeedback?: string;
  teamNotes?: string;
  siteStartedAt?: string;    // ISO — when site card was first opened
  siteCompletedAt?: string;  // ISO — when checklist was submitted/approved
  siteDurationMs?: number;   // ms between start and complete
  siteArrivedAt?: string;    // ISO — manual "Arrived" button tap
  siteDepartedAt?: string;   // ISO — manual "Site Done" button tap
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  checklistV2?: Record<string, any>; // SiteChecklistState saved by SiteChecklist component
}

// ─── Projects ────────────────────────────────────────────────────────────────
export type ProjectStatus = "planning" | "in_progress" | "completed" | "on_hold";

export interface ProjectEquipment {
  id: string;
  type: "inverter" | "battery" | "panel";
  brand: string;
  model: string;
  capacity?: number; // kW or W
  qty: number;
  addedAt: string; // ISO date
  notes?: string;
}

export interface ProjectRecord {
  id: string; // matches projectNo
  projectNo: string;
  proposalId: string;
  quotationId: string;
  customer: CustomerInfo;
  systemType: SystemType;
  capacity: string;
  panelCount?: string;
  inverter?: string;
  battery?: string;
  equipment?: ProjectEquipment[];
  status: ProjectStatus;
  createdAt: any;
  updatedAt: any;
}

// ─── Receipts ────────────────────────────────────────────────────────────────
export interface ReceiptRecord {
  id: string;
  receiptNo: string;
  quotationId: string;
  proposalId: string;
  projectNo: string;
  amount: number;
  date: string;
  notes?: string;
  createdAt: any;
}

