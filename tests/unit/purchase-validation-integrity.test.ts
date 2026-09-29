import { describe, expect, it } from "vitest";
import { goodsReceiptSchema, purchaseSchema, updateGoodsReceiptSchema } from "@/lib/validation/purchase";

const supplierId = "63b758e7-54e2-4d81-96ca-a057e59d64e8";
const productId = "7d155f2e-8bf1-4dd3-9575-6f5a8198b6e0";
const purchaseOrderId = "2920c78f-50ea-4cf8-9884-cc4d2b8f6786";
const purchaseOrderItemId = "8fd16779-9e04-4658-99a3-e607e98da56e";

describe("purchase and GRN line identity validation", () => {
  it("rejects duplicate products on a purchase before service idempotency handling", () => {
    const result = purchaseSchema.safeParse({
      supplierId,
      idempotencyKey: "purchase-key-123",
      items: [
        { productId, quantity: 1, unitCost: 10 },
        { productId, quantity: 2, unitCost: 10 },
      ],
    });
    expect(result.success).toBe(false);
  });

  it("rejects duplicate purchase-order items on a new GRN", () => {
    const line = { purchaseOrderItemId, receivedQuantity: 1, acceptedQuantity: 1, actualUnitCost: 10 };
    const result = goodsReceiptSchema.safeParse({
      purchaseOrderId,
      idempotencyKey: "grn-key-123",
      items: [line, line],
    });
    expect(result.success).toBe(false);
  });

  it("rejects duplicate purchase-order items on a GRN edit", () => {
    const line = { purchaseOrderItemId, receivedQuantity: 1, acceptedQuantity: 1, actualUnitCost: 10 };
    const result = updateGoodsReceiptSchema.safeParse({ items: [line, line] });
    expect(result.success).toBe(false);
  });
});
