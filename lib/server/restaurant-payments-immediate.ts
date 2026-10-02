import "server-only";

import { Prisma, type PaymentMethod } from "@prisma/client";

import { ensureDefaultAccounts, postCustomerPaymentToGeneralLedger } from "@/lib/server/accounting";
import { writeAudit } from "@/lib/server/audit";
import { IndustryDomainError, requireWorkspaceModule, type IndustryContext } from "@/lib/server/industry-modules";
import { assertRestaurantPaymentAccountKind, resolveRestaurantPaymentCashShift } from "@/lib/server/restaurant-payment-cash-shift";
import { releaseRestaurantTableIfSettled } from "@/lib/server/restaurant-table-settlement";
import { withSerializableRetry } from "@/lib/server/tx-retry";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PAYMENT_METHODS = new Set<PaymentMethod>([
  "CASH",
  "BANK_TRANSFER",
  "CHEQUE",
  "CREDIT_CARD",
  "MOBILE_WALLET",
  "JAZZCASH",
  "EASYPAISA",
  "OTHER",
]);

function cleanOptional(value: string | undefined, max: number) {
  const clean = value?.trim();
  if (!clean) return null;
  if (clean.length > max) throw new IndustryDomainError("INVALID_STATE", `Value must be ${max} characters or fewer.`);
  return clean;
}

function money(value: Prisma.Decimal.Value) {
  return new Prisma.Decimal(value).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
}

async function postPaymentNow(
  tx: Prisma.TransactionClient,
  input: {
    workspaceId: string;
    paymentId: string;
    orderNumber: string;
    amount: Prisma.Decimal;
    cashBankAccountId: string;
  },
) {
  await ensureDefaultAccounts(input.workspaceId, tx);
  const accountingDate = new Date();
  await postCustomerPaymentToGeneralLedger(tx, {
    workspaceId: input.workspaceId,
    paymentId: input.paymentId,
    documentNo: `RP-${input.orderNumber}-${input.paymentId.slice(0, 8).toUpperCase()}`,
    date: accountingDate,
    amount: input.amount,
    cashBankAccountId: input.cashBankAccountId,
  });
  const postedRows = await tx.$queryRaw<Array<{ postedAt: Date }>>`
    UPDATE "restaurant_payments"
    SET "postedAt"=CURRENT_TIMESTAMP
    WHERE "id"=${input.paymentId}::uuid
      AND "workspaceId"=${input.workspaceId}::uuid
      AND "voidedAt" IS NULL
      AND "postedAt" IS NULL
    RETURNING "postedAt"
  `;
  const postedAt = postedRows[0]?.postedAt;
  if (!postedAt) throw new IndustryDomainError("CONFLICT", "Restaurant payment changed before accounting could be posted.");
  return postedAt;
}

