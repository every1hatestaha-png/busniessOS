import "server-only";

import { Prisma } from "@prisma/client";

import { reverseGeneralLedgerEntries } from "@/lib/server/accounting";
import { writeAudit } from "@/lib/server/audit";
import { db } from "@/lib/server/db";
import {
  IndustryDomainError,
  requireWorkspaceModule,
  type IndustryContext,
} from "@/lib/server/industry-modules";
import { withSerializableRetry } from "@/lib/server/tx-retry";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MANAGER_ROLES = new Set(["OWNER", "ADMIN", "MANAGER"]);

function assertUuid(value: string, label: string) {
  if (!UUID.test(value)) throw new IndustryDomainError("INVALID_STATE", `${label} is invalid.`);
}

function assertManager(context: IndustryContext) {
  if (!MANAGER_ROLES.has(context.role)) {
    throw new IndustryDomainError("PERMISSION_DENIED", "Manager access is required for restaurant refunds.");
  }
}

function cleanReason(value: string) {
  const reason = value.trim();
  if (reason.length < 3 || reason.length > 500) {
    throw new IndustryDomainError("INVALID_STATE", "Provide a refund reason between 3 and 500 characters.");
  }
  return reason;
}

function cleanIdempotencyKey(value?: string) {
  const key = value?.trim();
  if (!key) return null;
  if (!/^[A-Za-z0-9:_-]{8,128}$/.test(key)) {
    throw new IndustryDomainError("INVALID_STATE", "Restaurant refund request ID is invalid.");
  }
  return key;
}

async function activePaymentTotal(tx: Prisma.TransactionClient, workspaceId: string, orderId: string) {
  const rows = await tx.$queryRaw<Array<{ total: Prisma.Decimal }>>`
    SELECT COALESCE(SUM("amount"), 0)::numeric AS "total"
    FROM "restaurant_payments"
    WHERE "workspaceId"=${workspaceId}::uuid
      AND "restaurantOrderId"=${orderId}::uuid
      AND "voidedAt" IS NULL
  `;
  return new Prisma.Decimal(rows[0]?.total ?? 0);
}

async function syncPaymentStatus(
  tx: Prisma.TransactionClient,
  workspaceId: string,
  orderId: string,
  total: Prisma.Decimal,
) {
  const paid = await activePaymentTotal(tx, workspaceId, orderId);
  const status = paid.lte(0) ? "UNPAID" : paid.gte(total) ? "PAID" : "PARTIALLY_PAID";
  await tx.$executeRaw`
    UPDATE "restaurant_orders"
    SET "paymentStatus"=${status}, "updatedAt"=now()
    WHERE "id"=${orderId}::uuid AND "workspaceId"=${workspaceId}::uuid
  `;
  return { paid, status };
}

export type RestaurantRefundRecord = {
  id: string;
  restaurantOrderId: string;
  restaurantPaymentId: string;
  cashBankAccountId: string;
  cashBankAccountName: string;
  amount: number;
  reason: string;
  createdAt: Date;
};

