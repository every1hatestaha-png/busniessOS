import { z } from "zod";

export const productSchema = z.object({
  name: z.string().trim().min(2).max(160),
  sku: z.string().trim().min(3).max(60).regex(/^[A-Za-z0-9-]+$/).transform((value) => value.toUpperCase()),
  category: z.string().trim().min(2).max(80),
  costPrice: z.coerce.number().min(0),
  sellingPrice: z.coerce.number().positive(),
  stockQuantity: z.coerce.number().min(0),
  reorderLevel: z.coerce.number().min(0),
  unit: z.enum(["PIECE", "BOX", "CARTON", "KG", "SET", "LITER", "METER"]),
  status: z.enum(["ACTIVE", "INACTIVE", "ARCHIVED"]).default("ACTIVE"),
  description: z.string().trim().min(10).max(500),
});

export const productEditSchema = productSchema.omit({ stockQuantity: true });

export type ProductInput = z.input<typeof productSchema>;
export type ProductEditInput = z.input<typeof productEditSchema>;
