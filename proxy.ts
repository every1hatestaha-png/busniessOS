import { clerkMiddleware } from "@clerk/nextjs/server";
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextFetchEvent, type NextRequest } from "next/server";

import { isAuthEntryPath, isPublicMarketingPath, safeInternalDestination } from "@/lib/auth-routing";
import { checkAppRateLimit } from "@/lib/request-rate-limit";
import { applyCorsHeaders, corsPreflightResponse, isApiV1Request, isTrustedMutationOrigin } from "@/lib/server/cors";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://wunynhbseytthrwceqhg.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || "sb_publishable_ZrVgIikHRhL86YNlopG72g_Em-2_wWP";
const CLERK_SERVER_CONFIGURED = Boolean(process.env.CLERK_SECRET_KEY && process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);

function isMutationMethod(method: string) {
  return !["GET", "HEAD", "OPTIONS"].includes(method.toUpperCase());
}

function copyResponseCookies(from: NextResponse, to: NextResponse) {
  for (const cookie of from.cookies.getAll()) {
    to.cookies.set(cookie);
  }
  return to;
}

function redirectWithCookies(url: URL, authResponse: NextResponse) {
  return copyResponseCookies(authResponse, NextResponse.redirect(url));
}

async function getSupabaseSessionState(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }

        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  const { data, error } = await supabase.auth.getUser();
  return {
    signedIn: !error && Boolean(data.user?.email_confirmed_at),
    response,
  };
}

function publicAuthPath(path: string) {
  return (
    path.startsWith("/auth/") ||
    path.startsWith("/forgot-password") ||
    path.startsWith("/account-recovery") ||
    path.startsWith("/recovery") ||
    path === "/api/health" ||
    path === "/api/readiness" ||
    path === "/api/desktop-config" ||
    path === "/api/webhooks/clerk"
  );
}

async function applyCommonGuards(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const limited = checkAppRateLimit(request, path);
  if (limited) {
    return NextResponse.json(
      { error: "Too many requests. Please retry shortly." },
      { status: 429, headers: { "Retry-After": String(limited.retryAfter), "Cache-Control": "no-store" } },
    );
  }

  if (isApiV1Request(path) && request.method === "OPTIONS") {
    return corsPreflightResponse(request);
  }

  if (
    isApiV1Request(path) &&
    isMutationMethod(request.method) &&
    !isTrustedMutationOrigin(request.headers.get("origin"), request.nextUrl.origin)
  ) {
    return NextResponse.json(
      { error: { code: "UNTRUSTED_ORIGIN", message: "This request origin is not allowed." } },
      { status: 403, headers: { "Cache-Control": "no-store" } },
    );
  }

  return null;
}

async function routeWebRequest(request: NextRequest, signedIn: boolean, authResponse: NextResponse) {
  const path = request.nextUrl.pathname;

  if (path === "/login" || path.startsWith("/login/")) {
    if (signedIn) return redirectWithCookies(new URL("/dashboard", request.url), authResponse);
    const signInUrl = new URL("/sign-in", request.url);
    const redirectUrl = request.nextUrl.searchParams.get("redirect_url");
    const sanitizedRedirect = redirectUrl ? safeInternalDestination(redirectUrl, request.url, "") : "";
    if (sanitizedRedirect) signInUrl.searchParams.set("redirect_url", sanitizedRedirect);
    return redirectWithCookies(signInUrl, authResponse);
  }

  if (path === "/signup" || path.startsWith("/signup/")) {
    if (signedIn) return redirectWithCookies(new URL("/dashboard", request.url), authResponse);
    return redirectWithCookies(new URL("/sign-up", request.url), authResponse);
  }

  if (isAuthEntryPath(path)) {
    const redirectUrl = request.nextUrl.searchParams.get("redirect_url");
    if (signedIn) {
      return redirectWithCookies(
        new URL(safeInternalDestination(redirectUrl, request.url), request.url),
        authResponse,
      );
    }
    if (redirectUrl) {
      const sanitizedRedirect = safeInternalDestination(redirectUrl, request.url, "");
      if (!sanitizedRedirect || sanitizedRedirect !== redirectUrl) {
        const sanitizedUrl = request.nextUrl.clone();
        if (sanitizedRedirect) sanitizedUrl.searchParams.set("redirect_url", sanitizedRedirect);
        else sanitizedUrl.searchParams.delete("redirect_url");
        return redirectWithCookies(sanitizedUrl, authResponse);
      }
    }
    return authResponse;
  }

  if (path === "/" && signedIn) {
    return redirectWithCookies(new URL("/dashboard", request.url), authResponse);
  }
  if (isPublicMarketingPath(path) || publicAuthPath(path)) return authResponse;

  if (!signedIn) {
    const signInUrl = new URL("/sign-in", request.url);
    signInUrl.searchParams.set("redirect_url", `${request.nextUrl.pathname}${request.nextUrl.search}`);
    return redirectWithCookies(signInUrl, authResponse);
  }

  return authResponse;
}

