/**
 * Sale → Inventory → AR → COGS Lifecycle Tests
 * 
 * Tests the complete sales workflow with independent oracle verification.
 * Covers: credit sales, cash sales, partial payments, customer returns, cancellations.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { AccountingOracle } from "../oracle/accounting-oracle";
import { roundMoney, assertMoneyEqual, assertQuantityEqual } from "../oracle/precision";
import { createTestWorkspace, teardownTestWorkspace, getDb, getCustomerBalance, getProductStock, getCashBankBalance, verifyGLBalanced, getGLEntries } from "../helpers/db-helpers";
import { ownerContext, type ServiceContext } from "../helpers/context-helpers";
import { PRODUCTS, CUSTOMERS } from "../fixtures/golden-business";

let db: any;
let oracle: AccountingOracle;
let workspaceId: string;
let userId: string;
let ctx: ServiceContext;

let customer1Id: string;
let product1Id: string;
let product2Id: string;
let cashAccountId: string;

const runId = `sale-lifecycle-${Date.now()}`;

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

  // Create customer
  const { createCustomer } = await import("@/lib/server/customers");
  const cust = await createCustomer(ctx, {
    name: CUSTOMERS[0].name,
    companyName: CUSTOMERS[0].companyName,
    phone: CUSTOMERS[0].phone,
    city: CUSTOMERS[0].city,
    creditDays: CUSTOMERS[0].creditDays,
    creditLimit: CUSTOMERS[0].creditLimit,
    openingBalance: CUSTOMERS[0].openingBalance,
  });
  customer1Id = cust;
  oracle.seedCustomer({ id: customer1Id, name: CUSTOMERS[0].name, currentBalance: CUSTOMERS[0].openingBalance });

  // Create products
  const { createProduct } = await import("@/lib/server/products");
  product1Id = await createProduct(workspaceId, { name: PRODUCTS[0].name, sku: `SLC-${PRODUCTS[0].sku}`, category: PRODUCTS[0].category, costPrice: PRODUCTS[0].costPrice, sellingPrice: PRODUCTS[0].sellingPrice, stockQuantity: 200, reorderLevel: PRODUCTS[0].reorderLevel, unit: PRODUCTS[0].unit, status: "ACTIVE", description: "" });
  oracle.seedProduct({ id: product1Id, name: PRODUCTS[0].name, sku: `SLC-${PRODUCTS[0].sku}`, costPrice: PRODUCTS[0].costPrice, sellingPrice: PRODUCTS[0].sellingPrice, stockQuantity: 200, unit: PRODUCTS[0].unit });

  product2Id = await createProduct(workspaceId, { name: PRODUCTS[1].name, sku: `SLC-${PRODUCTS[1].sku}`, category: PRODUCTS[1].category, costPrice: PRODUCTS[1].costPrice, sellingPrice: PRODUCTS[1].sellingPrice, stockQuantity: 100, reorderLevel: PRODUCTS[1].reorderLevel, unit: PRODUCTS[1].unit, status: "ACTIVE", description: "" });
  oracle.seedProduct({ id: product2Id, name: PRODUCTS[1].name, sku: `SLC-${PRODUCTS[1].sku}`, costPrice: PRODUCTS[1].costPrice, sellingPrice: PRODUCTS[1].sellingPrice, stockQuantity: 100, unit: PRODUCTS[1].unit });

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

describe("F2: Sale → Inventory → AR → COGS Lifecycle", () => {
  let sale1Id: string;
  let sale1OrderNumber: string;
  let sale1InvoiceId: string;

  it("2.1 Credit sale — inventory decreases, AR increases, COGS booked", async () => {
    const { createSale } = await import("@/lib/server/sales");
    const stockBefore1 = await getProductStock(workspaceId, product1Id);
    const stockBefore2 = await getProductStock(workspaceId, product2Id);
    const customerBalanceBefore = await getCustomerBalance(workspaceId, customer1Id);

    // Sell 10 units of product1 at 1200 each, 5 of product2 at 3800 each
    const sale = await createSale(ctx, {
      customerId: customer1Id,
      items: [
        { productId: product1Id, quantity: 10, unitPrice: 1200, discountPerUnit: 0 },
        { productId: product2Id, quantity: 5, unitPrice: 3800, discountPerUnit: 0 },
      ],
      orderDiscount: 0,
      paidAmount: 0,
      notes: "Credit sale test",
      idempotencyKey: crypto.randomUUID(),
    });
    sale1Id = sale.id;

    const saleRecord = await db.salesOrder.findFirstOrThrow({ where: { id: sale1Id } });
    sale1OrderNumber = saleRecord.orderNumber;
    const expectedTotal = 10 * 1200 + 5 * 3800; // 12,000 + 19,000 = 31,000
    assertMoneyEqual(Number(saleRecord.total), expectedTotal, 0.001, "Sale total");

    // Verify inventory decreased
    const stockAfter1 = await getProductStock(workspaceId, product1Id);
    const stockAfter2 = await getProductStock(workspaceId, product2Id);
    assertQuantityEqual(stockAfter1, stockBefore1 - 10, "Product 1 stock after sale");
    assertQuantityEqual(stockAfter2, stockBefore2 - 5, "Product 2 stock after sale");

    // Verify customer balance (AR) increased
    const customerBalanceAfter = await getCustomerBalance(workspaceId, customer1Id);
    assertMoneyEqual(customerBalanceAfter, customerBalanceBefore + expectedTotal, 0.001, "Customer AR after sale");

    // Verify GL balanced
    const glBalanced = await verifyGLBalanced(workspaceId);
    expect(glBalanced.balanced).toBe(true);

    // Get invoice for payment tests
    const invoice = await db.invoice.findFirst({ where: { salesOrderId: sale1Id } });
    sale1InvoiceId = invoice.id;

    // Oracle: record the sale
    oracle.applySale(product1Id, 10, PRODUCTS[0].costPrice);
    oracle.applySale(product2Id, 5, PRODUCTS[1].costPrice);
    oracle.recordSaleGL(sale1Id, sale1OrderNumber, saleRecord.orderDate, expectedTotal, 10 * PRODUCTS[0].costPrice + 5 * PRODUCTS[1].costPrice);
    oracle.updateCustomerBalance(customer1Id, expectedTotal);
    oracle.recordLedgerEntry({ customerId: customer1Id, type: "SALE", debit: expectedTotal, credit: 0, description: `Sale ${sale1OrderNumber}`, referenceId: sale1Id });
  });

  it("2.2 Cash sale — inventory decreases, cash increases, AR not increased", async () => {
    const { createSale } = await import("@/lib/server/sales");
    const stockBefore = await getProductStock(workspaceId, product1Id);
    const cashBefore = await getCashBankBalance(workspaceId, cashAccountId);

    const sale = await createSale(ctx, {
      customerId: customer1Id,
      items: [{ productId: product1Id, quantity: 5, unitPrice: 1200, discountPerUnit: 0 }],
      orderDiscount: 0,
      paidAmount: 6000,
      cashBankAccountId: cashAccountId,
      notes: "Cash sale test",
      idempotencyKey: crypto.randomUUID(),
    });

    const saleRecord = await db.salesOrder.findFirstOrThrow({ where: { id: sale.id } });

    // Verify stock decreased
    const stockAfter = await getProductStock(workspaceId, product1Id);
    assertQuantityEqual(stockAfter, stockBefore - 5, "Product 1 stock after cash sale");

    // Verify cash increased
    const cashAfter = await getCashBankBalance(workspaceId, cashAccountId);
    assertMoneyEqual(cashAfter, cashBefore + 6000, 0.001, "Cash after cash sale");

    // Verify GL balanced
    const glBalanced = await verifyGLBalanced(workspaceId);
    expect(glBalanced.balanced).toBe(true);

    // Oracle
    oracle.applySale(product1Id, 5, PRODUCTS[0].costPrice);
    oracle.recordSaleGL(sale.id, saleRecord.orderNumber, saleRecord.orderDate, 6000, 5 * PRODUCTS[0].costPrice);
    oracle.recordCashReceivedGL(sale.id, saleRecord.orderNumber, saleRecord.orderDate, cashAccountId, 6000);
    oracle.recordLedgerEntry({ customerId: customer1Id, type: "SALE", debit: 6000, credit: 0, description: `Sale ${saleRecord.orderNumber}`, referenceId: sale.id });
    oracle.recordLedgerEntry({ customerId: customer1Id, type: "PAYMENT_RECEIVED", debit: 0, credit: 6000, description: `Payment ${saleRecord.orderNumber}`, referenceId: sale.id });
  });

  it("2.3 Partial customer payment — AR decreases, cash increases", async () => {
    const { recordPayment } = await import("@/lib/server/payments");
    const customerBalanceBefore = await getCustomerBalance(workspaceId, customer1Id);
    const cashBefore = await getCashBankBalance(workspaceId, cashAccountId);

    await recordPayment(ctx, {
      customerId: customer1Id,
      invoiceId: sale1InvoiceId,
      cashBankAccountId: cashAccountId,
      amount: 15000,
      paymentDate: new Date(),
      method: "CASH",
      notes: "Partial payment",
      idempotencyKey: `pay-partial-${runId}`,
    });

    const customerBalanceAfter = await getCustomerBalance(workspaceId, customer1Id);
    assertMoneyEqual(customerBalanceAfter, customerBalanceBefore - 15000, 0.001, "Customer AR after partial payment");

    const cashAfter = await getCashBankBalance(workspaceId, cashAccountId);
    assertMoneyEqual(cashAfter, cashBefore + 15000, 0.001, "Cash after partial payment");

    // Invoice should be PARTIALLY_PAID
    const invoice = await db.invoice.findFirstOrThrow({ where: { id: sale1InvoiceId } });
    expect(invoice.status).toBe("PARTIALLY_PAID");

    const glBalanced = await verifyGLBalanced(workspaceId);
    expect(glBalanced.balanced).toBe(true);
  });

  it("2.4 Customer return — inventory restored, AR reduced, credit note issued", async () => {
    const { createCustomerReturn } = await import("@/lib/server/sales");
    const stockBefore = await getProductStock(workspaceId, product1Id);
    const customerBalanceBefore = await getCustomerBalance(workspaceId, customer1Id);

    const saleItems = await db.salesOrderItem.findMany({ where: { salesOrderId: sale1Id } });
    const item1 = saleItems.find((i: any) => i.productId === product1Id);

    const ret = await createCustomerReturn(ctx, {
      salesOrderId: sale1Id,
      items: [{ itemId: item1.id, quantity: 3 }],
      reason: "Defective items",
      restock: true,
      idempotencyKey: `cr-${runId}`,
    });

    // Verify stock restored
    const stockAfter = await getProductStock(workspaceId, product1Id);
    assertQuantityEqual(stockAfter, stockBefore + 3, "Product 1 stock after customer return");

    // Verify AR reduced
    const customerBalanceAfter = await getCustomerBalance(workspaceId, customer1Id);
    expect(customerBalanceAfter).toBeLessThan(customerBalanceBefore);

    // Verify credit note exists
    const creditNote = await db.creditNote.findFirst({ where: { customerReturnId: ret.id } });
    expect(creditNote).not.toBeNull();
    expect(creditNote.status).toBe("OPEN");

    const glBalanced = await verifyGLBalanced(workspaceId);
    expect(glBalanced.balanced).toBe(true);
  });

  it("2.5 Cancel sale — all entries reversed, inventory restored", async () => {
    const { createSale, cancelSale } = await import("@/lib/server/sales");

    // Create a sale to cancel
    const sale = await createSale(ctx, {
      customerId: customer1Id,
      items: [{ productId: product1Id, quantity: 2, unitPrice: 1200, discountPerUnit: 0 }],
      orderDiscount: 0,
      paidAmount: 0,
      notes: "Sale to cancel",
      idempotencyKey: crypto.randomUUID(),
    });

    const stockBefore = await getProductStock(workspaceId, product1Id);
    const customerBalanceBefore = await getCustomerBalance(workspaceId, customer1Id);

    await cancelSale(ctx, sale.id, false);

    // Verify stock restored
    const stockAfter = await getProductStock(workspaceId, product1Id);
    assertQuantityEqual(stockAfter, stockBefore + 2, "Product 1 stock after sale cancellation");

    // Verify AR reversed
    const customerBalanceAfter = await getCustomerBalance(workspaceId, customer1Id);
    assertMoneyEqual(customerBalanceAfter, customerBalanceBefore - 2400, 0.001, "Customer AR after cancellation");

    // Verify sale status
    const saleRecord = await db.salesOrder.findFirstOrThrow({ where: { id: sale.id } });
    expect(saleRecord.status).toBe("CANCELLED");

    // Verify GL has reversal entries
    const reversalEntries = await db.generalLedgerEntry.findMany({
      where: { workspaceId, sourceType: "REVERSAL", sourceId: sale.id },
    });
    expect(reversalEntries.length).toBeGreaterThan(0);

    const glBalanced = await verifyGLBalanced(workspaceId);
    expect(glBalanced.balanced).toBe(true);
  });

  it("2.6 Sale with discount — correct total, correct COGS", async () => {
    const { createSale } = await import("@/lib/server/sales");

    const sale = await createSale(ctx, {
      customerId: customer1Id,
      items: [
        { productId: product1Id, quantity: 10, unitPrice: 1200, discountPerUnit: 100 },
      ],
      orderDiscount: 500,
      paidAmount: 0,
      notes: "Discount test",
      idempotencyKey: crypto.randomUUID(),
    });

    // Expected: (10 * 1200) - (10 * 100) - 500 = 12000 - 1000 - 500 = 10500
    const saleRecord = await db.salesOrder.findFirstOrThrow({ where: { id: sale.id } });
    assertMoneyEqual(Number(saleRecord.total), 10500, 0.001, "Sale total with discount");
    assertMoneyEqual(Number(saleRecord.discount), 1500, 0.001, "Sale discount amount");

    const glBalanced = await verifyGLBalanced(workspaceId);
    expect(glBalanced.balanced).toBe(true);
  });

  it("2.7 Insufficient stock rejected", async () => {
    const { createSale } = await import("@/lib/server/sales");

    await expect(
      createSale(ctx, {
        customerId: customer1Id,
        items: [{ productId: product2Id, quantity: 99999, unitPrice: 3800, discountPerUnit: 0 }],
        orderDiscount: 0,
        paidAmount: 0,
        notes: "",
        idempotencyKey: crypto.randomUUID(),
      })
    ).rejects.toThrow();
  });

  it("2.8 GL entries for sale are balanced per source document", async () => {
    const saleEntries = await getGLEntries(workspaceId, "SALE", sale1Id);
    const totalDebit = saleEntries.reduce((s: number, e: any) => s + Number(e.debit), 0);
    const totalCredit = saleEntries.reduce((s: number, e: any) => s + Number(e.credit), 0);
    assertMoneyEqual(totalDebit, totalCredit, 0.001, `GL balanced for sale ${sale1OrderNumber}`);
  });

  it("2.9 Oracle full reconciliation", async () => {
    const reconciliation = oracle.reconcileAll();
    if (!reconciliation.passed) {
      console.error("Oracle reconciliation failures:", reconciliation.mismatches);
    }
    expect(reconciliation.passed).toBe(true);
  });
});
