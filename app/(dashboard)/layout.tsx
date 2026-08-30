import { Sidebar } from "@/components/layout/sidebar";
import { TopNav } from "@/components/layout/top-nav";
import { listCurrentUserWorkspaces, requireWorkspace } from "@/lib/server/auth";
import { getSearchResults } from "@/lib/server/search";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { workspace, role } = await requireWorkspace();
  const [searchResults, workspaces] = await Promise.all([getSearchResults(workspace.id), listCurrentUserWorkspaces()]);

  return (
    <div className="flex h-screen w-full overflow-hidden bg-neutral-50 text-neutral-900 print:block print:h-auto print:overflow-visible print:bg-white">
      <div className="hidden print:hidden lg:block">
        <Sidebar workspaceName={workspace.name} role={role} />
      </div>
      <div className="flex flex-1 flex-col overflow-hidden print:block print:overflow-visible">
        <TopNav workspaceName={workspace.name} workspaceId={workspace.id} workspaces={workspaces} searchResults={searchResults} role={role} />
        <main className="flex-1 overflow-y-auto p-4 print:overflow-visible print:p-0 md:p-6 lg:p-8">
          {children}
        </main>
      </div>
    </div>
  );
}
