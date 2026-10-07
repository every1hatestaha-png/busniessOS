import { apiData, apiHandler, parseApiBody, requireApiContext, requireApiUser } from "@/lib/server/api";
import { createInitialWorkspace } from "@/lib/server/onboarding";
import { onboardingSchema } from "@/lib/validation/onboarding";

export const GET = apiHandler(async () => {
  const { workspace } = await requireApiContext("business.read");
  return apiData({
    ...workspace,
    createdAt: workspace.createdAt.toISOString(),
    updatedAt: workspace.updatedAt.toISOString(),
  });
});

export const POST = apiHandler(async (request: Request) => {
  const user = await requireApiUser();
  const input = await parseApiBody(request, onboardingSchema);
  const idempotencyKey = request.headers.get("Idempotency-Key")?.trim() || undefined;
  return apiData(await createInitialWorkspace(user.id, input, undefined, { provisioningRequestId: idempotencyKey }), 201);
});
