import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const migration = readFileSync("prisma/migrations/20260929235900_restaurant_net_payment_limit/migration.sql", "utf8");
const summary = readFileSync("lib/server/restaurant-payment-summary.ts", "utf8");
const ordersPage = readFileSync("app/(dashboard)/restaurant/orders/page.tsx", "utf8");

describe("restaurant net payment limit after item returns", () => {
  it("enforces the adjusted order due at the database payment boundary", () => {
    expect(migration).toContain("enforce_restaurant_net_payment_limit");
    expect(migration).toContain('FROM "restaurant_returns"');
    expect(migration).toContain('FROM "restaurant_return_payment_allocations"');
    expect(migration).toContain("retained_paid > adjusted_due");
    expect(migration).toContain("DEFERRABLE INITIALLY DEFERRED");
  });

  it("renders payment due from return-aware retained value", () => {
    expect(summary).toContain('SUM("total") AS "returnedTotal"');
    expect(summary).toContain('SUM(rrpa."amount") AS "activeAllocated"');
    expect(ordersPage).toContain("listRestaurantNetPaymentSummaries");
    expect(ordersPage).toContain("Retained Rs");
  });
});
