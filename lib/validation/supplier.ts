import { z } from "zod";

export const supplierSchema = z.object({
  name: z.string().trim().min(2).max(120),
  companyName: z.string().trim().max(160).optional().default(""),
  phone: z.string().trim().max(40).optional().default(""),
  email: z.union([z.literal(""), z.email()]).optional().default(""),
  address: z.string().trim().max(300).optional().default(""),
  city: z.string().trim().max(80).optional().default(""),
  notes: z.string().trim().max(1000).optional().default(""),
  openingBalance: z.coerce.number().min(0).default(0),
});

const supplierPaymentAllocationSchema = z.object({
  goodReceivedNoteId: z.uuid().optional(),
  // Backward-compatible input only. The service normalizes legacy PO allocations
  // into explicit GRN allocations before persistence.
  purchaseOrderId: z.uuid().optional(),
  openingBalance: z.boolean().optional().default(false),
  amount: z.coerce.number().positive().max(999_999_999),
}).superRefine((allocation, ctx) => {
  const targetCount = Number(Boolean(allocation.goodReceivedNoteId)) + Number(Boolean(allocation.purchaseOrderId)) + Number(allocation.openingBalance);
  if (targetCount !== 1) {
    ctx.addIssue({ code: "custom", message: "Choose exactly one supplier payment target: GRN or opening balance." });
  }
});

export const supplierPaymentSchema = z.object({
  amount: z.coerce.number().positive().max(999_999_999),
  withholdingTaxAmount: z.coerce.number().min(0).max(999_999_999).default(0),
  cashBankAccountId: z.uuid().optional().or(z.literal("")),
  // Keep this optional at the input boundary so older callers receive the domain
  // error from recordSupplierPayment instead of becoming TypeScript-incompatible.
  // Parsed service data always contains an array.
  allocations: z.array(supplierPaymentAllocationSchema).max(100).optional().default([]),
  method: z.enum(["CASH", "BANK_TRANSFER", "JAZZCASH", "EASYPAISA", "CHEQUE", "CREDIT_CARD", "MOBILE_WALLET", "OTHER"]),
  reference: z.string().trim().max(120).optional().default(""),
  notes: z.string().trim().max(500).optional().default(""),
  paymentDate: z.coerce.date().default(() => new Date()),
  idempotencyKey: z.string().trim().min(8).max(200).optional(),
});

export type SupplierInput = z.infer<typeof supplierSchema>;
export type SupplierPaymentInput = z.input<typeof supplierPaymentSchema>;
