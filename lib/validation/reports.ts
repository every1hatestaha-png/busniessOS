import { z } from "zod";

const optionalDate = z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/).optional();

export const periodQuerySchema = z.object({
  from: optionalDate,
  to: optionalDate,
  search: z.string().trim().max(120).optional(),
}).refine((period) => !period.from || !period.to || period.from <= period.to, { path: ["to"], message: "End date must be on or after start date." });

export const agingQuerySchema = z.object({
  asOf: optionalDate,
  search: z.string().trim().max(120).optional(),
  partyId: z.string().uuid().optional(),
  bucket: z.enum(["current", "1-30", "31-45", "46-60", "61+"]).optional(),
});

export const statementQuerySchema = periodQuerySchema.extend({
  partyId: z.string().uuid().optional(),
});

export const inventoryMovementQuerySchema = periodQuerySchema.extend({
  productId: z.string().uuid().optional(),
  type: z.string().trim().max(40).optional(),
});

export function parseDate(value: string | undefined, fallback: Date, endOfDay = false) {
  if (!value) return fallback;
  const date = new Date(`${value}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}+05:00`);
  return Number.isNaN(date.getTime()) ? fallback : date;
}

export function dateInputValue(date: Date | string) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Karachi", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(date));
}
