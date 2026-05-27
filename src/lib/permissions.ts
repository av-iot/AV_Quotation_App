import type { UserRole } from "@/types";

export type Permission =
  | "view:dashboard"
  | "view:projects"
  | "view:proposals"
  | "view:invoices"
  | "view:installations"
  | "view:services"
  | "view:products"
  | "view:activity"
  | "view:settings"
  | "view:users"
  | "view:financials"
  | "create:proposal"
  | "edit:proposal"
  | "delete:proposal"
  | "create:invoice"
  | "edit:invoice"
  | "delete:invoice"
  | "create:receipt"
  | "delete:receipt"
  | "manage:refunds"
  | "manage:products"
  | "manage:users"
  | "manage:settings"
  | "manage:services";

const ALL_PERMISSIONS: Permission[] = [
  "view:dashboard", "view:projects", "view:proposals", "view:invoices", "view:installations",
  "view:services", "view:products", "view:activity", "view:settings",
  "view:users", "view:financials",
  "create:proposal", "edit:proposal", "delete:proposal",
  "create:invoice", "edit:invoice", "delete:invoice",
  "create:receipt", "delete:receipt",
  "manage:refunds", "manage:products", "manage:users", "manage:settings", "manage:services",
];

const ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
  superadmin: [...ALL_PERMISSIONS],

  payment_approver: [
    "view:dashboard", "view:projects", "view:proposals", "view:invoices", "view:installations",
    "view:activity", "view:financials",
    "create:receipt",
    "manage:refunds",
  ],

  admin: [
    "view:dashboard", "view:projects", "view:proposals", "view:invoices", "view:installations",
    "view:services", "view:products", "view:activity", "view:settings", "view:financials",
    "view:users",
    "create:proposal", "edit:proposal",
    "create:invoice", "edit:invoice",
    "create:receipt",
    "manage:refunds", "manage:products", "manage:settings", "manage:services",
    "manage:users",
  ],

  authorized: [
    "view:dashboard", "view:projects", "view:proposals", "view:invoices", "view:installations",
    "view:services", "view:products", "view:financials",
    "view:users",
    "create:proposal", "edit:proposal",
    "create:invoice", "edit:invoice",
    "create:receipt",
    "manage:refunds", "manage:services",
    "manage:users",
  ],

  stakeholder: [
    "view:dashboard", "view:projects", "view:invoices", "view:financials",
  ],

  engineer: [
    "view:dashboard", "view:projects", "view:proposals", "view:installations", "view:services", "view:products", "view:users",
    "create:proposal", "edit:proposal",
    "manage:services",
  ],

  site_engineer: [
    "view:projects", "view:installations", "view:services",
    "manage:services",
  ],

  team_leader: [
    "view:projects", "view:installations", "view:services",
  ],

  technician: [
    "view:projects", "view:installations", "view:services",
  ],

  viewer: [],
};

export function hasPermission(role: UserRole, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
}

export function getRolePermissions(role: UserRole): Permission[] {
  return ROLE_PERMISSIONS[role] ?? [];
}

export const ROLE_LABELS: Record<UserRole, string> = {
  superadmin: "Super Admin",
  admin: "Admin",
  payment_approver: "Finance Manager",
  authorized: "Authorized",
  stakeholder: "Stakeholder",
  engineer: "Engineer",
  site_engineer: "Site Engineer",
  team_leader: "Technician (Team Leader)",
  technician: "Technician",
  viewer: "Viewer",
};

export const ROLE_GRADIENT: Record<UserRole, string> = {
  superadmin: "bg-gradient-to-br from-violet-600 to-purple-700",
  admin: "bg-gradient-to-br from-blue-600 to-indigo-700",
  payment_approver: "bg-gradient-to-br from-red-600 to-pink-700",
  authorized: "bg-gradient-to-br from-emerald-600 to-teal-700",
  stakeholder: "bg-gradient-to-br from-amber-500 to-orange-600",
  engineer: "bg-gradient-to-br from-orange-500 to-red-600",
  site_engineer: "bg-gradient-to-br from-teal-500 to-cyan-600",
  team_leader: "bg-gradient-to-br from-cyan-500 to-blue-600",
  technician: "bg-gradient-to-br from-sky-500 to-cyan-600",
  viewer: "bg-gradient-to-br from-slate-500 to-gray-600",
};

export const ROLE_CHIPS: Record<UserRole, string[]> = {
  superadmin: ["Full Access", "Delete", "User Mgmt", "Settings"],
  admin: ["Create & Edit", "Products", "Settings", "Activity"],
  payment_approver: ["Approve Payments", "Audit Logs", "Restricted Access"],
  authorized: ["Create & Edit", "Receipts", "Refunds"],
  stakeholder: ["Financials", "Projects", "View Only"],
  engineer: ["Projects", "Services", "Proposals", "Users"],
  site_engineer: ["Services", "Checklists", "Approve"],
  team_leader: ["Routes", "Checklists", "View Only"],
  technician: ["Routes", "Checklists", "View Only"],
  viewer: ["View Only"],
};
