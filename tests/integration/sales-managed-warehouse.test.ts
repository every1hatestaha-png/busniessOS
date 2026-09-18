import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "crypto";

import { createTestWorkspace, getDb, teardownTestWorkspace } from "../finance-grade/helpers/db-helpers";

let db: Awaited<ReturnType<typeof getDb>>;
let createSale: typeof import("@/lib/server/sales")["createSale"];
let createCustomerReturn: typeof import("@/lib/server/sales")["createCustomerReturn"];
let cancelSale: typeof import("@/lib/server/sales")["cancelSale"];
let updateSaleAndInvoice: typeof import("@/lib/server/sale-edit")["updateSaleAndInvoice"];
let cancelCustomerReturn: typeof import("@/lib/server/customer-return-reversals")["cancelCustomerReturn"];
let ensureDefaultAccounts: typeof import("@/lib/server/accounting")["ensureDefaultAccounts"];
let setWorkspaceModule: typeof import("@/lib/server/industry-modules")["setWorkspaceModule"];

const marker = randomUUID();
let workspaceId = "";
let userId = "";
let otherWorkspaceId = "";
let otherUserId = "";
let customerId = "";
let productId = "";
let warehouseId = "";
let otherWarehouseId = "";

const context = () => ({ workspaceId, userId, role: "OWNER" as const });

async function quantities() {
  const [product, rows] = await Promise.all([
    db.product.findFirstOrThrow({
      where: { id: productId, workspaceId },
      select: { stockQuantity: true },
    }),
    db.$queryRawUnsafe<Array<{ quantity: string }>>(
      'SELECT "quantity"::text AS "quantity" FROM "warehouse_stocks" WHERE "workspaceId"=$1::uuid AND "warehouseId"=$2::uuid AND "productId"=$3::uuid',
      workspaceId,
      warehouseId,
      productId,
    ),
  ]);
  return {
    core: Number(product.stockQuantity),
    warehouse: Number(rows[0]?.quantity ?? 0),
  };
}

async function expectQuantities(expected: number) {
  expect(await quantities()).toEqual({ core: expected, warehouse: expected });
}

