// ─── Auth ────────────────────────────────────────────────────────────────────
export interface AppUser {
  uid: string;
  email: string;
  displayName: string | null;
  photoURL: string | null;
  source: "myiot" | "google";
  role: "admin" | "engineer" | "viewer";
}

// ─── Products / catalog ──────────────────────────────────────────────────────
export type ProductType = "panel" | "inverter" | "battery";
export type SystemType = "ongrid" | "hybrid" | "offgrid";
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
  warranty: string;
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
  warranty: string;
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
  warranty: string;
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
}

export interface OptionPricing {
  estOutput: string;      // e.g. "500 - 600"
  sysPrice: number;
  structPrice?: number;
  totalPrice: number;
  specialStructNote: boolean;
}

export interface ProposalOption {
  label: string;          // "Option 1" | "Option 2"
  panel: ComponentSpec;
  inverter: ComponentSpec;
  battery?: ComponentSpec;
  pricing: OptionPricing;
}

// ─── Proposal ────────────────────────────────────────────────────────────────
export type ProposalStatus =
  | "draft"
  | "sent"
  | "confirmed"
  | "converted"
  | "expired";

export interface CustomerInfo {
  name: string;
  address: string;
  phone: string;
  phone2?: string;
  email: string;
  sendFormat?: string[];
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
  numOptions: 1 | 2;
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
  qtnNo: string;
  date: string;
  customer: CustomerInfo;
  items: QuotationItem[];
  subtotal: number;
  total: number;
  selectedOption: number; // 0 or 1
  paymentStatus: QuotationStatus;
  confirmedAt: string;
  confirmedBy: string;
  bankDetails: {
    accountName: string;
    bank: string;
    branch: string;
    accountNo: string;
  };
  docxUrl?: string;
  pdfUrl?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

// ─── Form types ──────────────────────────────────────────────────────────────
export interface ProposalFormData {
  // Step 1 – customer
  custName: string;
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
  numOptions: 1 | 2;
  // Step 3 – options (components)
  options: OptionFormData[];
  // Step 4 – pricing
  pay1: string;
  pay2: string;
  pay3: string;
  extraNotes: string;
}

export interface OptionFormData {
  panelProductId: string;
  panelQty: string;
  inverterProductId: string;
  inverterQty: string;
  batteryProductId?: string;
  batteryQty?: string;
  coo: string;
  oversize: boolean;
  estOutput: string;
  sysPrice: string;
  structPrice: string;
  installPrice: string;
  discount: string;
  totalPrice: string;
  specialStructNote: boolean;
}
// ─── API responses ────────────────────────────────────────────────────────────
export interface ApiResponse<T> {
  data?: T;
  error?: string;
}
