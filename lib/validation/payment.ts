import { z } from "zod";

export const paymentSchema = z.object({
  customerId: z.string().uuid(),
  invoiceId: z.string().uuid().optional().or(z.literal("")),
  cashBankAccountId: z.string().uuid().optional().or(z.literal("")),
  allocations: z.array(z.object({ invoiceId: z.string().uuid(), amount: z.coerce.number().positive().max(100000000) })).max(100).optional(),
  amount: z.coerce.number().positive().max(100000000),
  paymentDate: z.coerce.date(),
  method: z.enum(["CASH", "BANK_TRANSFER", "JAZZCASH", "EASYPAISA", "CHEQUE", "OTHER"]),
  reference: z.string().trim().max(120).default(""),
  notes: z.string().trim().max(500).default(""),
  idempotencyKey: z.string().trim().min(8).max(200).optional(),
});

export type PaymentInput = z.input<typeof paymentSchema>;
