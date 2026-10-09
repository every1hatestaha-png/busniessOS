import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { POST_AUTH_PATH, safeInternalDestination } from "@/lib/auth-routing";
import { onboardingRouteFromBuilderParams } from "@/lib/saas/provisioning-selection";
import { getCurrentWorkspace } from "@/lib/server/auth";
import { getSupabaseAuthUser } from "@/lib/supabase/server";
import { resolveVerticalDashboard } from "@/lib/verticals/registry";

export async function GET(request: Request) {
  const user = await getSupabaseAuthUser();
  if (!user?.email_confirmed_at) {
    return NextResponse.redirect(new URL("/sign-in", request.url));
  }

  // Shared resolution scopes memberships to the verified local user, validates
  // the active cookie, and rejects unavailable verticals. Never query by a
  // caller-supplied workspace ID without that membership boundary.
  const context = await getCurrentWorkspace();
  if (!context) {
    // Signup may have arrived from Get Your Munshi through OTP or an email
    // verification link. Preserve only recognized onboarding preferences,
    // never an arbitrary post-auth destination for a new workspace.
    const next = safeInternalDestination(new URL(request.url).searchParams.get("next"), request.url, "/onboarding");
    const candidate = new URL(next, request.url);
    const onboardingRoute = candidate.pathname === "/onboarding"
      ? onboardingRouteFromBuilderParams(candidate.searchParams)
      : null;
    const response = NextResponse.redirect(new URL(onboardingRoute ?? "/onboarding", request.url));
    response.headers.set("Cache-Control", "no-store");
    return response;
  }

  const home = resolveVerticalDashboard(context.vertical) ?? "/workspace-unavailable";
  const requested = new URL(request.url).searchParams.get("next");
  const safeNext = safeInternalDestination(requested, request.url, home);
  const destination = new URL(safeNext, request.url).pathname === POST_AUTH_PATH ? home : safeNext;
  const response = NextResponse.redirect(new URL(destination, request.url));
  response.headers.set("Cache-Control", "no-store");
  if ((await cookies()).get("businessos_workspace")?.value !== context.workspaceId) {
    response.cookies.set("businessos_workspace", context.workspaceId, {
      httpOnly: true, sameSite: "lax", secure: new URL(request.url).protocol === "https:",
      path: "/", maxAge: 60 * 60 * 24 * 365,
    });
  }
  return response;
}
