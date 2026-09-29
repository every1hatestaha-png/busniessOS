import "server-only";

import { canPerformAction } from "@/lib/server/authorization";
import type { ServiceContext } from "@/lib/server/sales";
import type { PaymentInput } from "@/lib/validation/payment";
import { recordPayment as recordPaymentCore, PaymentDomainError } from "@/lib/server/payments-core";

export {
  PaymentDomainError,
  getCustomerOpeningBalanceOutstanding,
  getPaymentReceipt,
  reverseCustomerPayment,
} from "@/lib/server/payments-core";

export async function recordPayment(context: ServiceContext, input: PaymentInput) {
  if (!canPerformAction(context.role, "payments.record")) {
    throw new PaymentDomainError("Unauthorized");
  }
  return recordPaymentCore(context, input);
}
