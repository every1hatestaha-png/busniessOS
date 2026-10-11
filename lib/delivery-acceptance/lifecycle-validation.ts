import { z } from "zod";

export const positiveQuantity = z.string().regex(/^(?:0|[1-9]\d{0,10})(?:\.\d{1,4})?$/)
  .refine((s) => Number(s) > 0, "Quantity must be positive");
export const zeroOrPositiveQuantity = z.string().regex(/^(?:0|[1-9]\d{0,10})(?:\.\d{1,4})?$/);
export const uuid = z.string().uuid();

export const receivingInputSchema = z.object({
  gatePassId: uuid,
  reference: z.string().trim().min(1).max(120),
  recipient: z.string().trim().min(1).max(120),
  notes: z.string().trim().max(500).default(""),
  lines: z.array(z.object({
    itemId: uuid,
    accepted: zeroOrPositiveQuantity,
    rejected: zeroOrPositiveQuantity,
  })).min(1).max(100),
}).superRefine((data, ctx) => {
  if (new Set(data.lines.map((x) => x.itemId)).size !== data.lines.length)
    ctx.addIssue({ code: "custom", path: ["lines"], message: "Duplicate receiving line" });
});

export const returnedGoodsSchema = z.object({
  gatePassId: uuid,
  lines: z.array(z.object({ itemId: uuid, returned: zeroOrPositiveQuantity })).min(1).max(100),
}).superRefine((data, ctx) => {
  if (new Set(data.lines.map((x) => x.itemId)).size !== data.lines.length)
    ctx.addIssue({ code: "custom", path: ["lines"], message: "Duplicate return line" });
});

export const issueInvoiceFromGatePassSchema = z.object({
  gatePassId: uuid,
  complianceAcknowledged: z.literal(true),
  lines: z.array(z.object({
    itemId: uuid,
    unitPrice: z.string().regex(/^(?:0|[1-9]\d{0,10})(?:\.\d{1,2})?$/),
    taxRate: z.number().finite().min(0).max(100),
  })).min(1).max(100),
}).superRefine((data, ctx) => {
  if (new Set(data.lines.map((x) => x.itemId)).size !== data.lines.length)
    ctx.addIssue({ code: "custom", path: ["lines"], message: "Duplicate invoice line" });
});
