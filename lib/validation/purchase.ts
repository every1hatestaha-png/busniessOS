import { z } from "zod";

const purchaseItemSchema = z.object({
  productId: z.uuid(),
  quantity: z.coerce.number().int().positive(),
  unitCost: z.coerce.number().nonnegative().max(999_999_999),
  unitWeight: z.coerce.number().nonnegative().optional(),
  perKgRate: z.coerce.number().nonnegative().optional(),
});

export const purchaseSchema = z.object({
  supplierId: z.uuid(),
  items: z.array(purchaseItemSchema).min(1).max(100),
  notes: z.string().trim().max(1000).optional(),
  expectedDeliveryDate: z.coerce.date().optional(),
  department: z.string().trim().max(200).optional(),
  pricingMode: z.enum(["UNIT", "WEIGHT"]).optional(),
  idempotencyKey: z.string().trim().min(8).max(200),
}).superRefine((purchase, context) => {
  if (purchase.pricingMode !== "WEIGHT") return;
  purchase.items.forEach((item, index) => {
    if (!item.unitWeight || !item.perKgRate) {
      context.addIssue({ code: "custom", path: ["items", index], message: "Unit weight and rate per kg are required for weight pricing." });
    }
  });
});

export type PurchaseInput = z.infer<typeof purchaseSchema>;

export const goodsReceiptSchema = z.object({
  purchaseOrderId: z.uuid(),
  receiptDate: z.coerce.date().optional(),
  notes: z.string().trim().max(1000).optional(),
  receivedBy: z.string().trim().max(200).optional(),
  checkedBy: z.string().trim().max(200).optional(),
  items: z.array(z.object({
    purchaseOrderItemId: z.uuid(),
    receivedQuantity: z.coerce.number().int().nonnegative(),
    acceptedQuantity: z.coerce.number().int().nonnegative(),
    actualUnitCost: z.coerce.number().nonnegative().max(999_999_999),
  })).min(1).max(100),
  idempotencyKey: z.string().trim().min(8).max(200).optional(),
});

export type GoodsReceiptInput = z.infer<typeof goodsReceiptSchema>;
