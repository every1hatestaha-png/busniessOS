import type { AccountNormalBalance } from "@prisma/client";

export function calculateRunningBalance(openingBalance: number, normalBalance: AccountNormalBalance, entries: Array<{ debit: number; credit: number }>) {
  let runningBalance = openingBalance;
  return entries.map((entry) => {
    runningBalance += normalBalance === "DEBIT" ? entry.debit - entry.credit : entry.credit - entry.debit;
    return { ...entry, runningBalance };
  });
}

export function calculateProfitLossTotals(input: { grossSales: number; salesReturns: number; costOfGoodsSold: number; operatingExpenses: number }) {
  const salesRevenue = input.grossSales - input.salesReturns;
  const grossProfit = salesRevenue - input.costOfGoodsSold;
  return { salesRevenue, costOfGoodsSold: input.costOfGoodsSold, grossProfit, operatingExpenses: input.operatingExpenses, netProfit: grossProfit - input.operatingExpenses };
}
