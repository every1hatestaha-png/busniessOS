import { NextResponse } from "next/server";

import { getAuthenticatedUser } from "@/lib/server/auth";
import { recordCurrentPolicyAcceptance } from "@/lib/server/legal";
import { isTrustedMutationOrigin } from "@/lib/server/cors";

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  const requestOrigin = new URL(request.url).origin;
  if (!isTrustedMutationOrigin(origin, requestOrigin)) {
    return NextResponse.json(
      { error: "This request origin is not allowed." },
      { status: 403, headers: { "Cache-Control": "no-store" } },
    );
  }

  const user = await getAuthenticatedUser();
  await recordCurrentPolicyAcceptance(user.id);

  return NextResponse.json(
    { ok: true },
    { status: 200, headers: { "Cache-Control": "no-store" } },
  );
}
