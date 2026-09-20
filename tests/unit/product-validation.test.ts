import { describe, expect, it } from "vitest";

import { productSchema } from "@/lib/validation/product";

const baseProduct = {
  name: "Brake Pad",
  category: "Brakes",
  costPrice: 1000,
  sellingPrice: 1250,
  stockQuantity: 5,
  reorderLevel: 1,
  unit: "PIECE" as const,
  status: "ACTIVE" as const,
};

describe("product validation", () => {
  it("accepts common automotive part-number punctuation and normalizes case", () => {
    for (const sku of ["04465-33450/A", "NGK.BKR6E-11", "DENSO_SK20HR11", "ABC 123/XY"]) {
      const parsed = productSchema.parse({ ...baseProduct, sku, description: "" });
      expect(parsed.sku).toBe(sku.toUpperCase());
    }
  });

  it("allows an omitted or short optional description", () => {
    expect(productSchema.parse({ ...baseProduct, sku: "PAD-001" }).description).toBe("");
    expect(productSchema.parse({ ...baseProduct, sku: "PAD-002", description: "OEM" }).description).toBe("OEM");
  });

  it("still rejects unsafe SKU punctuation", () => {
    expect(() => productSchema.parse({ ...baseProduct, sku: "PAD#001" })).toThrow();
  });
});
