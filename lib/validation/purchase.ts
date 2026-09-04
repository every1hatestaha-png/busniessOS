import { z } from "zod";

const purchaseItemSchema = z.object({
  productId: z.uuid(),
  quantity: z.coerce.number().positive(),
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
    receivedQuantity: z.coerce.number().positive("Weight or quantity must be greater than zero."),
    acceptedQuantity: z.coerce.number().nonnegative(),
    actualUnitCost: z.coerce.number().nonnegative().max(999_999_999),
  })).min(1).max(100),
  idempotencyKey: z.string().trim().min(8).max(200).optional(),
}).superRefine((receipt, context) => {
  receipt.items.forEach((item, index) => {
    if (item.acceptedQuantity > item.receivedQuantity) context.addIssue({ code: "custom", path: ["items", index, "acceptedQuantity"], message: "Accepted quantity cannot exceed received quantity." });
  });
  if (!receipt.items.some((item) => item.acceptedQuantity > 0)) context.addIssue({ code: "custom", path: ["items"], message: "Accept at least one received item." });
});

export type GoodsReceiptInput = z.infer<typeof goodsReceiptSchema>;

export const updatePurchaseSchema = z.object({
  notes: z.string().trim().max(1000).optional(),
  expectedDeliveryDate: z.union([z.coerce.date(), z.null()]).optional(),
});

export type UpdatePurchaseInput = z.infer<typeof updatePurchaseSchema>;

export const voidGoodsReceiptSchema = z.object({
  voidedReason: z.string().trim().min(1).max(1000),
});

export type VoidGoodsReceiptInput = z.infer<typeof voidGoodsReceiptSchema>;

export const updateGoodsReceiptSchema = z.object({
  notes: z.string().trim().max(1000).optional(),
  receivedBy: z.string().trim().max(200).optional(),
  checkedBy: z.string().trim().max(200).optional(),
  items: z.array(z.object({
    purchaseOrderItemId: z.uuid(),
    receivedQuantity: z.coerce.number().positive("Weight or quantity must be greater than zero."),
    acceptedQuantity: z.coerce.number().nonnegative(),
    actualUnitCost: z.coerce.number().nonnegative().max(999_999_999),
  })).min(1).max(100).optional(),
}).superRefine((receipt, context) => {
  receipt.items?.forEach((item, index) => {
    if (item.acceptedQuantity > item.receivedQuantity) context.addIssue({ code: "custom", path: ["items", index, "acceptedQuantity"], message: "Accepted quantity cannot exceed received quantity." });
  });
});

export type UpdateGoodsReceiptInput = z.infer<typeof updateGoodsReceiptSchema>;
