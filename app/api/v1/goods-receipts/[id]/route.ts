import { z } from "zod";
import { ApiError, apiData, apiHandler, requireApiContext } from "@/lib/server/api";
import { getGoodsReceipt, updateGoodsReceipt, voidGoodsReceipt, deleteGoodsReceipt, PurchaseDomainError } from "@/lib/server/purchases";

export const GET = apiHandler(async (_request: Request, { params }: { params: Promise<{ id: string }> }) => {
  const context = await requireApiContext("business.read");
  const { id } = z.object({ id: z.uuid() }).parse(await params);
  const grn = await getGoodsReceipt(context.workspaceId, id);
  if (!grn) throw new ApiError(404, "NOT_FOUND", "Goods receipt not found.");
  return apiData(grn);
});

export const PATCH = apiHandler(async (request: Request, { params }: { params: Promise<{ id: string }> }) => {
  const context = await requireApiContext("inventory.adjust");
  const { id } = z.object({ id: z.uuid() }).parse(await params);
  const body = await request.json();

  try {
    const updated = await updateGoodsReceipt(context, id, body);
    return apiData(updated);
  } catch (error) {
    if (error instanceof PurchaseDomainError) {
      const status = error.code === "GRN_NOT_FOUND" ? 404 : 422;
      throw new ApiError(status, error.code, error.message);
    }
    throw error;
  }
});

export const POST = apiHandler(async (request: Request, { params }: { params: Promise<{ id: string }> }) => {
  const context = await requireApiContext("inventory.adjust");
  const { id } = z.object({ id: z.uuid() }).parse(await params);
  const body = await request.json();

  try {
    const voided = await voidGoodsReceipt(context, id, body);
    return apiData(voided);
  } catch (error) {
    if (error instanceof PurchaseDomainError) {
      const status = error.code === "GRN_NOT_FOUND" ? 404 : 422;
      throw new ApiError(status, error.code, error.message);
    }
    throw error;
  }
});

export const DELETE = apiHandler(async (_request: Request, { params }: { params: Promise<{ id: string }> }) => {
  const context = await requireApiContext("inventory.adjust");
  const { id } = z.object({ id: z.uuid() }).parse(await params);

  try {
    await deleteGoodsReceipt(context, id);
    return apiData({ success: true });
  } catch (error) {
    if (error instanceof PurchaseDomainError) {
      const status = error.code === "GRN_NOT_FOUND" ? 404 : 422;
      throw new ApiError(status, error.code, error.message);
    }
    throw error;
  }
});
