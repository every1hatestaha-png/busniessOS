import { z } from "zod";

import { apiData, apiHandler, parseApiBody, requireApiContext } from "@/lib/server/api";
import { askLiveBusinessAssistant } from "@/lib/server/ai-assistant";

const chatSchema = z.object({
  question: z.string().trim().min(1).max(2_000),
  history: z.array(z.object({
    role: z.enum(["user", "assistant"]),
    content: z.string().trim().min(1).max(2_000),
  })).max(10).default([]),
});

export const POST = apiHandler(async (request: Request) => {
  const context = await requireApiContext("business.read");
  const input = await parseApiBody(request, chatSchema);
  const response = await askLiveBusinessAssistant(
    {
      workspaceId: context.workspaceId,
      workspace: {
        name: context.workspace.name,
        timezone: context.workspace.timezone,
        currency: context.workspace.currency,
      },
      role: context.role,
    },
    input.question,
    input.history,
  );
  return apiData(response);
});
