import { z } from "zod";

// Quantities are strings to retain exact 4-decimal precision end to end.
const quantity = z.string().regex(
  /^(?:0|[1-9]\d{0,10})(?:\.\d{1,4})?$/,
  "Enter a non-negative quantity with up to four decimal places.",
).refine((value) => Number(value) > 0, "Quantity must be greater than zero.");

export const outboundGatePassDraftSchema = z.object({
  customerId: z.string().uuid(),
  warehouseId: z.union([z.string().uuid(), z.literal("")]).default(""),
  date: z.iso.date(),
  deliveryAddress: z.string().trim().max(500).default(""),
  notes: z.string().trim().max(500).default(""),
  idempotencyKey: z.string().uuid(),
  items: z.array(z.object({
    productId: z.string().uuid(),
    quantity,
  })).min(1, "Add at least one product.").max(100),
}).superRefine((data, ctx) => {
  const ids = data.items.map((item) => item.productId);
  if (new Set(ids).size !== ids.length) {
    ctx.addIssue({ code: "custom", path: ["items"], message: "Combine duplicate products." });
  }
});
export type OutboundGatePassDraftInput = z.input<typeof outboundGatePassDraftSchema>;
