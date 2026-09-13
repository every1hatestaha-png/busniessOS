type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();
let lastCleanup = 0;

function clientKey(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || request.headers.get("x-real-ip")?.trim() || null;
}

function cleanup(now: number) {
  if (now - lastCleanup < 60_000) return;
  lastCleanup = now;
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}

export function checkAppRateLimit(request: Request, pathname: string) {
  const ip = clientKey(request);
  if (!ip) return null;

  let limit = 0;
  let windowMs = 60_000;

  if (pathname.startsWith("/api/v1/")) {
    limit = request.method === "GET" ? 180 : 60;
  } else if (pathname === "/api/search") {
    limit = 90;
  } else if (pathname === "/platform" && request.method === "POST") {
    limit = 30;
  } else {
    return null;
  }

  const now = Date.now();
  cleanup(now);
  const key = `${ip}:${request.method}:${pathname}`;
  const existing = buckets.get(key);

  if (!existing || existing.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return null;
  }

  if (existing.count >= limit) {
    const retryAfter = Math.max(1, Math.ceil((existing.resetAt - now) / 1000));
    return { retryAfter };
  }

  existing.count += 1;
  return null;
}
