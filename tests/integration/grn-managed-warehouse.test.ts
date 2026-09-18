import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "crypto";

let db: typeof import("@/lib/server/db")["db"];
let createPurchase: typeof import("@/lib/server/purchases")["createPurchase"];
let createGoodsReceipt: typeof import("@/lib/server/purchases")["createGoodsReceipt"];
let createSupplierReturn: typeof import("@/lib/server/purchases")["createSupplierReturn"];
let cancelSupplierReturn: typeof import("@/lib/server/supplier-return-reversals")["cancelSupplierReturn"];
let updateGoodsReceipt: typeof import("@/lib/server/purchases")["updateGoodsReceipt"];
let voidGoodsReceipt: typeof import("@/lib/server/purchases")["voidGoodsReceipt"];
let getGoodsReceipt: typeof import("@/lib/server/purchases")["getGoodsReceipt"];
let ensureDefaultAccounts: typeof import("@/lib/server/accounting")["ensureDefaultAccounts"];
let setWorkspaceModule: typeof import("@/lib/server/industry-modules")["setWorkspaceModule"];

const runId = randomUUID();
let userId = "";
let workspaceId = "";
let otherWorkspaceId = "";
let supplierId = "";
let productId = "";
let warehouseId = "";
let otherWarehouseId = "";
let purchaseOrderId = "";
let purchaseOrderItemId = "";
let grnId = "";

const context = () => ({ workspaceId, userId, role: "OWNER" as const });

async function warehouseQuantity() {
  const rows = await db.$queryRawUnsafe<Array<{ quantity: string }>>(
    'SELECT "quantity"::text AS "quantity" FROM "warehouse_stocks" WHERE "workspaceId"=$1::uuid AND "warehouseId"=$2::uuid AND "productId"=$3::uuid',
    workspaceId,
    warehouseId,
    productId,
  );
  return Number(rows[0]?.quantity ?? 0);
}

async function coreQuantity() {
  const product = await db.product.findFirstOrThrow({
    where: { id: productId, workspaceId },
    select: { stockQuantity: true },
  });
  return product.stockQuantity.toNumber();
}

