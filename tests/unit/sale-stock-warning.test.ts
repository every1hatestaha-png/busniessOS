import { describe, expect, it } from "vitest";

import { getSaleStockWarning } from "@/lib/inventory/sale-stock-warning";

describe("sale stock warnings", () => {
  it("blocks quantities above available stock", () => {
    expect(getSaleStockWarning(5, 6, 1)).toEqual({
      kind: "insufficient",
      message: "Requested 6; only 5 available.",
    });
  });

  it("warns when the sale reaches the reorder level", () => {
    expect(getSaleStockWarning(10, 8, 2)).toEqual({
      kind: "low",
      message: "Stock will fall to 2, at/below reorder level 2.",
    });
  });

  it("stays quiet when healthy stock remains", () => {
    expect(getSaleStockWarning(10, 3, 2)).toBeNull();
  });
});
