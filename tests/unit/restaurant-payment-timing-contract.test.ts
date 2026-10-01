import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const actions = readFileSync("app/(dashboard)/restaurant/v1-actions.ts", "utf8");
const immediateService = readFileSync("lib/server/restaurant-payments-immediate.ts", "utf8");

describe("restaurant V1.7 payment timing production contract", () => {
  it("routes the restaurant payment action only through immediate collection posting", () => {
    expect(actions).toContain('from "@/lib/server/restaurant-payments-immediate"');
    expect(actions).toContain("recordRestaurantPaymentAtCollection(contextFrom(workspace)");
    expect(actions).not.toContain("recordRestaurantPayment(contextFrom(workspace)");
  });

  it("posts the receipt and postedAt inside the same serializable service", () => {
    expect(immediateService).toContain("postCustomerPaymentToGeneralLedger");
    expect(immediateService).toContain('SET "postedAt"=CURRENT_TIMESTAMP');
    expect(immediateService).toContain('RETURNING "postedAt"');
    expect(immediateService).not.toContain('SET "postedAt"=${postedAt}');
    expect(immediateService).toContain("withSerializableRetry");
    expect(immediateService).toContain('collectionTiming: "IMMEDIATE"');
  });

  it("calculates payment capacity from net returns and refund allocations", () => {
    expect(immediateService).toContain('FROM "restaurant_returns"');
    expect(immediateService).toContain('FROM "restaurant_return_payment_allocations"');
    expect(immediateService).toContain("Restaurant payment exceeds the net outstanding order balance.");
  });
});
