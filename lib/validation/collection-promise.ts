import { z } from "zod";

export const collectionPromiseSchema = z.object({
  customerId: z.uuid(),
  amount: z.coerce.number().finite().positive("Promise amount must be greater than zero").max(9_999_999_999_999.99, "Promise amount is too large"),
  promiseDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a valid promise date"),
  note: z.string().trim().max(300, "Promise note cannot exceed 300 characters").optional().default(""),
});

export const collectionPromiseStatusSchema = z.object({
  promiseId: z.uuid(),
  status: z.enum(["FULFILLED", "CANCELLED"]),
});

export type CollectionPromiseInput = z.infer<typeof collectionPromiseSchema>;
export type CollectionPromiseStatusInput = z.infer<typeof collectionPromiseStatusSchema>;
