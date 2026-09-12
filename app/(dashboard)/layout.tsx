import { Sidebar } from "@/components/layout/sidebar";
import { TopNav } from "@/components/layout/top-nav";
import { PrintShortcutRouter } from "@/components/documents/print-shortcut-router";
import { listCurrentUserWorkspaces } from "@/lib/server/auth";
import { requireWorkspaceAccess } from "@/lib/server/subscriptions";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { workspace, role } = await requireWorkspaceAccess();
  const workspaces = await listCurrentUserWorkspaces();

  return (
    <div className="flex min-h-dvh w-full min-w-0 bg-background text-foreground print:block print:min-h-0 print:bg-white">
      <PrintShortcutRouter />
      <div className="sticky top-0 hidden h-dvh shrink-0 print:hidden lg:block">
        <Sidebar workspaceName={workspace.name} role={role} />
      </div>
      <div className="min-w-0 flex-1 print:block">
        <TopNav workspaceName={workspace.name} workspaceId={workspace.id} workspaces={workspaces} role={role} />
        <main className="min-w-0 overflow-x-hidden px-4 py-4 print:overflow-visible print:p-0 sm:px-5 lg:px-6 lg:py-6">
          {children}
        </main>
      </div>
    </div>
  );
}
