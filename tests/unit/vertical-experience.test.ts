import { describe, expect, it } from "vitest";
import { getDashboardComposition, getReportSectionOrder, getSearchTypes, getVerticalNavigation } from "@/lib/verticals/experience";

const urls = (vertical: "TRADING" | "MANUFACTURING" | "LEGACY") => getVerticalNavigation(vertical).flatMap((section) => section.routes);

describe("vertical experience composition", () => {
  it("preserves the exact legacy ERP navigation and shared finance routes", () => {
    expect(getVerticalNavigation("LEGACY").map((section) => section.label)).toEqual(["Overview", "Operations", "Industry", "Finance", "Workspace"]);
    expect(getVerticalNavigation("LEGACY").find((section) => section.label === "Industry")?.routes).toEqual(["/restaurant", "/manufacturing", "/services"]);
    expect(urls("LEGACY")).toContain("/accounting/cash-bank");
    expect(getDashboardComposition("LEGACY")?.title).toBe("Dashboard");
  });

  it("gives Trading and Manufacturing independent compositions without losing enabled legacy routes", () => {
    expect(getVerticalNavigation("TRADING").map((section) => section.label)).toContain("Trading");
    expect(getVerticalNavigation("MANUFACTURING").map((section) => section.label)).toContain("Production");
    expect(getVerticalNavigation("MANUFACTURING")[1]?.routes).toEqual(["/manufacturing", "/inventory"]);
    for (const vertical of ["TRADING", "MANUFACTURING"] as const) {
      expect(urls(vertical)).toContain("/manufacturing");
      expect(urls(vertical)).toContain("/restaurant");
      expect(urls(vertical)).toContain("/services");
      expect(urls(vertical)).toContain("/settings");
    }
    expect(getDashboardComposition("TRADING")?.lead).toBe("trade");
    expect(getDashboardComposition("MANUFACTURING")?.lead).toBe("production");
  });

  it("composes reports and search independently while retaining existing results", () => {
    expect(getReportSectionOrder("LEGACY")).toEqual(["Financial", "Sales & Purchasing", "Accounts", "Inventory"]);
    expect(getReportSectionOrder("MANUFACTURING")[0]).toBe("Inventory");
    expect(getSearchTypes("TRADING")[0]).toBe("Customer");
    expect(getSearchTypes("MANUFACTURING")[0]).toBe("Product");
    expect(new Set(getSearchTypes("LEGACY"))).toEqual(new Set(getSearchTypes("MANUFACTURING")));
  });

  it("has no dashboard, navigation, search or reports for unavailable verticals", () => {
    for (const vertical of ["PROPERTY", "SERVICES"] as const) {
      expect(getDashboardComposition(vertical)).toBeNull();
      expect(getVerticalNavigation(vertical)).toEqual([]);
      expect(getSearchTypes(vertical)).toEqual([]);
      expect(getReportSectionOrder(vertical)).toEqual([]);
    }
  });
  it("provides the released Restaurant workspace without the generic ERP dashboard", () => {
    expect(getDashboardComposition("RESTAURANT")).toEqual({ title: "Restaurant overview", lead: "restaurant", sharedErpPanels: false });
    expect(getVerticalNavigation("RESTAURANT")[0]?.routes).toContain("/restaurant/pos");
    expect(getVerticalNavigation("RESTAURANT").flatMap(section => section.routes)).not.toContain("/dashboard");
    expect(getSearchTypes("RESTAURANT")).toEqual(["Order", "Product"]);
    expect(getReportSectionOrder("RESTAURANT")).toEqual(["Restaurant", "Financial", "Inventory"]);
  });
});
