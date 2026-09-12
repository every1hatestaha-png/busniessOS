export type SalesTaxMode = "EXCLUSIVE" | "INCLUSIVE";

export type SalesTaxBreakdown = {
  taxableAmount: number;
  taxAmount: number;
  total: number;
};

function money(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function calculateSalesTax(
  amountBeforeTax: number,
  enabled: boolean,
  ratePercent: number,
  mode: SalesTaxMode,
): SalesTaxBreakdown {
  const amount = money(Math.max(0, Number.isFinite(amountBeforeTax) ? amountBeforeTax : 0));
  const rate = Number.isFinite(ratePercent) ? Math.max(0, ratePercent) : 0;

  if (!enabled || rate <= 0 || amount <= 0) {
    return { taxableAmount: amount, taxAmount: 0, total: amount };
  }

  if (mode === "INCLUSIVE") {
    const taxableAmount = money(amount / (1 + rate / 100));
    const taxAmount = money(amount - taxableAmount);
    return { taxableAmount, taxAmount, total: amount };
  }

  const taxableAmount = amount;
  const taxAmount = money(taxableAmount * (rate / 100));
  return { taxableAmount, taxAmount, total: money(taxableAmount + taxAmount) };
}
