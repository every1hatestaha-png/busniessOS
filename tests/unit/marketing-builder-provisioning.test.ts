import { describe, expect, it } from "vitest";
import {
  buildProvisioningQuery,
  onboardingRouteFromBuilderParams,
  resolveProvisioningModules,
  sanitizeProvisioningModules,
} from "@/lib/saas/provisioning-selection";

describe("Marketing builder provisioning contract", () => {
  it("adds Restaurant and Inventory for Restaurant signup even if none selected", () => {
    expect(resolveProvisioningModules([], "restaurant")).toEqual(["inventory", "restaurant"]);
  });

  it("adds Services for a Services signup", () => {
    expect(resolveProvisioningModules(["accounting"], "services")).toEqual(["accounting", "services"]);
  });

  it("adds Warehouse and Wholesale to a selected manufacturing module", () => {
    expect(resolveProvisioningModules(["manufacturing"], "retail")).toEqual([
      "inventory", "wholesale", "manufacturing",
    ]);
  });

  it("de-duplicates selected modules and removes unknown entries", () => {
    expect(sanitizeProvisioningModules("inventory,inventory,unknown,accounting")).toEqual([
      "inventory", "accounting",
    ]);
  });

  it("retains Restaurant settings after signup verification", () => {
    const query = new URLSearchParams({ business: "restaurant", modules: "restaurant", billing: "monthly" });
    const next = onboardingRouteFromBuilderParams(query);
    expect(next).toBe("/onboarding?business=restaurant&modules=inventory%2Crestaurant&billing=monthly");
  });

  it("retains Services billing selection while restoring required module", () => {
    const query = new URLSearchParams({ business: "services", modules: "accounting", billing: "annual" });
    const next = onboardingRouteFromBuilderParams(query);
    expect(next).toBe("/onboarding?business=services&modules=accounting%2Cservices&billing=annual");
  });

  it("refuses arbitrary business types and cleans unknown module names", () => {
    expect(onboardingRouteFromBuilderParams(new URLSearchParams({ business: "hacked" }))).toBeNull();
    const query = new URLSearchParams({ business: "retail", modules: "inventory,secret,inventory", billing: "invalid" });
    expect(onboardingRouteFromBuilderParams(query)).toBe("/onboarding?business=retail&modules=inventory&billing=monthly");
  });

  it("preserves monthly billing and all effective modules in the signup URL", () => {
    const query = new URLSearchParams(buildProvisioningQuery({
      businessType: "restaurant",
      modules: ["inventory", "accounting"],
      billing: "monthly",
    }));
    expect(query.get("business")).toBe("restaurant");
    expect(query.get("billing")).toBe("monthly");
    expect(query.get("modules")?.split(",")).toEqual(["inventory", "restaurant", "accounting"]);
  });
});
