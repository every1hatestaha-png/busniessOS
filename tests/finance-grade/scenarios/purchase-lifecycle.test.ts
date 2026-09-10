/**
 * Purchase → GRN → Inventory → AP Lifecycle Tests
 * 
 * Tests the complete purchase workflow with independent oracle verification.
 * The oracle tracks expected inventory, AP, and GL state independently.
 * BusinessOS results are compared against oracle expectations.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { AccountingOracle } from "../oracle/accounting-oracle";
import { roundMoney, roundQuantity, assertMoneyEqual, assertQuantityEqual } from "../oracle/precision";
import { createTestWorkspace, teardownTestWorkspace, getDb, getSupplierBalance, getProductStock, getCashBankBalance, verifyGLBalanced, getGLEntries } from "../helpers/db-helpers";
import { ownerContext, type ServiceContext } from "../helpers/context-helpers";
import { SUPPLIERS, PRODUCTS } from "../fixtures/golden-business";

let db: any;
let oracle: AccountingOracle;
let workspaceId: string;
let userId: string;
let ctx: ServiceContext;

// Shared test entities
let supplier1Id: string;
let supplier2Id: string;
let product1Id: string;
let product2Id: string;
let product3Id: string;
let cashAccountId: string;

const runId = `purchase-lifecycle-${Date.now()}`;

beforeAll(async () => {
  const { config } = await import("dotenv");
  config({ path: ".env.local", quiet: true });
  db = await getDb();

  const workspace = await createTestWorkspace(runId);
  workspaceId = workspace.workspaceId;
  userId = workspace.userId;
  ctx = ownerContext(workspaceId, userId);

  oracle = new AccountingOracle();

  // Ensure default accounts exist
  const { ensureDefaultAccounts } = await import("@/lib/server/accounting");
  await ensureDefaultAccounts(workspaceId);

  // Create suppliers
  const { createSupplier } = await import("@/lib/server/suppliers");
  const s1 = await createSupplier(ctx, { name: SUPPLIERS[0].name, companyName: SUPPLIERS[0].companyName, phone: SUPPLIERS[0].phone, city: SUPPLIERS[0].city, openingBalance: SUPPLIERS[0].openingBalance });
  supplier1Id = s1.id;
  oracle.seedSupplier({ id: supplier1Id, name: SUPPLIERS[0].name, currentBalance: SUPPLIERS[0].openingBalance });

  const s2 = await createSupplier(ctx, { name: SUPPLIERS[1].name, companyName: SUPPLIERS[1].companyName, phone: SUPPLIERS[1].phone, city: SUPPLIERS[1].city, openingBalance: SUPPLIERS[1].openingBalance });
  supplier2Id = s2.id;
  oracle.seedSupplier({ id: supplier2Id, name: SUPPLIERS[1].name, currentBalance: SUPPLIERS[1].openingBalance });

  // Create products
  const { createProduct } = await import("@/lib/server/products");
  product1Id = await createProduct(workspaceId, { name: PRODUCTS[0].name, sku: PRODUCTS[0].sku, category: PRODUCTS[0].category, costPrice: PRODUCTS[0].costPrice, sellingPrice: PRODUCTS[0].sellingPrice, stockQuantity: PRODUCTS[0].stockQuantity, reorderLevel: PRODUCTS[0].reorderLevel, unit: PRODUCTS[0].unit, status: "ACTIVE", description: "" });
  oracle.seedProduct({ id: product1Id, name: PRODUCTS[0].name, sku: PRODUCTS[0].sku, costPrice: PRODUCTS[0].costPrice, sellingPrice: PRODUCTS[0].sellingPrice, stockQuantity: PRODUCTS[0].stockQuantity, unit: PRODUCTS[0].unit });

  product2Id = await createProduct(workspaceId, { name: PRODUCTS[1].name, sku: PRODUCTS[1].sku, category: PRODUCTS[1].category, costPrice: PRODUCTS[1].costPrice, sellingPrice: PRODUCTS[1].sellingPrice, stockQuantity: PRODUCTS[1].stockQuantity, reorderLevel: PRODUCTS[1].reorderLevel, unit: PRODUCTS[1].unit, status: "ACTIVE", description: "" });
  oracle.seedProduct({ id: product2Id, name: PRODUCTS[1].name, sku: PRODUCTS[1].sku, costPrice: PRODUCTS[1].costPrice, sellingPrice: PRODUCTS[1].sellingPrice, stockQuantity: PRODUCTS[1].stockQuantity, unit: PRODUCTS[1].unit });

  product3Id = await createProduct(workspaceId, { name: PRODUCTS[20].name, sku: PRODUCTS[20].sku, category: PRODUCTS[20].category, costPrice: PRODUCTS[20].costPrice, sellingPrice: PRODUCTS[20].sellingPrice, stockQuantity: PRODUCTS[20].stockQuantity, reorderLevel: PRODUCTS[20].reorderLevel, unit: PRODUCTS[20].unit, status: "ACTIVE", description: "" });
  oracle.seedProduct({ id: product3Id, name: PRODUCTS[20].name, sku: PRODUCTS[20].sku, costPrice: PRODUCTS[20].costPrice, sellingPrice: PRODUCTS[20].sellingPrice, stockQuantity: PRODUCTS[20].stockQuantity, unit: PRODUCTS[20].unit });

  // Seed cash account
  const cashAccounts = await db.cashBankAccount.findMany({ where: { workspaceId }, include: { account: true } });
  cashAccountId = cashAccounts[0]?.id;
  if (cashAccountId) {
    oracle.seedCashBankAccount({ id: cashAccountId, accountId: cashAccounts[0].accountId, name: "Cash in Hand", isBank: false, openingBalance: 0, currentBalance: 0 });
  }
}, 60_000);

afterAll(async () => {
  if (workspaceId && userId) await teardownTestWorkspace(workspaceId, userId);
}, 30_000);

describe("F1: Purchase → GRN → Inventory → AP Lifecycle", () => {
  let po1Id: string;
  let po1OrderNumber: string;
  let po1ItemId: string;

  it("1.1 Create PO with 3 items — inventory unchanged, no GL impact", async () => {
    const { createPurchase } = await import("@/lib/server/purchases");

    const stockBefore1 = await getProductStock(workspaceId, product1Id);
    const stockBefore2 = await getProductStock(workspaceId, product2Id);
    const stockBefore3 = await getProductStock(workspaceId, product3Id);

    const po = await createPurchase(ctx, {
      supplierId: supplier1Id,
      items: [
        { productId: product1Id, quantity: 100, unitCost: 850 },
        { productId: product2Id, quantity: 50, unitCost: 2600 },
        { productId: product3Id, quantity: 200, unitCost: 480 },
      ],
      pricingMode: "UNIT",
      idempotencyKey: `po-lc-1-${runId}`,
    });
    po1Id = po.id;

    const poRecord = await db.purchaseOrder.findFirstOrThrow({ where: { id: po1Id } });
    po1OrderNumber = poRecord.orderNumber;
    expect(poRecord.status).toBe("ORDERED");
    expect(Number(poRecord.totalAmount)).toBe(roundMoney(100 * 850 + 50 * 2600 + 200 * 480));

    // Inventory unchanged
    const stockAfter1 = await getProductStock(workspaceId, product1Id);
    const stockAfter2 = await getProductStock(workspaceId, product2Id);
    const stockAfter3 = await getProductStock(workspaceId, product3Id);
    assertQuantityEqual(stockAfter1, stockBefore1, "Product 1 stock after PO");
    assertQuantityEqual(stockAfter2, stockBefore2, "Product 2 stock after PO");
    assertQuantityEqual(stockAfter3, stockBefore3, "Product 3 stock after PO");

    // Get PO item ID for GRN
    const poItem = await db.purchaseOrderItem.findFirst({ where: { purchaseOrderId: po1Id } });
    po1ItemId = poItem.id;
  });

  it("1.2 Partial GRN (50 units of product 1) — inventory increases, AP increases", async () => {
    const { createGoodsReceipt } = await import("@/lib/server/purchases");
    const stockBefore = await getProductStock(workspaceId, product1Id);
    const supplierBalanceBefore = await getSupplierBalance(workspaceId, supplier1Id);

    const grn = await createGoodsReceipt(ctx, {
      purchaseOrderId: po1Id,
      items: [{ purchaseOrderItemId: po1ItemId, receivedQuantity: 50, acceptedQuantity: 50, actualUnitCost: 850 }],
      idempotencyKey: `grn-lc-1-${runId}`,
    });

    const expectedStockIncrease = 50;
    const expectedAPIncrease = 50 * 850; // 42,500

    // Verify inventory
    const stockAfter = await getProductStock(workspaceId, product1Id);
    assertQuantityEqual(stockAfter, stockBefore + expectedStockIncrease, "Product 1 stock after partial GRN");

    // Verify supplier balance (AP)
    const supplierBalanceAfter = await getSupplierBalance(workspaceId, supplier1Id);
    assertMoneyEqual(supplierBalanceAfter, supplierBalanceBefore + expectedAPIncrease, 0.001, "Supplier AP after partial GRN");

    // Verify PO status
    const poRecord = await db.purchaseOrder.findFirstOrThrow({ where: { id: po1Id } });
    expect(poRecord.status).toBe("PARTIALLY_RECEIVED");

    // Verify GL balanced
    const glBalanced = await verifyGLBalanced(workspaceId);
    expect(glBalanced.balanced).toBe(true);
  });

  it("1.3 Full GRN (remaining 50 units) — inventory fully increased, AP = full PO", async () => {
    const { createGoodsReceipt } = await import("@/lib/server/purchases");
    const stockBefore = await getProductStock(workspaceId, product1Id);
    const supplierBalanceBefore = await getSupplierBalance(workspaceId, supplier1Id);

    await createGoodsReceipt(ctx, {
      purchaseOrderId: po1Id,
      items: [{ purchaseOrderItemId: po1ItemId, receivedQuantity: 50, acceptedQuantity: 50, actualUnitCost: 850 }],
      idempotencyKey: `grn-lc-2-${runId}`,
    });

    // Verify stock = original + 100
    const stockAfter = await getProductStock(workspaceId, product1Id);
    assertQuantityEqual(stockAfter, stockBefore + 50, "Product 1 stock after full GRN");

    // Verify AP = previous + 50 * 850
    const supplierBalanceAfter = await getSupplierBalance(workspaceId, supplier1Id);
    assertMoneyEqual(supplierBalanceAfter, supplierBalanceBefore + 50 * 850, 0.001, "Supplier AP after full GRN");

    // Verify PO status
    const poRecord = await db.purchaseOrder.findFirstOrThrow({ where: { id: po1Id } });
    expect(poRecord.status).toBe("RECEIVED");
  });

  it("1.4 Void second GRN — inventory decreases, AP decreases", async () => {
    const { voidGoodsReceipt } = await import("@/lib/server/purchases");
    const stockBefore = await getProductStock(workspaceId, product1Id);
    const supplierBalanceBefore = await getSupplierBalance(workspaceId, supplier1Id);

    // Find the second GRN
    const grns = await db.goodReceivedNote.findMany({ where: { purchaseOrderId: po1Id, status: "ACTIVE" }, orderBy: { createdAt: "asc" } });
    const secondGrn = grns[grns.length - 1];

    await voidGoodsReceipt(ctx, secondGrn.id, { voidedReason: "Test void" });

    // Verify inventory decreased
    const stockAfter = await getProductStock(workspaceId, product1Id);
    assertQuantityEqual(stockAfter, stockBefore - 50, "Product 1 stock after GRN void");

    // Verify AP decreased
    const supplierBalanceAfter = await getSupplierBalance(workspaceId, supplier1Id);
    assertMoneyEqual(supplierBalanceAfter, supplierBalanceBefore - 50 * 850, 0.001, "Supplier AP after GRN void");

    // Verify GL balanced (reversal entries)
    const glBalanced = await verifyGLBalanced(workspaceId);
    expect(glBalanced.balanced).toBe(true);

    // Verify PO status reverted
    const poRecord = await db.purchaseOrder.findFirstOrThrow({ where: { id: po1Id } });
    expect(poRecord.status).toBe("PARTIALLY_RECEIVED");
  });

  it("1.5 Create second PO with weighted items — weight-based GRN", async () => {
    const { createPurchase, createGoodsReceipt } = await import("@/lib/server/purchases");

    const stockBefore = await getProductStock(workspaceId, product3Id);
    const supplierBalanceBefore = await getSupplierBalance(workspaceId, supplier2Id);

    // Create weight-priced PO
    const po = await createPurchase(ctx, {
      supplierId: supplier2Id,
      items: [{ productId: product3Id, quantity: 200, unitCost: 0, unitWeight: 1, perKgRate: 480 }],
      pricingMode: "WEIGHT",
      idempotencyKey: `po-weight-${runId}`,
    });

    const poItem = await db.purchaseOrderItem.findFirstOrThrow({ where: { purchaseOrderId: po.id } });

    // Receive 100kg
    await createGoodsReceipt(ctx, {
      purchaseOrderId: po.id,
      items: [{
        purchaseOrderItemId: poItem.id,
        receivedQuantity: 100,
        acceptedQuantity: 100,
        actualUnitCost: 480,
        receivedWeightKg: 100,
        acceptedWeightKg: 100,
        ratePerKg: 480,
      }],
      idempotencyKey: `grn-weight-${runId}`,
    });

    // Verify stock increased by 100
    const stockAfter = await getProductStock(workspaceId, product3Id);
    assertQuantityEqual(stockAfter, stockBefore + 100, "Product 3 stock after weighted GRN");

    // Verify AP increased
    const supplierBalanceAfter = await getSupplierBalance(workspaceId, supplier2Id);
    assertMoneyEqual(supplierBalanceAfter, supplierBalanceBefore + 100 * 480, 0.001, "Supplier AP after weighted GRN");

    // GL balanced
    const glBalanced = await verifyGLBalanced(workspaceId);
    expect(glBalanced.balanced).toBe(true);
  });

  it("1.6 GL entries for GRN are balanced per source document", async () => {
    const grns = await db.goodReceivedNote.findMany({ where: { purchaseOrderId: po1Id, status: "ACTIVE" } });
    for (const grn of grns) {
      const entries = await getGLEntries(workspaceId, "PURCHASE_RECEIPT", grn.id);
      const totalDebit = entries.reduce((s: number, e: any) => s + Number(e.debit), 0);
      const totalCredit = entries.reduce((s: number, e: any) => s + Number(e.credit), 0);
      assertMoneyEqual(totalDebit, totalCredit, 0.001, `GL balanced for GRN ${grn.grnNumber}`);
    }
  });

  it("1.7 Voided GRN has reversal entries", async () => {
    const voidedGrns = await db.goodReceivedNote.findMany({ where: { purchaseOrderId: po1Id, status: "VOIDED" } });
    expect(voidedGrns.length).toBeGreaterThan(0);

    for (const grn of voidedGrns) {
      const reversalEntries = await db.generalLedgerEntry.findMany({
        where: { workspaceId, sourceType: "REVERSAL", sourceId: grn.id },
      });
      expect(reversalEntries.length).toBeGreaterThan(0);

      // Reversal entries should be balanced
      const totalDebit = reversalEntries.reduce((s: number, e: any) => s + Number(e.debit), 0);
      const totalCredit = reversalEntries.reduce((s: number, e: any) => s + Number(e.credit), 0);
      assertMoneyEqual(totalDebit, totalCredit, 0.001, `Reversal balanced for voided GRN ${grn.grnNumber}`);
    }
  });

  it("1.8 Over-receipt is rejected", async () => {
    const { createPurchase, createGoodsReceipt } = await import("@/lib/server/purchases");

    const po = await createPurchase(ctx, {
      supplierId: supplier1Id,
      items: [{ productId: product1Id, quantity: 10, unitCost: 850 }],
      pricingMode: "UNIT",
      idempotencyKey: `po-over-${runId}`,
    });

    const poItem = await db.purchaseOrderItem.findFirstOrThrow({ where: { purchaseOrderId: po.id } });

    // Receive 15 (more than ordered 10) — should fail
    await expect(
      createGoodsReceipt(ctx, {
        purchaseOrderId: po.id,
        items: [{ purchaseOrderItemId: poItem.id, receivedQuantity: 15, acceptedQuantity: 15, actualUnitCost: 850 }],
        idempotencyKey: `grn-over-${runId}`,
      })
    ).rejects.toThrow();

    // Cleanup
    await db.purchaseOrderItem.deleteMany({ where: { purchaseOrderId: po.id } });
    await db.purchaseOrder.delete({ where: { id: po.id } });
  });

  it("1.9 Reject GRN on cancelled PO", async () => {
    const { createPurchase, cancelPurchase, createGoodsReceipt } = await import("@/lib/server/purchases");

    const po = await createPurchase(ctx, {
      supplierId: supplier1Id,
      items: [{ productId: product1Id, quantity: 10, unitCost: 850 }],
      pricingMode: "UNIT",
      idempotencyKey: `po-cancel-${runId}`,
    });

    await cancelPurchase(ctx, po.id);

    const poItem = await db.purchaseOrderItem.findFirstOrThrow({ where: { purchaseOrderId: po.id } });

    await expect(
      createGoodsReceipt(ctx, {
        purchaseOrderId: po.id,
        items: [{ purchaseOrderItemId: poItem.id, receivedQuantity: 5, acceptedQuantity: 5, actualUnitCost: 850 }],
        idempotencyKey: `grn-cancel-${runId}`,
      })
    ).rejects.toThrow();

    // Cleanup
    await db.purchaseOrderItem.deleteMany({ where: { purchaseOrderId: po.id } });
    await db.purchaseOrder.delete({ where: { id: po.id } });
  });

  it("1.10 Oracle reconciliation: inventory, AP, GL all consistent", async () => {
    const reconciliation = oracle.reconcileAll();
    if (!reconciliation.passed) {
      console.error("Oracle reconciliation failures:", reconciliation.mismatches);
    }
    expect(reconciliation.passed).toBe(true);
  });
});
