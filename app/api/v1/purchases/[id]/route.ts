import { z } from "zod";
import { ApiError, apiData, apiHandler, parseApiBody, requireApiContext } from "@/lib/server/api";
import { getPurchase, updatePurchase, deletePurchase, PurchaseDomainError } from "@/lib/server/purchases";
import { updatePurchaseSchema } from "@/lib/validation/purchase";

export const GET = apiHandler(async (_request: Request, { params }: { params: Promise<{ id: string }> }) => {
  const context = await requireApiContext("business.read");
  const { id } = z.object({ id: z.uuid() }).parse(await params);
  const purchase = await getPurchase(context.workspaceId, id);
  if (!purchase) throw new ApiError(404, "NOT_FOUND", "Purchase not found.");
  return apiData(purchase);
});

export const PATCH = apiHandler(async (request: Request, { params }: { params: Promise<{ id: string }> }) => {
  const context = await requireApiContext("financial.manage");
  const { id } = z.object({ id: z.uuid() }).parse(await params);
  const body = await parseApiBody(request, updatePurchaseSchema);

  try {
    await updatePurchase({ ...context, userId: context.user.id }, id, body);
    const purchase = await getPurchase(context.workspaceId, id);
    return apiData(purchase);
  } catch (error) {
    if (error instanceof PurchaseDomainError) {
      const status = error.code === "PURCHASE_NOT_FOUND" ? 404 : 422;
      throw new ApiError(status, error.code, error.message);
    }
    throw error;
  }
});

export const DELETE = apiHandler(async (_request: Request, { params }: { params: Promise<{ id: string }> }) => {
  const context = await requireApiContext("financial.manage");
  const { id } = z.object({ id: z.uuid() }).parse(await params);

  try {
    const deleted = await deletePurchase({ ...context, userId: context.user.id }, id);
    return apiData({ success: true, id: deleted.id, orderNumber: deleted.orderNumber });
  } catch (error) {
    if (error instanceof PurchaseDomainError) {
      const status = error.code === "PURCHASE_NOT_FOUND" ? 404 : 422;
      throw new ApiError(status, error.code, error.message);
    }
    throw error;
  }
});
