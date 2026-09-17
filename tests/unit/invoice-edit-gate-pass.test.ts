import { describe, expect, it } from "vitest";

import { deliveryChallanNumber } from "@/lib/document-references";
import { saleEditSchema } from "@/lib/validation/sale-edit";

const saleId = "11111111-1111-4111-8111-111111111111";
const customerId = "22222222-2222-4222-8222-222222222222";
const productId = "33333333-3333-4333-8333-333333333333";

describe("invoice editing and gate pass references", () => {
  it("derives a clean delivery challan number from the invoice reference", () => {
    expect(deliveryChallanNumber("INV-000001")).toBe("DC-000001");
    expect(deliveryChallanNumber("INV-0042")).toBe("DC-0042");
  });

  it("accepts a complete editable invoice payload", () => {
    const result = saleEditSchema.safeParse({
      saleId,
      customerId,
      issuedAt: "2026-09-17",
      dueDate: "2026-10-17",
      orderDiscount: 100,
      gstRate: 18,
      notes: "Updated invoice",
      items: [{ productId, quantity: 2, pricingMode: "UNIT", unitPrice: 1000, discountPerUnit: 50 }],
    });
    expect(result.success).toBe(true);
  });

  it("rejects a due date before the issue date and duplicate products", () => {
    const result = saleEditSchema.safeParse({
      saleId,
      customerId,
      issuedAt: "2026-09-17",
      dueDate: "2026-09-16",
      orderDiscount: 0,
      gstRate: 18,
      notes: "",
      items: [
        { productId, quantity: 1, pricingMode: "UNIT", unitPrice: 100, discountPerUnit: 0 },
        { productId, quantity: 1, pricingMode: "UNIT", unitPrice: 100, discountPerUnit: 0 },
      ],
    });
    expect(result.success).toBe(false);
  });
});