describe("managed warehouse sales lifecycle", () => {
  beforeAll(async () => {
    db = await getDb();
    ({ createSale, createCustomerReturn, cancelSale } = await import("@/lib/server/sales"));
    ({ updateSaleAndInvoice } = await import("@/lib/server/sale-edit"));
    ({ cancelCustomerReturn } = await import("@/lib/server/customer-return-reversals"));
    ({ ensureDefaultAccounts } = await import("@/lib/server/accounting"));
    ({ setWorkspaceModule } = await import("@/lib/server/industry-modules"));

    const primary = await createTestWorkspace("managed-sales-" + marker);
    workspaceId = primary.workspaceId;
    userId = primary.userId;

    const secondary = await createTestWorkspace("managed-sales-other-" + marker);
    otherWorkspaceId = secondary.workspaceId;
    otherUserId = secondary.userId;

    await setWorkspaceModule(context(), "inventory", true, { warehouseStockMode: "MANAGED" });
    await ensureDefaultAccounts(workspaceId);

    const [customer, product] = await Promise.all([
      db.customer.create({
        data: {
          workspaceId,
          name: "Managed Sales Customer",
          companyName: "Managed Sales Customer",
          creditLimit: 1000000,
          creditDays: 30,
        },
      }),
      db.product.create({
        data: {
          workspaceId,
          name: "Managed Sales Product",
          sku: "MS-" + marker,
          stockQuantity: 20,
          costPrice: 100,
          sellingPrice: 150,
          status: "ACTIVE",
        },
      }),
    ]);
    customerId = customer.id;
    productId = product.id;

    const warehouses = await db.$queryRawUnsafe<Array<{ id: string }>>(
      'INSERT INTO "warehouses" ("workspaceId","name","code","isDefault","isActive") VALUES ($1::uuid,$2,$3,true,true) RETURNING "id"::text AS "id"',
      workspaceId,
      "Sales Warehouse",
      "SALE-" + marker.slice(0, 8),
    );
    warehouseId = warehouses[0]!.id;

    const otherWarehouses = await db.$queryRawUnsafe<Array<{ id: string }>>(
      'INSERT INTO "warehouses" ("workspaceId","name","code","isDefault","isActive") VALUES ($1::uuid,$2,$3,true,true) RETURNING "id"::text AS "id"',
      otherWorkspaceId,
      "Other Tenant Warehouse",
      "OTHER-" + marker.slice(0, 8),
    );
    otherWarehouseId = otherWarehouses[0]!.id;

    await db.$executeRawUnsafe(
      'INSERT INTO "warehouse_stocks" ("workspaceId","warehouseId","productId","quantity","updatedAt") VALUES ($1::uuid,$2::uuid,$3::uuid,20,now())',
      workspaceId,
      warehouseId,
      productId,
    );
  }, 30_000);

  afterAll(async () => {
    if (!db) return;

    if (workspaceId) {
      await db.$executeRawUnsafe('DELETE FROM "warehouse_stocks" WHERE "workspaceId"=$1::uuid', workspaceId);
      await db.$executeRawUnsafe('DELETE FROM "warehouses" WHERE "workspaceId"=$1::uuid', workspaceId);
      await db.$executeRawUnsafe('DELETE FROM "workspace_modules" WHERE "workspaceId"=$1::uuid', workspaceId);
      await teardownTestWorkspace(workspaceId, userId);
    }

    if (otherWorkspaceId) {
      await db.$executeRawUnsafe('DELETE FROM "warehouse_stocks" WHERE "workspaceId"=$1::uuid', otherWorkspaceId);
      await db.$executeRawUnsafe('DELETE FROM "warehouses" WHERE "workspaceId"=$1::uuid', otherWorkspaceId);
      await db.$executeRawUnsafe('DELETE FROM "workspace_modules" WHERE "workspaceId"=$1::uuid', otherWorkspaceId);
      await teardownTestWorkspace(otherWorkspaceId, otherUserId);
    }
  }, 30_000);

  it("keeps sale, edit, return, return cancellation and sale cancellation in one warehouse", async () => {
    await expectQuantities(20);

    const sale = await createSale(context(), {
      customerId,
      warehouseId,
      items: [{ productId, quantity: 5, unitPrice: 150, discountPerUnit: 0 }],
      orderDiscount: 0,
      gstRate: 0,
      paidAmount: 0,
      notes: "Managed lifecycle",
      idempotencyKey: randomUUID(),
    });

    await expectQuantities(15);

    const storedSale = await db.salesOrder.findFirstOrThrow({
      where: { id: sale.id, workspaceId },
      include: { invoices: { take: 1 } },
    });
    expect(storedSale.warehouseId).toBe(warehouseId);
    expect(storedSale.invoices[0]).toBeTruthy();

    const detail = await createSaleDetail(sale.id);
    expect(detail?.warehouse?.id).toBe(warehouseId);

    await updateSaleAndInvoice(context(), {
      saleId: sale.id,
      customerId,
      issuedAt: new Date("2026-09-18T00:00:00.000Z"),
      dueDate: new Date("2026-10-18T00:00:00.000Z"),
      items: [{ productId, quantity: 7, pricingMode: "UNIT", unitPrice: 150, discountPerUnit: 0 }],
      orderDiscount: 0,
      gstRate: 0,
      notes: "Managed lifecycle edited",
    });

    await expectQuantities(13);

    const saleItem = await db.salesOrderItem.findFirstOrThrow({
      where: { salesOrderId: sale.id, productId },
    });

    const returned = await createCustomerReturn(context(), {
      salesOrderId: sale.id,
      items: [{ itemId: saleItem.id, quantity: 2 }],
      restock: true,
      reason: "Managed warehouse lifecycle test",
      notes: "",
      idempotencyKey: "managed-sales-return-" + marker,
    });

    await expectQuantities(15);

    await cancelCustomerReturn(context(), returned.id, "Lifecycle reversal test");
    await expectQuantities(13);

    await cancelSale(context(), sale.id, false);
    await expectQuantities(20);

    const cancelled = await db.salesOrder.findFirstOrThrow({
      where: { id: sale.id, workspaceId },
      select: { status: true, warehouseId: true },
    });
    expect(cancelled).toEqual({ status: "CANCELLED", warehouseId });
  });

  it("rejects missing, cross-tenant, and warehouse-short sales without partial writes", async () => {
    const beforeCount = await db.salesOrder.count({ where: { workspaceId } });
    await expectQuantities(20);

    await expect(
      createSale(context(), {
        customerId,
        items: [{ productId, quantity: 1, unitPrice: 150, discountPerUnit: 0 }],
        orderDiscount: 0,
        gstRate: 0,
        paidAmount: 0,
        notes: "",
        idempotencyKey: randomUUID(),
      }),
    ).rejects.toMatchObject({ code: "WAREHOUSE_REQUIRED" });

    await expect(
      createSale(context(), {
        customerId,
        warehouseId: otherWarehouseId,
        items: [{ productId, quantity: 1, unitPrice: 150, discountPerUnit: 0 }],
        orderDiscount: 0,
        gstRate: 0,
        paidAmount: 0,
        notes: "",
        idempotencyKey: randomUUID(),
      }),
    ).rejects.toMatchObject({ code: "WAREHOUSE_NOT_FOUND" });

    await db.$executeRawUnsafe(
      'UPDATE "warehouse_stocks" SET "quantity"=1, "updatedAt"=now() WHERE "workspaceId"=$1::uuid AND "warehouseId"=$2::uuid AND "productId"=$3::uuid',
      workspaceId,
      warehouseId,
      productId,
    );

    await expect(
      createSale(context(), {
        customerId,
        warehouseId,
        items: [{ productId, quantity: 2, unitPrice: 150, discountPerUnit: 0 }],
        orderDiscount: 0,
        gstRate: 0,
        paidAmount: 0,
        notes: "",
        idempotencyKey: randomUUID(),
      }),
    ).rejects.toMatchObject({ code: "INSUFFICIENT_STOCK" });

    expect(await db.salesOrder.count({ where: { workspaceId } })).toBe(beforeCount);
    const product = await db.product.findFirstOrThrow({ where: { id: productId, workspaceId }, select: { stockQuantity: true } });
    expect(Number(product.stockQuantity)).toBe(20);

    await db.$executeRawUnsafe(
      'UPDATE "warehouse_stocks" SET "quantity"=20, "updatedAt"=now() WHERE "workspaceId"=$1::uuid AND "warehouseId"=$2::uuid AND "productId"=$3::uuid',
      workspaceId,
      warehouseId,
      productId,
    );
    await expectQuantities(20);
  });
});

async function createSaleDetail(saleId: string) {
  const { getSale } = await import("@/lib/server/sales");
  return getSale(workspaceId, saleId);
}