describe("managed warehouse GRN lifecycle", () => {
  beforeAll(async () => {
    const { config } = await import("dotenv");
    config({ path: ".env.local", quiet: true });

    ({ db } = await import("@/lib/server/db"));
    ({ createPurchase, createGoodsReceipt, createSupplierReturn, updateGoodsReceipt, voidGoodsReceipt, getGoodsReceipt } = await import("@/lib/server/purchases"));
    ({ cancelSupplierReturn } = await import("@/lib/server/supplier-return-reversals"));
    ({ ensureDefaultAccounts } = await import("@/lib/server/accounting"));
    ({ setWorkspaceModule } = await import("@/lib/server/industry-modules"));

    const user = await db.user.create({
      data: { clerkId: "managed-grn-" + runId, email: "managed-grn-" + runId + "@example.invalid" },
    });
    userId = user.id;

    const workspace = await db.workspace.create({
      data: { name: "Managed GRN " + runId, members: { create: { userId, role: "OWNER" } } },
    });
    workspaceId = workspace.id;

    const otherWorkspace = await db.workspace.create({
      data: { name: "Managed GRN Other " + runId, members: { create: { userId, role: "OWNER" } } },
    });
    otherWorkspaceId = otherWorkspace.id;

    await setWorkspaceModule(context(), "inventory", true, { warehouseStockMode: "MANAGED" });

    const [supplier, product] = await Promise.all([
      db.supplier.create({ data: { workspaceId, name: "Managed GRN Supplier" } }),
      db.product.create({
        data: {
          workspaceId,
          name: "Managed GRN Product",
          sku: "managed-grn-" + runId,
          stockQuantity: 0,
          costPrice: 10,
          sellingPrice: 20,
        },
      }),
    ]);
    supplierId = supplier.id;
    productId = product.id;

    const warehouses = await db.$queryRawUnsafe<Array<{ id: string }>>(
      'INSERT INTO "warehouses" ("workspaceId","name","code","isDefault","isActive") VALUES ($1::uuid,$2,$3,true,true) RETURNING "id"::text AS "id"',
      workspaceId,
      "Receiving Warehouse",
      "RCV-" + runId.slice(0, 8),
    );
    warehouseId = warehouses[0]!.id;

    const otherWarehouses = await db.$queryRawUnsafe<Array<{ id: string }>>(
      'INSERT INTO "warehouses" ("workspaceId","name","code","isDefault","isActive") VALUES ($1::uuid,$2,$3,true,true) RETURNING "id"::text AS "id"',
      otherWorkspaceId,
      "Other Tenant Warehouse",
      "OTH-" + runId.slice(0, 8),
    );
    otherWarehouseId = otherWarehouses[0]!.id;

    await ensureDefaultAccounts(workspaceId);

    const purchase = await createPurchase(context(), {
      supplierId,
      pricingMode: "UNIT",
      items: [{ productId, quantity: 20, unitCost: 10 }],
      idempotencyKey: "managed-grn-po-" + runId,
    });
    purchaseOrderId = purchase.id;
    const poItem = await db.purchaseOrderItem.findFirstOrThrow({ where: { purchaseOrderId } });
    purchaseOrderItemId = poItem.id;
  }, 30_000);

  afterAll(async () => {
    if (!db || !userId) return;

    if (workspaceId) {
      await db.auditLog.deleteMany({ where: { workspaceId } });
      await db.generalLedgerEntry.deleteMany({ where: { workspaceId } });
      await db.ledgerEntry.deleteMany({ where: { workspaceId } });
      await db.paymentAllocation.deleteMany({ where: { workspaceId } });
      await db.inventoryTransaction.deleteMany({ where: { workspaceId } });
      await db.debitNote.deleteMany({ where: { workspaceId } });
      await db.supplierReturnItem.deleteMany({ where: { supplierReturn: { workspaceId } } });
      await db.supplierReturn.deleteMany({ where: { workspaceId } });
      await db.goodReceivedNoteItem.deleteMany({ where: { goodReceivedNote: { workspaceId } } });
      await db.goodReceivedNote.deleteMany({ where: { workspaceId } });
      await db.purchaseOrderItem.deleteMany({ where: { purchaseOrder: { workspaceId } } });
      await db.purchaseOrder.deleteMany({ where: { workspaceId } });
      await db.$executeRawUnsafe('DELETE FROM "warehouse_stocks" WHERE "workspaceId"=$1::uuid', workspaceId);
      await db.$executeRawUnsafe('DELETE FROM "warehouses" WHERE "workspaceId"=$1::uuid', workspaceId);
      await db.$executeRawUnsafe('DELETE FROM "workspace_modules" WHERE "workspaceId"=$1::uuid', workspaceId);
      await db.product.deleteMany({ where: { workspaceId } });
      await db.supplier.deleteMany({ where: { workspaceId } });
      await db.cashBankAccount.deleteMany({ where: { workspaceId } });
      await db.account.deleteMany({ where: { workspaceId } });
      await db.workspace.delete({ where: { id: workspaceId } });
    }

    if (otherWorkspaceId) {
      await db.$executeRawUnsafe('DELETE FROM "warehouses" WHERE "workspaceId"=$1::uuid', otherWorkspaceId);
      await db.workspace.delete({ where: { id: otherWorkspaceId } });
    }

    await db.user.delete({ where: { id: userId } });
  }, 30_000);

  it("posts, edits, and voids the same GRN warehouse balance atomically with core inventory", async () => {
    const grn = await createGoodsReceipt(context(), {
      purchaseOrderId,
      warehouseId,
      idempotencyKey: "managed-grn-receipt-" + runId,
      items: [{
        purchaseOrderItemId,
        receivedQuantity: 5,
        acceptedQuantity: 5,
        actualUnitCost: 10,
      }],
    });
    grnId = grn.id;

    expect(await coreQuantity()).toBe(5);
    expect(await warehouseQuantity()).toBe(5);

    const detail = await getGoodsReceipt(workspaceId, grnId);
    expect(detail?.warehouse).toEqual({
      id: warehouseId,
      name: "Receiving Warehouse",
      code: "RCV-" + runId.slice(0, 8),
    });

    await updateGoodsReceipt(context(), grnId, {
      items: [{
        purchaseOrderItemId,
        receivedQuantity: 7,
        acceptedQuantity: 7,
        actualUnitCost: 10,
      }],
    });

    expect(await coreQuantity()).toBe(7);
    expect(await warehouseQuantity()).toBe(7);

    await voidGoodsReceipt(context(), grnId, { voidedReason: "Managed warehouse lifecycle test" });

    expect(await coreQuantity()).toBe(0);
    expect(await warehouseQuantity()).toBe(0);

    const voided = await getGoodsReceipt(workspaceId, grnId);
    expect(voided?.status).toBe("VOIDED");
    expect(voided?.warehouse?.id).toBe(warehouseId);
  });

  it("keeps supplier return create and cancellation synced to the source GRN warehouse", async () => {
    const purchase = await createPurchase(context(), {
      supplierId,
      pricingMode: "UNIT",
      items: [{ productId, quantity: 10, unitCost: 10 }],
      idempotencyKey: "managed-return-po-" + runId,
    });
    const item = await db.purchaseOrderItem.findFirstOrThrow({ where: { purchaseOrderId: purchase.id } });
    const grn = await createGoodsReceipt(context(), {
      purchaseOrderId: purchase.id,
      warehouseId,
      idempotencyKey: "managed-return-grn-" + runId,
      items: [{
        purchaseOrderItemId: item.id,
        receivedQuantity: 10,
        acceptedQuantity: 10,
        actualUnitCost: 10,
      }],
    });

    expect(await coreQuantity()).toBe(10);
    expect(await warehouseQuantity()).toBe(10);

    const supplierReturn = await createSupplierReturn(context(), {
      purchaseOrderId: purchase.id,
      goodReceivedNoteId: grn.id,
      idempotencyKey: "managed-return-" + runId,
      reason: "Damaged stock",
      items: [{ itemId: item.id, quantity: 2 }],
    });

    expect(await coreQuantity()).toBe(8);
    expect(await warehouseQuantity()).toBe(8);

    await cancelSupplierReturn(context(), supplierReturn.id, "Return cancelled during warehouse regression test");

    expect(await coreQuantity()).toBe(10);
    expect(await warehouseQuantity()).toBe(10);
  });

  it("rejects missing and cross-tenant receiving warehouses without creating a GRN", async () => {
    const before = await db.goodReceivedNote.count({ where: { workspaceId } });

    await expect(
      createGoodsReceipt(context(), {
        purchaseOrderId,
        idempotencyKey: "managed-grn-missing-" + runId,
        items: [{
          purchaseOrderItemId,
          receivedQuantity: 1,
          acceptedQuantity: 1,
          actualUnitCost: 10,
        }],
      }),
    ).rejects.toMatchObject({ code: "WAREHOUSE_REQUIRED" });

    await expect(
      createGoodsReceipt(context(), {
        purchaseOrderId,
        warehouseId: otherWarehouseId,
        idempotencyKey: "managed-grn-other-" + runId,
        items: [{
          purchaseOrderItemId,
          receivedQuantity: 1,
          acceptedQuantity: 1,
          actualUnitCost: 10,
        }],
      }),
    ).rejects.toMatchObject({ code: "WAREHOUSE_NOT_FOUND" });

    expect(await db.goodReceivedNote.count({ where: { workspaceId } })).toBe(before);
    expect(await coreQuantity()).toBe(0);
    expect(await warehouseQuantity()).toBe(0);
  });
});
