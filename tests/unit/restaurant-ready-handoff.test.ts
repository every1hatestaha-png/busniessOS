import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ query: vi.fn(), module: vi.fn() }));
vi.mock("@/lib/server/db", () => ({ db: { $queryRaw: mocks.query } }));
vi.mock("@/lib/server/industry-modules", () => ({
  IndustryDomainError: class IndustryDomainError extends Error {
    constructor(readonly code: string, message: string) { super(message); }
  },
  requireWorkspaceModule: mocks.module,
}));
const orderId = "22222222-2222-4222-8222-222222222222";
beforeEach(() => {
  vi.clearAllMocks();
  mocks.module.mockResolvedValue(undefined);
  mocks.query.mockResolvedValue([{ orderId, readyAt: new Date("2026-11-01T10:00:00Z") }]);
});

describe("Price-free, tenant-scoped Kitchen to Cashier handoff", () => {
  it("queries only actual READY ticket evidence within one workspace", async () => {
    const { listRestaurantReadyAtByOrderIds } = await import("@/lib/server/restaurant-ready-handoff");
    const result = await listRestaurantReadyAtByOrderIds("synthetic-tenant", [orderId, orderId]);
    expect(result.get(orderId)?.toISOString()).toBe("2026-11-01T10:00:00.000Z");
    expect(mocks.module).toHaveBeenCalledWith("synthetic-tenant", "restaurant");
    expect(mocks.query).toHaveBeenCalledTimes(1);
    const sql = Array.from(mocks.query.mock.calls[0][0] as TemplateStringsArray).join(" ");
    expect(sql).toContain('ro."workspaceId"=');
    expect(sql).toContain('kt."workspaceId"=ro."workspaceId"');
    expect(sql).toContain('kt."readyAt"');
    expect(sql).not.toContain('"total"');
    expect(sql).not.toContain('"customerPhone"');
    expect(sql).not.toContain('"customerName"');
    expect(sql).not.toContain('"paymentStatus"');
  });

  it("refuses unbounded or malformed handoff selections", async () => {
    const { listRestaurantReadyAtByOrderIds } = await import("@/lib/server/restaurant-ready-handoff");
    await expect(listRestaurantReadyAtByOrderIds("synthetic-tenant", ["not-valid"]))
      .rejects.toThrow("selection is invalid");
    const ids = Array.from({ length: 61 }, (_, i) =>
      `22222222-2222-4222-8222-${String(i).padStart(12, "0")}`);
    await expect(listRestaurantReadyAtByOrderIds("synthetic-tenant", ids))
      .rejects.toThrow("selection is invalid");
    expect(mocks.query).not.toHaveBeenCalled();
  });


  it("applies kitchen-ready fairness in SQL before the queue limit", async () => {
    const { Prisma } = await import("@prisma/client");
    const { listRestaurantOrders } = await import("@/lib/server/restaurant-workspace");
    mocks.query.mockResolvedValueOnce([]);
    await listRestaurantOrders("synthetic-tenant", 60, {
      statuses: ["READY"], readyHandoffFirst: true,
    });
    const call = mocks.query.mock.calls.at(-1)!;
    const sql = Prisma.sql(call[0], ...call.slice(1)).text;
    expect(sql).toContain('MAX(kt."readyAt")');
    expect(sql).toContain('kt."workspaceId"=ro."workspaceId"');
    expect(sql).toContain('kt."restaurantOrderId"=ro."id"');
    expect(sql).toContain("'infinity'::timestamptz");
    expect(sql.indexOf('MAX(kt."readyAt")')).toBeLessThan(sql.indexOf("LIMIT"));
    expect(sql).toContain('ro."workspaceId"=');
    mocks.query.mockClear();
    await expect(listRestaurantOrders("synthetic-tenant", 60, {
      statuses: ["CONFIRMED"], readyHandoffFirst: true,
    })).rejects.toThrow("requires only READY orders");
    expect(mocks.query).not.toHaveBeenCalled();
  });

  it("prioritizes actual Kitchen ready timestamp without mutating the original order list", async () => {
    const { sortReadyOrderQueue } = await import("@/lib/server/restaurant-ready-handoff");
    const orders = [
      { id: "old-order", createdAt: new Date("2026-11-01T08:00:00Z") },
      { id: "new-order", createdAt: new Date("2026-11-01T09:00:00Z") },
      { id: "no-kot-time", createdAt: new Date("2026-11-01T07:00:00Z") },
    ];
    const times = new Map([
      ["old-order", new Date("2026-11-01T10:00:00Z")],
      ["new-order", new Date("2026-11-01T09:30:00Z")],
    ]);
    expect(sortReadyOrderQueue(orders, times).map(o => o.id))
      .toEqual(["new-order", "old-order", "no-kot-time"]);
    expect(orders[0].id).toBe("old-order");
  });

  it("flags actual service delays, never guesses missing kitchen times", async () => {
    const { readyForServiceLabel } = await import("@/lib/server/restaurant-ready-handoff");
    const now = new Date("2026-11-01T10:20:00Z");
    expect(readyForServiceLabel(undefined, now)).toEqual({ label: "Ready, time unavailable", delayed: false });
    expect(readyForServiceLabel(new Date("2026-11-01T10:20:00Z"), now)).toEqual({ label: "Ready just now", delayed: false });
    expect(readyForServiceLabel(new Date("2026-11-01T10:11:00Z"), now)).toEqual({ label: "Ready for 9 min", delayed: false });
    expect(readyForServiceLabel(new Date("2026-11-01T10:10:00Z"), now)).toEqual({ label: "Ready for 10 min", delayed: true });
  });
});