async function supabaseOnlyProxy(request: NextRequest) {
  const guard = await applyCommonGuards(request);
  if (guard) return guard;

  const path = request.nextUrl.pathname;
  const isElectron = (request.headers.get("user-agent") || "").includes("Electron");

  if (isElectron || path.startsWith("/desktop-auth") || path.startsWith("/platform")) {
    if (publicAuthPath(path) || path.startsWith("/desktop-auth") || path.startsWith("/platform/sign-in")) {
      return NextResponse.next();
    }
    return NextResponse.json(
      { error: { code: "CLERK_SERVER_UNAVAILABLE", message: "This protected legacy auth route is unavailable in this preview." } },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  const { signedIn, response } = await getSupabaseSessionState(request);

  if (isApiV1Request(path)) {
    return applyCorsHeaders(response, request.headers.get("origin"));
  }

  return routeWebRequest(request, signedIn, response);
}

const previewPublishableKey = process.env.VERCEL_ENV === "preview"
  ? "pk_test_Zml4dHVyZS5jbGVyay5hY2NvdW50cy5kZXYk"
  : undefined;

const clerkProxy = clerkMiddleware(
  async (auth, request) => {
    const guard = await applyCommonGuards(request);
    if (guard) return guard;

    const path = request.nextUrl.pathname;
    const isElectron = (request.headers.get("user-agent") || "").includes("Electron");
    const authHeader = request.headers.get("authorization");

    if (publicAuthPath(path) || path.startsWith("/platform/sign-in")) return NextResponse.next();

    if (isElectron) {
      if (!authHeader) return NextResponse.redirect(new URL("/desktop-auth", request.url));
      await auth.protect({ token: ["session_token", "oauth_token"] });
      return NextResponse.next();
    }

    if (isApiV1Request(path)) {
      return applyCorsHeaders(NextResponse.next(), request.headers.get("origin"));
    }

    const { signedIn: supabaseSignedIn, response } = await getSupabaseSessionState(request);
    let signedIn = supabaseSignedIn;
    if (!signedIn) {
      try {
        const authState = await auth();
        signedIn = Boolean(authState.userId);
      } catch {
        signedIn = false;
      }
    }

    return routeWebRequest(request, signedIn, response);
  },
  {
    publishableKey: process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY || previewPublishableKey,
    contentSecurityPolicy: { strict: true },
  },
);

export async function proxy(request: NextRequest, event: NextFetchEvent) {
  if (!CLERK_SERVER_CONFIGURED) {
    return supabaseOnlyProxy(request);
  }
  return clerkProxy(request, event);
}

export const config = {
  matcher: [
    "/((?!_next|forgot-password|account-recovery|recovery|desktop-auth|api/webhooks|api/health|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
    "/__clerk/(.*)",
  ],
};
