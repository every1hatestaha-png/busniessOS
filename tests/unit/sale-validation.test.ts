import { describe, expect, it } from "vitest";

import { saleSchema } from "@/lib/validation/sale";

const validSale = () => ({
  customerId: crypto.randomUUID(),
  items: [{ productId: crypto.randomUUID(), quantity: 1, unitPrice: 100, discountPerUnit: 0 }],
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

  it("rejects duplicate products in the same sale", () => {
    const pid = crypto.randomUUID();
    const input = validSale();
    input.items = [
      { productId: pid, quantity: 1, unitPrice: 100, discountPerUnit: 0 },
      { productId: pid, quantity: 2, unitPrice: 200, discountPerUnit: 0 },
    ];
    const result = saleSchema.safeParse(input);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues[0]?.message).toBe("Combine duplicate products into one line.");
  });

  it("rejects discount per unit that exceeds unit price", () => {
    const input = validSale();
    input.items[0].unitPrice = 100;
    input.items[0].discountPerUnit = 150;
    const result = saleSchema.safeParse(input);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues[0]?.message).toBe("Discount per unit cannot exceed unit price.");
  });

  it("accepts discount per unit equal to unit price (zero line total)", () => {
    const input = validSale();
    input.items[0].unitPrice = 100;
    input.items[0].discountPerUnit = 100;
    const result = saleSchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  it("rejects discount per unit exceeding unit price", () => {
    const input = validSale();
    input.items[0].unitPrice = 100;
    input.items[0].discountPerUnit = 150;
    const result = saleSchema.safeParse(input);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues[0]?.message).toBe("Discount per unit cannot exceed unit price.");
  });
});

describe("sale line total (per-unit discount)", () => {
  function lineTotal(qty: number, unitPrice: number, discountPerUnit: number) {
    const gross = qty * unitPrice;
    const discount = qty * discountPerUnit;
    return Math.max(0, gross - discount);
  }

  it("computes Rs 47,500 for qty=50, price=1000, disc/unit=50", () => {
    expect(lineTotal(50, 1000, 50)).toBe(47_500);
  });

  it("computes gross = 50,000, discount = 2,500 for the same example", () => {
    const gross = 50 * 1000;
    const discount = 50 * 50;
    expect(gross).toBe(50_000);
    expect(discount).toBe(2_500);
    expect(lineTotal(50, 1000, 50)).toBe(gross - discount);
  });

  it("returns zero when discount per unit equals unit price", () => {
    expect(lineTotal(10, 500, 500)).toBe(0);
  });

  it("returns gross when discount per unit is zero", () => {
    expect(lineTotal(10, 500, 0)).toBe(5_000);
  });

  it("handles fractional quantities", () => {
    expect(lineTotal(2.5, 1200, 50)).toBe(2_875);
  });
});
