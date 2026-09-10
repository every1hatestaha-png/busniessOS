/**
 * Returns Lifecycle Tests
 * 
 * Tests customer returns and supplier returns with full inventory,
 * AP/AR, and GL verification.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { AccountingOracle } from "../oracle/accounting-oracle";
import { roundMoney, assertMoneyEqual, assertQuantityEqual } from "../oracle/precision";
import { createTestWorkspace, teardownTestWorkspace, getDb, getCustomerBalance, getSupplierBalance, getProductStock, verifyGLBalanced } from "../helpers/db-helpers";
import { ownerContext, type ServiceContext } from "../helpers/context-helpers";
import { PRODUCTS, CUSTOMERS, SUPPLIERS } from "../fixtures/golden-business";

let db: any;
let oracle: AccountingOracle;
let workspaceId: string;
let userId: string;
let ctx: ServiceContext;

let customer1Id: string;
let supplier1Id: string;
let product1Id: string;
let product2Id: string;

const runId = `returns-lifecycle-${Date.now()}`;

beforeAll(async () => {
  const { config } = await import("dotenv");
  config({ path: ".env.local", quiet: true });
  db = await getDb();

  const workspace = await createTestWorkspace(runId);
  workspaceId = workspace.workspaceId;
  userId = workspace.userId;
  ctx = ownerContext(workspaceId, userId);

  oracle = new AccountingOracle();

  const { ensureDefaultAccounts } = await import("@/lib/server/accounting");
  await ensureDefaultAccounts(workspaceId);

  const { createCustomer } = await import("@/lib/server/customers");
  const cust = await createCustomer(ctx, {
    name: CUSTOMERS[0].name, companyName: CUSTOMERS[0].companyName, phone: CUSTOMERS[0].phone,
    city: CUSTOMERS[0].city, creditDays: 30, creditLimit: 200000, openingBalance: 0,
  });
  customer1Id = cust;
  oracle.seedCustomer({ id: customer1Id, name: CUSTOMERS[0].name, currentBalance: 0 });

  const { createSupplier } = await import("@/lib/server/suppliers");
  const sup = await createSupplier(ctx, {
    name: SUPPLIERS[0].name, companyName: SUPPLIERS[0].companyName, phone: SUPPLIERS[0].phone,
    city: SUPPLIERS[0].city, openingBalance: 0,
  });
  supplier1Id = sup.id;
  oracle.seedSupplier({ id: supplier1Id, name: SUPPLIERS[0].name, currentBalance: 0 });

  const { createProduct } = await import("@/lib/server/products");
  product1Id = await createProduct(workspaceId, { name: "Return Test A", sku: `RTA-${Date.now()}`, category: "Test", costPrice: 500, sellingPrice: 800, stockQuantity: 100, reorderLevel: 10, unit: "PIECE", status: "ACTIVE", description: "" });
  oracle.seedProduct({ id: product1Id, name: "Return Test A", sku: `RTA-${Date.now()}`, costPrice: 500, sellingPrice: 800, stockQuantity: 100, unit: "PIECE" });

  product2Id = await createProduct(workspaceId, { name: "Return Test B", sku: `RTB-${Date.now()}`, category: "Test", costPrice: 1000, sellingPrice: 1500, stockQuantity: 50, reorderLevel: 5, unit: "PIECE", status: "ACTIVE", description: "" });
  oracle.seedProduct({ id: product2Id, name: "Return Test B", sku: `RTB-${Date.now()}`, costPrice: 1000, sellingPrice: 1500, stockQuantity: 50, unit: "PIECE" });
}, 60_000);

afterAll(async () => {
  if (workspaceId && userId) await teardownTestWorkspace(workspaceId, userId);
}, 30_000);

describe("F4: Returns Lifecycle", () => {
  let sale1Id: string;

  it("4.1 Customer return — inventory restored, AR reduced, credit note created", async () => {
    const { createSale } = await import("@/lib/server/sales");
    const { createCustomerReturn } = await import("@/lib/server/sales");

    // Create sale
    const sale = await createSale(ctx, {
      customerId: customer1Id,
      items: [
        { productId: product1Id, quantity: 10, unitPrice: 800, discountPerUnit: 0 },
        { productId: product2Id, quantity: 5, unitPrice: 1500, discountPerUnit: 0 },
      ],
      orderDiscount: 0,
      paidAmount: 0,
      notes: "",
      idempotencyKey: crypto.randomUUID(),
    });
    sale1Id = sale.id;

    const stock1Before = await getProductStock(workspaceId, product1Id);
    const stock2Before = await getProductStock(workspaceId, product2Id);
    const arBefore = await getCustomerBalance(workspaceId, customer1Id);

    // Return 3 units of product1
    const saleItems = await db.salesOrderItem.findMany({ where: { salesOrderId: sale1Id } });
    const item1 = saleItems.find((i: any) => i.productId === product1Id);

    const ret = await createCustomerReturn(ctx, {
      salesOrderId: sale1Id,
      items: [{ itemId: item1.id, quantity: 3 }],
      reason: "Quality issue",
      restock: true,
      idempotencyKey: `cr-ret-${runId}`,
    });

    // Verify stock restored
    const stock1After = await getProductStock(workspaceId, product1Id);
    assertQuantityEqual(stock1After, stock1Before + 3, "Product 1 stock after return");

    // Verify AR reduced
    const arAfter = await getCustomerBalance(workspaceId, customer1Id);
    expect(arAfter).toBeLessThan(arBefore);

    // Verify credit note
    const creditNote = await db.creditNote.findFirst({ where: { customerReturnId: ret.id } });
    expect(creditNote).not.toBeNull();
    expect(creditNote.status).toBe("OPEN");

    // Verify GL balanced
    const glBalanced = await verifyGLBalanced(workspaceId);
    expect(glBalanced.balanced).toBe(true);

    // Verify return has GL entries
    const returnGLEntries = await db.generalLedgerEntry.findMany({
      where: { workspaceId, sourceType: "CUSTOMER_RETURN", sourceId: ret.id },
    });
    expect(returnGLEntries.length).toBeGreaterThan(0);
  });

  it("4.2 Supplier return — inventory decreased, AP decreased", async () => {
    const { createPurchase, createGoodsReceipt } = await import("@/lib/server/purchases");
    const { createSupplierReturn } = await import("@/lib/server/purchases");

    // Create PO and GRN
    const po = await createPurchase(ctx, {
      supplierId: supplier1Id,
      items: [{ productId: product1Id, quantity: 20, unitCost: 500 }],
      pricingMode: "UNIT",
      idempotencyKey: `po-sret-${runId}`,
    });

    const poItem = await db.purchaseOrderItem.findFirstOrThrow({ where: { purchaseOrderId: po.id } });
    await createGoodsReceipt(ctx, {
      purchaseOrderId: po.id,
      items: [{ purchaseOrderItemId: poItem.id, receivedQuantity: 20, acceptedQuantity: 20, actualUnitCost: 500 }],
      idempotencyKey: `grn-sret-${runId}`,
    });

    const stockBefore = await getProductStock(workspaceId, product1Id);
    const apBefore = await getSupplierBalance(workspaceId, supplier1Id);

    // Return 5 units
    const grn = await db.goodReceivedNote.findFirst({ where: { purchaseOrderId: po.id, status: "ACTIVE" } });

    await createSupplierReturn(ctx, {
      purchaseOrderId: po.id,
      goodReceivedNoteId: grn.id,
      items: [{ itemId: poItem.id, quantity: 5 }],
      reason: "Damaged goods",
      notes: "Test supplier return",
    });

    // Verify stock decreased
    const stockAfter = await getProductStock(workspaceId, product1Id);
    assertQuantityEqual(stockAfter, stockBefore - 5, "Product 1 stock after supplier return");

    // Verify AP decreased
    const apAfter = await getSupplierBalance(workspaceId, supplier1Id);
    assertMoneyEqual(apAfter, apBefore - 5 * 500, 0.001, "Supplier AP after return");

    // Verify GL balanced
    const glBalanced = await verifyGLBalanced(workspaceId);
    expect(glBalanced.balanced).toBe(true);
  });

  it("4.3 Customer return quantity cannot exceed sold quantity", async () => {
    const { createSale, createCustomerReturn } = await import("@/lib/server/sales");

    const sale = await createSale(ctx, {
      customerId: customer1Id,
      items: [{ productId: product1Id, quantity: 2, unitPrice: 800, discountPerUnit: 0 }],
      orderDiscount: 0, paidAmount: 0, notes: "", idempotencyKey: crypto.randomUUID(),
    });

    const saleItems = await db.salesOrderItem.findMany({ where: { salesOrderId: sale.id } });

    await expect(
      createCustomerReturn(ctx, {
        salesOrderId: sale.id,
        items: [{ itemId: saleItems[0].id, quantity: 5 }], // More than 2 sold
        reason: "Over return",
        restock: true,
        idempotencyKey: crypto.randomUUID(),
      })
    ).rejects.toThrow();
  });

  it("4.4 Return on cancelled sale is rejected", async () => {
    const { createSale, cancelSale, createCustomerReturn } = await import("@/lib/server/sales");

    const sale = await createSale(ctx, {
      customerId: customer1Id,
      items: [{ productId: product1Id, quantity: 2, unitPrice: 800, discountPerUnit: 0 }],
      orderDiscount: 0, paidAmount: 0, notes: "", idempotencyKey: crypto.randomUUID(),
    });

    await cancelSale(ctx, sale.id, false);

    const saleItems = await db.salesOrderItem.findMany({ where: { salesOrderId: sale.id } });

    await expect(
      createCustomerReturn(ctx, {
        salesOrderId: sale.id,
        items: [{ itemId: saleItems[0].id, quantity: 1 }],
        reason: "Late return",
        restock: true,
        idempotencyKey: crypto.randomUUID(),
      })
    ).rejects.toThrow();
  });
});
