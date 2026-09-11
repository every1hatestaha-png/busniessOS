import { z } from "zod";

const money = z.string().trim().regex(/^\d+(\.\d{1,2})?$/, "Enter a valid non-negative amount");

const baseCustomerSchema = z.object({
  name: z.string().trim().min(2, "Customer name must be at least 2 characters").max(120, "Customer name is too long"),
  companyName: z.string().trim().min(2, "Company name must be at least 2 characters").max(160, "Company name is too long"),
  phone: z.string().trim().min(10, "Enter a valid phone number").max(30, "Phone number is too long"),
  email: z.string().trim().email("Enter a valid email address"),
  city: z.string().trim().min(2, "City must be at least 2 characters").max(80, "City name is too long"),
  address: z.string().trim().min(5, "Address must be at least 5 characters").max(300, "Address is too long"),
  creditDays: z.coerce.number().int("Credit days must be a whole number").min(0, "Credit days cannot be negative").max(365, "Credit days cannot exceed 365").optional(),
  creditLimit: money,
  openingBalance: money,
  status: z.enum(["ACTIVE", "INACTIVE", "BLACKLISTED"]),
  notes: z.string().trim().max(500, "Notes cannot exceed 500 characters"),
});

export const customerSchema = baseCustomerSchema;
export const customerEditSchema = baseCustomerSchema.omit({ openingBalance: true });

export type CustomerInput = z.infer<typeof customerSchema>;
export type CustomerEditInput = z.infer<typeof customerEditSchema>;
