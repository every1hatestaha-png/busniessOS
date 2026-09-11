import { z } from "zod";

import { ApiError, apiData, apiHandler, parseApiBody, requireApiContext } from "@/lib/server/api";
import { cancelCustomerReturn, CustomerReturnReversalError } from "@/lib/server/customer-return-reversals";

export const POST = apiHandler(async (request: Request, { params }: { params: Promise<{ id: string }> }) => {
  const context = await requireApiContext("financial.manage");
  const { id } = z.object({ id: z.uuid() }).parse(await params);
  const body = await parseApiBody(request, z.object({ reason: z.string().trim().min(3).max(500) }));

  try {
    return apiData(await cancelCustomerReturn({ ...context, userId: context.user.id }, id, body.reason));
  } catch (error) {
    if (error instanceof CustomerReturnReversalError) throw new ApiError(422, "CUSTOMER_RETURN_CANCELLATION_REJECTED", error.message);
    throw error;
  }
});
