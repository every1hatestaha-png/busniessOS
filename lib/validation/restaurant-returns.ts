import { z } from "zod";

export const restaurantItemReturnApiSchema = z.object({
  orderId: z.uuid(),
  cashBankAccountId: z.uuid().optional(),
  reason: z.string().trim().min(3).max(500),
  lines: z.array(z.object({
    orderItemId: z.uuid(),
    quantity: z.coerce.number().positive().max(10_000),
  })).min(1).max(100),
  idempotencyKey: z.string().trim().min(8).max(128).regex(/^[A-Za-z0-9:_-]+$/),
}).strict();

export type RestaurantItemReturnApiInput = z.infer<typeof restaurantItemReturnApiSchema>;
