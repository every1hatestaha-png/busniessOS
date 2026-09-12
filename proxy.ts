import { clerkMiddleware } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import { applyCorsHeaders, corsPreflightResponse, isApiV1Request } from "@/lib/server/cors";

function d4ProxyLog(message: string) {
  console.info(`[D4][proxy] ${message}`);
}

const handleProxy = clerkMiddleware(async (auth, request) => {
  const path = request.nextUrl.pathname;
  const userAgent = request.headers.get("user-agent") || "";
  const isElectron = userAgent.includes("Electron");
  const authHeader = request.headers.get("authorization");

  if (isElectron && (path === "/" || path === "/dashboard")) {
    d4ProxyLog(`root request URL origin=${request.nextUrl.origin} pathname=${path}`);
  }

  if (path.startsWith("/desktop-auth") || path === "/api/desktop-config") {
    return NextResponse.next();
  }

  // Keep the web root as a safe entry point. app/page.tsx resolves the session
  // and redirects signed-out visitors to /sign-in, while all real app routes
  // remain protected below. This also avoids Clerk dev-browser protection
  // rewriting a fresh visit to the site root into a 404 before the page can
  // perform its own auth-aware redirect.
  if (!isElectron && path === "/") {
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
    await auth.protect();
  }

  if (isApiV1Request(path)) {
    return applyCorsHeaders(NextResponse.next(), request.headers.get("origin"));
  }

  return NextResponse.next();
});

export { handleProxy as proxy };

export const config = {
  matcher: [
    "/((?!_next|sign-in|sign-up|desktop-auth|api/webhooks|api/health|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
  ],
};
