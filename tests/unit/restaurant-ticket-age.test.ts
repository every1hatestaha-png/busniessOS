import { describe, expect, it } from "vitest";
import { kitchenDelayedCount, kitchenTicketAge } from "@/lib/restaurant/ticket-age";

const now = new Date("2026-11-01T12:00:00.000Z");
const minutesAgo = (minutes: number) => new Date(now.getTime() - minutes * 60_000);

describe("Restaurant kitchen ticket age is operational, not financial", () => {
  it("uses age since order placement, with clear delay thresholds", () => {
    expect(kitchenTicketAge(minutesAgo(0), now)).toEqual({ minutes: 0, label: "Just ordered", tone: "fresh" });
    expect(kitchenTicketAge(minutesAgo(9), now).tone).toBe("fresh");
    expect(kitchenTicketAge(minutesAgo(10), now)).toEqual({ minutes: 10, label: "10 min since order", tone: "watch" });
    expect(kitchenTicketAge(minutesAgo(19), now).tone).toBe("watch");
    expect(kitchenTicketAge(minutesAgo(20), now)).toEqual({ minutes: 20, label: "20 min since order", tone: "delayed" });
    expect(kitchenTicketAge(minutesAgo(65), now).label).toBe("1h 5m since order");
  });

  it("does not report negative durations and handles malformed inputs", () => {
    expect(kitchenTicketAge(minutesAgo(-5), now).minutes).toBe(0);
    expect(kitchenTicketAge("bad date", now).label).toBe("Time unavailable");
  });

  it("counts delayed open tickets within the passed visible set", () => {
    const orders = [9, 15, 20, 40].map(mins => ({ createdAt: minutesAgo(mins) }));
    expect(kitchenDelayedCount(orders, now)).toBe(2);
    expect(kitchenDelayedCount([], now)).toBe(0);
  });
});
