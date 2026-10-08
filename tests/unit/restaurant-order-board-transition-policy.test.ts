import { describe, expect, it } from "vitest";
import { canShowOrderBoardTransition } from "@/lib/restaurant/order-board-transition-policy";

describe("Restaurant order board mirrors server-side completion authorization", () => {
  it.each(["OWNER", "ADMIN", "MANAGER"] as const)(
    "permits %s to finalize READY orders and advance production",
    (role) => {
      expect(canShowOrderBoardTransition(role, "POS", "COMPLETED")).toBe(true);
      expect(canShowOrderBoardTransition(role, "KITCHEN", "COMPLETED")).toBe(true);
      expect(canShowOrderBoardTransition(role, "ALL", "READY")).toBe(true);
      expect(canShowOrderBoardTransition(role, "POS", "PREPARING")).toBe(true);
    },
  );

  it("never offers financially terminal completion to cashier, kitchen or legacy ALL STAFF", () => {
    for (const station of ["POS", "KITCHEN", "ALL", "UNKNOWN"]) {
      expect(canShowOrderBoardTransition("STAFF", station, "COMPLETED")).toBe(false);
    }
  });

  it("does not suggest kitchen preparation controls on the cashier order board", () => {
    expect(canShowOrderBoardTransition("STAFF", "POS", "PREPARING")).toBe(false);
    expect(canShowOrderBoardTransition("STAFF", "POS", "READY")).toBe(false);
    expect(canShowOrderBoardTransition("STAFF", "KITCHEN", "PREPARING")).toBe(false);
    expect(canShowOrderBoardTransition("STAFF", "KITCHEN", "READY")).toBe(false);
  });

  it("preserves legacy ALL station production capabilities without expanding completion rights", () => {
    expect(canShowOrderBoardTransition("STAFF", "ALL", "PREPARING")).toBe(true);
    expect(canShowOrderBoardTransition("STAFF", "ALL", "READY")).toBe(true);
    expect(canShowOrderBoardTransition("STAFF", "ALL", "COMPLETED")).toBe(false);
  });
  it("fails closed for any unsupported or non-actionable order transition", () => {
    for (const status of ["PENDING_REVIEW", "CONFIRMED", "CANCELLED"] as const) {
      expect(canShowOrderBoardTransition("OWNER", "ALL", status)).toBe(false);
      expect(canShowOrderBoardTransition("STAFF", "ALL", status)).toBe(false);
    }
  });

});
