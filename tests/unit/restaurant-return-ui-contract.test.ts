import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const actions = readFileSync("app/(dashboard)/restaurant/v1-actions.ts", "utf8");
const ordersPage = readFileSync("app/(dashboard)/restaurant/orders/page.tsx", "utf8");
const returnPage = readFileSync("app/(dashboard)/restaurant/orders/[id]/return/page.tsx", "utf8");
const returnUi = readFileSync("lib/server/restaurant-return-ui.ts", "utf8");

describe("restaurant item return UI boundary", () => {
  it("does not trust a browser-supplied refund amount", () => {
    expect(returnPage).not.toContain('name="refundAmount"');
    expect(actions).not.toContain('formData.get("refundAmount")');
    expect(actions).toContain("prepareRestaurantSingleItemReturn");
    expect(actions).toContain("paymentAllocations: prepared.paymentAllocations");
  });

  it("keeps manager authorization on the server action", () => {
    expect(actions).toContain("if (!canManageRestaurant(workspace.role))");
    expect(actions).toContain("Manager access is required for restaurant returns.");
  });

  it("keeps restock explicit and off by default", () => {
    expect(returnPage).toContain('name="restock"');
    expect(returnPage).not.toContain("defaultChecked");
    expect(actions).toContain('=== "true"');
  });

  it("recalculates remaining quantities and original-payment capacity server-side", () => {
    expect(returnUi).toContain('COALESCE(SUM(rri."quantity"), 0)');
    expect(returnUi).toContain('COALESCE(SUM(rrpa."amount"), 0)');
    expect(returnUi).toContain('rp."postedAt" IS NOT NULL');
    expect(returnUi).toContain('rp."voidedAt" IS NULL');
  });

  it("links returns only from completed order rows", () => {
    expect(ordersPage).toContain('order.status === "COMPLETED"');
    expect(ordersPage).toContain("Return items");
  });
});
