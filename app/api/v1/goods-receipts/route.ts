import { z } from "zod";
import { ApiError, apiData, apiHandler, parseApiBody, requireApiContext } from "@/lib/server/api";
import { createGoodsReceipt, listGoodsReceipts, PurchaseDomainError } from "@/lib/server/purchases";
import { goodsReceiptSchema } from "@/lib/validation/purchase";

export const GET = apiHandler(async (request: Request) => {
  const context = await requireApiContext("business.read");
  const url = new URL(request.url);
  const purchaseOrderId = url.searchParams.get("purchaseOrderId");
  if (!purchaseOrderId) throw new ApiError(422, "VALIDATION_ERROR", "purchaseOrderId query parameter is required.");
  z.uuid().parse(purchaseOrderId);
  return apiData(await listGoodsReceipts(context.workspaceId, purchaseOrderId));
});

export const POST = apiHandler(async (request: Request) => {
  const context = await requireApiContext("financial.manage");
  const body = await request.clone().json().catch(() => ({}));
  const key = request.headers.get("Idempotency-Key");
  const input = await parseApiBody(
    new Request(request.url, {
      method: "POST",
      headers: request.headers,
      body: JSON.stringify({ ...body, idempotencyKey: key ?? body.idempotencyKey }),
    }),
    goodsReceiptSchema,
  );
  try {
    return apiData(await createGoodsReceipt({ ...context, userId: context.user.id }, input), 201);
  } catch (error) {
    if (error instanceof PurchaseDomainError) throw new ApiError(422, error.code, error.message);
    throw error;
  }
});
