import { describe, expect, it } from "vitest";
import { suggestedCashierShare } from "@/lib/restaurant/cashier-split-helper";

describe("Cashier quick split amounts never auto-post a payment", () => {
  it("suggests exact cent-safe portions and leaves remainder to the final receipt", () => {
    expect(suggestedCashierShare(100, 1)).toBe(100);
    expect(suggestedCashierShare(100, 2)).toBe(50);
    expect(suggestedCashierShare(100, 3)).toBe(33.33);
    expect(suggestedCashierShare(100, 4)).toBe(25);
    expect(suggestedCashierShare(100.01, 3)).toBe(33.33);
    expect(suggestedCashierShare(0, 3)).toBe(0);
  });
  it("rejects impossible split sizes", () => {
    expect(() => suggestedCashierShare(500, 0)).toThrow();
    expect(() => suggestedCashierShare(500, 2.5)).toThrow();
    expect(() => suggestedCashierShare(500, 13)).toThrow();
  });
});
