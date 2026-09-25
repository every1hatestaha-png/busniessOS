import { clerkMiddleware } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import { isAuthEntryPath, isPublicMarketingPath, safeInternalDestination } from "@/lib/auth-routing";
import { checkAppRateLimit } from "@/lib/request-rate-limit";
import { applyCorsHeaders, corsPreflightResponse, isApiV1Request, isTrustedMutationOrigin } from "@/lib/server/cors";

function d4ProxyLog(_message: string) {
}

function isMutationMethod(method: string) {
  return !["GET", "HEAD", "OPTIONS"].includes(method.toUpperCase());
}

const isPreview = process.env.VERCEL_ENV === "preview";
const previewPublishableKey = isPreview ? "pk_test_Zml4dHVyZS5jbGVyay5hY2NvdW50cy5kZXYk" : undefined;
const previewSecretKey = isPreview ? "sk_test_preview_only_not_for_auth" : undefined;

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

    if (
      isApiV1Request(path)
      && isMutationMethod(request.method)
      && !isTrustedMutationOrigin(request.headers.get("origin"), request.nextUrl.origin)
    ) {
      return NextResponse.json(
        { error: { code: "UNTRUSTED_ORIGIN", message: "This request origin is not allowed." } },
        { status: 403, headers: { "Cache-Control": "no-store" } },
      );
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
        const redirectUrl = request.nextUrl.searchParams.get("redirect_url");
        const sanitizedRedirect = redirectUrl ? safeInternalDestination(redirectUrl, request.url, "") : "";
        if (sanitizedRedirect) signInUrl.searchParams.set("redirect_url", sanitizedRedirect);
        for (const key of ["business", "modules", "billing"]) {
          const value = request.nextUrl.searchParams.get(key);
          if (value) signInUrl.searchParams.set(key, value);
        }
        return NextResponse.redirect(signInUrl);
      }

      if (path === "/signup" || path.startsWith("/signup/")) {
        if (signedIn) return NextResponse.redirect(new URL("/dashboard", request.url));
        const signUpUrl = new URL("/sign-up", request.url);
        for (const key of ["business", "modules", "billing"]) {
          const value = request.nextUrl.searchParams.get(key);
          if (value) signUpUrl.searchParams.set(key, value);
        }
        return NextResponse.redirect(signUpUrl);
      }

      if (isAuthEntryPath(path)) {
        const redirectUrl = request.nextUrl.searchParams.get("redirect_url");
        if (signedIn) {
          const requestedDestination = safeInternalDestination(redirectUrl, request.url);
          return NextResponse.redirect(new URL(requestedDestination, request.url));
        }
        if (redirectUrl) {
          const sanitizedRedirect = safeInternalDestination(redirectUrl, request.url, "");
          if (!sanitizedRedirect || sanitizedRedirect !== redirectUrl) {
            const sanitizedUrl = request.nextUrl.clone();
            if (sanitizedRedirect) sanitizedUrl.searchParams.set("redirect_url", sanitizedRedirect);
            else sanitizedUrl.searchParams.delete("redirect_url");
            return NextResponse.redirect(sanitizedUrl);
          }
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
  {
    publishableKey: process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY || previewPublishableKey,
    secretKey: process.env.CLERK_SECRET_KEY || previewSecretKey,
    contentSecurityPolicy: { strict: true },
  },
);

export { handleProxy as proxy };

export const config = {
  matcher: [
    "/((?!_next|forgot-password|account-recovery|recovery|desktop-auth|api/webhooks|api/health|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
    "/__clerk/(.*)",
  ],
};
