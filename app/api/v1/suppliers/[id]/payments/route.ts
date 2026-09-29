import { z } from "zod";
import { ApiError, apiData, apiHandler, parseApiBody, requireApiContext, requireIdempotencyKey } from "@/lib/server/api";
import { supplierPaymentMatchesRequest } from "@/lib/server/payment-idempotency";
import { recordSupplierPayment, SupplierDomainError } from "@/lib/server/suppliers";
import { supplierPaymentSchema } from "@/lib/validation/supplier";

export const POST = apiHandler(async (request: Request, { params }: { params: Promise<{ id: string }> }) => {
  const context = await requireApiContext("payments.record");
  const { id } = z.object({ id: z.uuid() }).parse(await params);
  const body = await request.clone().json().catch(() => ({}));
  const key = requireIdempotencyKey(request);
  const input = await parseApiBody(new Request(request.url, { method: "POST", headers: request.headers, body: JSON.stringify({ ...body, idempotencyKey: key }) }), supplierPaymentSchema);
  try {
    const result = await recordSupplierPayment({ ...context, userId: context.user.id }, id, input);
    if (!await supplierPaymentMatchesRequest(context.workspaceId, id, result.id, input)) {
      throw new ApiError(422, "IDEMPOTENCY_CONFLICT", "This idempotency key was already used for a different supplier payment request.");
    }
    return apiData(result, 201);
  } catch (error) {
    if (error instanceof SupplierDomainError) throw new ApiError(422, "SUPPLIER_PAYMENT_ERROR", error.message);
    throw error;
  }
});
