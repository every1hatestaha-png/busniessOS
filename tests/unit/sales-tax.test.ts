import { describe, expect, it } from "vitest";

import { calculateSalesTax } from "@/lib/sales-tax";

describe("sales tax calculation", () => {
  it("keeps totals unchanged when tax is off", () => {
    expect(calculateSalesTax(100000, false, 18, "EXCLUSIVE")).toEqual({ taxableAmount: 100000, taxAmount: 0, total: 100000 });
  });

  it("adds exclusive tax on top of the discounted taxable amount", () => {
    expect(calculateSalesTax(100000, true, 18, "EXCLUSIVE")).toEqual({ taxableAmount: 100000, taxAmount: 18000, total: 118000 });
  });

  it("extracts inclusive tax without increasing the entered total", () => {
    expect(calculateSalesTax(100000, true, 18, "INCLUSIVE")).toEqual({ taxableAmount: 84745.76, taxAmount: 15254.24, total: 100000 });
  });

  it("supports a custom rate", () => {
    expect(calculateSalesTax(95000, true, 7.5, "EXCLUSIVE")).toEqual({ taxableAmount: 95000, taxAmount: 7125, total: 102125 });
  });
});
