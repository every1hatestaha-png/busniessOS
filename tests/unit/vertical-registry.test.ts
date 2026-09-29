import { describe, expect, it } from "vitest";
import { canOpenVerticalRoute, canUseVerticalCapability, resolveVerticalDashboard, resolveWorkspaceVertical } from "@/lib/verticals/registry";

describe("workspace vertical resolution", () => {
  it("preserves every legacy business type without guessing from OTHER", () => {
    for (const type of ["WHOLESALER", "DISTRIBUTOR", "RETAILER", "OTHER"] as const) {
      expect(resolveWorkspaceVertical(type)).toBe("trading");
      expect(canOpenVerticalRoute(resolveWorkspaceVertical(type), "/sales")).toBe(true);
    }
    expect(resolveWorkspaceVertical("MANUFACTURER")).toBe("manufacturing");
    expect(resolveVerticalDashboard("trading")).toBe("/dashboard");
    expect(resolveVerticalDashboard("manufacturing")).toBe("/dashboard");
  });

  it("resolves the active workspace independently on each switch", () => {
    const workspaces = [{ businessType: "WHOLESALER" }, { businessType: "MANUFACTURER" }] as const;
    expect(workspaces.map(({ businessType }) => resolveWorkspaceVertical(businessType))).toEqual(["trading", "manufacturing"]);
  });

  it("fails closed for unavailable verticals and manufacturing routes", () => {
    for (const vertical of ["restaurant", "property"] as const) {
      expect(resolveVerticalDashboard(vertical)).toBeNull();
      expect(canOpenVerticalRoute(vertical, "/sales")).toBe(false);
      expect(canUseVerticalCapability(vertical, "finance")).toBe(false);
    }
    expect(canOpenVerticalRoute("trading", "/manufacturing/runs/123")).toBe(false);
    expect(canOpenVerticalRoute("manufacturing", "/manufacturing/runs/123")).toBe(true);
  });
});
