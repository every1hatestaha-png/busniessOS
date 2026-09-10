/**
 * Service context builders for finance-grade tests.
 */

import type { Role } from "@prisma/client";

export type ServiceContext = { workspaceId: string; userId: string; role: Role };

export function ownerContext(workspaceId: string, userId: string): ServiceContext {
  return { workspaceId, userId, role: "OWNER" };
}

export function adminContext(workspaceId: string, userId: string): ServiceContext {
  return { workspaceId, userId, role: "ADMIN" };
}

export function managerContext(workspaceId: string, userId: string): ServiceContext {
  return { workspaceId, userId, role: "MANAGER" };
}

export function staffContext(workspaceId: string, userId: string): ServiceContext {
  return { workspaceId, userId, role: "STAFF" };
}
