import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  accounts: vi.fn().mockResolvedValue([{ id: "acct-a", name: "Cash Drawer", isBank: false }]),
  initialize: vi.fn().mockResolvedValue(undefined),
  module: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/server/db", () => ({
  db: { cashBankAccount: { findMany: mocks.accounts } },
}));
vi.mock("@/lib/server/accounting", () => ({ ensureDefaultAccounts: mocks.initialize }));
vi.mock("@/lib/server/industry-modules", () => ({ requireWorkspaceModule: mocks.module }));

describe("Restaurant cashier cannot fetch financial account secrets", () => {
  it("queries only settlement account identity, type and name within the tenant", async () => {
    const { listRestaurantCollectionAccountChoices } = await import("@/lib/server/restaurant-payment-accounts");
    const result = await listRestaurantCollectionAccountChoices("synthetic-restaurant");
    expect(result).toEqual([{ cashBankAccountId: "acct-a", name: "Cash Drawer", isBank: false }]);
    expect(mocks.module).toHaveBeenCalledWith("synthetic-restaurant", "restaurant");
    expect(mocks.initialize).toHaveBeenCalledWith("synthetic-restaurant");
    expect(mocks.accounts).toHaveBeenCalledWith({
      where: { workspaceId: "synthetic-restaurant", isActive: true },
      select: { id: true, name: true, isBank: true },
      orderBy: { name: "asc" },
    });
    for (const account of result) {
      expect(account).not.toHaveProperty("currentBalance");
      expect(account).not.toHaveProperty("openingBalance");
      expect(account).not.toHaveProperty("accountNumber");
      expect(account).not.toHaveProperty("notes");
    }
  });
});
