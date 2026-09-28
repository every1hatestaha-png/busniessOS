import { z } from "zod";
import { ApiError, apiData, apiHandler, parseApiBody, requireApiContext, requireIdempotencyKey } from "@/lib/server/api";
import { goodsReceiptMatchesRequest } from "@/lib/server/grn-idempotency";
import { createGoodsReceipt, listGoodsReceipts, PurchaseDomainError } from "@/lib/server/purchases";
import { goodsReceiptSchema } from "@/lib/validation/purchase";

export const GET = apiHandler(async (request: Request) => {
  const context = await requireApiContext("grn.create");
  const url = new URL(request.url);
  const purchaseOrderId = url.searchParams.get("purchaseOrderId");
  if (!purchaseOrderId) throw new ApiError(422, "VALIDATION_ERROR", "purchaseOrderId query parameter is required.");
  z.uuid().parse(purchaseOrderId);
  return apiData(await listGoodsReceipts(context.workspaceId, purchaseOrderId));
});

export const POST = apiHandler(async (request: Request) => {
  const context = await requireApiContext("grn.create");
  const body = await request.clone().json().catch(() => ({}));
  const key = requireIdempotencyKey(request);
  const input = await parseApiBody(
    new Request(request.url, {
      method: "POST",
      headers: request.headers,
      body: JSON.stringify({ ...body, idempotencyKey: key }),
    }),
    goodsReceiptSchema,
  );
  try {
    const result = await createGoodsReceipt({ ...context, userId: context.user.id }, input);
    if (!await goodsReceiptMatchesRequest(context.workspaceId, result.id, input)) {
      throw new ApiError(422, "IDEMPOTENCY_CONFLICT", "This idempotency key was already used for a different goods receipt request.");
    }
    return apiData(result, 201);
  } catch (error) {
    if (error instanceof PurchaseDomainError) throw new ApiError(422, error.code, error.message);
    throw error;
  }
});
