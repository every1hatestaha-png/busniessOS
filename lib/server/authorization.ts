import "server-only";

import type { Role } from "@prisma/client";
import { requireWorkspace } from "@/lib/server/auth";
import { getWorkspaceAccess } from "@/lib/server/subscriptions";

export type Permission = "business.read" | "customers.write" | "products.write" | "inventory.adjust" | "sales.create" | "payments.record" | "financial.manage" | "workspace.manage" | "members.manage";

const permissions: Record<Role, ReadonlySet<Permission>> = {
  OWNER: new Set(["business.read", "customers.write", "products.write", "inventory.adjust", "sales.create", "payments.record", "financial.manage", "workspace.manage", "members.manage"]),
  ADMIN: new Set(["business.read", "customers.write", "products.write", "inventory.adjust", "sales.create", "payments.record", "financial.manage", "workspace.manage"]),
  MANAGER: new Set(["business.read", "customers.write", "products.write", "inventory.adjust", "sales.create", "payments.record", "financial.manage"]),
  STAFF: new Set(["business.read", "sales.create"]),
};

export function canPerformAction(role: Role, permission: Permission) {
  return permissions[role].has(permission);
}

export class ForbiddenError extends Error {}
export class SubscriptionRequiredError extends Error {}

export async function requirePermission(permission: Permission) {
  const context = await requireWorkspace();
  if (!canPerformAction(context.role, permission)) throw new ForbiddenError("Forbidden");

  // Read-only access stays available after expiry. Every permission that can
  // mutate business state is centrally gated by the workspace entitlement.
  if (permission !== "business.read") {
    const access = await getWorkspaceAccess(context.workspaceId);
    if (!access.allowed) {
      throw new SubscriptionRequiredError(
        access.reason === "suspended"
          ? "This workspace is suspended. Contact MunshiOS support to restore access."
          : "Your MunshiOS trial or subscription has expired. Renew to continue making changes.",
      );
    }
  }

  return context;
}
