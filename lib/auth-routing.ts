export const PUBLIC_MARKETING_PATHS = new Set([
  "/",
  "/features",
  "/industries",
  "/pricing",
  "/faq",
  "/privacy",
  "/terms",
]);

export const AUTH_ENTRY_PATHS = new Set([
  "/sign-in",
  "/sign-up",
  "/login",
  "/signup",
]);

export function isAuthEntryPath(path: string) {
  return Array.from(AUTH_ENTRY_PATHS).some((entry) => path === entry || path.startsWith(`${entry}/`));
}

export function isPublicMarketingPath(path: string) {
  return PUBLIC_MARKETING_PATHS.has(path) || path.startsWith("/get-your-munshi");
}

export function safeInternalDestination(value: string | null, requestUrl: string, fallback = "/dashboard") {
  if (!value || /[\\\r\n\0]/.test(value)) return fallback;
  try {
    const base = new URL(requestUrl);
    const destination = new URL(value, base);
    if (destination.origin !== base.origin) return fallback;
    const normalized = `${destination.pathname}${destination.search}${destination.hash}`;
    if (
      normalized.startsWith("/sign-in") ||
      normalized.startsWith("/sign-up") ||
      normalized.startsWith("/login") ||
      normalized.startsWith("/signup")
    ) {
      return fallback;
    }
    return normalized;
  } catch {
    return fallback;
  }
}
