/**
 * Precision and Edge Case Tests
 * 
 * Tests decimal quantities, weighted goods, per-kg cost,
 * rounding, very small amounts, very large amounts,
 * and zero values.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { AccountingOracle } from "../oracle/accounting-oracle";
import { roundMoney, roundQuantity, assertMoneyEqual, assertQuantityEqual, calculateWAC } from "../oracle/precision";
import { createTestWorkspace, teardownTestWorkspace, getDb, getProductStock, verifyGLBalanced } from "../helpers/db-helpers";
import { ownerContext, type ServiceContext } from "../helpers/context-helpers";

let db: any;
let workspaceId: string;
let userId: string;
let ctx: ServiceContext;

const runId = `precision-${Date.now()}`;

beforeAll(async () => {
  const { config } = await import("dotenv");
  config({ path: ".env.local", quiet: true });
  db = await getDb();

  const workspace = await createTestWorkspace(runId);
  workspaceId = workspace.workspaceId;
  userId = workspace.userId;
  ctx = ownerContext(workspaceId, userId);

  const { ensureDefaultAccounts } = await import("@/lib/server/accounting");
  await ensureDefaultAccounts(workspaceId);
}, 60_000);

afterAll(async () => {
  if (workspaceId && userId) await teardownTestWorkspace(workspaceId, userId);
}, 30_000);

describe("F5: Precision and Edge Cases", () => {
  it("5.1 WAC calculation precision", () => {
    // Start with 100 units at 10.00 each = 1000.00
    // Add 50 units at 15.00 each = 750.00
    // Expected WAC: 1750.00 / 150 = 11.6667
    const result = calculateWAC(1000, 100, 750, 50);
    assertQuantityEqual(result.qty, 150, "Total quantity");
    assertMoneyEqual(result.value, 1750, 0.001, "Total value");
    assertQuantityEqual(result.wac, 11.6667, "WAC");
  });

  it("5.2 WAC with zero existing stock", () => {
    const result = calculateWAC(0, 0, 500, 100);
    assertQuantityEqual(result.qty, 100, "Quantity from zero");
    assertMoneyEqual(result.wac, 5, 0.001, "WAC from zero");
  });

  it("5.3 Money rounding", () => {
    assertMoneyEqual(roundMoney(10.005), 10.01, 0.001, "Banker's rounding up");
    assertMoneyEqual(roundMoney(10.015), 10.02, 0.001, "Banker's rounding");
    assertMoneyEqual(roundMoney(10.001), 10.00, 0.001, "Round down");
    assertMoneyEqual(roundMoney(999999.999), 1000000.00, 0.001, "Large amount rounding");
  });

  it("5.4 Quantity rounding", () => {
    assertQuantityEqual(roundQuantity(10.00005), 10.0001, 0.0001, "Quantity 4dp");
    assertQuantityEqual(roundQuantity(0.00001), 0.0000, 0.0001, "Tiny quantity");
  });

  it("5.5 Decimal quantities in GRN (weighted items)", async () => {
    const { createSupplier } = await import("@/lib/server/suppliers");
    const { createProduct } = await import("@/lib/server/products");
    const { createPurchase, createGoodsReceipt } = await import("@/lib/server/purchases");

    const sup = await createSupplier(ctx, { name: "Precision Supplier", companyName: "Test", phone: "", city: "Karachi", openingBalance: 0 });

    const pid = await createProduct(workspaceId, {
      name: "Weight Product", sku: `WGT-P-${Date.now()}`, category: "Test",
      costPrice: 100, sellingPrice: 200, stockQuantity: 0, reorderLevel: 0,
      unit: "KG", status: "ACTIVE", description: "",
    });

    const po = await createPurchase(ctx, {
      supplierId: sup.id,
      items: [{ productId: pid, quantity: 100, unitCost: 0, unitWeight: 1, perKgRate: 100 }],
      pricingMode: "WEIGHT",
      idempotencyKey: `prec-po-${runId}`,
    });

    const poItem = await db.purchaseOrderItem.findFirstOrThrow({ where: { purchaseOrderId: po.id } });

    // Receive 50.5 kg
    await createGoodsReceipt(ctx, {
      purchaseOrderId: po.id,
      items: [{
        purchaseOrderItemId: poItem.id,
        receivedQuantity: 50.5,
        acceptedQuantity: 50.5,
        actualUnitCost: 100,
        receivedWeightKg: 50.5,
        acceptedWeightKg: 50.5,
        ratePerKg: 100,
      }],
      idempotencyKey: `prec-grn-${runId}`,
    });

    const stock = await getProductStock(workspaceId, pid);
    assertQuantityEqual(stock, 50.5, "Decimal stock after weighted GRN");

    const glBalanced = await verifyGLBalanced(workspaceId);
    expect(glBalanced.balanced).toBe(true);
  });

  it("5.6 Very large amounts", async () => {
    const { createSupplier, recordSupplierPayment } = await import("@/lib/server/suppliers");
    const { createPurchase, createGoodsReceipt } = await import("@/lib/server/purchases");
    const { createProduct } = await import("@/lib/server/products");

    const sup = await createSupplier(ctx, { name: "Large Amount Supplier", companyName: "Test", phone: "", city: "Karachi", openingBalance: 0 });

    const pid = await createProduct(workspaceId, {
      name: "Expensive Product", sku: `EXP-${Date.now()}`, category: "Test",
      costPrice: 999999, sellingPrice: 1500000, stockQuantity: 0, reorderLevel: 0,
      unit: "PIECE", status: "ACTIVE", description: "",
    });

    const po = await createPurchase(ctx, {
      supplierId: sup.id,
      items: [{ productId: pid, quantity: 10, unitCost: 999999 }],
      pricingMode: "UNIT",
      idempotencyKey: `large-po-${runId}`,
    });

    const poItem = await db.purchaseOrderItem.findFirstOrThrow({ where: { purchaseOrderId: po.id } });

    await createGoodsReceipt(ctx, {
      purchaseOrderId: po.id,
      items: [{ purchaseOrderItemId: poItem.id, receivedQuantity: 10, acceptedQuantity: 10, actualUnitCost: 999999 }],
      idempotencyKey: `large-grn-${runId}`,
    });

    // Total: 9,999,990
    const stock = await getProductStock(workspaceId, pid);
    expect(stock).toBe(10);

    const glBalanced = await verifyGLBalanced(workspaceId);
    expect(glBalanced.balanced).toBe(true);
  });

  it("5.7 Very small amounts (0.01)", async () => {
    const { createSupplier } = await import("@/lib/server/suppliers");
    const { createPurchase, createGoodsReceipt } = await import("@/lib/server/purchases");
    const { createProduct } = await import("@/lib/server/products");

    const sup = await createSupplier(ctx, { name: "Small Amount Supplier", companyName: "Test", phone: "", city: "Karachi", openingBalance: 0 });

    const pid = await createProduct(workspaceId, {
      name: "Cheap Product", sku: `CHEAP-${Date.now()}`, category: "Test",
      costPrice: 0.01, sellingPrice: 0.02, stockQuantity: 0, reorderLevel: 0,
      unit: "PIECE", status: "ACTIVE", description: "",
    });

    const po = await createPurchase(ctx, {
      supplierId: sup.id,
      items: [{ productId: pid, quantity: 100, unitCost: 0.01 }],
      pricingMode: "UNIT",
      idempotencyKey: `small-po-${runId}`,
    });

    const poItem = await db.purchaseOrderItem.findFirstOrThrow({ where: { purchaseOrderId: po.id } });

    await createGoodsReceipt(ctx, {
      purchaseOrderId: po.id,
      items: [{ purchaseOrderItemId: poItem.id, receivedQuantity: 100, acceptedQuantity: 100, actualUnitCost: 0.01 }],
      idempotencyKey: `small-grn-${runId}`,
    });

    const stock = await getProductStock(workspaceId, pid);
    expect(stock).toBe(100);

    const glBalanced = await verifyGLBalanced(workspaceId);
    expect(glBalanced.balanced).toBe(true);
  });

  it("5.8 Discount per unit calculation", async () => {
    const { createCustomer } = await import("@/lib/server/customers");
    const { createProduct } = await import("@/lib/server/products");
    const { createSale } = await import("@/lib/server/sales");

    const cust = await createCustomer(ctx, { name: "Discount Customer", companyName: "Test", phone: "", city: "Lahore", creditDays: 30, creditLimit: 1000000, openingBalance: 0 });

    const pid = await createProduct(workspaceId, {
      name: "Discount Product", sku: `DISC-${Date.now()}`, category: "Test",
      costPrice: 100, sellingPrice: 200, stockQuantity: 100, reorderLevel: 10,
      unit: "PIECE", status: "ACTIVE", description: "",
    });

    // 10 units at 200 each, 50 discount per unit, 100 order discount
    // Total = (10 * 200) - (10 * 50) - 100 = 2000 - 500 - 100 = 1400
    const sale = await createSale(ctx, {
      customerId: cust,
      items: [{ productId: pid, quantity: 10, unitPrice: 200, discountPerUnit: 50 }],
      orderDiscount: 100,
      paidAmount: 0,
      notes: "",
      idempotencyKey: crypto.randomUUID(),
    });

    const saleRecord = await db.salesOrder.findFirstOrThrow({ where: { id: sale.id } });
    assertMoneyEqual(Number(saleRecord.total), 1400, 0.001, "Sale total with per-unit discount");
    assertMoneyEqual(Number(saleRecord.discount), 600, 0.001, "Total discount (500 line + 100 order)");
  });

  it("5.9 Zero quantity GRN is rejected", async () => {
    const { createSupplier } = await import("@/lib/server/suppliers");
    const { createPurchase, createGoodsReceipt } = await import("@/lib/server/purchases");
    const { createProduct } = await import("@/lib/server/products");

    const sup = await createSupplier(ctx, { name: "Zero Qty Supplier", companyName: "Test", phone: "", city: "Karachi", openingBalance: 0 });
    const pid = await createProduct(workspaceId, {
      name: "Zero Qty Product", sku: `ZERO-${Date.now()}`, category: "Test",
      costPrice: 100, sellingPrice: 200, stockQuantity: 0, reorderLevel: 0,
      unit: "PIECE", status: "ACTIVE", description: "",
    });

    const po = await createPurchase(ctx, {
      supplierId: sup.id,
      items: [{ productId: pid, quantity: 10, unitCost: 100 }],
      pricingMode: "UNIT",
      idempotencyKey: `zero-po-${runId}`,
    });

    const poItem = await db.purchaseOrderItem.findFirstOrThrow({ where: { purchaseOrderId: po.id } });

    // Zero quantity should be rejected
    await expect(
      createGoodsReceipt(ctx, {
        purchaseOrderId: po.id,
        items: [{ purchaseOrderItemId: poItem.id, receivedQuantity: 0, acceptedQuantity: 0, actualUnitCost: 100 }],
        idempotencyKey: `zero-grn-${runId}`,
      })
    ).rejects.toThrow();
  });

  it("5.10 Negative stock prevention", async () => {
    const { createCustomer } = await import("@/lib/server/customers");
    const { createProduct } = await import("@/lib/server/products");
    const { createSale } = await import("@/lib/server/sales");

    const cust = await createCustomer(ctx, { name: "Neg Stock Customer", companyName: "Test", phone: "", city: "Lahore", creditDays: 30, creditLimit: 1000000, openingBalance: 0 });

    const pid = await createProduct(workspaceId, {
      name: "Low Stock Product", sku: `NEG-${Date.now()}`, category: "Test",
      costPrice: 100, sellingPrice: 200, stockQuantity: 3, reorderLevel: 0,
      unit: "PIECE", status: "ACTIVE", description: "",
    });

    // Try to sell more than available
    await expect(
      createSale(ctx, {
        customerId: cust,
        items: [{ productId: pid, quantity: 5, unitPrice: 200, discountPerUnit: 0 }],
        orderDiscount: 0, paidAmount: 0, notes: "", idempotencyKey: crypto.randomUUID(),
      })
    ).rejects.toThrow();

    // Stock should remain 3
    const stock = await getProductStock(workspaceId, pid);
    expect(stock).toBe(3);
  });
});
