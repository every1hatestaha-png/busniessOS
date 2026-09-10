/**
 * Finance-grade precision helpers.
 * All monetary calculations use Decimal (2dp). All quantity calculations use 4dp.
 * No intermediate rounding unless explicitly stated.
 */

const MONEY_SCALE = 2;
const QUANTITY_SCALE = 4;

/** Round to money precision (2dp), banker's rounding. */
export function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/** Round to quantity precision (4dp). */
export function roundQuantity(value: number): number {
  return Math.round((value + Number.EPSILON) * 10000) / 10000;
}

/** Assert two monetary values are equal within tolerance. */
export function assertMoneyEqual(
  actual: number,
  expected: number,
  tolerance = 0.00,
  label = ""
): void {
  const diff = Math.abs(actual - expected);
  if (diff > tolerance + 0.001) {
    const msg = label
      ? `[MONEY] ${label}: expected ${expected.toFixed(MONEY_SCALE)}, got ${actual.toFixed(MONEY_SCALE)}, diff ${diff.toFixed(MONEY_SCALE)}`
      : `[MONEY] expected ${expected.toFixed(MONEY_SCALE)}, got ${actual.toFixed(MONEY_SCALE)}, diff ${diff.toFixed(MONEY_SCALE)}`;
    throw new Error(msg);
  }
}

/** Assert two quantity values are equal. */
export function assertQuantityEqual(
  actual: number,
  expected: number,
  label = ""
): void {
  const diff = Math.abs(actual - expected);
  if (diff > 0.0001) {
    const msg = label
      ? `[QTY] ${label}: expected ${expected.toFixed(QUANTITY_SCALE)}, got ${actual.toFixed(QUANTITY_SCALE)}, diff ${diff.toFixed(QUANTITY_SCALE)}`
      : `[QTY] expected ${expected.toFixed(QUANTITY_SCALE)}, got ${actual.toFixed(QUANTITY_SCALE)}, diff ${diff.toFixed(QUANTITY_SCALE)}`;
    throw new Error(msg);
  }
}

/** Assert debits equal credits for a set of GL entries. */
export function assertBalanced(
  debits: number,
  credits: number,
  label = ""
): void {
  const diff = Math.abs(debits - credits);
  if (diff > 0.001) {
    const prefix = label ? `[GL BALANCE] ${label}: ` : "[GL BALANCE] ";
    throw new Error(
      `${prefix}debits ${debits.toFixed(MONEY_SCALE)} ≠ credits ${credits.toFixed(MONEY_SCALE)} (diff ${diff.toFixed(MONEY_SCALE)})`
    );
  }
}

/** Calculate weighted average cost. */
export function calculateWAC(
  existingValue: number,
  existingQty: number,
  newValue: number,
  newQty: number
): { value: number; qty: number; wac: number } {
  const totalQty = existingQty + newQty;
  if (totalQty <= 0) return { value: 0, qty: 0, wac: 0 };
  const totalValue = existingValue + newValue;
  const wac = totalValue / totalQty;
  return { value: totalValue, qty: totalQty, wac };
}

/** Calculate line total: (unitPrice * quantity) - (discountPerUnit * quantity). */
export function calculateLineTotal(
  unitPrice: number,
  quantity: number,
  discountPerUnit = 0
): number {
  const gross = unitPrice * quantity;
  const discount = discountPerUnit * quantity;
  return roundMoney(gross - discount);
}

/** Calculate percentage of a value. */
export function percentage(value: number, percent: number): number {
  return roundMoney((value * percent) / 100);
}
