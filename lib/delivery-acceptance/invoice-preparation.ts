/** Display-only preparation. The lifecycle service remains the issuance authority. */
export function canPrepareGatePassInvoice(status: string): boolean {
  return ["ISSUED", "IN_TRANSIT", "RECEIVING_PENDING", "ACCEPTED", "PARTIALLY_ACCEPTED"].includes(status);
}

export function hasFinalGatePassReceiving(status: string): boolean {
  return status === "ACCEPTED" || status === "PARTIALLY_ACCEPTED";
}

type PreviewLine = { quantity: string; unitPrice: string; taxRate: string };

function scaled(value: string, places: number): bigint | null {
  if (!new RegExp(`^(?:0|[1-9]\\d{0,10})(?:\\.\\d{1,${places}})?$`).test(value)) return null;
  const [whole, fraction = ""] = value.split(".");
  return BigInt(whole) * 10n ** BigInt(places) + BigInt(fraction.padEnd(places, "0"));
}
function cents(value: bigint): string {
  return `${value / 100n}.${(value % 100n).toString().padStart(2, "0")}`;
}
function rounded(numerator: bigint, denominator: bigint): bigint {
  return (numerator + denominator / 2n) / denominator;
}

/** Exact cents, with the same per-line taxable-then-tax rounding as final issuance. */
export function gatePassInvoicePreview(lines: PreviewLine[]): { subtotal: string; tax: string; total: string } | null {
  if (!lines.length || lines.length > 100) return null;
  let subtotal = 0n;
  let tax = 0n;
  for (const line of lines) {
    const quantity = scaled(line.quantity, 4);
    const price = scaled(line.unitPrice, 2);
    const rate = scaled(line.taxRate, 4);
    if (quantity === null || quantity <= 0n || price === null || rate === null || rate > 1_000_000n) return null;
    const taxable = rounded(quantity * price, 10_000n);
    subtotal += taxable;
    tax += rounded(taxable * rate, 1_000_000n);
  }
  // The persisted invoice amount is Decimal(15,2). Never preview an unrepresentable total.
  if (subtotal + tax > 999_999_999_999_999n) return null;
  return { subtotal: cents(subtotal), tax: cents(tax), total: cents(subtotal + tax) };
}
