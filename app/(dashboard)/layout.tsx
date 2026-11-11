import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { canOpenRestaurantStaffPage, shouldShowWorkspaceSwitcher } from "@/lib/restaurant/station-access";

import { Sidebar } from "@/components/layout/sidebar";
import { outboundGatePassDraftFeatureEnabled } from "@/lib/server/outbound-gate-pass-feature";
import { TopNav } from "@/components/layout/top-nav";
import { PrintShortcutRouter } from "@/components/documents/print-shortcut-router";
import { listCurrentUserWorkspaces, requireWorkspace } from "@/lib/server/auth";
import { listWorkspaceModules } from "@/lib/server/industry-modules";
import { getWorkspaceAccess } from "@/lib/server/subscriptions";
import { getRestaurantActorStation } from "@/lib/server/restaurant-stations";
import { resolveWorkspaceVertical } from "@/lib/verticals/registry";
import { isPlatformOwner } from "@/lib/platform-access";
import { getSupabaseAuthUser } from "@/lib/supabase/server";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { workspace, role, user } = await requireWorkspace();
  const vertical = resolveWorkspaceVertical(workspace);
  const restaurantStation = vertical === "RESTAURANT"
    ? await getRestaurantActorStation({ workspaceId: workspace.id, userId: user.id, role })
    : null;

  // The station sidebar is only visual. Reject prohibited RESTAURANT STAFF
  // page requests server-side before loading generic ERP or finance records.
  // The path is overwritten by proxy.ts from request.nextUrl.pathname.
  if (vertical === "RESTAURANT" && role === "STAFF") {
    const trustedPath = (await headers()).get("x-munshios-internal-path");
    if (!canOpenRestaurantStaffPage(trustedPath, restaurantStation)) notFound();
  }

  // Restaurant station accounts stay inside their assigned workspace UI.
  // Do not query or serialize other workspace names into a STAFF station page.
  const showWorkspaceSwitcher = shouldShowWorkspaceSwitcher(vertical, role);
  const workspacesPromise = showWorkspaceSwitcher
    ? listCurrentUserWorkspaces()
    : Promise.resolve([] as Awaited<ReturnType<typeof listCurrentUserWorkspaces>>);
  const [workspaces, subscription, workspaceModules] = await Promise.all([
    workspacesPromise,
    getWorkspaceAccess(workspace.id),
    listWorkspaceModules(workspace.id),
  ]);
  const enabledModules = workspaceModules.filter((module) => module.enabled).map((module) => module.moduleKey);
  const gatePassEnabled = outboundGatePassDraftFeatureEnabled(workspace.id);
  const platformIdentity = await getSupabaseAuthUser();
  const platformOwner = isPlatformOwner(platformIdentity, process.env.MUNSHIOS_PLATFORM_OWNER_EMAIL, process.env.MUNSHIOS_PLATFORM_OWNER_SUPABASE_ID);

  return (
    <div className="flex min-h-dvh w-full min-w-0 bg-background text-foreground print:block print:min-h-0 print:bg-white">
      <PrintShortcutRouter />
      <div className="sticky top-0 hidden h-dvh shrink-0 print:hidden lg:block">
        <Sidebar workspaceName={workspace.name} gatePassEnabled={gatePassEnabled} role={role} enabledModules={enabledModules} vertical={vertical} restaurantStation={restaurantStation} />
      </div>
      <div className="min-w-0 flex-1 print:block">
        <TopNav workspaceName={workspace.name} workspaceId={workspace.id} gatePassEnabled={gatePassEnabled} workspaces={workspaces} role={role} enabledModules={enabledModules} vertical={vertical} restaurantStation={restaurantStation} platformOwner={platformOwner} preferWebAccountMenu={process.env.MUNSHIOS_DEPLOYMENT_ENVIRONMENT === "staging"} />
        {!subscription.allowed && (
          <div className="border-b border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-950 print:hidden sm:px-5 lg:px-6">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span>
                {subscription.reason === "suspended"
                  ? "This workspace is suspended. You can still review existing data, but changes are disabled."
                  : "Your trial or subscription has expired. Existing data remains available in read-only mode."}
              </span>
              <Link href="/subscription" className="font-semibold underline underline-offset-4">View access details</Link>
            </div>
          </div>
        )}
        {subscription.allowed && subscription.reason === "trial" && subscription.daysRemaining !== null && subscription.daysRemaining <= 7 && (
          <div className="border-b border-blue-200 bg-blue-50 px-4 py-2.5 text-sm text-blue-950 print:hidden sm:px-5 lg:px-6">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span>Your MunshiOS trial has {subscription.daysRemaining} day{subscription.daysRemaining === 1 ? "" : "s"} remaining.</span>
              <Link href="/subscription" className="font-semibold underline underline-offset-4">View subscription</Link>
            </div>
          </div>
        )}
        <main className="min-w-0 overflow-x-hidden px-4 py-4 print:overflow-visible print:p-0 sm:px-5 lg:px-6 lg:py-6">
          {children}
        </main>
      </div>
    </div>
  );
}
