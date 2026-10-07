import { NextResponse } from "next/server";

import { getOptionalCurrentUser } from "@/lib/server/auth";
import { recordCurrentPolicyAcceptance } from "@/lib/server/legal";
import { isSameOriginWebMutation } from "@/lib/server/cors";

export async function POST(request: Request) {
  if (!isSameOriginWebMutation(request)) {
    return NextResponse.json(
      { error: "This request origin is not allowed." },
      { status: 403, headers: { "Cache-Control": "no-store" } },
    );
  }

  const user = await getOptionalCurrentUser();
  if (!user) {
    return NextResponse.json(
      { error: "Authentication required." },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }
  await recordCurrentPolicyAcceptance(user.id);

  return NextResponse.json(
    { ok: true },
    { status: 200, headers: { "Cache-Control": "no-store" } },
  );
}
