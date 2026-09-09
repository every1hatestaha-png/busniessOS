import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export function GET() {
  const publishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
  const oauthClientId = process.env.CLERK_OAUTH_CLIENT_ID;

  if (!publishableKey || !oauthClientId) {
    return NextResponse.json(
      { error: "Desktop authentication is not configured." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  return NextResponse.json(
    { publishableKey, oauthClientId },
    {
      headers: {
        "Cache-Control": "no-store",
        "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
      },
    },
  );
}
