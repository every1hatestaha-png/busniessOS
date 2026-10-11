import "server-only";

import { Prisma, type PaymentMethod } from "@prisma/client";

import {
  ensureDefaultAccounts,
  postCustomerPaymentToGeneralLedger,
  postSaleToGeneralLedger,
  reverseGeneralLedgerEntries,
} from "@/lib/server/accounting";
import { writeAudit } from "@/lib/server/audit";
import { db } from "@/lib/server/db";
import {
  IndustryDomainError,
  requireWorkspaceModule,
  type IndustryContext,
} from "@/lib/server/industry-modules";
import {
  applyManagedWarehouseStockDelta,
  getWarehouseStockModeInTransaction,
  ManagedWarehouseStockError,
} from "@/lib/server/managed-warehouse-stock";
import {
  transitionRestaurantOrder,
  type RestaurantOrderStatus,
  type RestaurantPaymentStatus,
} from "@/lib/server/restaurant-workspace";
import { assertRestaurantPaymentAccountKind, resolveRestaurantPaymentCashShift, resolveRestaurantCashMovementShift } from "@/lib/server/restaurant-payment-cash-shift";
import { releaseRestaurantTableIfSettled } from "@/lib/server/restaurant-table-settlement";
import { withSerializableRetry } from "@/lib/server/tx-retry";
import { assertRestaurantActorAccess } from "@/lib/server/restaurant-actor-access";

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
const MANAGER_ROLES = new Set(["OWNER", "ADMIN", "MANAGER"]);

export type RestaurantPaymentRecord = {
  id: string;
  restaurantOrderId: string;
  cashBankAccountId: string;
  cashBankAccountName: string;
  method: PaymentMethod;
  amount: number;
  reference: string | null;
  notes: string | null;
  postedAt: Date | null;
  voidedAt: Date | null;
  createdAt: Date;
};

function assertUuid(value: string, label: string) {
  if (!UUID.test(value)) throw new IndustryDomainError("INVALID_STATE", `${label} is invalid.`);
}

function assertManager(context: IndustryContext) {
  if (!MANAGER_ROLES.has(context.role)) {
    throw new IndustryDomainError("PERMISSION_DENIED", "Manager access is required for this action.");
  }
}

function cleanOptional(value: string | undefined, max: number) {
  const clean = value?.trim();
  if (!clean) return null;
  if (clean.length > max) throw new IndustryDomainError("INVALID_STATE", `Value must be ${max} characters or fewer.`);
  return clean;
}

function paymentStatus(total: Prisma.Decimal, paid: Prisma.Decimal): RestaurantPaymentStatus {
  if (paid.lte(0)) return "UNPAID";
  if (paid.greaterThanOrEqualTo(total)) return "PAID";
  return "PARTIALLY_PAID";
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
  const status = paymentStatus(total, paid);
  await tx.$executeRaw`
    UPDATE "restaurant_orders"
    SET "paymentStatus"=${status}, "updatedAt"=now()
    WHERE "id"=${orderId}::uuid AND "workspaceId"=${workspaceId}::uuid
  `;
  return { paid, status };
}

