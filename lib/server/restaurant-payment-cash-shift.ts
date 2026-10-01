import "server-only";

import { Prisma, type PaymentMethod } from "@prisma/client";

import { IndustryDomainError } from "@/lib/server/industry-modules";

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
