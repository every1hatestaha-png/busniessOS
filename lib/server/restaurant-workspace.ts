import "server-only";

import { Prisma, type Role } from "@prisma/client";

import { writeAudit } from "@/lib/server/audit";
import { db } from "@/lib/server/db";
import { IndustryDomainError, requireWorkspaceModule, type IndustryContext } from "@/lib/server/industry-modules";
import { releaseRestaurantTableIfSettled } from "@/lib/server/restaurant-table-settlement";

export type RestaurantOrderSource = "POS" | "WHATSAPP" | "MANUAL";
export type RestaurantFulfillmentType = "DINE_IN" | "TAKEAWAY" | "DELIVERY";
export type RestaurantOrderStatus = "PENDING_REVIEW" | "CONFIRMED" | "PREPARING" | "READY" | "COMPLETED" | "CANCELLED";
export type RestaurantPaymentStatus = "UNPAID" | "PARTIALLY_PAID" | "PAID";

export type RestaurantOrderLineInput = {
  menuItemId: string;
  quantity: number;
  notes?: string;
  modifiers?: string[];
};

export type RestaurantOrderInput = {
  fulfillmentType: RestaurantFulfillmentType;
  restaurantTableId?: string;
  customerName?: string;
  customerPhone?: string;
  deliveryAddress?: string;
  notes?: string;
  discountAmount?: number;
  taxAmount?: number;
  items: RestaurantOrderLineInput[];
};

export type WhatsappRestaurantOrderInput = RestaurantOrderInput & {
  externalMessageId: string;
  messageBody: string;
};

const managerRoles = new Set<Role>(["OWNER", "ADMIN", "MANAGER"]);

function assertManager(context: IndustryContext) {
  if (!managerRoles.has(context.role)) {
    throw new IndustryDomainError("PERMISSION_DENIED", "Manager access is required for this action.");
  }
}

function assertUuid(value: string, label: string) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    throw new IndustryDomainError("INVALID_STATE", `${label} is invalid.`);
  }
}

function cleanOptional(value: string | undefined, max: number) {
  const cleaned = value?.trim();
  if (!cleaned) return null;
  if (cleaned.length > max) throw new IndustryDomainError("INVALID_STATE", `Value must be ${max} characters or fewer.`);
  return cleaned;
}

function money(value: number | undefined, label: string) {
  const normalized = value ?? 0;
  if (!Number.isFinite(normalized) || normalized < 0 || normalized > 1_000_000_000) {
    throw new IndustryDomainError("INVALID_STATE", `${label} must be a valid non-negative amount.`);
  }
  return Math.round(normalized * 100) / 100;
}

async function assertRestaurantTable(tx: Prisma.TransactionClient, workspaceId: string, tableId?: string) {
  if (!tableId) return null;
  assertUuid(tableId, "Restaurant table");
  const rows = await tx.$queryRaw<Array<{ id: string; status: string }>>`
    SELECT "id", "status"
    FROM "restaurant_tables"
    WHERE "id"=${tableId}::uuid AND "workspaceId"=${workspaceId}::uuid
    LIMIT 1
  `;
  const table = rows[0];
  if (!table) throw new IndustryDomainError("NOT_FOUND", "Restaurant table was not found in this workspace.");
  if (table.status === "INACTIVE") throw new IndustryDomainError("INVALID_STATE", "Inactive tables cannot receive orders.");
  return table;
}

async function nextOrderNumber(tx: Prisma.TransactionClient, workspaceId: string) {
  const rows = await tx.$queryRaw<Array<{ number: bigint }>>`
    INSERT INTO "restaurant_order_sequences" ("workspaceId", "nextNumber")
    VALUES (${workspaceId}::uuid, 2)
    ON CONFLICT ("workspaceId")
    DO UPDATE SET "nextNumber" = "restaurant_order_sequences"."nextNumber" + 1
    RETURNING ("nextNumber" - 1) AS "number"
  `;
  return `R-${String(rows[0]?.number ?? 1n).padStart(6, "0")}`;
}

