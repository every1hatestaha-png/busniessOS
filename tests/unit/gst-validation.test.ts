import { describe, expect, it } from "vitest";

import { purchaseSchema } from "@/lib/validation/purchase";
import { saleSchema } from "@/lib/validation/sale";

const id = "11111111-1111-4111-8111-111111111111";
const secondId = "22222222-2222-4222-8222-222222222222";

describe("GST validation", () => {
  it("defaults sales GST to 18 percent", () => {
    const sale = saleSchema.parse({
      customerId: id,
      items: [{ productId: secondId, quantity: 1, unitPrice: 100, discountPerUnit: 0 }],
      orderDiscount: 0,
      paidAmount: 0,
      notes: "",
      idempotencyKey: id,
    });

    expect(sale.gstRate).toBe(18);
  });

  it("allows editable sales GST including zero", () => {
    const base = {
      customerId: id,
      items: [{ productId: secondId, quantity: 1, unitPrice: 100, discountPerUnit: 0 }],
      orderDiscount: 0,
      paidAmount: 0,
      notes: "",
      idempotencyKey: id,
    };

    expect(saleSchema.parse({ ...base, gstRate: 0 }).gstRate).toBe(0);
    expect(saleSchema.parse({ ...base, gstRate: 17 }).gstRate).toBe(17);
    expect(saleSchema.safeParse({ ...base, gstRate: 101 }).success).toBe(false);
  });

  it("defaults purchase GST to 18 percent and accepts an override", () => {
    const base = {
      supplierId: id,
      items: [{ productId: secondId, quantity: 2, unitCost: 50 }],
      idempotencyKey: "purchase-test-key",
    };

    expect(purchaseSchema.parse(base).gstRate).toBe(18);
    expect(purchaseSchema.parse({ ...base, gstRate: 5 }).gstRate).toBe(5);
    expect(purchaseSchema.safeParse({ ...base, gstRate: -1 }).success).toBe(false);
  });
});
