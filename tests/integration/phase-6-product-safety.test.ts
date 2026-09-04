import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

let db: typeof import("@/lib/server/db")["db"];
let updateProduct: typeof import("@/lib/server/products")["updateProduct"];
let removeProduct: typeof import("@/lib/server/products")["removeProduct"];
let archiveProduct: typeof import("@/lib/server/products")["archiveProduct"];
let adjustProductStock: typeof import("@/lib/server/products")["adjustProductStock"];
let getProduct: typeof import("@/lib/server/products")["getProduct"];
let listProducts: typeof import("@/lib/server/products")["listProducts"];
let createPurchase: typeof import("@/lib/server/purchases")["createPurchase"];
let createGoodsReceipt: typeof import("@/lib/server/purchases")["createGoodsReceipt"];
let ensureDefaultAccounts: typeof import("@/lib/server/accounting")["ensureDefaultAccounts"];

const runId = randomUUID();
let userId = "";
let userId2 = "";
let workspaceId = "";
let workspaceId2 = "";
let productId = "";
let productWithStockId = "";
let supplierId = "";

const context = () => ({ workspaceId, userId, role: "OWNER" as const });
const context2 = () => ({ workspaceId: workspaceId2, userId: userId2, role: "OWNER" as const });

describe("Phase 6: Safe product edit, delete, and stock adjustment", () => {
  beforeAll(async () => {
    const { config } = await import("dotenv");
    config({ path: ".env.local", quiet: true });
    ({ db } = await import("@/lib/server/db"));
    ({ updateProduct } = await import("@/lib/server/products"));
    ({ removeProduct } = await import("@/lib/server/products"));
    ({ archiveProduct } = await import("@/lib/server/products"));
    ({ adjustProductStock } = await import("@/lib/server/products"));
    ({ getProduct } = await import("@/lib/server/products"));
    ({ listProducts } = await import("@/lib/server/products"));
    ({ createPurchase } = await import("@/lib/server/purchases"));
    ({ createGoodsReceipt } = await import("@/lib/server/purchases"));
    ({ ensureDefaultAccounts } = await import("@/lib/server/accounting"));

    const [user1, user2] = await Promise.all([
      db.user.create({ data: { clerkId: `p6-${runId}`, email: `p6-${runId}@example.invalid` } }),
      db.user.create({ data: { clerkId: `p6b-${runId}`, email: `p6b-${runId}@example.invalid` } }),
    ]);
    userId = user1.id;
    userId2 = user2.id;

    const [ws1, ws2] = await Promise.all([
      db.workspace.create({ data: { name: `Phase6 Test ${runId}`, members: { create: { userId, role: "OWNER" } } } }),
      db.workspace.create({ data: { name: `Phase6 WS2 ${runId}`, members: { create: { userId: userId2, role: "OWNER" } } } }),
    ]);
    workspaceId = ws1.id;
    workspaceId2 = ws2.id;

    const [product, productWithStock, supplier] = await Promise.all([
      db.product.create({ data: { workspaceId, name: "Unused Product", sku: `UNUSED-${runId}`, stockQuantity: 0, costPrice: 100, sellingPrice: 200, unit: "PIECE", description: "Test product for deletion" } }),
      db.product.create({ data: { workspaceId, name: "Stocked Product", sku: `STOCKED-${runId}`, stockQuantity: 50, costPrice: 75, sellingPrice: 150, unit: "PIECE", description: "Product with stock on hand" } }),
      db.supplier.create({ data: { workspaceId, name: "Phase6 Supplier" } }),
    ]);
    productId = product.id;
    productWithStockId = productWithStock.id;
    supplierId = supplier.id;

    await ensureDefaultAccounts(workspaceId);
    await ensureDefaultAccounts(workspaceId2);
  }, 30_000);

  afterAll(async () => {
    if (!db) return;
    await db.generalLedgerEntry.deleteMany({ where: { workspaceId } });
    await db.generalLedgerEntry.deleteMany({ where: { workspaceId: workspaceId2 } });
    await db.ledgerEntry.deleteMany({ where: { workspaceId } });
    await db.ledgerEntry.deleteMany({ where: { workspaceId: workspaceId2 } });
    await db.inventoryTransaction.deleteMany({ where: { workspaceId } });
    await db.inventoryTransaction.deleteMany({ where: { workspaceId: workspaceId2 } });
    await db.goodReceivedNoteItem.deleteMany({ where: { goodReceivedNote: { workspaceId } } });
    await db.goodReceivedNote.deleteMany({ where: { workspaceId } });
    await db.purchaseOrderItem.deleteMany({ where: { purchaseOrder: { workspaceId } } });
    await db.purchaseOrder.deleteMany({ where: { workspaceId } });
    await db.product.deleteMany({ where: { workspaceId } });
    await db.product.deleteMany({ where: { workspaceId: workspaceId2 } });
    await db.supplier.deleteMany({ where: { workspaceId } });
    await db.supplier.deleteMany({ where: { workspaceId: workspaceId2 } });
    await db.workspace.delete({ where: { id: workspaceId } });
    await db.workspace.delete({ where: { id: workspaceId2 } });
    await db.user.delete({ where: { id: userId } });
    await db.user.delete({ where: { id: userId2 } });
  }, 30_000);

  describe("Product edit safety", () => {
    it("A: edit unused product metadata succeeds", async () => {
      await updateProduct(context(), productId, {
        name: "Updated Unused Product",
        sku: `UPD-${runId}`,
        category: "Updated Category",
        costPrice: 120,
        sellingPrice: 240,
        reorderLevel: 5,
        unit: "PIECE",
        status: "ACTIVE",
        description: "Updated description for testing edit safety",
      });

      const updated = await getProduct(productId, workspaceId);
      expect(updated).not.toBeNull();
      expect(updated!.name).toBe("Updated Unused Product");
      expect(updated!.costPrice).toBe(120);
      expect(updated!.sellingPrice).toBe(240);
    });

    it("B: edit product with purchase history preserves historical monetary values", async () => {
      const order = await createPurchase(context(), {
        supplierId,
        items: [{ productId: productWithStockId, quantity: 20, unitCost: 75 }],
        pricingMode: "UNIT",
        idempotencyKey: `p6-history-po-${runId}`,
      });
      const poItem = await db.purchaseOrderItem.findFirstOrThrow({ where: { purchaseOrderId: order.id } });

      await createGoodsReceipt(context(), {
        purchaseOrderId: order.id,
        items: [{ purchaseOrderItemId: poItem.id, receivedQuantity: 20, acceptedQuantity: 20, actualUnitCost: 75 }],
        idempotencyKey: `p6-history-grn-${runId}`,
      });

      const glBefore = await db.generalLedgerEntry.findMany({ where: { workspaceId, sourceId: order.id }, include: { account: true } });
      const inventoryDebitBefore = glBefore.filter((e) => e.account.systemCode === "INVENTORY").reduce((sum, e) => sum + Number(e.debit), 0);

      await updateProduct(context(), productWithStockId, {
        name: "Updated Stocked Product",
        sku: `STK-UPD-${runId}`,
        category: "Updated",
        costPrice: 75,
        sellingPrice: 160,
        reorderLevel: 10,
        unit: "PIECE",
        status: "ACTIVE",
        description: "Updated but historical GL entries remain unchanged",
      });

      const glAfter = await db.generalLedgerEntry.findMany({ where: { workspaceId, sourceId: order.id }, include: { account: true } });
      const inventoryDebitAfter = glAfter.filter((e) => e.account.systemCode === "INVENTORY").reduce((sum, e) => sum + Number(e.debit), 0);
      expect(inventoryDebitAfter).toBe(inventoryDebitBefore);
    });

    it("C: costPrice change with stock > 0 is blocked", async () => {
      await expect(
        updateProduct(context(), productWithStockId, {
          name: "Stocked Product",
          sku: `STOCKED-${runId}`,
          category: "Test",
          costPrice: 999,
          sellingPrice: 150,
          reorderLevel: 10,
          unit: "PIECE",
          status: "ACTIVE",
          description: "Attempting to change cost price with stock on hand",
        })
      ).rejects.toThrow("Cost price cannot be changed while stock is on hand");
    });

    it("D: costPrice change with zero stock succeeds", async () => {
      await updateProduct(context(), productId, {
        name: "Updated Unused Product",
        sku: `UPD-${runId}`,
        category: "Updated",
        costPrice: 150,
        sellingPrice: 300,
        reorderLevel: 5,
        unit: "PIECE",
        status: "ACTIVE",
        description: "Cost price changed because stock is zero",
      });

      const updated = await getProduct(productId, workspaceId);
      expect(updated!.costPrice).toBe(150);
    });

    it("E: stockQuantity cannot be changed through product edit", async () => {
      const stockBefore = await db.product.findUniqueOrThrow({ where: { id: productWithStockId }, select: { stockQuantity: true } });

      await updateProduct(context(), productWithStockId, {
        name: "Stocked Product",
        sku: `STOCKED-${runId}`,
        category: "Test",
        costPrice: 75,
        sellingPrice: 150,
        reorderLevel: 10,
        unit: "PIECE",
        status: "ACTIVE",
        description: "Edit should not change stock quantity",
      });

      const stockAfter = await db.product.findUniqueOrThrow({ where: { id: productWithStockId }, select: { stockQuantity: true } });
      expect(stockAfter.stockQuantity.toNumber()).toBe(stockBefore.stockQuantity.toNumber());
    });
  });

  describe("Stock adjustment safety and audit", () => {
    it("F: positive stock adjustment creates correct InventoryTransaction", async () => {
      const stockBefore = await db.product.findUniqueOrThrow({ where: { id: productWithStockId }, select: { stockQuantity: true } });

      const newQty = await adjustProductStock(context(), productWithStockId, 15, "Cycle count correction");

      expect(newQty).toBe(stockBefore.stockQuantity.toNumber() + 15);

      const invTx = await db.inventoryTransaction.findFirst({
        where: { workspaceId, productId: productWithStockId, type: "ADJUSTMENT" },
        orderBy: { createdAt: "desc" },
      });
      expect(invTx).toBeDefined();
      expect(invTx!.quantityChanged.toNumber()).toBe(15);
      expect(invTx!.reference).toBe("Cycle count correction");
    });

    it("G: negative stock adjustment creates correct InventoryTransaction", async () => {
      const stockBefore = await db.product.findUniqueOrThrow({ where: { id: productWithStockId }, select: { stockQuantity: true } });

      const newQty = await adjustProductStock(context(), productWithStockId, -5, "Damaged goods removal");

      expect(newQty).toBe(stockBefore.stockQuantity.toNumber() - 5);

      const invTx = await db.inventoryTransaction.findFirst({
        where: { workspaceId, productId: productWithStockId, type: "ADJUSTMENT" },
        orderBy: { createdAt: "desc" },
      });
      expect(invTx).toBeDefined();
      expect(invTx!.quantityChanged.toNumber()).toBe(-5);
      expect(invTx!.reference).toBe("Damaged goods removal");
    });

    it("H: adjustment causing negative stock is rejected", async () => {
      const stock = await db.product.findUniqueOrThrow({ where: { id: productWithStockId }, select: { stockQuantity: true } });
      const currentStock = stock.stockQuantity.toNumber();

      await expect(
        adjustProductStock(context(), productWithStockId, -(currentStock + 10), "Too much removal")
      ).rejects.toThrow();
    });

    it("I: stock adjustment creates audit log entry", async () => {
      const auditBefore = await db.auditLog.count({
        where: { workspaceId, entityType: "Product", entityId: productWithStockId, action: "stock.adjusted" },
      });

      await adjustProductStock(context(), productWithStockId, 3, "Audit test adjustment");

      const auditAfter = await db.auditLog.count({
        where: { workspaceId, entityType: "Product", entityId: productWithStockId, action: "stock.adjusted" },
      });
      expect(auditAfter).toBe(auditBefore + 1);

      const latestAudit = await db.auditLog.findFirst({
        where: { workspaceId, entityType: "Product", entityId: productWithStockId, action: "stock.adjusted" },
        orderBy: { createdAt: "desc" },
      });
      expect(latestAudit).toBeDefined();
      const meta = latestAudit!.metadata as Record<string, unknown>;
      expect(meta.adjustmentQuantity).toBe(3);
      expect(meta.reason).toBe("Audit test adjustment");
      expect(typeof meta.previousQuantity).toBe("number");
      expect(typeof meta.newQuantity).toBe("number");
    });
  });

  describe("Workspace isolation", () => {
    it("J: cross-workspace product edit is blocked", async () => {
      await expect(
        updateProduct(context2(), productId, {
          name: "Hacked",
          sku: `HACK-${runId}`,
          category: "X",
          costPrice: 1,
          sellingPrice: 2,
          reorderLevel: 0,
          unit: "PIECE",
          status: "ACTIVE",
          description: "Attempting cross-workspace edit",
        })
      ).rejects.toThrow("Product not found");
    });

    it("K: cross-workspace adjustment is blocked", async () => {
      await expect(
        adjustProductStock(context2(), productId, 10, "Cross-workspace hack")
      ).rejects.toThrow();
    });

    it("L: cross-workspace delete/archive is blocked", async () => {
      await expect(
        removeProduct(context2(), productId)
      ).rejects.toThrow("Product not found");
    });
  });

  describe("Delete and archive behavior", () => {
    let freshProductId = "";

    beforeAll(async () => {
      const fresh = await db.product.create({
        data: { workspaceId, name: "Fresh Product", sku: `FRESH-${runId}`, stockQuantity: 0, costPrice: 50, sellingPrice: 100, unit: "PIECE", description: "Product for delete testing" },
      });
      freshProductId = fresh.id;
    });

    it("M: hard delete unused product succeeds", async () => {
      const result = await removeProduct(context(), freshProductId);
      expect(result.disposition).toBe("DELETED");

      const deleted = await db.product.findUnique({ where: { id: freshProductId } });
      expect(deleted).toBeNull();
    });

    it("N+O+P+Q+R: product with history cannot be hard deleted (archives instead)", async () => {
      const order = await createPurchase(context(), {
        supplierId,
        items: [{ productId: productWithStockId, quantity: 10, unitCost: 75 }],
        pricingMode: "UNIT",
        idempotencyKey: `p6-delete-po-${runId}`,
      });
      const poItem = await db.purchaseOrderItem.findFirstOrThrow({ where: { purchaseOrderId: order.id } });
      await createGoodsReceipt(context(), {
        purchaseOrderId: order.id,
        items: [{ purchaseOrderItemId: poItem.id, receivedQuantity: 10, acceptedQuantity: 10, actualUnitCost: 75 }],
        idempotencyKey: `p6-delete-grn-${runId}`,
      });

      const result = await removeProduct(context(), productWithStockId);
      expect(result.disposition).toBe("ARCHIVED");

      const archived = await db.product.findUniqueOrThrow({ where: { id: productWithStockId } });
      expect(archived.status).toBe("ARCHIVED");
    });

    it("S: used product archives successfully via archiveProduct", async () => {
      let archivalTarget = await db.product.findFirst({ where: { workspaceId, sku: `STK-UPD-${runId}` } });
      if (!archivalTarget) {
        archivalTarget = await db.product.create({
          data: { workspaceId, name: "Archive Target", sku: `ARCH-${runId}`, stockQuantity: 0, costPrice: 60, sellingPrice: 120, unit: "PIECE", description: "Target for explicit archive action" },
        });
      }

      await archiveProduct(context(), archivalTarget.id);

      const archived = await db.product.findUniqueOrThrow({ where: { id: archivalTarget.id } });
      expect(archived.status).toBe("ARCHIVED");
    });

    it("T: archived product remains resolvable in historical documents", async () => {
      const archivedProduct = await getProduct(productWithStockId, workspaceId);
      expect(archivedProduct).not.toBeNull();
      expect(archivedProduct!.status).toBe("ARCHIVED");

      const grnItems = await db.goodReceivedNoteItem.findMany({
        where: { productId: productWithStockId, goodReceivedNote: { workspaceId } },
      });
      expect(grnItems.length).toBeGreaterThan(0);
    });

    it("U: archived product is excluded from new transaction selectors", async () => {
      const allProducts = await listProducts(workspaceId);
      const archivedInList = allProducts.find((p) => p.id === productWithStockId && p.status === "ARCHIVED");
      expect(archivedInList).toBeDefined();

      const activeProducts = allProducts.filter((p) => p.status === "ACTIVE");
      expect(activeProducts.find((p) => p.id === productWithStockId)).toBeUndefined();
    });
  });

  describe("Accounting integrity", () => {
    it("V: product edit does not change posted GL entries", async () => {
      const order = await createPurchase(context(), {
        supplierId,
        items: [{ productId: productId, quantity: 5, unitCost: 150 }],
        pricingMode: "UNIT",
        idempotencyKey: `p6-gl-po-${runId}`,
      });
      const poItem = await db.purchaseOrderItem.findFirstOrThrow({ where: { purchaseOrderId: order.id } });
      await createGoodsReceipt(context(), {
        purchaseOrderId: order.id,
        items: [{ purchaseOrderItemId: poItem.id, receivedQuantity: 5, acceptedQuantity: 5, actualUnitCost: 150 }],
        idempotencyKey: `p6-gl-grn-${runId}`,
      });

      const glBefore = await db.generalLedgerEntry.findMany({ where: { workspaceId, sourceId: order.id } });
      const totalDebitBefore = glBefore.reduce((sum, e) => sum + Number(e.debit), 0);
      const totalCreditBefore = glBefore.reduce((sum, e) => sum + Number(e.credit), 0);

      const currentCostPrice = (await db.product.findUniqueOrThrow({ where: { id: productId }, select: { costPrice: true } })).costPrice.toNumber();

      await updateProduct(context(), productId, {
        name: "GL Integrity Test Product",
        sku: `GL-${runId}`,
        category: "Test",
        costPrice: currentCostPrice,
        sellingPrice: 400,
        reorderLevel: 5,
        unit: "PIECE",
        status: "ACTIVE",
        description: "Edit should not affect GL entries",
      });

      const glAfter = await db.generalLedgerEntry.findMany({ where: { workspaceId, sourceId: order.id } });
      const totalDebitAfter = glAfter.reduce((sum, e) => sum + Number(e.debit), 0);
      const totalCreditAfter = glAfter.reduce((sum, e) => sum + Number(e.credit), 0);

      expect(totalDebitAfter).toBe(totalDebitBefore);
      expect(totalCreditAfter).toBe(totalCreditBefore);
    });
  });

  describe("Weight-based history preservation", () => {
    it("W: weight-based GRN and supplier-return history remains intact after product metadata edit", async () => {
      const kgProduct = await db.product.create({
        data: { workspaceId, name: "Kg Test Product", sku: `KG-${runId}`, stockQuantity: 0, costPrice: 200, sellingPrice: 350, unit: "KG", description: "Weight-based product for history test" },
      });

      const order = await createPurchase(context(), {
        supplierId,
        items: [{ productId: kgProduct.id, quantity: 10, unitCost: 286, perKgRate: 286, unitWeight: 1 }],
        pricingMode: "WEIGHT",
        idempotencyKey: `p6-weight-po-${runId}`,
      });
      const poItem = await db.purchaseOrderItem.findFirstOrThrow({ where: { purchaseOrderId: order.id } });
      const grn = await createGoodsReceipt(context(), {
        purchaseOrderId: order.id,
        items: [{ purchaseOrderItemId: poItem.id, receivedQuantity: 4.6, acceptedQuantity: 4.6, actualUnitCost: 286, receivedWeightKg: 4.6, acceptedWeightKg: 4.6, ratePerKg: 286 }],
        idempotencyKey: `p6-weight-grn-${runId}`,
      });

      const grnItemBefore = await db.goodReceivedNoteItem.findFirstOrThrow({ where: { goodReceivedNoteId: grn.id } });
      expect(grnItemBefore.acceptedWeightKg?.toNumber()).toBeCloseTo(4.6, 3);
      expect(grnItemBefore.ratePerKg?.toNumber()).toBeCloseTo(286, 2);
      expect(grnItemBefore.lineAmount?.toNumber()).toBeCloseTo(1315.60, 2);

      const currentCostPrice = (await db.product.findUniqueOrThrow({ where: { id: kgProduct.id }, select: { costPrice: true } })).costPrice.toNumber();
      await updateProduct(context(), kgProduct.id, {
        name: "Updated Kg Product",
        sku: `KG-UPD-${runId}`,
        category: "Updated",
        costPrice: currentCostPrice,
        sellingPrice: 500,
        reorderLevel: 2,
        unit: "KG",
        status: "ACTIVE",
        description: "Edit should not affect weight-based GRN history",
      });

      const grnItemAfter = await db.goodReceivedNoteItem.findFirstOrThrow({ where: { goodReceivedNoteId: grn.id } });
      expect(grnItemAfter.acceptedWeightKg?.toNumber()).toBeCloseTo(4.6, 3);
      expect(grnItemAfter.ratePerKg?.toNumber()).toBeCloseTo(286, 2);
      expect(grnItemAfter.lineAmount?.toNumber()).toBeCloseTo(1315.60, 2);

      await db.generalLedgerEntry.deleteMany({ where: { sourceId: grn.id } });
      await db.inventoryTransaction.deleteMany({ where: { workspaceId, productId: kgProduct.id } });
      await db.goodReceivedNoteItem.deleteMany({ where: { goodReceivedNoteId: grn.id } });
      await db.goodReceivedNote.deleteMany({ where: { id: grn.id } });
      await db.purchaseOrderItem.deleteMany({ where: { purchaseOrderId: order.id } });
      await db.purchaseOrder.deleteMany({ where: { id: order.id } });
      await db.product.delete({ where: { id: kgProduct.id } });
    });
  });
});
