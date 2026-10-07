import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { VERTICALS } from "@/lib/verticals/registry";
import { getDashboardComposition, getReportSectionOrder, getSearchTypes, getVerticalNavigation } from "@/lib/verticals/experience";

const root = process.cwd();
const inventory = JSON.parse(fs.readFileSync(path.join(root, "docs/architecture/vertical-entrypoints.json"), "utf8")) as Array<{
  file: string; url: string; kind: string; category: string; boundary: string;
}>;
const pageRoutes = new Set(inventory.filter((entry) => entry.kind === "PAGE" && entry.file.startsWith("app/(dashboard)/")).map((entry) => entry.url));
const reports = fs.readFileSync(path.join(root, "app/(dashboard)/reports/page.tsx"), "utf8");
const reportTitles = [...reports.matchAll(/\{ title: "([^"]+)", reports:/g)].map((match) => match[1]);
const searchTypes = new Set(["Customer", "Product", "Order", "Invoice"]);

describe("vertical operational manifests and entry points", () => {
  it("only references real page routes, reports, and search types without duplicates", () => {
    for (const vertical of ["TRADING", "MANUFACTURING", "LEGACY"] as const) {
      const routes = getVerticalNavigation(vertical).flatMap((section) => section.routes);
      expect(new Set(routes).size).toBe(routes.length);
      for (const route of routes) expect(pageRoutes.has(route), `${vertical} references missing ${route}`).toBe(true);
      const destination = VERTICALS[vertical].dashboard;
      expect(destination && pageRoutes.has(destination)).toBe(true);
      expect(getDashboardComposition(vertical)).not.toBeNull();
      const catalog = getReportSectionOrder(vertical);
      expect(new Set(catalog).size).toBe(catalog.length);
      expect(new Set(catalog)).toEqual(new Set(reportTitles));
      for (const type of getSearchTypes(vertical)) expect(searchTypes.has(type)).toBe(true);
      expect(new Set(getSearchTypes(vertical)).size).toBe(getSearchTypes(vertical).length);
    }
  });

  it("keeps unavailable verticals empty and LEGACY exact", () => {
    for (const vertical of ["PROPERTY", "SERVICES"] as const) {
      expect(VERTICALS[vertical].dashboard).toBeNull();
      expect(getVerticalNavigation(vertical)).toEqual([]);
      expect(getDashboardComposition(vertical)).toBeNull();
      expect(getReportSectionOrder(vertical)).toEqual([]);
      expect(getSearchTypes(vertical)).toEqual([]);
    }
    expect(getVerticalNavigation("LEGACY").map((section) => section.label)).toEqual(["Overview", "Operations", "Industry", "Finance", "Workspace"]);
    expect(getVerticalNavigation("LEGACY")[2]?.routes).toEqual(["/restaurant", "/manufacturing", "/services"]);
  });
  it("maps Restaurant navigation to real operational pages", () => {
    const restaurant = JSON.parse(fs.readFileSync(path.join(root, "docs/architecture/vertical-entrypoints.restaurant-v1.json"), "utf8")) as typeof inventory;
    const routes = new Set([...inventory, ...restaurant].filter(entry => entry.kind === "PAGE").map(entry => entry.url));
    expect(VERTICALS.RESTAURANT.dashboard).toBe("/restaurant");
    const navigation = getVerticalNavigation("RESTAURANT").flatMap(section => section.routes);
    expect(new Set(navigation).size).toBe(navigation.length);
    for (const route of navigation) expect(routes.has(route), route).toBe(true);
  });

  it("has an explicit classification and no unreviewed boundary", () => {
    expect(inventory.length).toBeGreaterThan(180);
    for (const entry of inventory) {
      expect(["SHARED_CORE", "TRADING", "MANUFACTURING", "LEGACY_COMPATIBILITY", "RESTAURANT", "PROPERTY", "SERVICES"]).toContain(entry.category);
      expect(entry.boundary, entry.file).not.toBe("REVIEW");
    }
  });
});
