import { ApiError, apiData, apiHandler, parseApiBody, requireApiContext, requireApiUser } from "@/lib/server/api";
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
  const input = await parseApiBody(request, onboardingSchema);
  const idempotencyKey = request.headers.get("Idempotency-Key")?.trim() || undefined;
  try {
    return apiData(await createInitialWorkspace(user.id, input, undefined, { provisioningRequestId: idempotencyKey }), 201);
  } catch (error) {
    if (error instanceof PaymentRequiredError) throw new ApiError(403, "PAYMENT_REQUIRED", error.message);
    throw error;
  }
});
