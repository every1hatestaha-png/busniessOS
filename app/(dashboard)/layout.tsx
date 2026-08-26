import { Sidebar } from "@/components/layout/sidebar";
import { TopNav } from "@/components/layout/top-nav";
import { listCurrentUserWorkspaces, requireWorkspace } from "@/lib/server/auth";
import { getSearchResults } from "@/lib/server/search";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { workspace } = await requireWorkspace();
  const [searchResults, workspaces] = await Promise.all([getSearchResults(workspace.id), listCurrentUserWorkspaces()]);

  return (
    <div className="flex h-screen w-full overflow-hidden bg-neutral-50 text-neutral-900">
      <div className="hidden lg:block">
        <Sidebar workspaceName={workspace.name} />
      </div>
      <div className="flex flex-1 flex-col overflow-hidden">
        <TopNav workspaceName={workspace.name} workspaceId={workspace.id} workspaces={workspaces} searchResults={searchResults} />
        <main className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8">
          {children}
        </main>
      </div>
    </div>
  );
}
