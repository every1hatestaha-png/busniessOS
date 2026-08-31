import { describe, expect, it } from "vitest";

import {
  calculateBalance,
  calculateInventoryValue,
  calculateLedgerRunningBalance,
  calculateOrderSubtotal,
  calculateOrderTotal,
  formatPKR,
  getCreditStatus,
  getStockStatus,
} from "@/lib/utils";

describe("formatPKR", () => {
  it.each([
    [undefined, "Rs 0"],
    [null, "Rs 0"],
    ["not a number", "Rs 0"],
    [0, "Rs 0"],
    [1234567.6, "Rs 1,234,567.6"],
    ["2500.49", "Rs 2,500.49"],
  ])("formats %s as %s", (amount, expected) => {
    expect(formatPKR(amount)).toBe(expected);
  });
});

describe("order calculations", () => {
  it("calculates a subtotal from numeric and string prices", () => {
    expect(calculateOrderSubtotal([
      { quantity: 2, unitPrice: 125.5 },
      { quantity: 3, unitPrice: "50" },
      { quantity: 10, unitPrice: "invalid" },
    ])).toBe(401);
  });

  it.each([
    [500, 75, 425],
    [500, "125.50", 374.5],
    [500, "invalid", 500],
    [100, 150, 0],
  ])("calculates total %s less %s as %s", (subtotal, discount, expected) => {
    expect(calculateOrderTotal(subtotal, discount)).toBe(expected);
  });
});

describe("balance", () => {
  it.each([
    [500, 125, 375],
    [500, "125.50", 374.5],
    [500, "invalid", 500],
    [100, 150, 0],
  ])("calculates balance %s less %s as %s", (total, paid, expected) => {
    expect(calculateBalance(total, paid)).toBe(expected);
  });
});

describe("inventory", () => {
  it.each([
    [10, 25.5, 255],
    [4, "12.25", 49],
    [5, "invalid", 0],
  ])("values %s units at %s as %s", (stock, cost, expected) => {
    expect(calculateInventoryValue(stock, cost)).toBe(expected);
  });

  it.each([
    [-1, 5, "Out of Stock"],
    [0, 5, "Out of Stock"],
    [5, 5, "Low Stock"],
    [6, 5, "In Stock"],
  ] as const)("classifies stock %s with reorder level %s as %s", (stock, reorderLevel, expected) => {
    expect(getStockStatus(stock, reorderLevel)).toBe(expected);
  });
});

describe("credit status", () => {
  it.each([
    [0, 1000, "Clear"],
    [-1, 1000, "Clear"],
    [1, 1000, "Normal"],
    [799, 1000, "Normal"],
    [800, 1000, "Near Limit"],
    [999, 1000, "Near Limit"],
    [1000, 1000, "Over Limit"],
    [1200, 1000, "Over Limit"],
  ] as const)("classifies balance %s against limit %s as %s", (balance, limit, expected) => {
    expect(getCreditStatus(balance, limit)).toBe(expected);
  });
});

describe("ledger running balance", () => {
  it("adds debits, subtracts credits, and preserves entry data", () => {
    const entries = [
      { id: "opening", debit: 1000, credit: 0 },
      { id: "payment", debit: 0, credit: 250 },
      { id: "sale", debit: 125.5, credit: 0 },
    ];

    expect(calculateLedgerRunningBalance(entries)).toEqual([
      { id: "opening", debit: 1000, credit: 0, balance: 1000 },
      { id: "payment", debit: 0, credit: 250, balance: 750 },
      { id: "sale", debit: 125.5, credit: 0, balance: 875.5 },
    ]);
    expect(entries).not.toHaveProperty("0.balance");
  });

  it("returns an empty ledger unchanged", () => {
    expect(calculateLedgerRunningBalance([])).toEqual([]);
  });
});
