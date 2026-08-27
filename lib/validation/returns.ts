import { z } from "zod";

const returnItemSchema = z.object({ itemId: z.uuid(), quantity: z.coerce.number().int().positive() });

export const customerReturnSchema = z.object({
  salesOrderId: z.uuid(),
  items: z.array(returnItemSchema).min(1).max(100),
  restock: z.boolean().default(true),
  reason: z.string().trim().max(300).optional().default(""),
  notes: z.string().trim().max(1000).optional().default(""),
  idempotencyKey: z.string().trim().min(8).max(200).optional(),
});

export const supplierReturnSchema = z.object({
  purchaseOrderId: z.uuid(),
  items: z.array(returnItemSchema).min(1).max(100),
  reason: z.string().trim().max(300).optional().default(""),
  notes: z.string().trim().max(1000).optional().default(""),
  idempotencyKey: z.string().trim().min(8).max(200).optional(),
});

export type CustomerReturnInput = z.infer<typeof customerReturnSchema>;
export type SupplierReturnInput = z.infer<typeof supplierReturnSchema>;
