import { Prisma } from "@prisma/client";

export type SalesTaxLineAllocation = {
  orderDiscount: Prisma.Decimal;
  taxableAmount: Prisma.Decimal;
  taxRate: Prisma.Decimal;
  salesTaxAmount: Prisma.Decimal;
};

export function allocateUniformSalesTax(
  lineAmounts: Prisma.Decimal[],
  orderDiscountInput: Prisma.Decimal,
  taxRateInput: Prisma.Decimal,
) {
  const zero = new Prisma.Decimal(0);
  const orderDiscount = orderDiscountInput.toDecimalPlaces(2);
  const taxRate = taxRateInput.toDecimalPlaces(4);
  if (orderDiscount.isNegative()) throw new Error("Order discount cannot be negative.");
  if (taxRate.isNegative()) throw new Error("Tax rate cannot be negative.");

  const base = lineAmounts.reduce((sum, amount) => sum.plus(amount), zero);
  if (orderDiscount.greaterThan(base)) throw new Error("Order discount exceeds the line value.");

  const totalTaxable = base.minus(orderDiscount).toDecimalPlaces(2);
  const totalTax = totalTaxable.isPositive()
    ? totalTaxable.mul(taxRate).div(100).toDecimalPlaces(2)
    : zero;

  let allocatedDiscount = zero;
  let allocatedTax = zero;
  const lines: SalesTaxLineAllocation[] = lineAmounts.map((rawAmount, index) => {
    const amount = rawAmount.toDecimalPlaces(2);
    const last = index === lineAmounts.length - 1;
    const lineOrderDiscount = last
      ? orderDiscount.minus(allocatedDiscount)
      : base.isZero()
        ? zero
        : amount.mul(orderDiscount).div(base).toDecimalPlaces(2, Prisma.Decimal.ROUND_DOWN);
    allocatedDiscount = allocatedDiscount.plus(lineOrderDiscount);

    const taxableAmount = amount.minus(lineOrderDiscount).toDecimalPlaces(2);
    const salesTaxAmount = last
      ? totalTax.minus(allocatedTax)
      : taxableAmount.mul(taxRate).div(100).toDecimalPlaces(2, Prisma.Decimal.ROUND_DOWN);
    allocatedTax = allocatedTax.plus(salesTaxAmount);

    if (lineOrderDiscount.isNegative() || taxableAmount.isNegative() || salesTaxAmount.isNegative()) {
      throw new Error("Sales tax allocation produced a negative line amount.");
    }

    return { orderDiscount: lineOrderDiscount, taxableAmount, taxRate, salesTaxAmount };
  });

  return { lines, totalTaxable, totalTax };
}
