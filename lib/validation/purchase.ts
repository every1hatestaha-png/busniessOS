import { z } from "zod";

export const purchaseSchema = z.object({
  supplierId: z.uuid(),
  items: z.array(z.object({ productId: z.uuid(), quantity: z.coerce.number().int().positive(), unitCost: z.coerce.number().nonnegative().max(999_999_999) })).min(1).max(100),
  paidAmount: z.coerce.number().nonnegative().default(0),
  paymentMethod: z.enum(["CASH", "BANK_TRANSFER", "JAZZCASH", "EASYPAISA", "CHEQUE", "CREDIT_CARD", "MOBILE_WALLET", "OTHER"]).default("CASH"),
  notes: z.string().trim().max(1000).optional().default(""),
  idempotencyKey: z.string().trim().min(8).max(200),
});

export type PurchaseInput = z.infer<typeof purchaseSchema>;
