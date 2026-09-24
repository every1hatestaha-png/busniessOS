import { clerkMiddleware } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import { checkAppRateLimit } from "@/lib/request-rate-limit";
import { applyCorsHeaders, corsPreflightResponse, isApiV1Request } from "@/lib/server/cors";

function d4ProxyLog(message: string) {
}

const PUBLIC_MARKETING_PATHS = new Set([
  "/",
  "/features",
  "/industries",
  "/pricing",
  "/faq",
  "/privacy",
  "/terms",
]);

const AUTH_ENTRY_PATHS = new Set([
  "/sign-in",
  "/sign-up",
  "/login",
  "/signup",
]);

function isAuthEntryPath(path: string) {
  return Array.from(AUTH_ENTRY_PATHS).some((entry) => path === entry || path.startsWith(`${entry}/`));
}

function isPublicMarketingPath(path: string) {
  return PUBLIC_MARKETING_PATHS.has(path) || path.startsWith("/get-your-munshi");
}

function safeInternalDestination(value: string | null, fallback = "/dashboard") {
  if (!value) return fallback;
  if (!value.startsWith("/") || value.startsWith("//")) return fallback;
  if (value.startsWith("/sign-in") || value.startsWith("/sign-up") || value.startsWith("/login") || value.startsWith("/signup")) {
    return fallback;
  }
  return value;
}

const handleProxy = clerkMiddleware(
  async (auth, request) => {
    const path = request.nextUrl.pathname;
    const userAgent = request.headers.get("user-agent") || "";
    const isElectron = userAgent.includes("Electron");
    const authHeader = request.headers.get("authorization");

    const limited = checkAppRateLimit(request, path);
    if (limited) {
      return NextResponse.json(
        { error: "Too many requests. Please retry shortly." },
        { status: 429, headers: { "Retry-After": String(limited.retryAfter), "Cache-Control": "no-store" } },
      );
    }

    if (isElectron && (path === "/" || path === "/dashboard")) {
      d4ProxyLog(`root request URL origin=${request.nextUrl.origin} pathname=${path}`);
    }

    if (
      path.startsWith("/desktop-auth") ||
      path === "/api/desktop-config" ||
      path === "/api/health" ||
      path === "/api/readiness" ||
      path === "/api/webhooks/clerk" ||
      path.startsWith("/forgot-password") ||
      path.startsWith("/account-recovery") ||
      path.startsWith("/recovery") ||
      path.startsWith("/platform/sign-in")
    ) {
      return NextResponse.next();
    }

    if (isApiV1Request(path) && request.method === "OPTIONS") {
      return corsPreflightResponse(request);
    }

    if (isElectron) {
      if (!authHeader) {
        d4ProxyLog(`Electron request path=${path} Authorization header attached=NO; redirecting to /desktop-auth`);
        return NextResponse.redirect(new URL("/desktop-auth", request.url));
      }

      d4ProxyLog(`Electron request path=${path} Authorization header attached=YES`);
      try {
        const protectedAuth = await auth.protect({ token: ["session_token", "oauth_token"] });
        d4ProxyLog(`auth.protect passed=YES userIdPresent=${protectedAuth.userId ? "YES" : "NO"}`);
        return NextResponse.next();
      } catch (error) {
        const errorName = error instanceof Error ? error.name : "unknown";
        d4ProxyLog(`auth.protect passed=NO error=${errorName}`);
        throw error;
      }
    }

    if (!isApiV1Request(path)) {
      const authState = await auth();
      const signedIn = Boolean(authState.userId);

      if (path === "/login" || path.startsWith("/login/")) {
        if (signedIn) return NextResponse.redirect(new URL("/dashboard", request.url));
        const signInUrl = new URL("/sign-in", request.url);
        signInUrl.search = request.nextUrl.search;
        return NextResponse.redirect(signInUrl);
      }

      if (path === "/signup" || path.startsWith("/signup/")) {
        if (signedIn) return NextResponse.redirect(new URL("/dashboard", request.url));
        const signUpUrl = new URL("/sign-up", request.url);
        signUpUrl.search = request.nextUrl.search;
        return NextResponse.redirect(signUpUrl);
      }

      if (isAuthEntryPath(path)) {
        if (signedIn) {
          const requestedDestination = safeInternalDestination(request.nextUrl.searchParams.get("redirect_url"));
          return NextResponse.redirect(new URL(requestedDestination, request.url));
        }
        return NextResponse.next();
      }

      if (path === "/" && signedIn) {
        return NextResponse.redirect(new URL("/dashboard", request.url));
      }

      if (isPublicMarketingPath(path)) {
        return NextResponse.next();
      }

      if (!signedIn) {
        const signInUrl = new URL("/sign-in", request.url);
        signInUrl.searchParams.set("redirect_url", `${request.nextUrl.pathname}${request.nextUrl.search}`);
        return NextResponse.redirect(signInUrl);
      }
    }

    if (isApiV1Request(path)) {
      return applyCorsHeaders(NextResponse.next(), request.headers.get("origin"));
    }

    return NextResponse.next();
  },
  { contentSecurityPolicy: {} },
);

export { handleProxy as proxy };

export const config = {
  matcher: [
    "/((?!_next|forgot-password|account-recovery|recovery|desktop-auth|api/webhooks|api/health|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
    "/__clerk/(.*)",
  ],
};
