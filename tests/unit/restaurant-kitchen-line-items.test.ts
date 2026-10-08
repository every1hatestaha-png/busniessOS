import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  module: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/server/db", () => ({ db: { $queryRaw: mocks.query } }));
vi.mock("@/lib/server/industry-modules", () => ({
  requireWorkspaceModule: mocks.module,
  IndustryDomainError: class IndustryDomainError extends Error {},
}));
vi.mock("@/lib/server/restaurant-table-settlement", () => ({
  releaseRestaurantTableIfSettled: vi.fn(),
}));
vi.mock("@/lib/server/audit", () => ({ writeAudit: vi.fn() }));

import { listRestaurantKitchenItems } from "@/lib/server/restaurant-workspace";

const workspaceId = "11111111-1111-4111-8111-111111111111";
const orderId = "22222222-2222-4222-8222-222222222222";

describe("Restaurant kitchen dish lines", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.module.mockResolvedValue(undefined);
    mocks.query.mockResolvedValue([]);
  });

  it("returns an empty map without querying when there are no orders", async () => {
    expect((await listRestaurantKitchenItems(workspaceId, [])).size).toBe(0);
    expect(mocks.query).not.toHaveBeenCalled();
  });

  it("loads dish names and modifiers while omitting pricing and customer data", async () => {
    mocks.query.mockResolvedValue([
      { restaurantOrderId: orderId, itemName: "Chicken burger", quantity: "2", notes: "No onion", modifiers: ["Extra cheese", 42] },
    ]);
    const data = await listRestaurantKitchenItems(workspaceId, [orderId]);
    expect(data.get(orderId)).toEqual([{
      itemName: "Chicken burger", quantity: 2, notes: "No onion", modifiers: ["Extra cheese"],
    }]);
    const queryArgs = mocks.query.mock.calls[0][0];
    expect(JSON.stringify(queryArgs)).toContain("restaurant_order_items");
    expect(JSON.stringify(queryArgs)).toContain("workspaceId");
    expect(JSON.stringify(queryArgs)).not.toContain("customerPhone");
    expect(JSON.stringify(queryArgs)).not.toContain("unitPrice");
  });

  it("rejects an invalid order identifier before database queries", async () => {
    await expect(listRestaurantKitchenItems(workspaceId, ["../../foreign"]))
      .rejects.toThrow("Restaurant order is invalid.");
    expect(mocks.query).not.toHaveBeenCalled();
  });
});
