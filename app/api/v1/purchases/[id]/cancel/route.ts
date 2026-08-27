import { z } from "zod";
import { ApiError, apiData, apiHandler, parseApiBody, requireApiContext } from "@/lib/server/api";
import { cancelPurchase, PurchaseDomainError } from "@/lib/server/purchases";

export const POST = apiHandler(async (request: Request, { params }: { params: Promise<{ id: string }> }) => {
  const context = await requireApiContext("financial.manage");
  const { id } = z.object({ id: z.uuid() }).parse(await params);
  const body = await parseApiBody(request, z.object({ reverseInitialPayment: z.boolean().default(false) }));
  try {
    return apiData(await cancelPurchase({ ...context, userId: context.user.id }, id, body.reverseInitialPayment));
  } catch (error) {
    if (error instanceof PurchaseDomainError) throw new ApiError(422, "PURCHASE_CANCELLATION_REJECTED", error.message);
    throw error;
  }
});
