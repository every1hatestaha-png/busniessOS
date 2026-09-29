import type { BusinessType } from "@prisma/client";

// BusinessType is legacy business classification. A new vertical must never be
// inferred from OTHER or a purchased module: both already have live meanings.
export const VERTICALS = {
  trading: { status: "active", dashboard: "/dashboard", capabilities: ["trading", "finance", "reports", "settings"] },
  manufacturing: { status: "active", dashboard: "/dashboard", capabilities: ["trading", "manufacturing", "finance", "reports", "settings"] },
  restaurant: { status: "unavailable", dashboard: null, capabilities: [] },
  property: { status: "unavailable", dashboard: null, capabilities: [] },
} as const;

export type WorkspaceVertical = keyof typeof VERTICALS;
export type VerticalCapability = "trading" | "manufacturing" | "finance" | "reports" | "settings";

export function resolveWorkspaceVertical(businessType: BusinessType): WorkspaceVertical {
  return businessType === "MANUFACTURER" ? "manufacturing" : "trading";
}

export function canUseVerticalCapability(vertical: WorkspaceVertical, capability: VerticalCapability): boolean {
  return VERTICALS[vertical].status === "active" &&
    (VERTICALS[vertical].capabilities as readonly string[]).includes(capability);
}

export function resolveVerticalDashboard(vertical: WorkspaceVertical): string | null {
  return VERTICALS[vertical].dashboard;
}

export function canOpenVerticalRoute(vertical: WorkspaceVertical, path: string): boolean {
  if (VERTICALS[vertical].status !== "active") return false;
  if (path === "/manufacturing" || path.startsWith("/manufacturing/")) {
    return canUseVerticalCapability(vertical, "manufacturing");
  }
  return true;
}
