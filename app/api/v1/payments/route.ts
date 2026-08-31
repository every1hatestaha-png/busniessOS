import { PaymentDomainError, recordPayment } from "@/lib/server/payments";
import { ApiError, apiData, apiHandler, parseApiBody, requireApiContext, requireIdempotencyKey } from "@/lib/server/api";
import { paymentSchema } from "@/lib/validation/payment";

export const POST = apiHandler(async (request: Request) => {
  const context = await requireApiContext("payments.record");
  const body = await request.clone().json().catch(() => ({}));
  const key = requireIdempotencyKey(request);
  const input = await parseApiBody(new Request(request.url, { method: "POST", headers: request.headers, body: JSON.stringify({ ...body, idempotencyKey: key }) }), paymentSchema);
  try {
    return apiData(await recordPayment({ ...context, userId: context.user.id }, input), 201);
  } catch (error) {
    if (error instanceof PaymentDomainError) {
      throw new ApiError(422, "PAYMENT_REJECTED", error.message);
    }
    throw error;
  }
});
