import "server-only";

import type { ServiceContext } from "@/lib/server/sales";
import type { GoodsReceiptInput } from "@/lib/validation/purchase";
import { goodsReceiptMatchesRequest } from "@/lib/server/grn-idempotency";
import { createGoodsReceipt as createGoodsReceiptCore, PurchaseDomainError } from "@/lib/server/purchases-core";

export {
  PurchaseDomainError,
  createPurchase,
  cancelPurchase,
  createSupplierReturn,
  listPurchases,
  getPurchase,
  getOpenPOItemsForGRN,
  listGoodsReceipts,
  listAllGoodsReceipts,
  getGoodsReceipt,
  listSupplierReturns,
  getSupplierReturn,
  updatePurchase,
  deletePurchase,
  updateGoodsReceipt,
  voidGoodsReceipt,
  deleteGoodsReceipt,
} from "@/lib/server/purchases-core";

export async function createGoodsReceipt(context: ServiceContext, input: GoodsReceiptInput) {
  const result = await createGoodsReceiptCore(context, input);
  if (!await goodsReceiptMatchesRequest(context.workspaceId, result.id, input)) {
    throw new PurchaseDomainError(
      "IDEMPOTENCY_CONFLICT",
      "This idempotency key was already used for a different goods receipt request.",
    );
  }
  return result;
}
