import { clerkMiddleware } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import { applyCorsHeaders, corsPreflightResponse, isApiV1Request } from "@/lib/server/cors";

export const proxy = clerkMiddleware(async (auth, request) => {
  const path = request.nextUrl.pathname;
  if (isApiV1Request(path) && request.method === "OPTIONS") {
    return corsPreflightResponse(request);
  }

  if (!isApiV1Request(path)) {
    await auth.protect();
  }

  if (isApiV1Request(path)) {
    return applyCorsHeaders(NextResponse.next(), request.headers.get("origin"));
  }

  return NextResponse.next();
});

export const config = {
  matcher: [
    "/((?!_next|sign-in|sign-up|api/webhooks|api/health|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
  ],
};
