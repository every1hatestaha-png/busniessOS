import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "crypto";

import { createTestWorkspace, getDb, teardownTestWorkspace } from "../finance-grade/helpers/db-helpers";

let db: Awaited<ReturnType<typeof getDb>>;
let workspaceId = "";
let userId = "";
let customerId = "";
let hubId = "";
let bearingId = "";
let sealId = "";
let studId = "";
let warehouseId = "";
const marker = randomUUID();

const context = () => ({ workspaceId, userId, role: "OWNER" as const });

async function stock(productId: string) {
  const [product, warehouseRows] = await Promise.all([
    db.product.findFirstOrThrow({ where: { id: productId, workspaceId }, select: { stockQuantity: true } }),
    db.$queryRawUnsafe<Array<{ quantity: string }>>(
      'SELECT "quantity"::text AS "quantity" FROM "warehouse_stocks" WHERE "workspaceId"=$1::uuid AND "warehouseId"=$2::uuid AND "productId"=$3::uuid',
      workspaceId,
      warehouseId,
      productId,
    ),
  ]);
  return { core: Number(product.stockQuantity), warehouse: Number(warehouseRows[0]?.quantity ?? 0) };
}

async function expectStock(productId: string, expected: number) {
  expect(await stock(productId)).toEqual({ core: expected, warehouse: expected });
}

