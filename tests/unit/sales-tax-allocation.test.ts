import { describe, expect, it } from "vitest";
import { Prisma } from "@prisma/client";

import { allocateSalesTaxByLine, allocateUniformSalesTax } from "@/lib/sales-tax";

describe("line-level sales tax allocation", () => {
  it("allocates order discount and reconciles tax exactly", () => {
    const result = allocateUniformSalesTax(
      [new Prisma.Decimal(100), new Prisma.Decimal(50)],
      new Prisma.Decimal(10),
      new Prisma.Decimal(18),
    );
    expect(result.totalTaxable.toNumber()).toBe(140);
    expect(result.totalTax.toNumber()).toBe(25.2);
    expect(result.lines.reduce((sum, line) => sum.plus(line.orderDiscount), new Prisma.Decimal(0)).equals(10)).toBe(true);
    expect(result.lines.reduce((sum, line) => sum.plus(line.taxableAmount), new Prisma.Decimal(0)).equals(140)).toBe(true);
    expect(result.lines.reduce((sum, line) => sum.plus(line.salesTaxAmount), new Prisma.Decimal(0)).equals(25.2)).toBe(true);
  });

  it("supports mixed line rates while reconciling a shared order discount", () => {
    const result = allocateSalesTaxByLine(
      [new Prisma.Decimal(100), new Prisma.Decimal(200)],
      new Prisma.Decimal(30),
      [new Prisma.Decimal(18), new Prisma.Decimal(0)],
    );
    expect(result.totalTaxable.equals(270)).toBe(true);
    expect(result.totalTax.equals(16.2)).toBe(true);
    expect(result.lines[0]).toMatchObject({
      orderDiscount: expect.any(Prisma.Decimal),
      taxableAmount: expect.any(Prisma.Decimal),
      taxRate: expect.any(Prisma.Decimal),
      salesTaxAmount: expect.any(Prisma.Decimal),
    });
    expect(result.lines[0].orderDiscount.equals(10)).toBe(true);
    expect(result.lines[0].taxableAmount.equals(90)).toBe(true);
    expect(result.lines[0].salesTaxAmount.equals(16.2)).toBe(true);
    expect(result.lines[1].orderDiscount.equals(20)).toBe(true);
    expect(result.lines[1].taxableAmount.equals(180)).toBe(true);
    expect(result.lines[1].salesTaxAmount.equals(0)).toBe(true);
  });

  it("rejects missing or invalid mixed-rate inputs", () => {
    expect(() => allocateSalesTaxByLine(
      [new Prisma.Decimal(100)],
      new Prisma.Decimal(0),
      [],
    )).toThrow(/exactly one tax rate/i);
    expect(() => allocateSalesTaxByLine(
      [new Prisma.Decimal(100)],
      new Prisma.Decimal(0),
      [new Prisma.Decimal(101)],
    )).toThrow(/between 0 and 100/i);
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