async function resolveRestaurantWarehouse(
  tx: Prisma.TransactionClient,
  workspaceId: string,
): Promise<string | undefined> {
  const mode = await getWarehouseStockModeInTransaction(tx, workspaceId);
  if (mode === "LEGACY") return undefined;
  const rows = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT "id"::text AS "id"
    FROM "warehouses"
    WHERE "workspaceId"=${workspaceId}::uuid
      AND "isActive"=true
      AND "isDefault"=true
    FOR SHARE
  `;
  if (rows.length !== 1) {
    throw new IndustryDomainError(
      "INVALID_STATE",
      "Managed warehouse stock requires exactly one active default warehouse before a restaurant order can be completed.",
    );
  }
  return rows[0]!.id;
}

type Requirement = { productId: string; quantity: Prisma.Decimal };

async function buildInventoryRequirements(
  tx: Prisma.TransactionClient,
  workspaceId: string,
  orderId: string,
): Promise<Requirement[]> {
  const lines = await tx.$queryRaw<Array<{ productId: string | null; quantity: Prisma.Decimal }>>`
    SELECT mi."productId", roi."quantity"
    FROM "restaurant_order_items" roi
    INNER JOIN "restaurant_menu_items" mi
      ON mi."id"=roi."menuItemId"
    INNER JOIN "restaurant_orders" ro
      ON ro."id"=roi."restaurantOrderId"
    WHERE roi."restaurantOrderId"=${orderId}::uuid
      AND ro."workspaceId"=${workspaceId}::uuid
      AND mi."workspaceId"=${workspaceId}::uuid
  `;

  const required = new Map<string, Prisma.Decimal>();
  const add = (productId: string, quantity: Prisma.Decimal) => {
    required.set(productId, (required.get(productId) ?? new Prisma.Decimal(0)).plus(quantity));
  };

  for (const line of lines) {
    if (!line.productId) continue;
    const recipes = await tx.$queryRaw<Array<{ id: string; yieldQuantity: Prisma.Decimal }>>`
      SELECT "id"::text AS "id", "yieldQuantity"
      FROM "recipes"
      WHERE "workspaceId"=${workspaceId}::uuid
        AND "finishedProductId"=${line.productId}::uuid
        AND "isActive"=true
      LIMIT 1
      FOR SHARE
    `;
    const recipe = recipes[0];
    if (!recipe) {
      add(line.productId, new Prisma.Decimal(line.quantity));
      continue;
    }

    const ingredients = await tx.$queryRaw<Array<{
      ingredientProductId: string;
      quantity: Prisma.Decimal;
      wastagePercent: Prisma.Decimal;
    }>>`
      SELECT "ingredientProductId"::text AS "ingredientProductId", "quantity", "wastagePercent"
      FROM "recipe_items"
      WHERE "recipeId"=${recipe.id}::uuid
      FOR SHARE
    `;
    if (!ingredients.length) {
      throw new IndustryDomainError("INVALID_STATE", "A linked restaurant recipe has no ingredients.");
    }
    const factor = new Prisma.Decimal(line.quantity).div(recipe.yieldQuantity);
    for (const ingredient of ingredients) {
      const wastageMultiplier = new Prisma.Decimal(1).plus(new Prisma.Decimal(ingredient.wastagePercent).div(100));
      add(ingredient.ingredientProductId, new Prisma.Decimal(ingredient.quantity).mul(factor).mul(wastageMultiplier));
    }
  }

  return [...required].map(([productId, quantity]) => ({ productId, quantity }));
}

async function postRestaurantInventory(
  tx: Prisma.TransactionClient,
  workspaceId: string,
  orderId: string,
) {
  const requirements = await buildInventoryRequirements(tx, workspaceId, orderId);
  const warehouseId = await resolveRestaurantWarehouse(tx, workspaceId);
  let inventoryCost = new Prisma.Decimal(0);

  for (const requirement of requirements) {
    const products = await tx.$queryRaw<Array<{
      id: string;
      stockQuantity: Prisma.Decimal;
      costPrice: Prisma.Decimal;
    }>>`
      SELECT "id", "stockQuantity", "costPrice"
      FROM "products"
      WHERE "id"=${requirement.productId}
        AND "workspaceId"=${workspaceId}
      FOR UPDATE
    `;
    const product = products[0];
    if (!product) throw new IndustryDomainError("NOT_FOUND", "A restaurant inventory product no longer exists in this workspace.");
    if (new Prisma.Decimal(product.stockQuantity).lt(requirement.quantity)) {
      throw new IndustryDomainError("INSUFFICIENT_STOCK", "Not enough ingredient stock to complete this restaurant order.");
    }

    await tx.product.update({
      where: { id: product.id, workspaceId },
      data: { stockQuantity: { decrement: requirement.quantity } },
    });
    try {
      await applyManagedWarehouseStockDelta(tx, {
        workspaceId,
        warehouseId,
        productId: product.id,
        delta: requirement.quantity.negated(),
      });
    } catch (error) {
      if (error instanceof ManagedWarehouseStockError) {
        const code = error.code === "NEGATIVE_WAREHOUSE_STOCK" ? "INSUFFICIENT_STOCK" : "INVALID_STATE";
        throw new IndustryDomainError(code, error.message);
      }
      throw error;
    }

    await tx.inventoryTransaction.create({
      data: {
        workspaceId,
        productId: product.id,
        type: "ADJUSTMENT",
        quantityChanged: requirement.quantity.negated(),
        unitCost: product.costPrice,
        reference: `RESTAURANT:${orderId}`,
      },
    });
    inventoryCost = inventoryCost.plus(requirement.quantity.mul(product.costPrice));
  }

  const roundedCost = inventoryCost.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
  await tx.$executeRaw`
    UPDATE "restaurant_orders"
    SET "inventoryPostedAt"=now(), "inventoryCost"=${roundedCost}, "updatedAt"=now()
    WHERE "id"=${orderId}::uuid AND "workspaceId"=${workspaceId}::uuid
  `;
  return roundedCost;
}

async function postRestaurantAccounting(
  tx: Prisma.TransactionClient,
  context: IndustryContext,
  order: {
    id: string;
    orderNumber: string;
    subtotal: Prisma.Decimal;
    discountAmount: Prisma.Decimal;
    taxAmount: Prisma.Decimal;
    inventoryCost: Prisma.Decimal;
  },
) {
  await ensureDefaultAccounts(context.workspaceId, tx);
  const revenue = new Prisma.Decimal(order.subtotal).minus(order.discountAmount);
  await postSaleToGeneralLedger(tx, {
    workspaceId: context.workspaceId,
    saleId: order.id,
    orderNumber: order.orderNumber,
    date: new Date(),
    revenue,
    salesTax: order.taxAmount,
    costOfGoodsSold: order.inventoryCost,
    cashReceived: new Prisma.Decimal(0),
  });

  const payments = await tx.$queryRaw<Array<{
    id: string;
    cashBankAccountId: string;
    amount: Prisma.Decimal;
  }>>`
    SELECT "id"::text AS "id", "cashBankAccountId", "amount"
    FROM "restaurant_payments"
    WHERE "workspaceId"=${context.workspaceId}::uuid
      AND "restaurantOrderId"=${order.id}::uuid
      AND "voidedAt" IS NULL
      AND "postedAt" IS NULL
    ORDER BY "createdAt", "id"
    FOR UPDATE
  `;
  for (const payment of payments) {
    await postCustomerPaymentToGeneralLedger(tx, {
      workspaceId: context.workspaceId,
      paymentId: payment.id,
      documentNo: `RP-${order.orderNumber}-${payment.id.slice(0, 8).toUpperCase()}`,
      date: new Date(),
      amount: payment.amount,
      cashBankAccountId: payment.cashBankAccountId,
    });
    await tx.$executeRaw`
      UPDATE "restaurant_payments" SET "postedAt"=now()
      WHERE "id"=${payment.id}::uuid AND "workspaceId"=${context.workspaceId}::uuid
    `;
  }

  await tx.$executeRaw`
    UPDATE "restaurant_orders"
    SET "accountingPostedAt"=now(), "updatedAt"=now()
    WHERE "id"=${order.id}::uuid AND "workspaceId"=${context.workspaceId}::uuid
  `;
}

/**
 * PREPARING and READY retain the V1 lifecycle implementation. Terminal transitions
 * run here so stock, accounting, KOT, table state and audit commit atomically.
 */
export async function transitionRestaurantOrderWithIntegrity(
  context: IndustryContext,
  orderId: string,
  nextStatus: RestaurantOrderStatus,
) {
  if (nextStatus === "COMPLETED") assertManager(context);
  await requireWorkspaceModule(context.workspaceId, "restaurant");
  assertUuid(orderId, "Restaurant order");
  if (nextStatus !== "COMPLETED" && nextStatus !== "CANCELLED") {
    return transitionRestaurantOrder(context, orderId, nextStatus);
  }

  return withSerializableRetry(async (tx) => {
    await assertRestaurantActorAccess(tx, context, nextStatus === "COMPLETED" ? "FINANCIAL" : "POS", "Restaurant order finalization");
    const rows = await tx.$queryRaw<Array<{
      id: string;
      orderNumber: string;
      status: RestaurantOrderStatus;
      restaurantTableId: string | null;
      subtotal: Prisma.Decimal;
      discountAmount: Prisma.Decimal;
      taxAmount: Prisma.Decimal;
      total: Prisma.Decimal;
      inventoryPostedAt: Date | null;
      accountingPostedAt: Date | null;
      inventoryCost: Prisma.Decimal;
    }>>`
      SELECT "id", "orderNumber", "status", "restaurantTableId", "subtotal", "discountAmount", "taxAmount", "total",
             "inventoryPostedAt", "accountingPostedAt", "inventoryCost"
      FROM "restaurant_orders"
      WHERE "id"=${orderId}::uuid AND "workspaceId"=${context.workspaceId}::uuid
      FOR UPDATE
    `;
    const order = rows[0];
    if (!order) throw new IndustryDomainError("NOT_FOUND", "Restaurant order was not found.");
    if (order.status === nextStatus) {
      await releaseRestaurantTableIfSettled(tx, context.workspaceId, order.restaurantTableId);
      return order;
    }
    if (nextStatus === "COMPLETED" && order.status !== "READY") {
      throw new IndustryDomainError("INVALID_STATE", `Cannot complete restaurant order from ${order.status}.`);
    }
    if (nextStatus === "CANCELLED" && !["PENDING_REVIEW", "CONFIRMED", "PREPARING", "READY"].includes(order.status)) {
      throw new IndustryDomainError("INVALID_STATE", `Cannot cancel restaurant order from ${order.status}.`);
    }

    if (nextStatus === "CANCELLED") {
      const paid = await activePaymentTotal(tx, context.workspaceId, order.id);
      if (paid.gt(0)) {
        throw new IndustryDomainError("INVALID_STATE", "Void or refund restaurant payments before cancelling this order.");
      }
    }

    let inventoryCost = new Prisma.Decimal(order.inventoryCost ?? 0);
    if (nextStatus === "COMPLETED" && !order.inventoryPostedAt) {
      inventoryCost = await postRestaurantInventory(tx, context.workspaceId, order.id);
    }
    if (nextStatus === "COMPLETED" && !order.accountingPostedAt) {
      await postRestaurantAccounting(tx, context, { ...order, inventoryCost });
    }

    await tx.$executeRaw`
      UPDATE "restaurant_orders"
      SET "status"=${nextStatus},
          "completedAt"=CASE WHEN ${nextStatus}='COMPLETED' THEN now() ELSE "completedAt" END,
          "cancelledAt"=CASE WHEN ${nextStatus}='CANCELLED' THEN now() ELSE "cancelledAt" END,
          "updatedAt"=now()
      WHERE "id"=${order.id}::uuid AND "workspaceId"=${context.workspaceId}::uuid
    `;
    const kitchenStatus = nextStatus === "COMPLETED" ? "SERVED" : "CANCELLED";
    await tx.$executeRaw`
      UPDATE "kitchen_tickets"
      SET "status"=${kitchenStatus},
          "servedAt"=CASE WHEN ${kitchenStatus}='SERVED' AND "servedAt" IS NULL THEN now() ELSE "servedAt" END,
          "updatedAt"=now()
      WHERE "workspaceId"=${context.workspaceId}::uuid AND "restaurantOrderId"=${order.id}::uuid
    `;
    await syncPaymentStatus(tx, context.workspaceId, order.id, order.total);
    await releaseRestaurantTableIfSettled(tx, context.workspaceId, order.restaurantTableId);
    await writeAudit(tx, {
      workspaceId: context.workspaceId,
      actorId: context.userId,
      action: "restaurant.order.status_changed",
      entityType: "RestaurantOrder",
      entityId: order.id,
      metadata: {
        orderNumber: order.orderNumber,
        from: order.status,
        to: nextStatus,
        inventoryPosted: nextStatus === "COMPLETED",
        accountingPosted: nextStatus === "COMPLETED",
        inventoryCost: inventoryCost.toFixed(2),
      },
    });
    return { ...order, status: nextStatus, inventoryCost };
  });
}

export async function recordRestaurantPayment(
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
  assertUuid(input.orderId, "Restaurant order");
  if (!PAYMENT_METHODS.has(input.method)) throw new IndustryDomainError("INVALID_STATE", "Restaurant payment method is invalid.");
  if (!Number.isFinite(input.amount) || input.amount <= 0 || input.amount > 1_000_000_000) {
    throw new IndustryDomainError("INVALID_STATE", "Restaurant payment amount must be positive.");
  }
  const amount = new Prisma.Decimal(input.amount).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
  const idempotencyKey = cleanOptional(input.idempotencyKey, 128);
  if (idempotencyKey && !/^[A-Za-z0-9:_-]{8,128}$/.test(idempotencyKey)) {
    throw new IndustryDomainError("INVALID_STATE", "Restaurant payment request ID is invalid.");
  }

  return withSerializableRetry(async (tx) => {
    const orders = await tx.$queryRaw<Array<{
      id: string;
      orderNumber: string;
      status: RestaurantOrderStatus;
      total: Prisma.Decimal;
      restaurantTableId: string | null;
      accountingPostedAt: Date | null;
    }>>`
      SELECT "id", "orderNumber", "status", "total", "restaurantTableId", "accountingPostedAt"
      FROM "restaurant_orders"
      WHERE "id"=${input.orderId}::uuid AND "workspaceId"=${context.workspaceId}::uuid
      FOR UPDATE
    `;
    const order = orders[0];
    if (!order) throw new IndustryDomainError("NOT_FOUND", "Restaurant order was not found.");
    if (order.status === "CANCELLED") throw new IndustryDomainError("INVALID_STATE", "Cancelled restaurant orders cannot receive payments.");

    if (idempotencyKey) {
      const existing = await tx.$queryRaw<Array<{
        id: string;
        restaurantOrderId: string;
        cashBankAccountId: string;
        method: PaymentMethod;
        amount: Prisma.Decimal;
        voidedAt: Date | null;
      }>>`
        SELECT "id"::text AS "id", "restaurantOrderId"::text AS "restaurantOrderId", "cashBankAccountId", "method", "amount", "voidedAt"
        FROM "restaurant_payments"
        WHERE "workspaceId"=${context.workspaceId}::uuid AND "idempotencyKey"=${idempotencyKey}
        LIMIT 1
        FOR SHARE
      `;
      const existingPayment = existing[0];
      if (existingPayment) {
        const same = existingPayment.restaurantOrderId === input.orderId
          && existingPayment.cashBankAccountId === input.cashBankAccountId
          && existingPayment.method === input.method
          && new Prisma.Decimal(existingPayment.amount).equals(amount)
          && !existingPayment.voidedAt;
        if (!same) throw new IndustryDomainError("CONFLICT", "This restaurant payment request ID was already used for a different payment.");
        await releaseRestaurantTableIfSettled(tx, context.workspaceId, order.restaurantTableId);
        return { id: existingPayment.id, idempotent: true as const };
      }
    }

    const cashBank = await tx.cashBankAccount.findFirst({
      where: { id: input.cashBankAccountId, workspaceId: context.workspaceId, isActive: true },
      select: { id: true, isBank: true },
    });
    if (!cashBank) throw new IndustryDomainError("NOT_FOUND", "Cash or bank account is unavailable in this workspace.");
    assertRestaurantPaymentAccountKind(input.method, cashBank.isBank);

    const cashShiftId = await resolveRestaurantPaymentCashShift(tx, context.workspaceId, input.method);

    const currentlyPaid = await activePaymentTotal(tx, context.workspaceId, order.id);
    if (currentlyPaid.plus(amount).gt(order.total)) {
      throw new IndustryDomainError("INVALID_STATE", "Restaurant payment exceeds the outstanding order balance.");
    }

    const rows = await tx.$queryRaw<Array<{ id: string }>>`
      INSERT INTO "restaurant_payments" (
        "workspaceId", "restaurantOrderId", "cashBankAccountId", "method", "amount", "reference", "notes", "idempotencyKey", "createdById", "cashShiftId"
      ) VALUES (
        ${context.workspaceId}::uuid, ${order.id}::uuid, ${cashBank.id}, ${input.method}, ${amount},
        ${cleanOptional(input.reference, 120)}, ${cleanOptional(input.notes, 500)}, ${idempotencyKey}, ${context.userId ?? null},
        ${cashShiftId}::uuid
      )
      RETURNING "id"::text AS "id"
    `;
    const payment = rows[0]!;

    if (order.accountingPostedAt) {
      await ensureDefaultAccounts(context.workspaceId, tx);
      await postCustomerPaymentToGeneralLedger(tx, {
        workspaceId: context.workspaceId,
        paymentId: payment.id,
        documentNo: `RP-${order.orderNumber}-${payment.id.slice(0, 8).toUpperCase()}`,
        date: new Date(),
        amount,
        cashBankAccountId: cashBank.id,
      });
      await tx.$executeRaw`
        UPDATE "restaurant_payments" SET "postedAt"=now()
        WHERE "id"=${payment.id}::uuid AND "workspaceId"=${context.workspaceId}::uuid
      `;
    }

    const nextPayment = await syncPaymentStatus(tx, context.workspaceId, order.id, order.total);
    await releaseRestaurantTableIfSettled(tx, context.workspaceId, order.restaurantTableId);
    await writeAudit(tx, {
      workspaceId: context.workspaceId,
      actorId: context.userId,
      action: "restaurant.payment.recorded",
      entityType: "RestaurantPayment",
      entityId: payment.id,
      metadata: {
        orderId: order.id,
        orderNumber: order.orderNumber,
        amount: amount.toFixed(2),
        method: input.method,
        paymentStatus: nextPayment.status,
        accountingPosted: Boolean(order.accountingPostedAt),
        cashShiftId,
      },
    });
    return { id: payment.id, idempotent: false as const };
  });
}

export async function voidRestaurantPayment(context: IndustryContext, paymentId: string, reason: string) {
  assertManager(context);
  await requireWorkspaceModule(context.workspaceId, "restaurant");
  assertUuid(paymentId, "Restaurant payment");
  const cleanReason = reason.trim();
  if (cleanReason.length < 3 || cleanReason.length > 500) {
    throw new IndustryDomainError("INVALID_STATE", "Provide a payment void reason between 3 and 500 characters.");
  }

  return withSerializableRetry(async (tx) => {
    await assertRestaurantActorAccess(tx, context, "FINANCIAL", "Restaurant payment void");
    const rows = await tx.$queryRaw<Array<{
      id: string;
      restaurantOrderId: string;
      cashBankAccountId: string;
      amount: Prisma.Decimal;
      postedAt: Date | null;
      voidedAt: Date | null;
      orderNumber: string;
      orderTotal: Prisma.Decimal;
    }>>`
      SELECT rp."id"::text AS "id", rp."restaurantOrderId"::text AS "restaurantOrderId", rp."cashBankAccountId", rp."amount",
             rp."postedAt", rp."voidedAt", ro."orderNumber", ro."total" AS "orderTotal"
      FROM "restaurant_payments" rp
      INNER JOIN "restaurant_orders" ro ON ro."id"=rp."restaurantOrderId" AND ro."workspaceId"=rp."workspaceId"
      WHERE rp."id"=${paymentId}::uuid AND rp."workspaceId"=${context.workspaceId}::uuid
      FOR UPDATE OF rp, ro
    `;
    const payment = rows[0];
    if (!payment) throw new IndustryDomainError("NOT_FOUND", "Restaurant payment was not found.");
    if (payment.voidedAt) return { id: payment.id, alreadyVoided: true as const };

    const allocations = await tx.$queryRaw<Array<{ total: Prisma.Decimal }>>`
      SELECT COALESCE(SUM("amount"), 0)::numeric AS "total"
      FROM "restaurant_return_payment_allocations"
      WHERE "workspaceId"=${context.workspaceId}::uuid
        AND "restaurantPaymentId"=${payment.id}::uuid
    `;
    if (new Prisma.Decimal(allocations[0]?.total ?? 0).gt(0)) {
      throw new IndustryDomainError("INVALID_STATE", "Reverse existing item-return refund allocations before voiding this payment.");
    }

    const reversalDate = new Date();
    const cashShiftId = payment.postedAt
      ? await resolveRestaurantCashMovementShift(tx, context.workspaceId, payment.cashBankAccountId)
      : null;
    if (payment.postedAt) {
      await reverseGeneralLedgerEntries(tx, {
        workspaceId: context.workspaceId,
        sources: [{ sourceType: "RECEIPT", sourceId: payment.id }],
        documentNo: `REV-RP-${payment.id.slice(0, 8).toUpperCase()}`,
        date: reversalDate,
        reason: `Voided restaurant payment: ${cleanReason}`,
        reversedById: context.userId,
      });
      await tx.cashBankAccount.update({
        where: { id: payment.cashBankAccountId, workspaceId: context.workspaceId },
        data: { currentBalance: { decrement: payment.amount } },
      });
    }

    await tx.$executeRaw`
      UPDATE "restaurant_payments"
      SET "voidedAt"=CURRENT_TIMESTAMP, "voidedById"=${context.userId ?? null}, "voidReason"=${cleanReason}
      WHERE "id"=${payment.id}::uuid AND "workspaceId"=${context.workspaceId}::uuid
    `;
    const nextPayment = await syncPaymentStatus(tx, context.workspaceId, payment.restaurantOrderId, payment.orderTotal);
    await writeAudit(tx, {
      workspaceId: context.workspaceId,
      actorId: context.userId,
      action: "restaurant.payment.voided",
      entityType: "RestaurantPayment",
      entityId: payment.id,
      metadata: {
        orderId: payment.restaurantOrderId,
        orderNumber: payment.orderNumber,
        amount: payment.amount.toString(),
        reason: cleanReason,
        reversedAccounting: Boolean(payment.postedAt),
        cashShiftId,
        paymentStatus: nextPayment.status,
      },
    });
    return { id: payment.id, alreadyVoided: false as const };
  });
}

export async function listRestaurantPayments(workspaceId: string, orderIdOrIds?: string | string[]) {
  await requireWorkspaceModule(workspaceId, "restaurant");
  let orderFilter = Prisma.empty;
  if (Array.isArray(orderIdOrIds)) {
    const orderIds = [...new Set(orderIdOrIds)];
    if (orderIds.length > 500) throw new IndustryDomainError("INVALID_STATE", "Select at most 500 restaurant orders.");
    if (!orderIds.length) return [];
    for (const orderId of orderIds) assertUuid(orderId, "Restaurant order");
    const scopedIds = Prisma.join(orderIds.map((orderId) => Prisma.sql`${orderId}::uuid`));
    orderFilter = Prisma.sql`AND rp."restaurantOrderId" IN (${scopedIds})`;
  } else if (orderIdOrIds) {
    assertUuid(orderIdOrIds, "Restaurant order");
    orderFilter = Prisma.sql`AND rp."restaurantOrderId"=${orderIdOrIds}::uuid`;
  }
  const rows = await db.$queryRaw<Array<{
    id: string;
    restaurantOrderId: string;
    cashBankAccountId: string;
    cashBankAccountName: string;
    method: PaymentMethod;
    amount: Prisma.Decimal;
    reference: string | null;
    notes: string | null;
    postedAt: Date | null;
    voidedAt: Date | null;
    createdAt: Date;
  }>>`
    SELECT rp."id"::text AS "id", rp."restaurantOrderId"::text AS "restaurantOrderId", rp."cashBankAccountId",
           cba."name" AS "cashBankAccountName", rp."method", rp."amount", rp."reference", rp."notes", rp."postedAt", rp."voidedAt", rp."createdAt"
    FROM "restaurant_payments" rp
    INNER JOIN "cash_bank_accounts" cba ON cba."id"=rp."cashBankAccountId" AND cba."workspaceId"::uuid=rp."workspaceId"
    WHERE rp."workspaceId"=${workspaceId}::uuid
      ${orderFilter}
    ORDER BY rp."createdAt" DESC
    LIMIT 500
  `;
  return rows.map((row): RestaurantPaymentRecord => ({ ...row, amount: Number(row.amount) }));
}
