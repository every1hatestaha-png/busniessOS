import "server-only";

import { Prisma, type PaymentMethod } from "@prisma/client";

import { IndustryDomainError } from "@/lib/server/industry-modules";

const BANK_REQUIRED_METHODS = new Set<PaymentMethod>([
  "BANK_TRANSFER",
  "CHEQUE",
  "CREDIT_CARD",
  "MOBILE_WALLET",
  "JAZZCASH",
  "EASYPAISA",
]);

export function assertRestaurantPaymentAccountKind(method: PaymentMethod, isBank: boolean) {
  if (method === "CASH" && isBank) {
    throw new IndustryDomainError("INVALID_STATE", "Cash restaurant payments must use a physical cash account");
  }
  if (BANK_REQUIRED_METHODS.has(method) && !isBank) {
    throw new IndustryDomainError("INVALID_STATE", "Non-cash restaurant payments must use a bank or digital settlement account");
  }
}

/**
 * CASH collection is a physical drawer mutation. Lock the unique OPEN shift row
 * before inserting the payment so shift close and payment collection serialize.
 * Non-cash payments deliberately carry no cash-shift reference.
 */
export async function resolveRestaurantPaymentCashShift(
  tx: Prisma.TransactionClient,
  workspaceId: string,
  method: PaymentMethod,
): Promise<string | null> {
  if (method !== "CASH") return null;

  const rows = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT "id"::text AS "id"
    FROM "cash_shifts"
    WHERE "workspaceId"=${workspaceId}::uuid
      AND "status"='OPEN'
    FOR SHARE
  `;

  const shift = rows[0];
  if (!shift) {
    throw new IndustryDomainError(
      "INVALID_STATE",
      "An open restaurant cash shift is required before recording a cash payment.",
    );
  }
  return shift.id;
}
