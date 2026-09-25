import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ groupBy: vi.fn(), aggregate: vi.fn(), findMany: vi.fn() }));
vi.mock("@/lib/server/db", () => ({ db: {
  generalLedgerEntry: { groupBy: mocks.groupBy, aggregate: mocks.aggregate },
  account: { findMany: mocks.findMany },
} }));
import { getProfitAndLoss } from "@/lib/server/accounting";

describe("P&L return cancellation classification", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findMany.mockResolvedValue([{ id: "revenue", code: "4000", name: "Sales", category: "INCOME", systemCode: "SALES_REVENUE" }]);
  });

  it("does not count a cancelled return as a new sale", async () => {
    mocks.groupBy.mockResolvedValue([{ accountId: "revenue", _sum: { credit: 605.9, debit: 605.9 } }]);
    mocks.aggregate.mockResolvedValue({ _sum: { credit: 180.4, debit: 0 } });
    const result = await getProfitAndLoss("test-workspace", { from: new Date("2026-09-01"), to: new Date("2026-09-30") });
    expect(result.grossSales).toBe(425.5);
    expect(result.salesReturns).toBe(425.5);
    expect(result.salesRevenue).toBe(0);
    expect(result.netProfit).toBe(0);
    expect(mocks.aggregate).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({
      workspaceId: "test-workspace", sourceType: "REVERSAL",
      date: expect.objectContaining({ gte: expect.any(Date), lte: expect.any(Date) }),
      reversalOf: { workspaceId: "test-workspace", sourceType: "CUSTOMER_RETURN" },
    }) }));
  });

  it("recognizes a prior-period return cancelled in the selected period", async () => {
    mocks.groupBy.mockResolvedValue([{ accountId: "revenue", _sum: { credit: 180.4, debit: 0 } }]);
    mocks.aggregate.mockResolvedValue({ _sum: { credit: 180.4, debit: 0 } });
    const result = await getProfitAndLoss("test-workspace");
    expect(result.grossSales).toBe(0);
    expect(result.salesReturns).toBe(-180.4);
    expect(result.salesRevenue).toBe(180.4);
    expect(result.netProfit).toBe(180.4);
  });
});