async function priceLines(tx: Prisma.TransactionClient, workspaceId: string, lines: RestaurantOrderLineInput[]) {
  if (!Array.isArray(lines) || lines.length < 1 || lines.length > 100) {
    throw new IndustryDomainError("INVALID_STATE", "Add between 1 and 100 menu items.");
  }

  const priced: Array<{
    menuItemId: string;
    itemName: string;
    quantity: number;
    unitPrice: number;
    lineTotal: number;
    notes: string | null;
    modifiers: string[];
  }> = [];

  for (const line of lines) {
    assertUuid(line.menuItemId, "Menu item");
    if (!Number.isFinite(line.quantity) || line.quantity <= 0 || line.quantity > 10_000) {
      throw new IndustryDomainError("INVALID_STATE", "Menu item quantity must be positive.");
    }
    const notes = cleanOptional(line.notes, 300);
    const modifiers = Array.isArray(line.modifiers)
      ? line.modifiers.map((modifier) => modifier.trim()).filter(Boolean).slice(0, 20)
      : [];
    if (modifiers.some((modifier) => modifier.length > 80)) {
      throw new IndustryDomainError("INVALID_STATE", "Order modifiers must be 80 characters or fewer.");
    }

    const rows = await tx.$queryRaw<Array<{ id: string; name: string; price: Prisma.Decimal; isActive: boolean; isAvailable: boolean }>>`
      SELECT "id", "name", "price", "isActive", "isAvailable"
      FROM "restaurant_menu_items"
      WHERE "id"=${line.menuItemId}::uuid AND "workspaceId"=${workspaceId}::uuid
      LIMIT 1
      FOR SHARE
    `;
    const item = rows[0];
    if (!item || !item.isActive) throw new IndustryDomainError("NOT_FOUND", "A selected menu item is not available in this workspace.");
    if (!item.isAvailable) throw new IndustryDomainError("INVALID_STATE", `${item.name} is currently unavailable.`);

    const unitPrice = Number(item.price);
    const lineTotal = Math.round(unitPrice * line.quantity * 100) / 100;
    priced.push({ menuItemId: item.id, itemName: item.name, quantity: line.quantity, unitPrice, lineTotal, notes, modifiers });
  }
  return priced;
}

async function insertRestaurantOrder(
  tx: Prisma.TransactionClient,
  workspaceId: string,
  source: RestaurantOrderSource,
  input: RestaurantOrderInput,
  options: { actorId?: string; externalReference?: string; initialStatus: RestaurantOrderStatus },
) {
  if (!["DINE_IN", "TAKEAWAY", "DELIVERY"].includes(input.fulfillmentType)) {
    throw new IndustryDomainError("INVALID_STATE", "Order type is invalid.");
  }
  if (input.fulfillmentType === "DINE_IN" && !input.restaurantTableId) {
    throw new IndustryDomainError("INVALID_STATE", "Dine-in orders require a restaurant table.");
  }
  if (input.fulfillmentType === "DELIVERY" && !input.deliveryAddress?.trim()) {
    throw new IndustryDomainError("INVALID_STATE", "Delivery orders require an address.");
  }

  await assertRestaurantTable(tx, workspaceId, input.restaurantTableId);
  const lines = await priceLines(tx, workspaceId, input.items);
  const subtotal = Math.round(lines.reduce((sum, line) => sum + line.lineTotal, 0) * 100) / 100;
  const discountAmount = money(input.discountAmount, "Discount");
  const taxAmount = money(input.taxAmount, "Tax");
  if (discountAmount > subtotal) throw new IndustryDomainError("INVALID_STATE", "Discount cannot exceed the order subtotal.");
  const total = Math.round((subtotal - discountAmount + taxAmount) * 100) / 100;
  const orderNumber = await nextOrderNumber(tx, workspaceId);

  const rows = await tx.$queryRaw<Array<{ id: string; orderNumber: string; status: RestaurantOrderStatus; total: Prisma.Decimal }>>`
    INSERT INTO "restaurant_orders" (
      "workspaceId", "orderNumber", "source", "fulfillmentType", "status", "restaurantTableId",
      "customerName", "customerPhone", "deliveryAddress", "notes", "subtotal", "discountAmount", "taxAmount", "total",
      "externalReference", "createdById", "confirmedById", "confirmedAt"
    ) VALUES (
      ${workspaceId}::uuid, ${orderNumber}, ${source}, ${input.fulfillmentType}, ${options.initialStatus},
      ${input.restaurantTableId ?? null}::uuid, ${cleanOptional(input.customerName, 120)}, ${cleanOptional(input.customerPhone, 40)},
      ${cleanOptional(input.deliveryAddress, 500)}, ${cleanOptional(input.notes, 500)}, ${subtotal}, ${discountAmount}, ${taxAmount}, ${total},
      ${options.externalReference ?? null}, ${options.actorId ?? null},
      ${options.initialStatus === "CONFIRMED" ? options.actorId ?? null : null},
      ${options.initialStatus === "CONFIRMED" ? new Date() : null}
    )
    RETURNING "id", "orderNumber", "status", "total"
  `;
  const order = rows[0]!;

  for (const line of lines) {
    await tx.$executeRaw`
      INSERT INTO "restaurant_order_items" (
        "restaurantOrderId", "menuItemId", "itemName", "quantity", "unitPrice", "lineTotal", "notes", "modifiers"
      ) VALUES (
        ${order.id}::uuid, ${line.menuItemId}::uuid, ${line.itemName}, ${line.quantity}, ${line.unitPrice}, ${line.lineTotal},
        ${line.notes}, ${JSON.stringify(line.modifiers)}::jsonb
      )
    `;
  }

  return { ...order, total: Number(order.total) };
}

