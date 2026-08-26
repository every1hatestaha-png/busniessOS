import { PaymentDomainError, recordPayment } from "@/lib/server/payments";
import { ApiError, apiData, apiHandler, parseApiBody, requireApiContext } from "@/lib/server/api";
import { paymentSchema } from "@/lib/validation/payment";

export const POST = apiHandler(async (request: Request) => {
  const context = await requireApiContext("payments.record");
  const input = await parseApiBody(request, paymentSchema);
  try {
    return apiData(await recordPayment({ ...context, userId: context.user.id }, input), 201);
  } catch (error) {
    if (error instanceof PaymentDomainError) {
      throw new ApiError(422, "PAYMENT_REJECTED", error.message);
    }
    throw error;
  }
});
