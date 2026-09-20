import { z } from "zod";

const saleEditItemSchema = z.object({
  productId: z.string().uuid(),
  quantity: z.coerce.number().positive().max(1000000),
  pricingMode: z.enum(["UNIT", "WEIGHT"]).default("UNIT"),
  unitWeight: z.coerce.number().positive().max(100000).optional(),
  perKgRate: z.coerce.number().positive().max(100000000).optional(),
  unitPrice: z.coerce.number().positive().max(100000000),
  discountPerUnit: z.coerce.number().nonnegative().max(100000000).default(0),
  taxRate: z.coerce.number().min(0).max(100).optional(),
});

export const saleEditSchema = z.object({
  saleId: z.string().uuid(),
  customerId: z.string().uuid(),
  issuedAt: z.coerce.date(),
  dueDate: z.coerce.date().nullable(),
  items: z.array(saleEditItemSchema).min(1).max(100),
  orderDiscount: z.coerce.number().nonnegative().max(100000000).default(0),
  gstRate: z.coerce.number().min(0).max(100).default(0),
  notes: z.string().trim().max(500).default(""),
}).superRefine((sale, context) => {
  if (sale.dueDate && sale.dueDate < sale.issuedAt) {
    context.addIssue({ code: "custom", path: ["dueDate"], message: "Due date cannot be before the invoice date." });
  }
  const ids = sale.items.map((item) => item.productId);
  if (new Set(ids).size !== ids.length) {
    context.addIssue({ code: "custom", path: ["items"], message: "Combine duplicate products into one line." });
  }
  sale.items.forEach((item, index) => {
    const effectiveUnitPrice = item.pricingMode === "WEIGHT" && item.unitWeight && item.perKgRate
      ? item.unitWeight * item.perKgRate
      : item.unitPrice;
    if (item.pricingMode === "WEIGHT" && (!item.unitWeight || !item.perKgRate)) {
      context.addIssue({ code: "custom", path: ["items", index, "unitWeight"], message: "Weight-priced items require kg/unit and rate/kg." });
    }
    if (item.discountPerUnit > effectiveUnitPrice) {
      context.addIssue({ code: "custom", path: ["items", index, "discountPerUnit"], message: "Discount per unit cannot exceed the effective unit price." });
    }
  });
});

export type SaleEditInput = z.input<typeof saleEditSchema>;
export type SaleEditValues = z.output<typeof saleEditSchema>;
