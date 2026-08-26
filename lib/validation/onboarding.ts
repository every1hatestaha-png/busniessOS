import { z } from "zod";

export const onboardingSchema = z.object({
  businessName: z.string().trim().min(2).max(120),
  ownerName: z.string().trim().min(2).max(120),
  phone: z.string().trim().min(10).max(30),
  email: z.string().trim().email(),
  address: z.string().trim().min(5).max(300),
  city: z.string().trim().min(2).max(80),
  country: z.string().trim().min(2).max(80).default("Pakistan"),
  currency: z.string().trim().length(3).default("PKR"),
  timezone: z.string().trim().min(3).max(80).default("Asia/Karachi"),
  businessType: z.enum(["WHOLESALER", "DISTRIBUTOR", "MANUFACTURER", "RETAILER", "OTHER"]),
});

export type OnboardingInput = z.input<typeof onboardingSchema>;
