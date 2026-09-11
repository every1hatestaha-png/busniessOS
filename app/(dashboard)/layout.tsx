import { Sidebar } from "@/components/layout/sidebar";
import { TopNav } from "@/components/layout/top-nav";
import { listCurrentUserWorkspaces, requireWorkspace } from "@/lib/server/auth";
import { getSearchResults } from "@/lib/server/search";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  console.info("[D4][root] dashboard layout entered");
  console.info("[D4][root] before workspace resolution");
  const { workspace, role } = await requireWorkspace();
  console.info("[D4][root] after workspace resolution");
  console.info(`[D4][dashboard] request success=YES workspaceFound=YES role=${role}`);
  const [searchResults, workspaces] = await Promise.all([getSearchResults(workspace.id), listCurrentUserWorkspaces()]);
  console.info("[D4][root] before page render");

  const rendered = (
    <div className="flex h-screen w-full overflow-hidden bg-background text-foreground print:block print:h-auto print:overflow-visible print:bg-white">
      <div className="hidden print:hidden lg:block">
        <Sidebar workspaceName={workspace.name} role={role} />
      </div>
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden print:block print:overflow-visible">
        <TopNav workspaceName={workspace.name} workspaceId={workspace.id} workspaces={workspaces} searchResults={searchResults} role={role} />
        <main className="flex-1 overflow-y-auto px-4 py-4 print:overflow-visible print:p-0 lg:px-6 lg:py-6">
          {children}
        </main>
      </div>
    </div>
  );
  console.info("[D4][root] page render completed");
  return rendered;
}
