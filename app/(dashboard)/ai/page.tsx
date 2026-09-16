import { AssistantChat } from "@/components/ai/assistant-chat";
import { requireWorkspace } from "@/lib/server/auth";

export default async function AIPage() {
  const { workspace } = await requireWorkspace();

  return (
    <div className="-mx-4 -my-4 h-[calc(100dvh-4rem)] min-h-[620px] overflow-hidden sm:-mx-5 lg:-mx-6 lg:-my-6">
      <AssistantChat workspaceId={workspace.id} workspaceName={workspace.name} />
    </div>
  );
}
