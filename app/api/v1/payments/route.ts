import { PaymentDomainError, recordPayment } from "@/lib/server/payments";
import { customerPaymentMatchesRequest } from "@/lib/server/payment-idempotency";
import { ApiError, apiData, apiHandler, parseApiBody, requireApiContext, requireIdempotencyKey } from "@/lib/server/api";
import { paymentSchema } from "@/lib/validation/payment";

export const POST = apiHandler(async (request: Request) => {
  const context = await requireApiContext("payments.record");
  const body = await request.clone().json().catch(() => ({}));
  const key = requireIdempotencyKey(request);
  const input = await parseApiBody(new Request(request.url, { method: "POST", headers: request.headers, body: JSON.stringify({ ...body, idempotencyKey: key }) }), paymentSchema);
  try {
    const result = await recordPayment({ ...context, userId: context.user.id }, input);
    if (!await customerPaymentMatchesRequest(context.workspaceId, result.id, input)) {
      throw new ApiError(422, "IDEMPOTENCY_CONFLICT", "This idempotency key was already used for a different payment request.");
    }
    return apiData(result, 201);
  } catch (error) {
    if (error instanceof PaymentDomainError) {
      throw new ApiError(422, "PAYMENT_REJECTED", error.message);
    }
    throw error;
  }
});
