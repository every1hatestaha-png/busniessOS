import { Prisma } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  query: vi.fn().mockResolvedValue([{ todaySales: 8500, todayOrders: 76, liveOrders: 0, pendingWhatsapp: 0, readyOrders: 0 }]),
  workspace: vi.fn().mockResolvedValue({ timezone: "Asia/Karachi" }),
}));
vi.mock("@/lib/server/db", () => ({ db: {
  $queryRaw: mocks.query,
  workspace: { findUnique: mocks.workspace },
} }));
vi.mock("@/lib/server/industry-modules", () => ({ requireWorkspaceModule: vi.fn() }));

describe("Restaurant manager completed sales respect returns", () => {
  it("queries net revenue after returns, including compensating reversals", async () => {
    const { getRestaurantWorkspaceMetrics } = await import("@/lib/server/restaurant-workspace");
    const metrics = await getRestaurantWorkspaceMetrics("2002f828-dbc8-4f2a-bfec-b32f35043144");
    expect(metrics.todaySales).toBe(8500);
    const call = mocks.query.mock.calls.at(-1)!;
    const query = Prisma.sql(call[0], ...call.slice(1)).text;
    expect(query).toContain('FROM "restaurant_returns" rr');
    expect(query).toContain('rr."workspaceId"=ro."workspaceId"');
    expect(query).toContain('rr."restaurantOrderId"=ro."id"');
    expect(query).toContain('ro."status"=\'COMPLETED\'');
    expect(query).toContain('ro."completedAt" >=');
    expect(query).not.toContain('SUM("total") FILTER');
  });
});
