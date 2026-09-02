import { z } from "zod";
import { ApiError, apiData, apiHandler, requireApiContext } from "@/lib/server/api";
import { getPurchase, updatePurchase, deletePurchase, PurchaseDomainError } from "@/lib/server/purchases";

export const GET = apiHandler(async (_request: Request, { params }: { params: Promise<{ id: string }> }) => {
  const context = await requireApiContext("business.read");
  const { id } = z.object({ id: z.uuid() }).parse(await params);
  const purchase = await getPurchase(context.workspaceId, id);
  if (!purchase) throw new ApiError(404, "NOT_FOUND", "Purchase not found.");
  return apiData(purchase);
});

export const PATCH = apiHandler(async (request: Request, { params }: { params: Promise<{ id: string }> }) => {
  const context = await requireApiContext("business.write");
  const { id } = z.object({ id: z.uuid() }).parse(await params);
  const body = await request.json();

  try {
    const updated = await updatePurchase(context, id, body);
    const purchase = await getPurchase(context.workspaceId, id);
    return apiData(purchase);
  } catch (error) {
    if (error instanceof PurchaseDomainError) {
      const status = error.code === "PURCHASE_NOT_FOUND" ? 404 : error.code === "CANNOT_EDIT_PO" ? 400 : 500;
      throw new ApiError(status, error.code, error.message);
    }
    throw error;
  }
});

export const DELETE = apiHandler(async (_request: Request, { params }: { params: Promise<{ id: string }> }) => {
  const context = await requireApiContext("business.delete");
  const { id } = z.object({ id: z.uuid() }).parse(await params);

  try {
    const deleted = await deletePurchase(context, id);
    return apiData({ success: true, id: deleted.id, orderNumber: deleted.orderNumber });
  } catch (error) {
    if (error instanceof PurchaseDomainError) {
      const status = error.code === "PURCHASE_NOT_FOUND" ? 404 : error.code === "CANNOT_DELETE_PO" ? 400 : 500;
      throw new ApiError(status, error.code, error.message);
    }
    throw error;
  }
});

