import { z } from "zod";

export const saleSchema = z.object({
  customerId: z.string().uuid(),
  items: z.array(z.object({
    productId: z.string().uuid(),
    quantity: z.number().positive(),
    unitPrice: z.number().nonnegative().max(100000000),
    discount: z.number().nonnegative().max(100000000),
  })).min(1).max(100),
  orderDiscount: z.number().nonnegative().max(100000000),
  paidAmount: z.number().nonnegative().max(100000000),
  cashBankAccountId: z.string().uuid().optional().or(z.literal("")),
  notes: z.string().trim().max(500).default(""),
  idempotencyKey: z.string().uuid(),
}).superRefine((sale, context) => {
  const ids = sale.items.map((item) => item.productId);
  if (new Set(ids).size !== ids.length) context.addIssue({ code: "custom", path: ["items"], message: "Combine duplicate products into one line." });
  sale.items.forEach((item, index) => {
    if (item.discount > item.quantity * item.unitPrice) context.addIssue({ code: "custom", path: ["items", index, "discount"], message: "Discount exceeds line value." });
  });
  if (sale.paidAmount > 0 && !sale.cashBankAccountId) context.addIssue({ code: "custom", path: ["cashBankAccountId"], message: "Select the cash/bank account receiving this payment." });
});

export type SaleInput = z.infer<typeof saleSchema>;
