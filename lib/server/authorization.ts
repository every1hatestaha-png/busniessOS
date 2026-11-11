import "server-only";

import type { Role } from "@prisma/client";
import { requireWorkspace } from "@/lib/server/auth";
import { getWorkspaceAccess } from "@/lib/server/subscriptions";

export type Permission = "business.read" | "customers.write" | "products.write" | "inventory.adjust" | "sales.create" | "payments.record" | "financial.manage" | "purchases.create" | "grn.create" | "returns.create" | "suppliers.manage" | "expenses.create" | "workspace.manage" | "members.manage";

const permissions: Record<Role, ReadonlySet<Permission>> = {
  OWNER: new Set(["business.read", "customers.write", "products.write", "inventory.adjust", "sales.create", "payments.record", "financial.manage", "purchases.create", "grn.create", "returns.create", "suppliers.manage", "expenses.create", "workspace.manage", "members.manage"]),
  ADMIN: new Set(["business.read", "customers.write", "products.write", "inventory.adjust", "sales.create", "payments.record", "financial.manage", "purchases.create", "grn.create", "returns.create", "suppliers.manage", "expenses.create", "workspace.manage"]),
  MANAGER: new Set(["business.read", "customers.write", "products.write", "inventory.adjust", "sales.create", "payments.record", "financial.manage", "purchases.create", "grn.create", "returns.create", "suppliers.manage", "expenses.create"]),
  STAFF: new Set(["business.read", "sales.create"]),
};

export function canPerformAction(role: Role, permission: Permission) {
  return permissions[role].has(permission);
}

export class ForbiddenError extends Error {}
export class SubscriptionRequiredError extends Error {}

export async function requirePermission(permission: Permission) {
  const context = await requireWorkspace();
  // Restaurant STAFF use dedicated tenant-checked station actions only.
  // Generic ERP "business.read" / "sales.create" permissions must not grant
  // them financial, inventory or non-restaurant operations.
  if (context.vertical === "RESTAURANT" && context.role === "STAFF") {
    throw new ForbiddenError("Restaurant staff must use their assigned station.");
  }
  if (!canPerformAction(context.role, permission)) throw new ForbiddenError("Forbidden");

  // Read-only access stays available after expiry. Every permission that can
  // mutate business state is centrally gated by the workspace entitlement.
  if (permission !== "business.read") {
    const access = await getWorkspaceAccess(context.workspaceId);
    if (!access.allowed) {
      throw new SubscriptionRequiredError(
        access.reason === "suspended"
          ? "This workspace is suspended. Contact MunshiOS support to restore access."
          : "Your MunshiOS subscription is not active. Complete payment or renew to continue making changes.",
      );
    }
  }

  return context;
}
