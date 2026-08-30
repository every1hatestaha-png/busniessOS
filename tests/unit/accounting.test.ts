import { describe, expect, it } from "vitest";

import { calculateProfitLossTotals, calculateRunningBalance } from "@/lib/accounting-math";
import { expenseSchema } from "@/lib/validation/accounting";

describe("accounting helpers", () => {
  it("calculates debit-normal running balances", () => {
    const rows = calculateRunningBalance(100, "DEBIT", [
      { debit: 50, credit: 0 },
      { debit: 0, credit: 25 },
    ]);
    expect(rows.map((row) => row.runningBalance)).toEqual([150, 125]);
  });

  it("calculates credit-normal running balances", () => {
    const rows = calculateRunningBalance(100, "CREDIT", [
      { debit: 30, credit: 0 },
      { debit: 0, credit: 70 },
    ]);
    expect(rows.map((row) => row.runningBalance)).toEqual([70, 140]);
  });

  it("calculates P&L from revenue, returns, COGS and expenses", () => {
    expect(calculateProfitLossTotals({ grossSales: 1000, salesReturns: 100, costOfGoodsSold: 550, operatingExpenses: 125 })).toEqual({ salesRevenue: 900, costOfGoodsSold: 550, grossProfit: 350, operatingExpenses: 125, netProfit: 225 });
  });

  it("rejects non-positive expense amounts", () => {
    const result = expenseSchema.safeParse({ expenseAccountId: crypto.randomUUID(), paymentAccountId: crypto.randomUUID(), amount: 0, expenseDate: new Date() });
    expect(result.success).toBe(false);
  });
});
