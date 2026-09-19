import { z } from "zod";

import { MAX_CONTACT_PHONES, splitContactPhones } from "@/lib/contact-phones";

const money = z.string().trim().regex(/^\d+(\.\d{1,2})?$/, "Enter a valid non-negative amount");

const customerPhones = z.string().trim().min(10, "Enter at least one valid phone number").max(220, "Phone numbers are too long").superRefine((value, ctx) => {
  const phones = splitContactPhones(value, MAX_CONTACT_PHONES + 1);
  if (!phones.length) {
    ctx.addIssue({ code: "custom", message: "Enter at least one valid phone number" });
    return;
  }
  if (phones.length > MAX_CONTACT_PHONES) {
    ctx.addIssue({ code: "custom", message: `You can save up to ${MAX_CONTACT_PHONES} phone numbers per customer` });
    return;
  }
  for (const phone of phones) {
    const digits = phone.replace(/\D/g, "");
    if (digits.length < 10 || digits.length > 15) {
      ctx.addIssue({ code: "custom", message: `Check phone number: ${phone}` });
      return;
    }
  }
});

const baseCustomerSchema = z.object({
  name: z.string().trim().min(2, "Customer name must be at least 2 characters").max(120, "Customer name is too long"),
  companyName: z.string().trim().min(2, "Company name must be at least 2 characters").max(160, "Company name is too long"),
  phone: customerPhones,
  email: z.string().trim().email("Enter a valid email address"),
  city: z.string().trim().min(2, "City must be at least 2 characters").max(80, "City name is too long"),
  address: z.string().trim().min(5, "Address must be at least 5 characters").max(300, "Address is too long"),
  taxId: z.string().trim().max(40, "NTN/CNIC is too long").optional().default(""),
  province: z.string().trim().max(80, "Province is too long").optional().default(""),
  registrationType: z.enum(["Registered", "Unregistered"]).or(z.literal("")).optional().default(""),
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
