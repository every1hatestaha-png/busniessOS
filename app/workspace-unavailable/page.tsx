import { cookies } from "next/headers";
import { WorkspaceSwitcher } from "@/components/layout/workspace-switcher";
import { listCurrentUserWorkspaces } from "@/lib/server/auth";

export default async function WorkspaceUnavailablePage() {
  const workspaces = await listCurrentUserWorkspaces();
  const activeId = (await cookies()).get("businessos_workspace")?.value ?? workspaces[0]?.workspaceId ?? "";
  return <main className="mx-auto max-w-lg space-y-4 p-8">
    <h1 className="text-xl font-semibold">This workspace experience is not available yet</h1>
    <p>Select another workspace to continue.</p>
    <WorkspaceSwitcher activeId={activeId} workspaces={workspaces} />
  </main>;
}
