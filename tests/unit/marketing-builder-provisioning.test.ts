import { describe, expect, it } from "vitest";
import {
  buildProvisioningQuery,
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
