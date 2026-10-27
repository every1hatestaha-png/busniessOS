import { describe, expect, it } from "vitest";
import { KITCHEN_TICKET_BATCH_LIMIT, kitchenVisibleCount } from "@/lib/restaurant/kitchen-queue";

describe("kitchen FIFO fairness and queue counts", () => {
  it("caps all three columns to a safe 225 combined kitchen lines", () => {
    expect(KITCHEN_TICKET_BATCH_LIMIT).toBe(75);
    expect(KITCHEN_TICKET_BATCH_LIMIT * 3).toBeLessThanOrEqual(250);
  });
  it("marks a capped count as at least the visible limit", () => {
    expect(kitchenVisibleCount(0)).toBe("0");
    expect(kitchenVisibleCount(7)).toBe("7");
    expect(kitchenVisibleCount(74)).toBe("74");
    expect(kitchenVisibleCount(75)).toBe("75+");
    expect(kitchenVisibleCount(100)).toBe("75+");
  });
  it("fails safely on non-finite and invalid counts", () => {
    expect(kitchenVisibleCount(-1)).toBe("0");
    expect(kitchenVisibleCount(NaN)).toBe("0");
    expect(kitchenVisibleCount(2.5)).toBe("0");
  });
});
