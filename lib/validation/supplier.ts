import { z } from "zod";

export const supplierSchema = z.object({
  name: z.string().trim().min(2).max(120),
  companyName: z.string().trim().max(160).optional().default(""),
  phone: z.string().trim().max(40).optional().default(""),
  email: z.union([z.literal(""), z.email()]).optional().default(""),
  address: z.string().trim().max(300).optional().default(""),
  city: z.string().trim().max(80).optional().default(""),
  notes: z.string().trim().max(1000).optional().default(""),
});

export const supplierPaymentSchema = z.object({
  amount: z.coerce.number().positive().max(999_999_999),
  withholdingTaxAmount: z.coerce.number().min(0).max(999_999_999).default(0),
  cashBankAccountId: z.uuid().optional().or(z.literal("")),
  allocations: z.array(z.object({ purchaseOrderId: z.uuid(), amount: z.coerce.number().positive().max(999_999_999) })).max(100).optional(),
  method: z.enum(["CASH", "BANK_TRANSFER", "JAZZCASH", "EASYPAISA", "CHEQUE", "CREDIT_CARD", "MOBILE_WALLET", "OTHER"]),
  reference: z.string().trim().max(120).optional().default(""),
  notes: z.string().trim().max(500).optional().default(""),
  paymentDate: z.coerce.date().default(() => new Date()),
  idempotencyKey: z.string().trim().min(8).max(200).optional(),
});

export type SupplierInput = z.infer<typeof supplierSchema>;
export type SupplierPaymentInput = z.input<typeof supplierPaymentSchema>;
