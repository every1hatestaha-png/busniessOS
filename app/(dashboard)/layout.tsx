import Link from "next/link";

import { Sidebar } from "@/components/layout/sidebar";
import { TopNav } from "@/components/layout/top-nav";
import { PrintShortcutRouter } from "@/components/documents/print-shortcut-router";
import { listCurrentUserWorkspaces, requireWorkspace } from "@/lib/server/auth";
import { getWorkspaceAccess } from "@/lib/server/subscriptions";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { workspace, role } = await requireWorkspace();
  const [workspaces, subscription] = await Promise.all([
    listCurrentUserWorkspaces(),
    getWorkspaceAccess(workspace.id),
  ]);

  return (
    <div className="flex min-h-dvh w-full min-w-0 bg-background text-foreground print:block print:min-h-0 print:bg-white">
      <PrintShortcutRouter />
      <div className="sticky top-0 hidden h-dvh shrink-0 print:hidden lg:block">
        <Sidebar workspaceName={workspace.name} role={role} />
      </div>
      <div className="min-w-0 flex-1 print:block">
        <TopNav workspaceName={workspace.name} workspaceId={workspace.id} workspaces={workspaces} role={role} />
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