async function createKitchenTicketForRestaurantOrder(
  tx: Prisma.TransactionClient,
  workspaceId: string,
  order: { id: string; orderNumber: string; restaurantTableId: string | null },
) {
  const ticketNumber = `KOT-${order.orderNumber}`;
  const rows = await tx.$queryRaw<Array<{ id: string; ticketNumber: string }>>`
    INSERT INTO "kitchen_tickets" (
      "workspaceId", "restaurantOrderId", "restaurantTableId", "ticketNumber", "notes"
    ) VALUES (
      ${workspaceId}::uuid, ${order.id}::uuid, ${order.restaurantTableId}::uuid, ${ticketNumber}, ${`Restaurant order ${order.orderNumber}`}
    )
    ON CONFLICT ("workspaceId", "ticketNumber") DO UPDATE SET "updatedAt"=now()
    RETURNING "id", "ticketNumber"
  `;
  if (order.restaurantTableId) {
    await tx.$executeRaw`
      UPDATE "restaurant_tables" SET "status"='OCCUPIED', "updatedAt"=now()
      WHERE "id"=${order.restaurantTableId}::uuid AND "workspaceId"=${workspaceId}::uuid AND "status" <> 'INACTIVE'
    `;
  }
  return rows[0]!;
}

export async function listRestaurantMenu(workspaceId: string) {
  await requireWorkspaceModule(workspaceId, "restaurant");
  const categories = await db.$queryRaw<Array<{ id: string; name: string; sortOrder: number; isActive: boolean }>>`
    SELECT "id", "name", "sortOrder", "isActive"
    FROM "restaurant_menu_categories"
    WHERE "workspaceId"=${workspaceId}::uuid
    ORDER BY "sortOrder", "name"
  `;
  const items = await db.$queryRaw<Array<{
    id: string; categoryId: string; categoryName: string; productId: string | null; name: string; description: string | null;
    price: Prisma.Decimal; sortOrder: number; isActive: boolean; isAvailable: boolean;
  }>>`
    SELECT mi."id", mi."categoryId", c."name" AS "categoryName", mi."productId", mi."name", mi."description", mi."price",
           mi."sortOrder", mi."isActive", mi."isAvailable"
    FROM "restaurant_menu_items" mi
    INNER JOIN "restaurant_menu_categories" c ON c."id"=mi."categoryId" AND c."workspaceId"=mi."workspaceId"
    WHERE mi."workspaceId"=${workspaceId}::uuid
    ORDER BY c."sortOrder", c."name", mi."sortOrder", mi."name"
  `;
  return { categories, items: items.map((item) => ({ ...item, price: Number(item.price) })) };
}

