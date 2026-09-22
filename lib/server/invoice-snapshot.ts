import "server-only";

import { z } from "zod";

const nullableText = z.string().nullable();

export const invoiceIssuedSnapshotSchema = z.object({
  version: z.literal(1),
  seller: z.object({
    name: z.string(),
    phone: nullableText,
    email: nullableText,
    address: nullableText,
    city: nullableText,
    country: z.string(),
    currency: z.string(),
    timezone: z.string(),
    ntn: nullableText,
    strn: nullableText,
    province: nullableText,
  }),
  buyer: z.object({
    id: z.string(),
    name: z.string(),
    companyName: nullableText,
    phone: nullableText,
    address: nullableText,
    city: nullableText,
    taxId: nullableText,
    province: nullableText,
    registrationType: nullableText,
  }),
  order: z.object({
    number: z.string(),
    warehouse: z.object({
      id: z.string(),
      name: z.string(),
      code: nullableText,
    }).nullable(),
    items: z.array(z.object({
      key: z.string(),
      name: z.string(),
      sku: nullableText,
      unit: z.string(),
      quantity: z.number(),
      unitPrice: z.number(),
      discountPerUnit: z.number(),
      total: z.number(),
      pricingMode: z.enum(["UNIT", "WEIGHT"]),
      taxRate: z.number().nullable(),
      unitWeight: z.number().nullable(),
      totalWeight: z.number().nullable(),
      perKgRate: z.number().nullable(),
    })),
  }),
  totals: z.object({
    subtotal: z.number(),
    discount: z.number(),
    taxableAmount: z.number(),
    gstRate: z.number().nullable(),
    gstAmount: z.number(),
    total: z.number(),
  }),
});

export type InvoiceIssuedSnapshot = z.infer<typeof invoiceIssuedSnapshotSchema>;

export function parseInvoiceIssuedSnapshot(value: unknown): InvoiceIssuedSnapshot | null {
  const parsed = invoiceIssuedSnapshotSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}