export async function recordRestaurantPaymentAtCollection(
  context: IndustryContext,
  input: {
    orderId: string;
    cashBankAccountId: string;
    method: PaymentMethod;
    amount: number;
    reference?: string;
    notes?: string;
    idempotencyKey?: string;
  },
) {
  await requireWorkspaceModule(context.workspaceId, "restaurant");
  if (!UUID.test(input.orderId)) throw new IndustryDomainError("INVALID_STATE", "Restaurant order is invalid.");
  if (!PAYMENT_METHODS.has(input.method)) throw new IndustryDomainError("INVALID_STATE", "Restaurant payment method is invalid.");
  if (!Number.isFinite(input.amount) || input.amount <= 0 || input.amount > 1_000_000_000) {
    throw new IndustryDomainError("INVALID_STATE", "Restaurant payment amount must be positive.");
  }
  const amount = money(input.amount);
  const idempotencyKey = cleanOptional(input.idempotencyKey, 128);
  if (idempotencyKey && !/^[A-Za-z0-9:_-]{8,128}$/.test(idempotencyKey)) {
    throw new IndustryDomainError("INVALID_STATE", "Restaurant payment request ID is invalid.");
  }

  return withSerializableRetry(async (tx) => {
    const orders = await tx.$queryRaw<Array<{
      id: string;
      orderNumber: string;
      status: string;
      total: Prisma.Decimal;
      restaurantTableId: string | null;
    }>>`
      SELECT "id"::text AS "id", "orderNumber", "status", "total", "restaurantTableId"
      FROM "restaurant_orders"
      WHERE "id"=${input.orderId}::uuid AND "workspaceId"=${context.workspaceId}::uuid
      FOR UPDATE
    `;
    const order = orders[0];
    if (!order) throw new IndustryDomainError("NOT_FOUND", "Restaurant order was not found.");
    if (order.status === "CANCELLED") throw new IndustryDomainError("INVALID_STATE", "Cancelled restaurant orders cannot receive payments.");

    // Distinct orders can collect into the same balance. Lock that shared row
    // before inserting ledger/payment evidence, so contention retries happen
    // before accounting work instead of at the final balance increment.
    const cashBanks = await tx.$queryRaw<Array<{ id: string; isBank: boolean }>>`
      SELECT "id", "isBank"
      FROM "cash_bank_accounts"
      WHERE "id"=${input.cashBankAccountId}
        AND "workspaceId"=${context.workspaceId}
        AND "isActive"=true
      FOR UPDATE
    `;
    const cashBank = cashBanks[0];
    if (!cashBank) throw new IndustryDomainError("NOT_FOUND", "Cash or bank account is unavailable in this workspace.");
    assertRestaurantPaymentAccountKind(input.method, cashBank.isBank);

    if (idempotencyKey) {
      const existing = await tx.$queryRaw<Array<{
        id: string;
        restaurantOrderId: string;
        cashBankAccountId: string;
        method: PaymentMethod;
        amount: Prisma.Decimal;
        postedAt: Date | null;
        voidedAt: Date | null;
      }>>`
        SELECT "id"::text AS "id", "restaurantOrderId"::text AS "restaurantOrderId", "cashBankAccountId",
               "method", "amount", "postedAt", "voidedAt"
        FROM "restaurant_payments"
        WHERE "workspaceId"=${context.workspaceId}::uuid AND "idempotencyKey"=${idempotencyKey}
        LIMIT 1
        FOR UPDATE
      `;
      const previous = existing[0];
      if (previous) {
        const same = previous.restaurantOrderId === input.orderId
          && previous.cashBankAccountId === input.cashBankAccountId
          && previous.method === input.method
          && new Prisma.Decimal(previous.amount).equals(amount)
          && !previous.voidedAt;
        if (!same) throw new IndustryDomainError("CONFLICT", "This restaurant payment request ID was already used for a different payment.");
        if (!previous.postedAt) {
          const postedAt = await postPaymentNow(tx, {
            workspaceId: context.workspaceId,
            paymentId: previous.id,
            orderNumber: order.orderNumber,
            amount,
            cashBankAccountId: previous.cashBankAccountId,
          });
          await writeAudit(tx, {
            workspaceId: context.workspaceId,
            actorId: context.userId,
            action: "restaurant.payment.posted_on_retry",
            entityType: "RestaurantPayment",
            entityId: previous.id,
            metadata: { orderId: order.id, orderNumber: order.orderNumber, amount: amount.toFixed(2), postedAt: postedAt.toISOString() },
          });
        }
        await releaseRestaurantTableIfSettled(tx, context.workspaceId, order.restaurantTableId);
        return { id: previous.id, idempotent: true as const };
      }
    }

    const cashShiftId = await resolveRestaurantPaymentCashShift(tx, context.workspaceId, input.method);

    const totals = await tx.$queryRaw<Array<{
      returnedTotal: Prisma.Decimal;
      activePaid: Prisma.Decimal;
      allocated: Prisma.Decimal;
    }>>`
      SELECT
        COALESCE((
          SELECT SUM(rr."total") FROM "restaurant_returns" rr
          WHERE rr."workspaceId"=${context.workspaceId}::uuid
            AND rr."restaurantOrderId"=${order.id}::uuid
        ), 0)::numeric AS "returnedTotal",
        COALESCE((
          SELECT SUM(rp."amount") FROM "restaurant_payments" rp
          WHERE rp."workspaceId"=${context.workspaceId}::uuid
            AND rp."restaurantOrderId"=${order.id}::uuid
            AND rp."voidedAt" IS NULL
        ), 0)::numeric AS "activePaid",
        COALESCE((
          SELECT SUM(a."amount")
          FROM "restaurant_return_payment_allocations" a
          INNER JOIN "restaurant_payments" rp2
            ON rp2."id"=a."restaurantPaymentId" AND rp2."workspaceId"=a."workspaceId"
          WHERE a."workspaceId"=${context.workspaceId}::uuid
            AND rp2."restaurantOrderId"=${order.id}::uuid
            AND rp2."voidedAt" IS NULL
        ), 0)::numeric AS "allocated"
    `;
    const totalsRow = totals[0]!;
    const adjustedDue = money(Prisma.Decimal.max(new Prisma.Decimal(order.total).minus(totalsRow.returnedTotal), 0));
    const retainedPaid = money(Prisma.Decimal.max(new Prisma.Decimal(totalsRow.activePaid).minus(totalsRow.allocated), 0));
    const outstanding = money(Prisma.Decimal.max(adjustedDue.minus(retainedPaid), 0));
    if (amount.gt(outstanding)) {
      throw new IndustryDomainError("INVALID_STATE", "Restaurant payment exceeds the net outstanding order balance.");
    }

    const inserted = await tx.$queryRaw<Array<{ id: string }>>`
      INSERT INTO "restaurant_payments" (
        "workspaceId", "restaurantOrderId", "cashBankAccountId", "method", "amount",
        "reference", "notes", "idempotencyKey", "createdById", "cashShiftId"
      ) VALUES (
        ${context.workspaceId}::uuid, ${order.id}::uuid, ${cashBank.id}, ${input.method}, ${amount},
        ${cleanOptional(input.reference, 120)}, ${cleanOptional(input.notes, 500)}, ${idempotencyKey}, ${context.userId ?? null},
        ${cashShiftId}::uuid
      )
      RETURNING "id"::text AS "id"
    `;
    const paymentId = inserted[0]!.id;
    const postedAt = await postPaymentNow(tx, {
      workspaceId: context.workspaceId,
      paymentId,
      orderNumber: order.orderNumber,
      amount,
      cashBankAccountId: cashBank.id,
    });

    await releaseRestaurantTableIfSettled(tx, context.workspaceId, order.restaurantTableId);

    await writeAudit(tx, {
      workspaceId: context.workspaceId,
      actorId: context.userId,
      action: "restaurant.payment.recorded",
      entityType: "RestaurantPayment",
      entityId: paymentId,
      metadata: {
        orderId: order.id,
        orderNumber: order.orderNumber,
        amount: amount.toFixed(2),
        method: input.method,
        postedAt: postedAt.toISOString(),
        accountingPosted: true,
        collectionTiming: "IMMEDIATE",
        cashShiftId,
      },
    });

    return { id: paymentId, idempotent: false as const };
  });
}