export async function createRestaurantMenuCategory(context: IndustryContext, input: { name: string; sortOrder?: number }) {
  assertManager(context);
  await requireWorkspaceModule(context.workspaceId, "restaurant");
  const name = input.name.trim();
  if (!name || name.length > 80) throw new IndustryDomainError("INVALID_STATE", "Category name must be 1-80 characters.");
  const sortOrder = input.sortOrder ?? 0;
  if (!Number.isInteger(sortOrder) || sortOrder < 0 || sortOrder > 10_000) throw new IndustryDomainError("INVALID_STATE", "Category order is invalid.");
  const rows = await db.$queryRaw<Array<{ id: string; name: string }>>`
    INSERT INTO "restaurant_menu_categories" ("workspaceId", "name", "sortOrder")
    VALUES (${context.workspaceId}::uuid, ${name}, ${sortOrder})
    RETURNING "id", "name"
  `;
  return rows[0]!;
}

export async function createRestaurantMenuItem(context: IndustryContext, input: {
  categoryId: string; productId?: string; name: string; description?: string; price: number; sortOrder?: number;
}) {
  assertManager(context);
  await requireWorkspaceModule(context.workspaceId, "restaurant");
  assertUuid(input.categoryId, "Menu category");
  const name = input.name.trim();
  if (!name || name.length > 120) throw new IndustryDomainError("INVALID_STATE", "Menu item name must be 1-120 characters.");
  const price = money(input.price, "Menu price");
  const sortOrder = input.sortOrder ?? 0;
  if (!Number.isInteger(sortOrder) || sortOrder < 0 || sortOrder > 10_000) throw new IndustryDomainError("INVALID_STATE", "Menu item order is invalid.");

  return db.$transaction(async (tx) => {
    const category = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT "id" FROM "restaurant_menu_categories"
      WHERE "id"=${input.categoryId}::uuid AND "workspaceId"=${context.workspaceId}::uuid AND "isActive"=true
      LIMIT 1
    `;
    if (!category[0]) throw new IndustryDomainError("NOT_FOUND", "Menu category was not found in this workspace.");

    if (input.productId) {
      assertUuid(input.productId, "Product");
      const product = await tx.product.findFirst({ where: { id: input.productId, workspaceId: context.workspaceId }, select: { id: true } });
      if (!product) throw new IndustryDomainError("NOT_FOUND", "Linked inventory product was not found in this workspace.");
    }

    const rows = await tx.$queryRaw<Array<{ id: string; name: string }>>`
      INSERT INTO "restaurant_menu_items" (
        "workspaceId", "categoryId", "productId", "name", "description", "price", "sortOrder"
      ) VALUES (
        ${context.workspaceId}::uuid, ${input.categoryId}::uuid, ${input.productId ?? null}, ${name},
        ${cleanOptional(input.description, 500)}, ${price}, ${sortOrder}
      ) RETURNING "id", "name"
    `;
    await writeAudit(tx, {
      workspaceId: context.workspaceId,
      actorId: context.userId,
      action: "restaurant.menu_item.created",
      entityType: "RestaurantMenuItem",
      entityId: rows[0]!.id,
      metadata: { name, categoryId: input.categoryId, productId: input.productId ?? null, price },
    });
    return rows[0]!;
  });
}

export async function setRestaurantMenuItemAvailability(context: IndustryContext, menuItemId: string, isAvailable: boolean) {
  await requireWorkspaceModule(context.workspaceId, "restaurant");
  assertUuid(menuItemId, "Menu item");
  const rows = await db.$queryRaw<Array<{ id: string; name: string; isAvailable: boolean }>>`
    UPDATE "restaurant_menu_items"
    SET "isAvailable"=${isAvailable}, "updatedAt"=now()
    WHERE "id"=${menuItemId}::uuid AND "workspaceId"=${context.workspaceId}::uuid AND "isActive"=true
    RETURNING "id", "name", "isAvailable"
  `;
  if (!rows[0]) throw new IndustryDomainError("NOT_FOUND", "Menu item was not found in this workspace.");
  return rows[0];
}

export async function createPosRestaurantOrder(context: IndustryContext, input: RestaurantOrderInput) {
  await requireWorkspaceModule(context.workspaceId, "restaurant");
  const hasFinancialOverride = (input.discountAmount ?? 0) > 0 || (input.taxAmount ?? 0) > 0;
  if (hasFinancialOverride && !managerRoles.has(context.role)) {
    throw new IndustryDomainError("PERMISSION_DENIED", "Manager approval is required for POS financial overrides");
  }
  return db.$transaction(async (tx) => {
    const order = await insertRestaurantOrder(tx, context.workspaceId, "POS", input, {
      actorId: context.userId,
      initialStatus: "CONFIRMED",
    });
    const stored = await tx.$queryRaw<Array<{ id: string; orderNumber: string; restaurantTableId: string | null }>>`
      SELECT "id", "orderNumber", "restaurantTableId" FROM "restaurant_orders"
      WHERE "id"=${order.id}::uuid AND "workspaceId"=${context.workspaceId}::uuid
      LIMIT 1
    `;
    await createKitchenTicketForRestaurantOrder(tx, context.workspaceId, stored[0]!);
    await writeAudit(tx, {
      workspaceId: context.workspaceId,
      actorId: context.userId,
      action: "restaurant.order.created",
      entityType: "RestaurantOrder",
      entityId: order.id,
      metadata: { source: "POS", orderNumber: order.orderNumber, total: order.total },
    });
    return order;
  });
}

export async function ingestWhatsappRestaurantOrder(workspaceId: string, input: WhatsappRestaurantOrderInput) {
  await requireWorkspaceModule(workspaceId, "restaurant");
  const externalMessageId = input.externalMessageId.trim();
  if (!externalMessageId || externalMessageId.length > 200) throw new IndustryDomainError("INVALID_STATE", "WhatsApp message id is invalid.");
  const body = input.messageBody.trim();
  if (!body || body.length > 4_000) throw new IndustryDomainError("INVALID_STATE", "WhatsApp message body is invalid.");
  if (!input.customerPhone?.trim()) throw new IndustryDomainError("INVALID_STATE", "WhatsApp customer phone is required.");

  return db.$transaction(async (tx) => {
    const existing = await tx.$queryRaw<Array<{ id: string; orderNumber: string; status: RestaurantOrderStatus; total: Prisma.Decimal }>>`
      SELECT "id", "orderNumber", "status", "total"
      FROM "restaurant_orders"
      WHERE "workspaceId"=${workspaceId}::uuid AND "source"='WHATSAPP' AND "externalReference"=${externalMessageId}
      LIMIT 1
      FOR SHARE
    `;
    if (existing[0]) return { ...existing[0], total: Number(existing[0].total), idempotent: true };

    const order = await insertRestaurantOrder(tx, workspaceId, "WHATSAPP", input, {
      externalReference: externalMessageId,
      initialStatus: "PENDING_REVIEW",
    });
    await tx.$executeRaw`
      INSERT INTO "restaurant_whatsapp_messages" (
        "workspaceId", "externalMessageId", "customerPhone", "customerName", "body", "restaurantOrderId"
      ) VALUES (
        ${workspaceId}::uuid, ${externalMessageId}, ${input.customerPhone!.trim()}, ${cleanOptional(input.customerName, 120)},
        ${body}, ${order.id}::uuid
      )
      ON CONFLICT ("workspaceId", "externalMessageId") DO NOTHING
    `;
    await writeAudit(tx, {
      workspaceId,
      action: "restaurant.whatsapp_order.received",
      entityType: "RestaurantOrder",
      entityId: order.id,
      metadata: { source: "WHATSAPP", orderNumber: order.orderNumber, externalMessageId },
    });
    return { ...order, idempotent: false };
  });
}

export async function confirmRestaurantOrder(context: IndustryContext, orderId: string) {
  await requireWorkspaceModule(context.workspaceId, "restaurant");
  assertUuid(orderId, "Restaurant order");
  return db.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<Array<{ id: string; orderNumber: string; status: RestaurantOrderStatus; restaurantTableId: string | null }>>`
      SELECT "id", "orderNumber", "status", "restaurantTableId"
      FROM "restaurant_orders"
      WHERE "id"=${orderId}::uuid AND "workspaceId"=${context.workspaceId}::uuid
      FOR UPDATE
    `;
    const order = rows[0];
    if (!order) throw new IndustryDomainError("NOT_FOUND", "Restaurant order was not found.");
    if (order.status === "CONFIRMED") return order;
    if (order.status !== "PENDING_REVIEW") {
      throw new IndustryDomainError("INVALID_STATE", `Only pending orders can be confirmed. Current status: ${order.status}.`);
    }

    await tx.$executeRaw`
      UPDATE "restaurant_orders"
      SET "status"='CONFIRMED', "confirmedById"=${context.userId ?? null}, "confirmedAt"=now(), "updatedAt"=now()
      WHERE "id"=${order.id}::uuid AND "workspaceId"=${context.workspaceId}::uuid
    `;
    await createKitchenTicketForRestaurantOrder(tx, context.workspaceId, order);
    await writeAudit(tx, {
      workspaceId: context.workspaceId,
      actorId: context.userId,
      action: "restaurant.order.confirmed",
      entityType: "RestaurantOrder",
      entityId: order.id,
      metadata: { orderNumber: order.orderNumber },
    });
    return { ...order, status: "CONFIRMED" as const };
  });
}

const transitions: Record<RestaurantOrderStatus, readonly RestaurantOrderStatus[]> = {
  PENDING_REVIEW: ["CANCELLED"],
  CONFIRMED: ["PREPARING", "CANCELLED"],
  PREPARING: ["READY", "CANCELLED"],
  READY: ["COMPLETED", "CANCELLED"],
  COMPLETED: [],
  CANCELLED: [],
};

const kitchenStatusForOrder: Partial<Record<RestaurantOrderStatus, string>> = {
  PREPARING: "PREPARING",
  READY: "READY",
  COMPLETED: "SERVED",
  CANCELLED: "CANCELLED",
};

export async function transitionRestaurantOrder(context: IndustryContext, orderId: string, nextStatus: RestaurantOrderStatus) {
  await requireWorkspaceModule(context.workspaceId, "restaurant");
  assertUuid(orderId, "Restaurant order");
  return db.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<Array<{ id: string; orderNumber: string; status: RestaurantOrderStatus; restaurantTableId: string | null }>>`
      SELECT "id", "orderNumber", "status", "restaurantTableId"
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
    if (!transitions[order.status].includes(nextStatus)) {
      throw new IndustryDomainError("INVALID_STATE", `Cannot move restaurant order from ${order.status} to ${nextStatus}.`);
    }

    await tx.$executeRaw`
      UPDATE "restaurant_orders"
      SET "status"=${nextStatus},
          "completedAt"=CASE WHEN ${nextStatus}='COMPLETED' THEN now() ELSE "completedAt" END,
          "cancelledAt"=CASE WHEN ${nextStatus}='CANCELLED' THEN now() ELSE "cancelledAt" END,
          "updatedAt"=now()
      WHERE "id"=${order.id}::uuid AND "workspaceId"=${context.workspaceId}::uuid
    `;

    const kitchenStatus = kitchenStatusForOrder[nextStatus];
    if (kitchenStatus) {
      await tx.$executeRaw`
        UPDATE "kitchen_tickets"
        SET "status"=${kitchenStatus},
            "startedAt"=CASE WHEN ${kitchenStatus}='PREPARING' AND "startedAt" IS NULL THEN now() ELSE "startedAt" END,
            "readyAt"=CASE WHEN ${kitchenStatus}='READY' AND "readyAt" IS NULL THEN now() ELSE "readyAt" END,
            "servedAt"=CASE WHEN ${kitchenStatus}='SERVED' AND "servedAt" IS NULL THEN now() ELSE "servedAt" END,
            "updatedAt"=now()
        WHERE "workspaceId"=${context.workspaceId}::uuid AND "restaurantOrderId"=${order.id}::uuid
      `;
    }

    if (order.restaurantTableId && (nextStatus === "COMPLETED" || nextStatus === "CANCELLED")) {
      await releaseRestaurantTableIfSettled(tx, context.workspaceId, order.restaurantTableId);
    }

    await writeAudit(tx, {
      workspaceId: context.workspaceId,
      actorId: context.userId,
      action: "restaurant.order.status_changed",
      entityType: "RestaurantOrder",
      entityId: order.id,
      metadata: { orderNumber: order.orderNumber, from: order.status, to: nextStatus },
    });
    return { ...order, status: nextStatus };
  });
}

