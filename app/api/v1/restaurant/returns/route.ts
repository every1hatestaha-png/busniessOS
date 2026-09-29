import { ApiError, apiData, apiHandler, parseApiBody, requireApiContext, requireIdempotencyKey } from "@/lib/server/api";
import { IndustryDomainError } from "@/lib/server/industry-modules";
import { returnRestaurantItems } from "@/lib/server/restaurant-returns";
import { restaurantItemReturnApiSchema } from "@/lib/validation/restaurant-returns";

function toApiError(error: IndustryDomainError) {
  switch (error.code) {
    case "PERMISSION_DENIED":
      return new ApiError(403, "RESTAURANT_RETURN_FORBIDDEN", error.message);
    case "NOT_FOUND":
      return new ApiError(404, "RESTAURANT_RETURN_NOT_FOUND", error.message);
    case "CONFLICT":
      return new ApiError(409, "RESTAURANT_RETURN_CONFLICT", error.message);
    case "MODULE_DISABLED":
      return new ApiError(409, "RESTAURANT_MODULE_DISABLED", error.message);
    case "INSUFFICIENT_STOCK":
    case "INVALID_STATE":
    default:
      return new ApiError(422, "RESTAURANT_RETURN_REJECTED", error.message);
  }
}

export const POST = apiHandler(async (request: Request) => {
  const context = await requireApiContext("returns.create");
  const body = await request.clone().json().catch(() => ({}));
  const idempotencyKey = requireIdempotencyKey(request);
  const input = await parseApiBody(
    new Request(request.url, {
      method: "POST",
      headers: request.headers,
      body: JSON.stringify({ ...body, idempotencyKey }),
    }),
    restaurantItemReturnApiSchema,
  );

  try {
    const result = await returnRestaurantItems(
      {
        workspaceId: context.workspaceId,
        role: context.role,
        userId: context.user.id,
      },
      input,
    );
    return apiData(result, result.idempotent ? 200 : 201);
  } catch (error) {
    if (error instanceof IndustryDomainError) throw toApiError(error);
    throw error;
  }
});
