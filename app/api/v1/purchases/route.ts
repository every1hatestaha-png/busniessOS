import { ApiError, apiData, apiHandler, parseApiBody, requireApiContext, requireIdempotencyKey } from "@/lib/server/api";
import { purchaseMatchesRequest } from "@/lib/server/purchase-idempotency";
import { createPurchase, listPurchases, PurchaseDomainError } from "@/lib/server/purchases";
import { purchaseSchema } from "@/lib/validation/purchase";

export const GET = apiHandler(async () => {
  const context = await requireApiContext("purchases.create");
  return apiData(await listPurchases(context.workspaceId));
});

export const POST = apiHandler(async (request: Request) => {
  const context = await requireApiContext("purchases.create");
  const body = await request.clone().json().catch(() => ({}));
  const key = requireIdempotencyKey(request);
  const input = await parseApiBody(
    new Request(request.url, {
      method: "POST",
      headers: request.headers,
      body: JSON.stringify({ ...body, idempotencyKey: key }),
    }),
    purchaseSchema,
  );
  try {
    const result = await createPurchase({ ...context, userId: context.user.id }, input);
    if (!await purchaseMatchesRequest(context.workspaceId, result.id, input)) {
      throw new ApiError(422, "IDEMPOTENCY_CONFLICT", "This idempotency key was already used for a different purchase request.");
    }
    return apiData(result, 201);
  } catch (error) {
    if (error instanceof PurchaseDomainError) throw new ApiError(422, error.code, error.message);
    throw error;
  }
});