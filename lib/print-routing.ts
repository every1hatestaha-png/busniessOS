const DEDICATED_PRINT_ROUTES = [
  /^\/purchases\/[^/]+$/,
  /^\/goods-receipts\/[^/]+$/,
] as const;

/**
 * Returns the canonical print route for detail screens that have a dedicated
 * document page. Pages that already render their own print surface return null
 * and can use the browser print dialog directly.
 */
export function getDedicatedPrintRoute(pathname: string): string | null {
  const normalized = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  if (normalized.endsWith("/print")) return null;

  return DEDICATED_PRINT_ROUTES.some((pattern) => pattern.test(normalized))
    ? `${normalized}/print`
    : null;
}
