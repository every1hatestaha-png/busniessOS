import { ApiError, apiData, apiHandler, parseApiBody, requireApiContext, requireIdempotencyKey } from "@/lib/server/api";
import { createSupplierReturn, PurchaseDomainError } from "@/lib/server/purchases";
import { supplierReturnSchema } from "@/lib/validation/returns";

export const POST = apiHandler(async (request: Request) => {
  const context = await requireApiContext("financial.manage");
  const body = await request.clone().json().catch(() => ({}));
  const key = requireIdempotencyKey(request);
  const input = await parseApiBody(new Request(request.url, { method: "POST", headers: request.headers, body: JSON.stringify({ ...body, idempotencyKey: key }) }), supplierReturnSchema);
  try {
    return apiData(await createSupplierReturn({ ...context, userId: context.user.id }, input), 201);
  } catch (error) {
    if (error instanceof PurchaseDomainError) throw new ApiError(422, "SUPPLIER_RETURN_REJECTED", error.message);
    throw error;
  }
});