export async function setRestaurantOrderPaymentStatus(context: IndustryContext, orderId: string, paymentStatus: RestaurantPaymentStatus) {
  await requireWorkspaceModule(context.workspaceId, "restaurant");
  assertUuid(orderId, "Restaurant order");
  if (!["UNPAID", "PARTIALLY_PAID", "PAID"].includes(paymentStatus)) throw new IndustryDomainError("INVALID_STATE", "Payment status is invalid.");
  const rows = await db.$queryRaw<Array<{ id: string; paymentStatus: RestaurantPaymentStatus }>>`
    UPDATE "restaurant_orders"
    SET "paymentStatus"=${paymentStatus}, "updatedAt"=now()
    WHERE "id"=${orderId}::uuid AND "workspaceId"=${context.workspaceId}::uuid AND "status" <> 'CANCELLED'
    RETURNING "id", "paymentStatus"
  `;
  if (!rows[0]) throw new IndustryDomainError("NOT_FOUND", "Restaurant order was not found.");
  return rows[0];
}

export async function listRestaurantOrders(workspaceId: string, limit = 100) {
  await requireWorkspaceModule(workspaceId, "restaurant");
  const safeLimit = Math.max(1, Math.min(Math.trunc(limit), 250));
  const rows = await db.$queryRaw<Array<{
    id: string; orderNumber: string; source: RestaurantOrderSource; fulfillmentType: RestaurantFulfillmentType;
    status: RestaurantOrderStatus; paymentStatus: RestaurantPaymentStatus; customerName: string | null; customerPhone: string | null;
    tableName: string | null; total: Prisma.Decimal; createdAt: Date; notes: string | null;
  }>>`
    SELECT ro."id", ro."orderNumber", ro."source", ro."fulfillmentType", ro."status", ro."paymentStatus",
           ro."customerName", ro."customerPhone", rt."name" AS "tableName", ro."total", ro."createdAt", ro."notes"
    FROM "restaurant_orders" ro
    LEFT JOIN "restaurant_tables" rt ON rt."id"=ro."restaurantTableId" AND rt."workspaceId"=ro."workspaceId"
    WHERE ro."workspaceId"=${workspaceId}::uuid
    ORDER BY ro."createdAt" DESC
    LIMIT ${safeLimit}
  `;
  return rows.map((row) => ({ ...row, total: Number(row.total) }));
}

