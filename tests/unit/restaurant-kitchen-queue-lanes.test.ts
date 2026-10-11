import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ orders: vi.fn(), items: vi.fn() }));
vi.mock("@/lib/server/restaurant-workspace", () => ({
  listRestaurantOrders: mocks.orders,
  listRestaurantKitchenItems: mocks.items,
}));
vi.mock("server-only", () => ({}));

import { KITCHEN_LANE_LIMIT, listRestaurantKitchenQueue } from "@/lib/server/restaurant-kitchen-queue";

const workspaceId = "11111111-1111-4111-8111-111111111111";
function tickets(prefix: string, count: number) {
  return Array.from({ length: count }, (_, i) => ({ id: `${prefix}-${i}`, status: prefix }));
}

describe("Restaurant KDS lane fairness", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.orders.mockResolvedValue([]);
    mocks.items.mockResolvedValue(new Map());
  });

  it("never lets 200 READY backlog entries consume the new-order lane", async () => {
    const confirmed = tickets("CONFIRMED", 1);
    const readyBacklog = tickets("READY", 200);
    mocks.orders.mockImplementation(async (_workspaceId: string, limit: number, options: { statuses: string[] }) => {
      const state = options.statuses[0];
      const all = state === "CONFIRMED" ? confirmed : state === "READY" ? readyBacklog : [];
      return all.slice(0, limit);
    });
    const result = await listRestaurantKitchenQueue(workspaceId);
    expect(result.orders.map((order) => order.status)).toContain("CONFIRMED");
    expect(result.orders).toHaveLength(101);
    expect(result.cappedStatuses).toEqual(["Ready"]);
    expect(mocks.orders).toHaveBeenCalledTimes(3);
    for (const state of ["CONFIRMED", "PREPARING", "READY"]) {
      expect(mocks.orders).toHaveBeenCalledWith(workspaceId, KITCHEN_LANE_LIMIT, {
        statuses: [state], oldestFirst: true,
      });
    }
  });

  it("chunks up to 300 line-item IDs without dropping entries after the first 250", async () => {
    mocks.orders.mockImplementation(async (_workspaceId: string, _limit: number, opts: { statuses: string[] }) =>
      tickets(opts.statuses[0]!, KITCHEN_LANE_LIMIT));
    mocks.items.mockImplementation(async (_workspaceId: string, ids: string[]) =>
      new Map(ids.map((id) => [id, [{ itemName: id, quantity: 1, notes: null, modifiers: [] }]])));
    const result = await listRestaurantKitchenQueue(workspaceId);
    expect(result.orders).toHaveLength(300);
    expect(result.kitchenItems.size).toBe(300);
    expect(mocks.items).toHaveBeenCalledTimes(2);
    const batches = mocks.items.mock.calls.map((call) => call[1] as string[]);
    expect(batches.map((batch) => batch.length)).toEqual([250, 50]);
    expect(mocks.items.mock.calls.every((call) => call[0] === workspaceId)).toBe(true);
    expect(result.cappedStatuses).toEqual(["New", "Preparing", "Ready"]);
  });
});