describe("customer-specific sales BOM", () => {
  beforeAll(async () => {
    db = await getDb();
    const workspace = await createTestWorkspace(`customer-bom-${marker}`);
    workspaceId = workspace.workspaceId;
    userId = workspace.userId;

    const { setWorkspaceModule } = await import("@/lib/server/industry-modules");
    const { ensureDefaultAccounts } = await import("@/lib/server/accounting");
    await setWorkspaceModule(context(), "inventory", true, { warehouseStockMode: "MANAGED" });
    await ensureDefaultAccounts(workspaceId);

    const customer = await db.customer.create({
      data: { workspaceId, name: "Ahmed BOM Customer", companyName: "Ahmed BOM Customer", creditLimit: 1000000, creditDays: 30 },
    });
    customerId = customer.id;

    const products = await Promise.all([
      db.product.create({ data: { workspaceId, name: "Front Hub Full Floating", sku: `FHFF-${marker}`, stockQuantity: 20, costPrice: 1000, sellingPrice: 2500, status: "ACTIVE" } }),
      db.product.create({ data: { workspaceId, name: "Bearing", sku: `BRG-${marker}`, stockQuantity: 100, costPrice: 100, sellingPrice: 150, status: "ACTIVE" } }),
      db.product.create({ data: { workspaceId, name: "Seal", sku: `SEAL-${marker}`, stockQuantity: 50, costPrice: 50, sellingPrice: 80, status: "ACTIVE" } }),
      db.product.create({ data: { workspaceId, name: "Stud", sku: `STUD-${marker}`, stockQuantity: 200, costPrice: 20, sellingPrice: 30, status: "ACTIVE" } }),
    ]);
    [hubId, bearingId, sealId, studId] = products.map((product) => product.id);

    const warehouseRows = await db.$queryRawUnsafe<Array<{ id: string }>>(
      'INSERT INTO "warehouses" ("workspaceId","name","code","isDefault","isActive") VALUES ($1::uuid,$2,$3,true,true) RETURNING "id"::text AS "id"',
      workspaceId,
      "BOM Warehouse",
      `BOM-${marker.slice(0, 8)}`,
    );
    warehouseId = warehouseRows[0]!.id;

    for (const [productId, quantity] of [[hubId, 20], [bearingId, 100], [sealId, 50], [studId, 200]] as Array<[string, number]>) {
      await db.$executeRawUnsafe(
        'INSERT INTO "warehouse_stocks" ("workspaceId","warehouseId","productId","quantity","updatedAt") VALUES ($1::uuid,$2::uuid,$3::uuid,$4,now())',
        workspaceId,
        warehouseId,
        productId,
        quantity,
      );
    }

    const { saveCustomerSalesBom } = await import("@/lib/server/customer-sales-bom");
    await saveCustomerSalesBom(context(), customerId, {
      productId: hubId,
      productCode: "FHFF",
      components: [
        { componentProductId: bearingId, quantityPerUnit: 2 },
        { componentProductId: sealId, quantityPerUnit: 0.5 },
        { componentProductId: studId, quantityPerUnit: 5 },
      ],
    });
  }, 30_000);

  afterAll(async () => {
    if (!db || !workspaceId) return;
    await db.$executeRawUnsafe('DELETE FROM "sales_order_component_snapshots" WHERE "workspaceId"=$1::uuid', workspaceId);
    await db.$executeRawUnsafe('DELETE FROM "customer_sales_bom_items" WHERE "customerSalesBomId" IN (SELECT "id" FROM "customer_sales_boms" WHERE "workspaceId"=$1::uuid)', workspaceId);
    await db.$executeRawUnsafe('DELETE FROM "customer_sales_boms" WHERE "workspaceId"=$1::uuid', workspaceId);
    await teardownTestWorkspace(workspaceId, userId);
  }, 30_000);

  it("keeps accessories internal while sale, edit, assembled return and cancellation move exact stock", async () => {
    const { createSale, createCustomerReturn, cancelSale } = await import("@/lib/server/sales");
    const { updateSaleAndInvoice } = await import("@/lib/server/sale-edit");
    const { cancelCustomerReturn } = await import("@/lib/server/customer-return-reversals");

    const sale = await createSale(context(), {
      customerId,
      warehouseId,
      items: [{ productId: hubId, quantity: 4, unitPrice: 2500, discountPerUnit: 0 }],
      orderDiscount: 0,
      gstRate: 0,
      paidAmount: 0,
      notes: "BOM sale",
      idempotencyKey: randomUUID(),
    });

    await expectStock(hubId, 16);
    await expectStock(bearingId, 92);
    await expectStock(sealId, 48);
    await expectStock(studId, 180);

    const order = await db.salesOrder.findFirstOrThrow({ where: { id: sale.id, workspaceId }, include: { items: true, invoices: { take: 1 } } });
    expect(order.items).toHaveLength(1);
    expect(order.items[0]!.productId).toBe(hubId);
    const invoiceSnapshot = order.invoices[0]!.issuedSnapshot as { order?: { items?: Array<{ name?: string }> } } | null;
    expect(invoiceSnapshot?.order?.items).toHaveLength(1);
    expect(invoiceSnapshot?.order?.items?.[0]?.name).toBe("Front Hub Full Floating");

    const snapshots = await db.$queryRawUnsafe<Array<{ productCode: string; componentProductId: string; totalQuantityConsumed: string }>>(
      'SELECT "productCode", "componentProductId"::text AS "componentProductId", "totalQuantityConsumed"::text AS "totalQuantityConsumed" FROM "sales_order_component_snapshots" WHERE "workspaceId"=$1::uuid AND "salesOrderId"=$2::uuid ORDER BY "componentName"',
      workspaceId,
      sale.id,
    );
    expect(snapshots).toHaveLength(3);
    expect(snapshots.every((row) => row.productCode === "FHFF")).toBe(true);

    await updateSaleAndInvoice(context(), {
      saleId: sale.id,
      customerId,
      issuedAt: new Date("2026-09-23T00:00:00.000Z"),
      dueDate: new Date("2026-10-23T00:00:00.000Z"),
      items: [{ productId: hubId, quantity: 5, pricingMode: "UNIT", unitPrice: 2500, discountPerUnit: 0 }],
      orderDiscount: 0,
      gstRate: 0,
      notes: "BOM sale edited",
    });

    await expectStock(hubId, 15);
    await expectStock(bearingId, 90);
    await expectStock(sealId, 47.5);
    await expectStock(studId, 175);

    const saleItem = await db.salesOrderItem.findFirstOrThrow({ where: { salesOrderId: sale.id, productId: hubId } });
    const customerReturn = await createCustomerReturn(context(), {
      salesOrderId: sale.id,
      items: [{ itemId: saleItem.id, quantity: 2 }],
      reason: "Test return",
      restock: true,
      notes: "BOM return",
      idempotencyKey: randomUUID(),
    });

    // The physical returned hubs come back as assembled units. Their bearings,
    // seals and studs remain embedded and must not become separately usable stock.
    await expectStock(hubId, 17);
    await expectStock(bearingId, 90);
    await expectStock(sealId, 47.5);
    await expectStock(studId, 175);

    const returnedHubMovement = await db.inventoryTransaction.findFirstOrThrow({
      where: { workspaceId, productId: hubId, type: "RETURN_IN", reference: customerReturn.number },
      orderBy: { createdAt: "desc" },
      select: { unitCost: true },
    });
    // Base hub cost 1000 + embedded BOM cost (2*100 + 0.5*50 + 5*20) = 1325.
    expect(Number(returnedHubMovement.unitCost)).toBeCloseTo(1325, 4);
    const componentReturnMovements = await db.inventoryTransaction.count({
      where: { workspaceId, type: "RETURN_IN", reference: `BOM:${customerReturn.number}` },
    });
    expect(componentReturnMovements).toBe(0);

    await cancelCustomerReturn(context(), customerReturn.id, "Return entered for test only");
    await expectStock(hubId, 15);
    await expectStock(bearingId, 90);
    await expectStock(sealId, 47.5);
    await expectStock(studId, 175);

    await cancelSale(context(), sale.id, false);
    await expectStock(hubId, 20);
    await expectStock(bearingId, 100);
    await expectStock(sealId, 50);
    await expectStock(studId, 200);
  }, 30_000);

  it("blocks a sale when an accessory is short", async () => {
    const { createSale } = await import("@/lib/server/sales");
    await db.product.update({ where: { id: bearingId }, data: { stockQuantity: 1 } });
    await db.$executeRawUnsafe(
      'UPDATE "warehouse_stocks" SET "quantity"=1,"updatedAt"=now() WHERE "workspaceId"=$1::uuid AND "warehouseId"=$2::uuid AND "productId"=$3::uuid',
      workspaceId,
      warehouseId,
      bearingId,
    );

    await expect(createSale(context(), {
      customerId,
      warehouseId,
      items: [{ productId: hubId, quantity: 1, unitPrice: 2500, discountPerUnit: 0 }],
      orderDiscount: 0,
      gstRate: 0,
      paidAmount: 0,
      notes: "Should fail on bearing stock",
      idempotencyKey: randomUUID(),
    })).rejects.toThrow(/Bearing requires 2/);

    await expectStock(hubId, 20);
    await expectStock(bearingId, 1);
  }, 30_000);
});