export async function getRestaurantOrder(workspaceId: string, orderId: string) {
  await requireWorkspaceModule(workspaceId, "restaurant");
  assertUuid(orderId, "Restaurant order");
  const orders = await db.$queryRaw<Array<{
    id: string; orderNumber: string; source: RestaurantOrderSource; fulfillmentType: RestaurantFulfillmentType; status: RestaurantOrderStatus;
    paymentStatus: RestaurantPaymentStatus; customerName: string | null; customerPhone: string | null; deliveryAddress: string | null;
    notes: string | null; subtotal: Prisma.Decimal; discountAmount: Prisma.Decimal; taxAmount: Prisma.Decimal; total: Prisma.Decimal; createdAt: Date;
  }>>`
    SELECT "id", "orderNumber", "source", "fulfillmentType", "status", "paymentStatus", "customerName", "customerPhone",
           "deliveryAddress", "notes", "subtotal", "discountAmount", "taxAmount", "total", "createdAt"
    FROM "restaurant_orders"
    WHERE "id"=${orderId}::uuid AND "workspaceId"=${workspaceId}::uuid
    LIMIT 1
  `;
  const order = orders[0];
  if (!order) throw new IndustryDomainError("NOT_FOUND", "Restaurant order was not found.");
  const items = await db.$queryRaw<Array<{ id: string; itemName: string; quantity: Prisma.Decimal; unitPrice: Prisma.Decimal; lineTotal: Prisma.Decimal; notes: string | null; modifiers: unknown }>>`
    SELECT roi."id", roi."itemName", roi."quantity", roi."unitPrice", roi."lineTotal", roi."notes", roi."modifiers"
    FROM "restaurant_order_items" roi
    INNER JOIN "restaurant_orders" ro ON ro."id"=roi."restaurantOrderId"
    WHERE roi."restaurantOrderId"=${orderId}::uuid AND ro."workspaceId"=${workspaceId}::uuid
    ORDER BY roi."createdAt"
  `;
  return {
    ...order,
    subtotal: Number(order.subtotal), discountAmount: Number(order.discountAmount), taxAmount: Number(order.taxAmount), total: Number(order.total),
    items: items.map((item) => ({ ...item, quantity: Number(item.quantity), unitPrice: Number(item.unitPrice), lineTotal: Number(item.lineTotal) })),
  };
}

