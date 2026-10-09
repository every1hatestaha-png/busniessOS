import { NextResponse, type NextRequest } from "next/server";

const ALLOWED_METHODS = "GET, POST, PUT, PATCH, DELETE, OPTIONS";
const ALLOWED_HEADERS = "Authorization, Content-Type, Idempotency-Key";
const EXPO_WEB_DEV_PORTS = new Set(["8081", "8082", "8083", "19006"]);

function webMutationTargetOrigin(request: Request) {
  const target = new URL(request.url);
  // NextURL normalizes loopback addresses to localhost. Preserve the actual
  // served loopback authority; do not treat localhost and 127.0.0.1 as the same
  // browser origin, or trust arbitrary forwarded/foreign host overrides.
  const loopback = new Set(["localhost", "127.0.0.1", "[::1]"]);
  const host = request.headers.get("host");
  if (!loopback.has(target.hostname) || host === null) return target.origin;
  if (!/^(localhost|127\.0\.0\.1|\[::1\])(?::\d{1,5})?$/i.test(host)) return null;
  const served = new URL(`${target.protocol}//${host}`);
  return served.port === target.port ? served.origin : null;
}

export function isApiV1Request(pathname: string) {
  return pathname === "/api/v1" || pathname.startsWith("/api/v1/");
}

export function getAllowedCorsOrigin(origin: string | null) {
  if (!origin) return null;

  let url: URL;
  try {
    url = new URL(origin);
  } catch {
    return null;
  }
  if (url.origin !== origin) return null;

  const isLocalExpoWeb =
    url.protocol === "http:" &&
    (url.hostname === "localhost" || url.hostname === "127.0.0.1") &&
    EXPO_WEB_DEV_PORTS.has(url.port);

  return isLocalExpoWeb ? origin : null;
}

export function isTrustedMutationOrigin(origin: string | null, requestOrigin: string) {
  if (!origin) return false;
  let parsedOrigin: URL;
  let parsedRequestOrigin: URL;
  try {
    parsedOrigin = new URL(origin);
    parsedRequestOrigin = new URL(requestOrigin);
  } catch {
    return false;
  }
  if (parsedOrigin.origin !== origin) return false;
  if (parsedOrigin.origin === parsedRequestOrigin.origin) return true;
  return Boolean(getAllowedCorsOrigin(origin));
}

// Cookie-authenticated web flows do not share the mobile API's localhost CORS
// exception. Fetch Metadata also rejects cross-site forms with a missing Origin.
export function isSameOriginWebMutation(request: Request) {
  const site = request.headers.get("sec-fetch-site");
  if (site !== null && site !== "same-origin" && site !== "none") return false;
  const origin = request.headers.get("origin");
  try {
    const target = webMutationTargetOrigin(request);
    if (target === null) return false;
    if (origin !== null) return new URL(origin).origin === origin && origin === target;
    // Older same-origin clients can supply Referer; modern browsers supply
    // protected Fetch Metadata. With neither proof, cookie writes fail closed.
    const referer = request.headers.get("referer");
    if (referer !== null) return new URL(referer).origin === target;
    return site === "same-origin";
  } catch {
    return false;
  }
}

export function isMutationMethod(method: string) {
  return !["GET", "HEAD", "OPTIONS"].includes(method.toUpperCase());
}

export function isAllowedMutationRequest(request: Request) {
  if (!isMutationMethod(request.method)) return true;
  if (isSameOriginWebMutation(request)) return true;
  // Only API v1 supports independent bearer authentication. Do not permit an
  // attacker-added Authorization header to fall back to ambient cookie auth.
  if (!isApiV1Request(new URL(request.url).pathname) || request.headers.has("cookie")) return false;
  if (!/^Bearer [^\s,]+$/i.test(request.headers.get("authorization") ?? "")) return false;
  const origin = request.headers.get("origin");
  const site = request.headers.get("sec-fetch-site");
  if (origin !== null) return isTrustedMutationOrigin(origin, new URL(request.url).origin);
  return site === null || site === "none" || site === "same-origin";
}

export function applyCorsHeaders(response: Response, origin: string | null) {
  const allowedOrigin = getAllowedCorsOrigin(origin);
  if (!allowedOrigin) return response;

  response.headers.set("Access-Control-Allow-Origin", allowedOrigin);
  response.headers.set("Access-Control-Allow-Methods", ALLOWED_METHODS);
  response.headers.set("Access-Control-Allow-Headers", ALLOWED_HEADERS);
  // Cross-origin Expo development uses an explicit bearer token, never cookies.
  response.headers.append("Vary", "Origin");
  return response;
}

export function corsPreflightResponse(request: NextRequest) {
  return applyCorsHeaders(new NextResponse(null, { status: 204 }), request.headers.get("origin"));
}
