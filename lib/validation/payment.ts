import { z } from "zod";

export const paymentSchema = z.object({
  customerId: z.string().uuid(),
  invoiceId: z.string().uuid().optional().or(z.literal("")),
  cashBankAccountId: z.string().uuid().optional().or(z.literal("")),
  allocations: z.array(z.object({ invoiceId: z.string().uuid(), amount: z.coerce.number().positive().max(100000000) })).max(100).optional(),
  amount: z.coerce.number().positive().max(100000000),
  withholdingTaxAmount: z.coerce.number().min(0).max(100000000).default(0),
  paymentDate: z.coerce.date(),
  method: z.enum(["CASH", "BANK_TRANSFER", "JAZZCASH", "EASYPAISA", "CHEQUE", "OTHER"]),
  reference: z.string().trim().max(120).default(""),
  notes: z.string().trim().max(500).default(""),
  idempotencyKey: z.string().trim().min(8).max(200).optional(),
}).superRefine((value, ctx) => {
  if (value.withholdingTaxAmount > value.amount) {
    ctx.addIssue({ code: "custom", path: ["withholdingTaxAmount"], message: "Withholding tax cannot exceed the gross settlement amount." });
  }
});

export type PaymentInput = z.input<typeof paymentSchema>;
