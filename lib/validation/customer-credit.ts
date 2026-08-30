import { z } from "zod";

export const customerCreditAllocationSchema = z.object({
  creditNoteId: z.uuid(),
  invoiceId: z.uuid(),
  amount: z.coerce.number().positive(),
  idempotencyKey: z.string().trim().min(8).max(200).optional(),
});

export type CustomerCreditAllocationInput = z.infer<typeof customerCreditAllocationSchema>;