export async function listWhatsappRestaurantMessages(workspaceId: string, limit = 50) {
  await requireWorkspaceModule(workspaceId, "restaurant");
  const safeLimit = Math.max(1, Math.min(Math.trunc(limit), 100));
  return db.$queryRaw<Array<{ id: string; externalMessageId: string; customerPhone: string; customerName: string | null; body: string; restaurantOrderId: string | null; receivedAt: Date }>>`
    SELECT "id", "externalMessageId", "customerPhone", "customerName", "body", "restaurantOrderId", "receivedAt"
    FROM "restaurant_whatsapp_messages"
    WHERE "workspaceId"=${workspaceId}::uuid
    ORDER BY "receivedAt" DESC
    LIMIT ${safeLimit}
  `;
}

export async function getRestaurantWorkspaceMetrics(workspaceId: string) {
  await requireWorkspaceModule(workspaceId, "restaurant");
  const workspace = await db.workspace.findUnique({ where: { id: workspaceId }, select: { timezone: true } });
  const timezone = workspace?.timezone || "Asia/Karachi";
  const rows = await db.$queryRaw<Array<{
    todaySales: Prisma.Decimal; todayOrders: number; liveOrders: number; pendingWhatsapp: number; readyOrders: number;
  }>>`
    SELECT
      COALESCE(SUM("total") FILTER (
        WHERE "status"='COMPLETED' AND "createdAt" >= (date_trunc('day', now() AT TIME ZONE ${timezone}) AT TIME ZONE ${timezone})
      ), 0) AS "todaySales",
      COUNT(*) FILTER (
        WHERE "createdAt" >= (date_trunc('day', now() AT TIME ZONE ${timezone}) AT TIME ZONE ${timezone})
      )::int AS "todayOrders",
      COUNT(*) FILTER (WHERE "status" IN ('CONFIRMED','PREPARING','READY'))::int AS "liveOrders",
      COUNT(*) FILTER (WHERE "source"='WHATSAPP' AND "status"='PENDING_REVIEW')::int AS "pendingWhatsapp",
      COUNT(*) FILTER (WHERE "status"='READY')::int AS "readyOrders"
    FROM "restaurant_orders"
    WHERE "workspaceId"=${workspaceId}::uuid
  `;
  const row = rows[0] ?? { todaySales: new Prisma.Decimal(0), todayOrders: 0, liveOrders: 0, pendingWhatsapp: 0, readyOrders: 0 };
  return { ...row, todaySales: Number(row.todaySales) };
}
