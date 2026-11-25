import { ApiError, apiData, apiHandler, parseApiBody, requireApiContext, requireApiUser } from "@/lib/server/api";
import { getCurrentWorkspace } from "@/lib/server/auth";
import { PaymentRequiredError } from "@/lib/saas/payment-first";
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
  // Workspace POST is an onboarding exception to requireApiContext because new
  // users have no membership yet. Existing Restaurant STAFF must still stay
  // within their station-only API boundary, including stale-cookie fallback.
  const currentWorkspace = await getCurrentWorkspace();
  if (currentWorkspace?.vertical === "RESTAURANT" && currentWorkspace.role === "STAFF") {
    throw new ApiError(403, "STATION_ONLY", "This account can only access its assigned restaurant station.");
  }
  const input = await parseApiBody(request, onboardingSchema);
  const idempotencyKey = request.headers.get("Idempotency-Key")?.trim() || undefined;
  try {
    return apiData(await createInitialWorkspace(user.id, input, undefined, { provisioningRequestId: idempotencyKey }), 201);
  } catch (error) {
    if (error instanceof PaymentRequiredError) throw new ApiError(403, "PAYMENT_REQUIRED", error.message);
    throw error;
  }
});
