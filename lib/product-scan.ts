export function normalizeScanCode(value: string) {
  return value.trim().toUpperCase();
}

export function findProductByScanCode<T extends { sku?: string | null }>(products: T[], value: string): T | null {
  const code = normalizeScanCode(value);
  if (!code) return null;
  return products.find((product) => normalizeScanCode(product.sku ?? "") === code) ?? null;
}
