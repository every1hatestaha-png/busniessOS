import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { POST_AUTH_PATH, safeInternalDestination } from "@/lib/auth-routing";
import { isPlatformOwner } from "@/lib/platform-access";
import { getCurrentWorkspace } from "@/lib/server/auth";
import { getSupabaseAuthUser } from "@/lib/supabase/server";
import { resolveVerticalDashboard } from "@/lib/verticals/registry";

export async function GET(request: Request) {
  const user = await getSupabaseAuthUser();
  if (!user?.email_confirmed_at) {
    return NextResponse.redirect(new URL("/sign-in", request.url));
  }

  const requested = new URL(request.url).searchParams.get("next");
  const safeNext = safeInternalDestination(requested, request.url, "");
  const destinationPath = safeNext ? new URL(safeNext, request.url).pathname : "";
  // The platform owner may not belong to a customer workspace. The owner route
  // must be resolved BEFORE regular workspace onboarding, with its own gate.
  if (/^\\/(?:platform|admin)(?:\\/|$)/.test(destinationPath)) {
    const owner = isPlatformOwner(
      user,
      process.env.MUNSHIOS_PLATFORM_OWNER_EMAIL,
      process.env.MUNSHIOS_PLATFORM_OWNER_SUPABASE_ID,
    );
    const response = NextResponse.redirect(new URL(owner ? "/platform" : "/dashboard", request.url));
    response.headers.set("Cache-Control", "no-store");
    return response;
  }

  // Shared resolution scopes memberships to the verified local user, validates
  // the active cookie, and rejects unavailable verticals. Never query by a
  // caller-supplied workspace ID without that membership boundary.
  const context = await getCurrentWorkspace();
  if (!context) return NextResponse.redirect(new URL("/onboarding", request.url));

  const home = resolveVerticalDashboard(context.vertical) ?? "/workspace-unavailable";
  const safeDestination = safeInternalDestination(requested, request.url, home);
  const destination = new URL(safeDestination, request.url).pathname === POST_AUTH_PATH ? home : safeDestination;
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
