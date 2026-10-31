import { beforeEach, describe, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => ({
  query: vi.fn(), module: vi.fn(), workspace: vi.fn(),
}));
vi.mock("@/lib/server/db", () => ({
  db: { $queryRaw: mock.query, workspace: { findUnique: mock.workspace } },
}));
vi.mock("@/lib/server/industry-modules", () => ({
  requireWorkspaceModule: mock.module,
}));

beforeEach(() => {
  vi.clearAllMocks();
  mock.module.mockResolvedValue(undefined);
  mock.workspace.mockResolvedValue({ timezone: "Asia/Karachi" });
  mock.query
    .mockResolvedValueOnce([{ prepared: 6n, meanMinutes: 11.5, p90Minutes: 19.5,
      delayed20: 1n, fastestMinutes: 2.0, slowestMinutes: 22.0 }])
    .mockResolvedValueOnce([{ waiting: 2n, preparing: 3n, ready: 1n,
      waitingOver10: 1n, preparingOver20: 1n, cancelled: 0n }])
    .mockResolvedValueOnce([{ day: "2026-11-01", prepared: 6n, meanMinutes: 11.5 }]);
});

describe("Kitchen performance is actual tenant-scoped KOT evidence", () => {
  it("reads KOT timestamps, never finance or inferred cooking duration", async () => {
    const { getRestaurantKitchenPerformance } = await import("@/lib/server/restaurant-kitchen-performance");
    const result = await getRestaurantKitchenPerformance("qa-workspace", 7);
    expect(result.prepared).toBe(6);
    expect(result.p90Minutes).toBe(19.5);
    expect(result.preparingOver20).toBe(1);
    expect(result.byDay).toHaveLength(1);
    expect(mock.module).toHaveBeenCalledWith("qa-workspace", "restaurant");
    expect(mock.workspace).toHaveBeenCalledWith({
      where: { id: "qa-workspace" }, select: { timezone: true },
    });
    expect(mock.query).toHaveBeenCalledTimes(3);
    const sql = mock.query.mock.calls
      .map(args => Array.from(args[0] as TemplateStringsArray).join(" "))
      .join("\n");
    expect(sql).toContain('kt."readyAt"');
    expect(sql).toContain('kt."startedAt"');
    expect(sql).toContain('ro."workspaceId"=kt."workspaceId"');
    expect(sql).not.toContain("restaurant_payments");
    expect(sql).not.toContain("general_ledger_entries");
  });
});
