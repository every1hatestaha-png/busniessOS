export type SaleStockWarning =
  | { kind: "insufficient"; message: string }
  | { kind: "low"; message: string }
  | null;

export function getSaleStockWarning(available: number, requested: number, reorderLevel = 0): SaleStockWarning {
  if (!Number.isFinite(available) || !Number.isFinite(requested) || requested <= 0) return null;
  if (requested > available) {
    return { kind: "insufficient", message: `Requested ${requested}; only ${available} available.` };
  }
  const remaining = available - requested;
  if (remaining <= reorderLevel) {
    return { kind: "low", message: `Stock will fall to ${remaining}, at/below reorder level ${reorderLevel}.` };
  }
  return null;
}
