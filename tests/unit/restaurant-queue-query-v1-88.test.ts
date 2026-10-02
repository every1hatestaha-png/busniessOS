import { Prisma } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ query: vi.fn().mockResolvedValue([]) }));
vi.mock("@/lib/server/db", () => ({ db: { $queryRaw: mocks.query } }));
vi.mock("@/lib/server/industry-modules", () => ({ requireWorkspaceModule: vi.fn() }));

describe("Restaurant V1.88 operational queue query", () => {
  it("filters kitchen statuses before applying the history limit", async () => {
    const { listRestaurantOrders } = await import("@/lib/server/restaurant-workspace");
    const list = listRestaurantOrders as (workspace: string, limit: number, options: { statuses: string[]; oldestFirst: boolean }) => ReturnType<typeof listRestaurantOrders>;
    await list("synthetic-workspace", 200, { statuses: ["CONFIRMED", "PREPARING", "READY"], oldestFirst: true });
    const call = mocks.query.mock.calls.at(-1)!;
    const sql = Prisma.sql(call[0], ...call.slice(1)).text;
    expect(sql).toContain('ro."status" IN');
    expect(sql.indexOf('ro."status" IN')).toBeLessThan(sql.indexOf("LIMIT"));
    expect(sql).toMatch(/ORDER BY ro\."createdAt" ASC/);
  });
  it("filters net unpaid completed orders before applying the history limit", async () => {
    const { listRestaurantOrders } = await import("@/lib/server/restaurant-workspace");
    const list = listRestaurantOrders as (workspace: string, limit: number, options: { statuses: string[]; oldestFirst: boolean; outstandingOnly: boolean }) => ReturnType<typeof listRestaurantOrders>;
    await list("synthetic-workspace", 200, { statuses: ["COMPLETED"], oldestFirst: true, outstandingOnly: true });
    const call = mocks.query.mock.calls.at(-1)!;
    const sql = Prisma.sql(call[0], ...call.slice(1)).text;
    expect(sql).toContain('restaurant_order_net_outstanding(ro."id", ro."workspaceId") > 0');
    expect(sql.indexOf("restaurant_order_net_outstanding")).toBeLessThan(sql.indexOf("LIMIT"));
  });
});
