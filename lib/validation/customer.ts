import { z } from "zod";

const money = z.string().trim().regex(/^\d+(\.\d{1,2})?$/, "Enter a valid non-negative amount");

const baseCustomerSchema = z.object({
  name: z.string().trim().min(2).max(120),
  companyName: z.string().trim().min(2).max(160),
  phone: z.string().trim().min(10).max(30),
  email: z.string().trim().email(),
  city: z.string().trim().min(2).max(80),
  address: z.string().trim().min(5).max(300),
  creditDays: z.coerce.number().int().min(0).max(365).optional(),
  creditLimit: money,
  openingBalance: money,
  status: z.enum(["ACTIVE", "INACTIVE", "BLACKLISTED"]),
  notes: z.string().trim().max(500),
});

export const customerSchema = baseCustomerSchema;
export const customerEditSchema = baseCustomerSchema.omit({ openingBalance: true });

export type CustomerInput = z.infer<typeof customerSchema>;
export type CustomerEditInput = z.infer<typeof customerEditSchema>;
