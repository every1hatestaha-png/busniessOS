import { z } from "zod";

import { ApiError, apiData, apiHandler, parseApiBody, requireApiContext } from "@/lib/server/api";
import { PaymentDomainError, reverseCustomerPayment } from "@/lib/server/payments";

export const POST = apiHandler(async (request: Request, { params }: { params: Promise<{ id: string }> }) => {
  const context = await requireApiContext("financial.manage");
  const { id } = z.object({ id: z.uuid() }).parse(await params);
  const body = await parseApiBody(request, z.object({ reason: z.string().trim().min(3).max(500) }));

  try {
    return apiData(await reverseCustomerPayment({ ...context, userId: context.user.id }, id, body.reason));
  } catch (error) {
    if (error instanceof PaymentDomainError) throw new ApiError(422, "PAYMENT_REVERSAL_REJECTED", error.message);
    throw error;
  }
});
