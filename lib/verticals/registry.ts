import type { BusinessType, WorkspaceVertical as PersistedVertical } from "@prisma/client";

// Verticals are first-class workspace experiences. Module entitlements still gate
// optional capabilities inside a vertical, but a Restaurant workspace must not
// fall back to the generic ERP shell.
export const VERTICALS = {
  TRADING: { status: "active", dashboard: "/dashboard", navigation: "erp" },
  MANUFACTURING: { status: "active", dashboard: "/dashboard", navigation: "erp" },
  LEGACY: { status: "active", dashboard: "/dashboard", navigation: "erp" },
  RESTAURANT: { status: "active", dashboard: "/restaurant", navigation: "restaurant" },
  PROPERTY: { status: "unavailable", dashboard: null, navigation: null },
  SERVICES: { status: "unavailable", dashboard: null, navigation: null },
} as const;

export type WorkspaceVertical = PersistedVertical;
export type VerticalCapability = "trading" | "manufacturing" | "restaurant" | "services" | "finance" | "reports" | "settings";
export type VerticalModule = "restaurant" | "manufacturing" | "services";

export function initialVerticalForBusinessType(businessType: BusinessType): WorkspaceVertical {
  if (businessType === "MANUFACTURER") return "MANUFACTURING";
  if (businessType === "OTHER") return "LEGACY";
  return "TRADING";
}

export function initialVerticalForProvisioning(
  businessType: BusinessType,
  builderBusiness?: string | null,
  enabledModules: readonly string[] = [],
): WorkspaceVertical {
  if (builderBusiness === "restaurant" || enabledModules.includes("restaurant")) return "RESTAURANT";
  return initialVerticalForBusinessType(businessType);
}

export function canSaveBusinessType(current: BusinessType, submitted: BusinessType): boolean {
  return current === submitted;
}

export function resolveWorkspaceVertical(workspace: { vertical: WorkspaceVertical }): WorkspaceVertical {
  return workspace.vertical;
}

export function isAvailableVertical(vertical: WorkspaceVertical): boolean {
  return VERTICALS[vertical].status === "active";
}

export function canUseVerticalCapability(vertical: WorkspaceVertical, capability: VerticalCapability, enabledModules: readonly string[] = []): boolean {
  if (!isAvailableVertical(vertical)) return false;
  if (capability === "manufacturing" || capability === "restaurant" || capability === "services") {
    return enabledModules.includes(capability);
  }
  return true;
}

export function resolveVerticalDashboard(vertical: WorkspaceVertical): string | null {
  return VERTICALS[vertical].dashboard;
}

export function requiredModuleForRoute(path: string): VerticalModule | null {
  for (const moduleKey of ["manufacturing", "restaurant", "services"] as const) {
    if (path === `/${moduleKey}` || path.startsWith(`/${moduleKey}/`)) return moduleKey;
  }
  return null;
}

export function canOpenVerticalRoute(vertical: WorkspaceVertical, path: string, enabledModules: readonly string[] = []): boolean {
  if (!isAvailableVertical(vertical)) return false;
  const moduleKey = requiredModuleForRoute(path);
  return moduleKey ? canUseVerticalCapability(vertical, moduleKey, enabledModules) : true;
}
