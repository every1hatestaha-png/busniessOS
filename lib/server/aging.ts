import "server-only";

export type PayablesBucket = "1-30" | "31-45" | "46-60" | "61+";
export type ReceivablesBucket = "1-30" | "31-60" | "61-90" | "90+";

export const PAYABLES_BUCKET_ORDER: PayablesBucket[] = ["1-30", "31-45", "46-60", "61+"];
export const RECEIVABLES_BUCKET_ORDER: ReceivablesBucket[] = ["1-30", "31-60", "61-90", "90+"];

export function startOfDayInTimezone(date: Date, timeZone: string): Date {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value);
  // Build a UTC Date at local noon to avoid any DST/UTC boundary skew; we only
  // use the calendar date so the time-of-day is irrelevant to the day count.
  return new Date(Date.UTC(get("year"), get("month") - 1, get("day"), 12, 0, 0, 0));
}

/**
 * Calendar-day difference between `start` and `asOf` in the given business
 * timezone. Both instants are normalized to the start of their calendar day in
 * the business timezone, so a purchase made just before/after a UTC midnight
 * boundary is not misclassified (e.g. a 2026-08-29 purchase does not become 1
 * day old merely because UTC crossed midnight differently).
 *
 * Returns 0 for today, positive for dates in the past, negative for future dates.
 */
export function ageDays(start: Date, asOf: Date, timeZone: string): number {
  const startDay = startOfDayInTimezone(start, timeZone);
  const asOfDay = startOfDayInTimezone(asOf, timeZone);
  return Math.round((asOfDay.getTime() - startDay.getTime()) / 86_400_000);
}

export function payablesBucket(age: number): PayablesBucket | "current" {
  if (age <= 0) return "current";
  if (age <= 30) return "1-30";
  if (age <= 45) return "31-45";
  if (age <= 60) return "46-60";
  return "61+";
}

export function receivablesBucket(age: number): ReceivablesBucket | "current" {
  if (age <= 0) return "current";
  if (age <= 30) return "1-30";
  if (age <= 60) return "31-60";
  if (age <= 90) return "61-90";
  return "90+";
}

export const DEFAULT_BUSINESS_TIMEZONE = "Asia/Karachi";
