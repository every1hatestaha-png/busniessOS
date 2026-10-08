import { NextResponse } from "next/server";

import { CURRENT_PRIVACY_VERSION, CURRENT_TERMS_VERSION } from "@/lib/legal/policies";
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
  // An authenticated request is not evidence of agreement. Require explicit,
  // version-matched confirmations before persisting the acceptance timestamps.
  let submitted: unknown;
  try {
    submitted = await request.json();
  } catch {
    submitted = null;
  }

  const consent = submitted && typeof submitted === "object" && !Array.isArray(submitted)
    ? submitted as Record<string, unknown>
    : null;

  if (
    consent?.terms !== true ||
    consent?.privacy !== true ||
    consent?.termsVersion !== CURRENT_TERMS_VERSION ||
    consent?.privacyVersion !== CURRENT_PRIVACY_VERSION
  ) {
    return NextResponse.json(
      { error: "Explicit acceptance of the current Terms and Privacy Policy is required." },
      { status: 422, headers: { "Cache-Control": "no-store" } },
    );
  }

  await recordCurrentPolicyAcceptance(user.id);

  return NextResponse.json(
    { ok: true },
    { status: 200, headers: { "Cache-Control": "no-store" } },
  );
}
