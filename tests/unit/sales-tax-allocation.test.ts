import { describe, expect, it } from "vitest";
import { Prisma } from "@prisma/client";

import { allocateUniformSalesTax } from "@/lib/sales-tax";

describe("line-level sales tax allocation", () => {
  it("allocates order discount and reconciles tax exactly", () => {
    const result = allocateUniformSalesTax(
      [new Prisma.Decimal(100), new Prisma.Decimal(50)],
      new Prisma.Decimal(10),
      new Prisma.Decimal(18),
    );
    expect(result.totalTaxable.toNumber()).toBe(140);
    expect(result.totalTax.toNumber()).toBe(25.2);
    expect(result.lines.reduce((sum, line) => sum + line.orderDiscount.toNumber(), 0)).toBe(10);
    expect(result.lines.reduce((sum, line) => sum + line.taxableAmount.toNumber(), 0)).toBe(140);
    expect(result.lines.reduce((sum, line) => sum + line.salesTaxAmount.toNumber(), 0)).toBe(25.2);
  });

  it("preserves zero tax and rejects excessive discounts", () => {
    const zero = allocateUniformSalesTax(
      [new Prisma.Decimal(100)],
      new Prisma.Decimal(20),
      new Prisma.Decimal(0),
    );
    expect(zero.lines[0].taxableAmount.toNumber()).toBe(80);
    expect(zero.lines[0].salesTaxAmount.toNumber()).toBe(0);
    expect(() => allocateUniformSalesTax(
      [new Prisma.Decimal(100)],
      new Prisma.Decimal(101),
      new Prisma.Decimal(18),
    )).toThrow(/discount exceeds/i);
  });
});
