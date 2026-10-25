import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { CASHIER_QUEUE_LIMIT, cashierQueueLabel } from "@/lib/restaurant/cashier-queue";

const mocks = vi.hoisted(() => ({
  listOrders: vi.fn(),
  listPayments: vi.fn(),
  listSummaries: vi.fn(),
  listAccounts: vi.fn(),
}));

vi.mock("@/lib/server/auth", () => ({
  requireWorkspace: async () => ({
    workspaceId: "cashier-fixture", role: "STAFF", user: { id: "cashier-user" },
    workspace: { name: "Cashier Kitchen Handoff" },
  }),
}));
vi.mock("@/lib/server/restaurant-stations", () => ({ assertRestaurantStation: vi.fn() }));
vi.mock("@/lib/server/restaurant-workspace", () => ({ listRestaurantOrders: mocks.listOrders }));
vi.mock("@/lib/server/restaurant-integrity", () => ({ listRestaurantPayments: mocks.listPayments }));
vi.mock("@/lib/server/restaurant-payment-summary", () => ({
  listRestaurantNetPaymentSummaries: mocks.listSummaries,
}));
vi.mock("@/lib/server/accounting", () => ({ getCashBankAccounts: mocks.listAccounts }));
vi.mock("@/components/restaurant/station-auto-refresh", () => ({
  RestaurantStationAutoRefresh: () => null,
}));
vi.mock("@/app/(dashboard)/restaurant/orders/cashier-payment-form", () => ({
  CashierPaymentForm: () => null,
}));
vi.mock("@/app/(dashboard)/restaurant/mutation-form", () => ({
  RestaurantMutationForm: ({ children }: { children: React.ReactNode }) => React.createElement("div", null, children),
}));
vi.mock("@/app/(dashboard)/restaurant/v1-actions", () => ({
  confirmRestaurantOrderAction: vi.fn(),
  transitionRestaurantOrderAction: vi.fn(),
  voidRestaurantPaymentAction: vi.fn(),
}));

function order(id: string, status: string) {
  return {
    id, orderNumber: id, status, source: "POS", fulfillmentType: "TAKEAWAY",
    paymentStatus: "UNPAID", total: 100, customerName: null, customerPhone: null,
    tableName: null, createdAt: new Date("2026-10-25T09:00:00Z"), notes: null,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.listAccounts.mockResolvedValue([]);
  mocks.listPayments.mockResolvedValue([]);
  mocks.listSummaries.mockResolvedValue([]);
  mocks.listOrders.mockImplementation(async (_workspaceId: string, _limit: number, options: { statuses: string[] }) => {
    if (options.statuses[0] === "CONFIRMED") {
      return Array.from({ length: CASHIER_QUEUE_LIMIT }, (_, i) => order(`CONFIRMED-${i}`, "CONFIRMED"));
    }
    if (options.statuses[0] === "READY") return [order("READY-FROM-KITCHEN", "READY")];
    return [];
  });
});

describe("Cashier board queue starvation protection", () => {
  it("keeps four stage reads independent and surfaces READY even behind 60 confirmed orders", async () => {
    const { default: CashierOrders } = await import("@/app/(dashboard)/restaurant/orders/page");
    const html = renderToStaticMarkup(await CashierOrders());
    expect(html).toContain("READY-FROM-KITCHEN");
    expect(html).toContain("Complete order");
    expect(html).toContain("CONFIRMED-0");
    expect(html).toContain("60+");
    expect(html).toContain("Showing oldest first");
    for (const status of ["PENDING_REVIEW", "CONFIRMED", "PREPARING", "READY"]) {
      expect(mocks.listOrders).toHaveBeenCalledWith("cashier-fixture", CASHIER_QUEUE_LIMIT,
        { statuses: [status], oldestFirst: true });
    }
    expect(mocks.listOrders).toHaveBeenCalledWith("cashier-fixture", 200,
      { statuses: ["COMPLETED"], oldestFirst: true, outstandingOnly: true });
    const requested = mocks.listPayments.mock.calls[0][1] as string[];
    expect(requested).toHaveLength(CASHIER_QUEUE_LIMIT + 1);
    expect(requested).toContain("READY-FROM-KITCHEN");
    expect(mocks.listSummaries).toHaveBeenCalledWith("cashier-fixture", requested);
  });

  it("respects bounded payments scope and clearly labels capped status count", () => {
    expect(4 * CASHIER_QUEUE_LIMIT + 30 + 200).toBeLessThanOrEqual(500);
    expect(cashierQueueLabel(59)).toBe("59");
    expect(cashierQueueLabel(60)).toBe("60+");
    expect(cashierQueueLabel(100)).toBe("60+");
    expect(cashierQueueLabel(NaN)).toBe("0");
  });
});
