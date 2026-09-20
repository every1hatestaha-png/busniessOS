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


export function allocateSalesTaxByLine(
  lineAmounts: Prisma.Decimal[],
  orderDiscountInput: Prisma.Decimal,
  taxRateInputs: Prisma.Decimal[],
) {
  const zero = new Prisma.Decimal(0);
  if (lineAmounts.length !== taxRateInputs.length) {
    throw new Error("Every sale line must have exactly one tax rate.");
  }

  const orderDiscount = orderDiscountInput.toDecimalPlaces(2);
  if (orderDiscount.isNegative()) throw new Error("Order discount cannot be negative.");

  const amounts = lineAmounts.map((amount) => amount.toDecimalPlaces(2));
  const rates = taxRateInputs.map((rate) => rate.toDecimalPlaces(4));
  for (const amount of amounts) {
    if (amount.isNegative()) throw new Error("Sale line amount cannot be negative.");
  }
  for (const rate of rates) {
    if (rate.isNegative() || rate.greaterThan(100)) throw new Error("Sales tax rate must be between 0 and 100.");
  }

  const base = amounts.reduce((sum, amount) => sum.plus(amount), zero);
  if (orderDiscount.greaterThan(base)) throw new Error("Order discount exceeds the line value.");

  let allocatedDiscount = zero;
  const lines = amounts.map((amount, index) => {
    const last = index === amounts.length - 1;
    const lineOrderDiscount = last
      ? orderDiscount.minus(allocatedDiscount)
      : base.isZero()
        ? zero
        : amount.mul(orderDiscount).div(base).toDecimalPlaces(2, Prisma.Decimal.ROUND_DOWN);
    allocatedDiscount = allocatedDiscount.plus(lineOrderDiscount);

    const taxableAmount = amount.minus(lineOrderDiscount).toDecimalPlaces(2);
    const taxRate = rates[index]!;
    const salesTaxAmount = taxableAmount.mul(taxRate).div(100).toDecimalPlaces(2);

    if (lineOrderDiscount.isNegative() || taxableAmount.isNegative() || salesTaxAmount.isNegative()) {
      throw new Error("Sales tax allocation produced a negative line amount.");
    }
    return { orderDiscount: lineOrderDiscount, taxableAmount, taxRate, salesTaxAmount };
  });

  return {
    lines,
    totalTaxable: lines.reduce((sum, line) => sum.plus(line.taxableAmount), zero).toDecimalPlaces(2),
    totalTax: lines.reduce((sum, line) => sum.plus(line.salesTaxAmount), zero).toDecimalPlaces(2),
  };
}
