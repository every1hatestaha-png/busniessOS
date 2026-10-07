import { describe, expect, it } from "vitest";
import {
  canOpenVerticalRoute, canSaveBusinessType, canUseVerticalCapability,
  initialVerticalForBusinessType, resolveVerticalDashboard, resolveWorkspaceVertical,
} from "@/lib/verticals/registry";

describe("persisted workspace vertical policy", () => {
  it("maps existing types without interpreting OTHER as a new industry", () => {
    expect(initialVerticalForBusinessType("MANUFACTURER")).toBe("MANUFACTURING");
    for (const type of ["WHOLESALER", "DISTRIBUTOR", "RETAILER"] as const) {
      expect(initialVerticalForBusinessType(type)).toBe("TRADING");
    }
    expect(initialVerticalForBusinessType("OTHER")).toBe("LEGACY");
  });

  it("uses persisted identity, even when businessType differs, and switches contexts", () => {
    const workspaces = [
      { vertical: "TRADING", businessType: "MANUFACTURER" },
      { vertical: "MANUFACTURING", businessType: "WHOLESALER" },
      { vertical: "LEGACY", businessType: "OTHER" },
    ] as const;
    expect(workspaces.map(resolveWorkspaceVertical)).toEqual(["TRADING", "MANUFACTURING", "LEGACY"]);
    expect(resolveVerticalDashboard("LEGACY")).toBe("/dashboard");
  });

  it("preserves existing enabled modules for any legacy ERP workspace", () => {
    expect(canOpenVerticalRoute("TRADING", "/manufacturing/runs/id", ["manufacturing"])).toBe(true);
    expect(canOpenVerticalRoute("LEGACY", "/restaurant", ["restaurant"])).toBe(true);
    expect(canOpenVerticalRoute("LEGACY", "/services/jobs/id", ["services"])).toBe(true);
    expect(canOpenVerticalRoute("TRADING", "/manufacturing", [])).toBe(false);
    expect(canUseVerticalCapability("MANUFACTURING", "restaurant", [])).toBe(false);
  });

  it("denies all routes and capabilities for unreleased verticals", () => {
    for (const vertical of ["PROPERTY", "SERVICES"] as const) {
      expect(resolveVerticalDashboard(vertical)).toBeNull();
      expect(canOpenVerticalRoute(vertical, "/dashboard", ["restaurant", "manufacturing"])).toBe(false);
      expect(canOpenVerticalRoute(vertical, "/sales", ["restaurant"])).toBe(false);
      expect(canUseVerticalCapability(vertical, "finance")).toBe(false);
    }
  });
  it("routes Restaurant home while preserving its module entitlement boundary", () => {
    expect(resolveVerticalDashboard("RESTAURANT")).toBe("/restaurant");
    expect(canOpenVerticalRoute("RESTAURANT", "/restaurant/pos", ["restaurant"])).toBe(true);
    expect(canOpenVerticalRoute("RESTAURANT", "/restaurant/pos", [])).toBe(false);
    expect(canUseVerticalCapability("RESTAURANT", "restaurant", [])).toBe(false);
  });

  it("rejects settings requests that change business classification", () => {
    expect(canSaveBusinessType("OTHER", "OTHER")).toBe(true);
    expect(canSaveBusinessType("OTHER", "MANUFACTURER")).toBe(false);
    expect(canSaveBusinessType("MANUFACTURER", "WHOLESALER")).toBe(false);
  });
});
