import { z } from "zod";

const baseManualNoteSchema = z.object({
  amount: z.coerce.number().positive("Amount must be greater than zero").max(100000000),
  reason: z.string().trim().min(3, "Enter a brief reason").max(160),
  reference: z.string().trim().max(100).optional().default(""),
  notes: z.string().trim().max(500).optional().default(""),
  idempotencyKey: z.string().uuid(),
});

export const manualCustomerCreditNoteSchema = baseManualNoteSchema.extend({
  customerId: z.string().uuid(),
});

export const manualSupplierDebitNoteSchema = baseManualNoteSchema.extend({
  supplierId: z.string().uuid(),
  purchaseOrderId: z.string().uuid().optional().or(z.literal("")),
});

export type ManualCustomerCreditNoteInput = z.input<typeof manualCustomerCreditNoteSchema>;
export type ManualSupplierDebitNoteInput = z.input<typeof manualSupplierDebitNoteSchema>;
