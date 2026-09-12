import { Sidebar } from "@/components/layout/sidebar";
import { TopNav } from "@/components/layout/top-nav";
import { PrintShortcutRouter } from "@/components/documents/print-shortcut-router";
import { listCurrentUserWorkspaces, requireWorkspace } from "@/lib/server/auth";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { workspace, role } = await requireWorkspace();
  const workspaces = await listCurrentUserWorkspaces();

  const rendered = (
    <div className="flex h-screen w-full overflow-hidden bg-background text-foreground print:block print:h-auto print:overflow-visible print:bg-white">
      <PrintShortcutRouter />
      <div className="hidden print:hidden lg:block">
        <Sidebar workspaceName={workspace.name} role={role} />
      </div>
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden print:block print:overflow-visible">
        <TopNav workspaceName={workspace.name} workspaceId={workspace.id} workspaces={workspaces} role={role} />
        <main className="flex-1 overflow-y-auto px-4 py-4 print:overflow-visible print:p-0 lg:px-6 lg:py-6">
          {children}
        </main>
      </div>
    </div>
  );
  return rendered;
}
