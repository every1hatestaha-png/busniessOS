import { NextResponse } from "next/server";

import { hasFreshRecoveryProof } from "@/lib/auth-recovery-proof";
import { hasRecoveryMarker } from "@/lib/server/recovery-session";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createSupabaseServerClient();
  const [{ data: userData, error: userError }, { data: claimsData, error: claimsError }, marker] = await Promise.all([
    supabase.auth.getUser(),
    supabase.auth.getClaims(),
    hasRecoveryMarker(),
  ]);

  const valid = Boolean(
    marker
      && !userError
      && userData.user?.email_confirmed_at
      && !claimsError
      && hasFreshRecoveryProof(claimsData?.claims),
  );

  return NextResponse.json(
    { valid },
    { status: valid ? 200 : 403, headers: { "Cache-Control": "no-store" } },
  );
}
