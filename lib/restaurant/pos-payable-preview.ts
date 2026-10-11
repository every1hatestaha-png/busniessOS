/** Display estimate only. The server remains authoritative for prices and permissions. */
export function posPayablePreview(
  lines: ReadonlyArray<{ price: number; quantity: number }>,
  discountInput: string,
  taxInput: string,
  canFinancialOverride: boolean,
) {
  const round = (value: number) => Math.round(value * 100) / 100;
  const subtotal = round(lines.reduce((sum, line) => sum + round(line.price * line.quantity), 0));
  const discount = canFinancialOverride ? round(Number(discountInput)) : 0;
  const tax = canFinancialOverride ? round(Number(taxInput)) : 0;
  const valid = [subtotal, discount, tax].every(Number.isFinite)
    && discount >= 0 && tax >= 0 && discount <= subtotal;
  return { subtotal, discount, tax, payable: valid ? round(subtotal - discount + tax) : null };
}
