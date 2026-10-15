const DEDICATED_PRINT_ROUTES = [
  /^\/purchases\/[^/]+$/,
  /^\/goods-receipts\/[^/]+$/,
  /^\/gate-passes\/[^/]+$/,
  /^\/services\/quotes\/[^/]+$/,
] as const;

/**
 * Returns the canonical print route for detail screens that have a dedicated
 * document page. Pages that already render their own print surface return null
 * and can use the browser print dialog directly.
 */
export function getDedicatedPrintRoute(pathname: string): string | null {
  const normalized = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  if (normalized.endsWith("/print")) return null;
  if (["/gate-passes/new", "/gate-passes/pending-invoices", "/gate-passes/in-transit"].includes(normalized)) return null;

  return DEDICATED_PRINT_ROUTES.some((pattern) => pattern.test(normalized))
    ? `${normalized}/print`
    : null;
}
