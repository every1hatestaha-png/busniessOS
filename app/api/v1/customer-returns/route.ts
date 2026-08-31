import { ApiError, apiData, apiHandler, parseApiBody, requireApiContext, requireIdempotencyKey } from "@/lib/server/api";
import { createCustomerReturn, SaleDomainError } from "@/lib/server/sales";
import { customerReturnSchema } from "@/lib/validation/returns";

export const POST = apiHandler(async (request: Request) => {
  const context = await requireApiContext("financial.manage");
  const body = await request.clone().json().catch(() => ({}));
  const key = requireIdempotencyKey(request);
  const input = await parseApiBody(new Request(request.url, { method: "POST", headers: request.headers, body: JSON.stringify({ ...body, idempotencyKey: key }) }), customerReturnSchema);
  try {
    return apiData(await createCustomerReturn({ ...context, userId: context.user.id }, input), 201);
  } catch (error) {
    if (error instanceof SaleDomainError) throw new ApiError(422, "CUSTOMER_RETURN_REJECTED", error.message);
    throw error;
  }
});
