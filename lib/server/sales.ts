import "server-only";

import { canPerformAction } from "@/lib/server/authorization";
import type { SaleInput } from "@/lib/validation/sale";
import { createSale as createSaleCore, SaleDomainError } from "@/lib/server/sales-core";
import type { ServiceContext } from "@/lib/server/sales-core";

export type { ServiceContext } from "@/lib/server/sales-core";
export {
  SaleDomainError,
  createCustomerReturn,
  cancelSale,
  listSales,
  getSale,
} from "@/lib/server/sales-core";

export async function createSale(context: ServiceContext, input: SaleInput) {
  if (!canPerformAction(context.role, "sales.create")) {
    throw new SaleDomainError("PERMISSION_DENIED", "Unauthorized");
  }
  return createSaleCore(context, input);
}
