import { describe, expect, it } from "vitest";

import { saleSchema } from "@/lib/validation/sale";

const validSale = () => ({
  customerId: crypto.randomUUID(),
  items: [{ productId: crypto.randomUUID(), quantity: 1, unitPrice: 100, discount: 0 }],
  orderDiscount: 0,
  paidAmount: 0,
  notes: "",
  idempotencyKey: crypto.randomUUID(),
});

describe("sale validation", () => {
  it("allows an unpaid sale without a cash/bank account", () => {
    expect(saleSchema.safeParse(validSale()).success).toBe(true);
  });

  it("requires a cash/bank account for a positive initial payment", () => {
    const result = saleSchema.safeParse({ ...validSale(), paidAmount: 10 });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues[0]?.message).toBe("Select the cash/bank account receiving this payment.");
  });

  it.each([0, -1, 100000001])("returns a useful error for invalid selling price %s", (unitPrice) => {
    const input = validSale();
    input.items[0].unitPrice = unitPrice;
    const result = saleSchema.safeParse(input);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues[0]?.message).toBe("Invalid selling price.");
  });
});
