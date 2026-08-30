import { describe, expect, it } from "vitest";

import { ageDays, payablesBucket, receivablesBucket, startOfDayInTimezone } from "@/lib/server/aging";

const TZ = "Asia/Karachi";

function date(y: number, m: number, d: number): Date {
  // A fixed instant on the given calendar date; time-of-day should not affect aging.
  return new Date(Date.UTC(y, m - 1, d, 13, 0, 0, 0));
}

describe("ageDays", () => {
  it("is 0 when the purchase is created today", () => {
    expect(ageDays(date(2026, 8, 29), date(2026, 8, 29), TZ)).toBe(0);
  });

  it("is 1 for a purchase one calendar day earlier", () => {
    expect(ageDays(date(2026, 8, 28), date(2026, 8, 29), TZ)).toBe(1);
  });

  it("counts calendar days across month and year boundaries", () => {
    expect(ageDays(date(2026, 6, 10), date(2026, 8, 29), TZ)).toBe(80);
    expect(ageDays(date(2025, 12, 31), date(2026, 1, 1), TZ)).toBe(1);
  });

  it("does not age when the purchase is later than the asOf date", () => {
    expect(ageDays(date(2026, 8, 29), date(2026, 8, 28), TZ)).toBe(-1);
  });

  it("is not affected by the time-of-day of either date", () => {
    // Consecutive Karachi calendar days (Aug 29 23:00 Asia/Karachi -> Aug 30).
    const early = new Date("2026-08-29T18:00:00Z"); // Aug 29 23:00 in Asia/Karachi
    const late = new Date("2026-08-30T00:00:00Z"); // Aug 30 05:00 in Asia/Karachi
    expect(ageDays(early, late, TZ)).toBe(1);
  });

  it("returns 0 for instants on the same Karachi calendar day even across a UTC midnight boundary", () => {
    // Both are Aug 29 in Asia/Karachi (UTC+5) even though they are different UTC days.
    const beforeUtcMidnight = new Date("2026-08-28T20:00:00Z"); // Aug 29 01:00 Asia/Karachi
    const afterUtcMidnight = new Date("2026-08-29T10:00:00Z"); // Aug 29 15:00 Asia/Karachi
    expect(ageDays(beforeUtcMidnight, afterUtcMidnight, TZ)).toBe(0);
  });
});

describe("startOfDayInTimezone", () => {
  it("normalizes to the start of the calendar day in the business timezone", () => {
    const utc = new Date("2026-08-29T10:00:00Z"); // 15:00 on Aug 29 in Asia/Karachi
    const day = startOfDayInTimezone(utc, TZ);
    expect(day.toISOString().startsWith("2026-08-29")).toBe(true);
    expect(day.getUTCHours()).toBe(12);
  });
});

describe("payablesBucket", () => {
  it.each([
    [0, "current"],
    [1, "1-30"],
    [30, "1-30"],
    [31, "31-45"],
    [45, "31-45"],
    [46, "46-60"],
    [60, "46-60"],
    [61, "61+"],
    [75, "61+"],
    [365, "61+"],
    [1000, "61+"],
    [-5, "current"],
  ] as const)("classifies %i days as %s", (age, expected) => {
    expect(payablesBucket(age)).toBe(expected);
  });

  it("covers every required boundary example", () => {
    expect(payablesBucket(29)).toBe("1-30");
    expect(payablesBucket(41)).toBe("31-45");
    expect(payablesBucket(48)).toBe("46-60");
    expect(payablesBucket(75)).toBe("61+");
  });
});

describe("receivablesBucket", () => {
  it.each([
    [0, "current"],
    [1, "1-30"],
    [30, "1-30"],
    [31, "31-45"],
    [45, "31-45"],
    [46, "46-60"],
    [60, "46-60"],
    [61, "61+"],
    [365, "61+"],
    [-1, "current"],
  ] as const)("classifies %i receivable days as %s", (age, expected) => {
    expect(receivablesBucket(age)).toBe(expected);
  });
});
