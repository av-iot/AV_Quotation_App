"use client";

import { useAuth } from "@/lib/auth-context";
import { hasPermission, type Permission } from "@/lib/permissions";

export function usePermission(permission: Permission): boolean {
  const { user } = useAuth();
  if (!user) return false;
  return hasPermission(user.role, permission);
}

export function usePermissions<T extends Permission>(
  permissions: T[]
): Record<T, boolean> {
  const { user } = useAuth();
  const result = {} as Record<T, boolean>;
  for (const p of permissions) {
    result[p] = user ? hasPermission(user.role, p) : false;
  }
  return result;
}
