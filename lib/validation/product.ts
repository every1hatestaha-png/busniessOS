import { z } from "zod";

export const productSchema = z.object({
  name: z.string().trim().min(2, "Product name must be at least 2 characters").max(160, "Product name is too long"),
  sku: z.string().trim().min(3, "SKU must be at least 3 characters").max(60, "SKU is too long").regex(/^[A-Za-z0-9-]+$/, "SKU can contain only letters, numbers, and hyphens").transform((value) => value.toUpperCase()),
  category: z.string().trim().min(2, "Category must be at least 2 characters").max(80, "Category is too long"),
  costPrice: z.coerce.number().min(0, "Cost price cannot be negative"),
  sellingPrice: z.coerce.number().positive("Selling price must be greater than zero"),
  stockQuantity: z.coerce.number().min(0, "Opening stock cannot be negative"),
  reorderLevel: z.coerce.number().min(0, "Reorder level cannot be negative"),
  defaultWeightKg: z.preprocess((value) => value === "" || value == null ? undefined : value, z.coerce.number().positive("Default weight must be greater than zero").max(100000).optional()),
  unit: z.enum(["PIECE", "BOX", "CARTON", "KG", "SET", "LITER", "METER"]),
  status: z.enum(["ACTIVE", "INACTIVE", "ARCHIVED"]).default("ACTIVE"),
  description: z.string().trim().min(10, "Description must be at least 10 characters").max(500, "Description cannot exceed 500 characters"),
});

export const productEditSchema = productSchema.omit({ stockQuantity: true });

export type ProductInput = z.input<typeof productSchema>;
export type ProductEditInput = z.input<typeof productEditSchema>;
