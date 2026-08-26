import { z } from "zod";

export const paymentSchema = z.object({
  customerId: z.string().uuid(),
  invoiceId: z.string().uuid().optional().or(z.literal("")),
  amount: z.coerce.number().positive().max(100000000),
  paymentDate: z.coerce.date(),
  method: z.enum(["CASH", "BANK_TRANSFER", "JAZZCASH", "EASYPAISA", "CHEQUE", "OTHER"]),
  reference: z.string().trim().max(120).default(""),
  notes: z.string().trim().max(500).default(""),
});

export type PaymentInput = z.infer<typeof paymentSchema>;
