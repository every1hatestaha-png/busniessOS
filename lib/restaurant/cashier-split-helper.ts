/**
 * A convenience suggestion for multiple verified receipts on one restaurant
 * order. Does not allocate items, mutate totals or create payments.
 * Remaining cents stay outstanding and are collected by the final receipt.
 */
export function suggestedCashierShare(outstanding: number, portions: number): number {
  if (!Number.isFinite(outstanding) || outstanding <= 0) return 0;
  if (!Number.isInteger(portions) || portions < 1 || portions > 12) {
    throw new Error("A split must contain 1 to 12 portions.");
  }
  const cents = Math.round(outstanding * 100);
  return Math.floor(cents / portions) / 100;
}
