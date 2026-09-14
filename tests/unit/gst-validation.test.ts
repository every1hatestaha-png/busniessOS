import { describe, expect, it } from "vitest";

import { purchaseSchema } from "@/lib/validation/purchase";
import { saleSchema } from "@/lib/validation/sale";

const id = "11111111-1111-4111-8111-111111111111";
const secondId = "22222222-2222-4222-8222-222222222222";

describe("GST validation", () => {
  it("keeps omitted sales GST backward compatible", () => {
    const sale = saleSchema.parse({
      customerId: id,
      items: [{ productId: secondId, quantity: 1, unitPrice: 100, discountPerUnit: 0 }],
      orderDiscount: 0,
      paidAmount: 0,
      notes: "",
      idempotencyKey: id,
    });

    expect(sale.gstRate).toBe(0);
  });

  it("allows editable sales GST including the 18 percent UI default", () => {
    const base = {
      customerId: id,
      items: [{ productId: secondId, quantity: 1, unitPrice: 100, discountPerUnit: 0 }],
      orderDiscount: 0,
      paidAmount: 0,
      notes: "",
      idempotencyKey: id,
    };

    expect(saleSchema.parse({ ...base, gstRate: 0 }).gstRate).toBe(0);
    expect(saleSchema.parse({ ...base, gstRate: 18 }).gstRate).toBe(18);
    expect(saleSchema.parse({ ...base, gstRate: 17 }).gstRate).toBe(17);
    expect(saleSchema.safeParse({ ...base, gstRate: 101 }).success).toBe(false);
  });

  it("keeps omitted purchase GST backward compatible and validates overrides", () => {
    const base = {
      supplierId: id,
      items: [{ productId: secondId, quantity: 2, unitCost: 50 }],
      idempotencyKey: "purchase-test-key",
    };

    expect(purchaseSchema.parse(base).gstRate).toBe(0);
    expect(purchaseSchema.parse({ ...base, gstRate: 18 }).gstRate).toBe(18);
    expect(purchaseSchema.parse({ ...base, gstRate: 5 }).gstRate).toBe(5);
    expect(purchaseSchema.safeParse({ ...base, gstRate: -1 }).success).toBe(false);
  });
});
