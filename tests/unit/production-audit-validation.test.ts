import { describe, expect, it } from "vitest";
import { optionalProductNumber, productEditSchema } from "@/lib/validation/product";
import { publicSiteUrl } from "@/lib/site-url";

describe("production audit regressions", () => {
  it("preserves absent optional numeric product fields when editing database records", () => {
    const base = { name: "Test product", sku: "TEST-1", category: "Test", costPrice: 100,
      sellingPrice: 200, reorderLevel: 1, unit: "KG", status: "ACTIVE" };
    for (const value of [null, undefined, ""]) {
      const parsed = productEditSchema.safeParse({ ...base,
        fbrTransactionTypeId: optionalProductNumber(value),
        fbrRateId: optionalProductNumber(value), defaultWeightKg: optionalProductNumber(value) });
      expect(parsed.success).toBe(true);
    }
    for (const value of [0, -1, "bad"]) {
      expect(productEditSchema.safeParse({ ...base, defaultWeightKg: optionalProductNumber(value) }).success).toBe(false);
    }
  });

  it("uses the redirect destination consistently for public metadata", () => {
    expect(publicSiteUrl("")).toBe("https://www.munshios.tech");
    expect(publicSiteUrl("https://munshios.tech/")).toBe("https://www.munshios.tech");
    expect(publicSiteUrl("https://www.munshios.tech/")).toBe("https://www.munshios.tech");
    expect(publicSiteUrl("https://preview.example/")).toBe("https://preview.example");
  });
});