export async function refundRestaurantPayment(
  context: IndustryContext,
  input: {
    paymentId: string;
    reason: string;
    idempotencyKey?: string;
  },
) {
  assertManager(context);
  await requireWorkspaceModule(context.workspaceId, "restaurant");
  assertUuid(input.paymentId, "Restaurant payment");
  const reason = cleanReason(input.reason);
  const idempotencyKey = cleanIdempotencyKey(input.idempotencyKey);

  return withSerializableRetry(async (tx) => {
    if (idempotencyKey) {
      const existing = await tx.$queryRaw<Array<{
        id: string;
        restaurantPaymentId: string;
        reason: string;
      }>>`
        SELECT "id"::text AS "id", "restaurantPaymentId"::text AS "restaurantPaymentId", "reason"
        FROM "restaurant_refunds"
        WHERE "workspaceId"=${context.workspaceId}::uuid
          AND "idempotencyKey"=${idempotencyKey}
        LIMIT 1
        FOR SHARE
      `;
      const refund = existing[0];
      if (refund) {
        if (refund.restaurantPaymentId !== input.paymentId || refund.reason !== reason) {
          throw new IndustryDomainError("CONFLICT", "This restaurant refund request ID was already used for a different refund.");
        }
        return { id: refund.id, idempotent: true as const };
      }
    }

    const rows = await tx.$queryRaw<Array<{
      paymentId: string;
      restaurantOrderId: string;
      cashBankAccountId: string;
      amount: Prisma.Decimal;
      postedAt: Date | null;
      voidedAt: Date | null;
      orderNumber: string;
      orderStatus: string;
      orderTotal: Prisma.Decimal;
    }>>`
      SELECT rp."id"::text AS "paymentId",
             rp."restaurantOrderId"::text AS "restaurantOrderId",
             rp."cashBankAccountId",
             rp."amount",
             rp."postedAt",
             rp."voidedAt",
             ro."orderNumber",
             ro."status" AS "orderStatus",
             ro."total" AS "orderTotal"
      FROM "restaurant_payments" rp
      INNER JOIN "restaurant_orders" ro
        ON ro."id"=rp."restaurantOrderId" AND ro."workspaceId"=rp."workspaceId"
      WHERE rp."id"=${input.paymentId}::uuid
        AND rp."workspaceId"=${context.workspaceId}::uuid
      FOR UPDATE OF rp, ro
    `;
    const payment = rows[0];
    if (!payment) throw new IndustryDomainError("NOT_FOUND", "Restaurant payment was not found.");
    if (payment.orderStatus !== "COMPLETED") {
      throw new IndustryDomainError("INVALID_STATE", "Only payments on completed restaurant orders can be refunded. Void the payment before completion instead.");
    }
    if (!payment.postedAt) {
      throw new IndustryDomainError("INVALID_STATE", "Unposted restaurant payments cannot be refunded. Void the payment instead.");
    }

    const prior = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT "id"::text AS "id"
      FROM "restaurant_refunds"
      WHERE "workspaceId"=${context.workspaceId}::uuid
        AND "restaurantPaymentId"=${payment.paymentId}::uuid
      LIMIT 1
      FOR SHARE
    `;
    if (prior[0]) return { id: prior[0].id, idempotent: true as const };
    if (payment.voidedAt) {
      throw new IndustryDomainError("INVALID_STATE", "This restaurant payment has already been voided or refunded.");
    }

    const cashBank = await tx.cashBankAccount.findFirst({
      where: {
        id: payment.cashBankAccountId,
        workspaceId: context.workspaceId,
      },
      select: { id: true, currentBalance: true },
    });
    if (!cashBank) throw new IndustryDomainError("NOT_FOUND", "The original restaurant cash or bank account is unavailable.");
    if (new Prisma.Decimal(cashBank.currentBalance).lt(payment.amount)) {
      throw new IndustryDomainError(
        "INVALID_STATE",
        "The original cash or bank account does not have enough recorded balance to refund this payment.",
      );
    }

    const refundRows = await tx.$queryRaw<Array<{ id: string }>>`
      INSERT INTO "restaurant_refunds" (
        "workspaceId", "restaurantOrderId", "restaurantPaymentId", "cashBankAccountId",
        "amount", "reason", "idempotencyKey", "createdById"
      ) VALUES (
        ${context.workspaceId}::uuid,
        ${payment.restaurantOrderId}::uuid,
        ${payment.paymentId}::uuid,
        ${payment.cashBankAccountId},
        ${payment.amount},
        ${reason},
        ${idempotencyKey},
        ${context.userId ?? null}
      )
      RETURNING "id"::text AS "id"
    `;
    const refund = refundRows[0]!;

    const now = new Date();
    const reversal = await reverseGeneralLedgerEntries(tx, {
      workspaceId: context.workspaceId,
      sources: [{ sourceType: "RECEIPT", sourceId: payment.paymentId }],
      documentNo: `RF-${payment.orderNumber}-${refund.id.slice(0, 8).toUpperCase()}`,
      date: now,
      reason: `Restaurant refund: ${reason}`,
      reversedById: context.userId,
    });
    if (reversal.reversed < 2) {
      throw new IndustryDomainError("INVALID_STATE", "The original restaurant receipt accounting could not be fully reversed.");
    }

    await tx.cashBankAccount.update({
      where: { id: payment.cashBankAccountId, workspaceId: context.workspaceId },
      data: { currentBalance: { decrement: payment.amount } },
    });

    await tx.$executeRaw`
      UPDATE "restaurant_payments"
      SET "voidedAt"=${now},
          "voidedById"=${context.userId ?? null},
          "voidReason"=${`Refunded: ${reason}`}
      WHERE "id"=${payment.paymentId}::uuid
        AND "workspaceId"=${context.workspaceId}::uuid
        AND "voidedAt" IS NULL
    `;

    const next = await syncPaymentStatus(
      tx,
      context.workspaceId,
      payment.restaurantOrderId,
      payment.orderTotal,
    );

    await writeAudit(tx, {
      workspaceId: context.workspaceId,
      actorId: context.userId,
      action: "restaurant.payment.refunded",
      entityType: "RestaurantRefund",
      entityId: refund.id,
      metadata: {
        orderId: payment.restaurantOrderId,
        orderNumber: payment.orderNumber,
        paymentId: payment.paymentId,
        amount: payment.amount.toFixed(2),
        reason,
        paymentStatus: next.status,
      },
    });

    return { id: refund.id, idempotent: false as const };
  });
}

export async function listRestaurantRefunds(workspaceId: string, orderId?: string) {
  await requireWorkspaceModule(workspaceId, "restaurant");
  if (orderId) assertUuid(orderId, "Restaurant order");
  const orderFilter = orderId
    ? Prisma.sql`AND rr."restaurantOrderId"=${orderId}::uuid`
    : Prisma.empty;

  const rows = await db.$queryRaw<Array<{
    id: string;
    restaurantOrderId: string;
    restaurantPaymentId: string;
    cashBankAccountId: string;
    cashBankAccountName: string;
    amount: Prisma.Decimal;
    reason: string;
    createdAt: Date;
  }>>`
    SELECT rr."id"::text AS "id",
           rr."restaurantOrderId"::text AS "restaurantOrderId",
           rr."restaurantPaymentId"::text AS "restaurantPaymentId",
           rr."cashBankAccountId",
           cba."name" AS "cashBankAccountName",
           rr."amount",
           rr."reason",
           rr."createdAt"
    FROM "restaurant_refunds" rr
    INNER JOIN "cash_bank_accounts" cba
      ON cba."id"=rr."cashBankAccountId" AND cba."workspaceId"::uuid=rr."workspaceId"
    WHERE rr."workspaceId"=${workspaceId}::uuid
      ${orderFilter}
    ORDER BY rr."createdAt" DESC
    LIMIT 500
  `;

  return rows.map((row): RestaurantRefundRecord => ({ ...row, amount: Number(row.amount) }));
}
