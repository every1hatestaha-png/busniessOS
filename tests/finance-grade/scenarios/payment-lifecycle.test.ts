/**
 * Payment Lifecycle Tests
 * 
 * Tests customer payments, supplier payments, advance payments,
 * duplicate payment prevention, and cash/bank account effects.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { AccountingOracle } from "../oracle/accounting-oracle";
import { roundMoney, assertMoneyEqual } from "../oracle/precision";
import { createTestWorkspace, teardownTestWorkspace, getDb, getCustomerBalance, getSupplierBalance, getCashBankBalance, verifyGLBalanced } from "../helpers/db-helpers";
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
let cashAccountId: string;

const runId = `payment-lifecycle-${Date.now()}`;

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
    openingBalance: 0,
  });
  customer1Id = cust;
  oracle.seedCustomer({ id: customer1Id, name: CUSTOMERS[0].name, currentBalance: 0 });

  // Create supplier
  const { createSupplier } = await import("@/lib/server/suppliers");
  const sup = await createSupplier(ctx, {
    name: SUPPLIERS[0].name,
    companyName: SUPPLIERS[0].companyName,
    phone: SUPPLIERS[0].phone,
    city: SUPPLIERS[0].city,
    openingBalance: 0,
  });
  supplier1Id = sup.id;
  oracle.seedSupplier({ id: supplier1Id, name: SUPPLIERS[0].name, currentBalance: 0 });

  // Create product
  const { createProduct } = await import("@/lib/server/products");
  product1Id = await createProduct(workspaceId, { name: "Payment Test Product", sku: `PAY-${Date.now()}`, category: "Test", costPrice: 500, sellingPrice: 800, stockQuantity: 100, reorderLevel: 10, unit: "PIECE", status: "ACTIVE", description: "" });
  oracle.seedProduct({ id: product1Id, name: "Payment Test Product", sku: `PAY-${Date.now()}`, costPrice: 500, sellingPrice: 800, stockQuantity: 100, unit: "PIECE" });

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

describe("F3: Payment Lifecycle", () => {
  let sale1Id: string;
  let sale1InvoiceId: string;

  it("3.1 Create credit sale for payment testing", async () => {
    const { createSale } = await import("@/lib/server/sales");

    const sale = await createSale(ctx, {
      customerId: customer1Id,
      items: [{ productId: product1Id, quantity: 20, unitPrice: 800, discountPerUnit: 0 }],
      orderDiscount: 0,
      paidAmount: 0,
      notes: "Payment test sale",
      idempotencyKey: crypto.randomUUID(),
    });
    sale1Id = sale.id;

    const invoice = await db.invoice.findFirst({ where: { salesOrderId: sale1Id } });
    sale1InvoiceId = invoice.id;

    // Verify AR = 16,000
    const balance = await getCustomerBalance(workspaceId, customer1Id);
    assertMoneyEqual(balance, 16000, 0.001, "Customer AR after credit sale");
  });

  it("3.2 Full customer payment — AR zeroed, cash increased", async () => {
    const { recordPayment } = await import("@/lib/server/payments");
    const cashBefore = await getCashBankBalance(workspaceId, cashAccountId);

    await recordPayment(ctx, {
      customerId: customer1Id,
      invoiceId: sale1InvoiceId,
      cashBankAccountId: cashAccountId,
      amount: 16000,
      paymentDate: new Date(),
      method: "CASH",
      notes: "Full payment",
      idempotencyKey: `pay-full-${runId}`,
    });

    const balance = await getCustomerBalance(workspaceId, customer1Id);
    assertMoneyEqual(balance, 0, 0.001, "Customer AR after full payment");

    const cashAfter = await getCashBankBalance(workspaceId, cashAccountId);
    assertMoneyEqual(cashAfter, cashBefore + 16000, 0.001, "Cash after full payment");

    const invoice = await db.invoice.findFirstOrThrow({ where: { id: sale1InvoiceId } });
    expect(invoice.status).toBe("PAID");

    const glBalanced = await verifyGLBalanced(workspaceId);
    expect(glBalanced.balanced).toBe(true);
  });

  it("3.3 Advance payment (no invoice) — customer gets credit", async () => {
    const { recordPayment } = await import("@/lib/server/payments");
    const cashBefore = await getCashBankBalance(workspaceId, cashAccountId);
    const balanceBefore = await getCustomerBalance(workspaceId, customer1Id);

    await recordPayment(ctx, {
      customerId: customer1Id,
      cashBankAccountId: cashAccountId,
      amount: 5000,
      paymentDate: new Date(),
      method: "BANK_TRANSFER",
      reference: "ADV-001",
      notes: "Advance payment",
      idempotencyKey: `pay-adv-${runId}`,
    });

    // Customer balance should go negative (credit on account)
    const balanceAfter = await getCustomerBalance(workspaceId, customer1Id);
    assertMoneyEqual(balanceAfter, balanceBefore - 5000, 0.001, "Customer balance after advance");

    const cashAfter = await getCashBankBalance(workspaceId, cashAccountId);
    assertMoneyEqual(cashAfter, cashBefore + 5000, 0.001, "Cash after advance payment");

    const glBalanced = await verifyGLBalanced(workspaceId);
    expect(glBalanced.balanced).toBe(true);
  });

  it("3.4 Duplicate payment with same idempotency key is rejected or idempotent", async () => {
    const { recordPayment } = await import("@/lib/server/payments");

    const key = `pay-dup-${runId}`;
    await recordPayment(ctx, {
      customerId: customer1Id,
      cashBankAccountId: cashAccountId,
      amount: 1000,
      paymentDate: new Date(),
      method: "CASH",
      notes: "First payment",
      idempotencyKey: key,
    });

    const balanceAfterFirst = await getCustomerBalance(workspaceId, customer1Id);

    // Second call with same key should either return existing or reject if different params
    await recordPayment(ctx, {
      customerId: customer1Id,
      cashBankAccountId: cashAccountId,
      amount: 1000,
      paymentDate: new Date(),
      method: "CASH",
      notes: "First payment",
      idempotencyKey: key,
    }).catch(() => {}); // May reject if different params

    const balanceAfterSecond = await getCustomerBalance(workspaceId, customer1Id);
    // Balance should not change on duplicate
    assertMoneyEqual(balanceAfterSecond, balanceAfterFirst, 0.001, "No double payment on duplicate idempotency key");
  });

  it("3.5 Supplier payment — AP decreases, cash decreases", async () => {
    const { createPurchase, createGoodsReceipt } = await import("@/lib/server/purchases");
    const { recordSupplierPayment } = await import("@/lib/server/suppliers");

    // First create a PO and GRN to build AP
    const po = await createPurchase(ctx, {
      supplierId: supplier1Id,
      items: [{ productId: product1Id, quantity: 10, unitCost: 500 }],
      pricingMode: "UNIT",
      idempotencyKey: `po-pay-${runId}`,
    });

    const poItem = await db.purchaseOrderItem.findFirstOrThrow({ where: { purchaseOrderId: po.id } });
    await createGoodsReceipt(ctx, {
      purchaseOrderId: po.id,
      items: [{ purchaseOrderItemId: poItem.id, receivedQuantity: 10, acceptedQuantity: 10, actualUnitCost: 500 }],
      idempotencyKey: `grn-pay-${runId}`,
    });

    const apBefore = await getSupplierBalance(workspaceId, supplier1Id);
    const cashBefore = await getCashBankBalance(workspaceId, cashAccountId);

    // Pay 3000 of the 5000 AP
    await recordSupplierPayment(ctx, supplier1Id, {
      cashBankAccountId: cashAccountId,
      amount: 3000,
      paymentDate: new Date(),
      method: "BANK_TRANSFER",
      reference: "SUP-PAY-001",
      allocations: [{ purchaseOrderId: po.id, amount: 3000 }],
      idempotencyKey: `sup-pay-${runId}`,
    });

    const apAfter = await getSupplierBalance(workspaceId, supplier1Id);
    assertMoneyEqual(apAfter, apBefore - 3000, 0.001, "Supplier AP after payment");

    const cashAfter = await getCashBankBalance(workspaceId, cashAccountId);
    assertMoneyEqual(cashAfter, cashBefore - 3000, 0.001, "Cash after supplier payment");

    const glBalanced = await verifyGLBalanced(workspaceId);
    expect(glBalanced.balanced).toBe(true);
  });

  it("3.6 Payment exceeding invoice balance is rejected", async () => {
    const { recordPayment } = await import("@/lib/server/payments");

    // Create a small sale
    const { createSale } = await import("@/lib/server/sales");
    const sale = await createSale(ctx, {
      customerId: customer1Id,
      items: [{ productId: product1Id, quantity: 1, unitPrice: 800, discountPerUnit: 0 }],
      orderDiscount: 0,
      paidAmount: 0,
      notes: "",
      idempotencyKey: crypto.randomUUID(),
    });
    const invoice = await db.invoice.findFirst({ where: { salesOrderId: sale.id } });

    // Try to pay more than invoice
    await expect(
      recordPayment(ctx, {
        customerId: customer1Id,
        invoiceId: invoice.id,
        cashBankAccountId: cashAccountId,
        amount: 99999,
        paymentDate: new Date(),
        method: "CASH",
        notes: "",
        idempotencyKey: crypto.randomUUID(),
      })
    ).rejects.toThrow();
  });

  it("3.7 GL entries for payments are balanced", async () => {
    const glBalanced = await verifyGLBalanced(workspaceId);
    expect(glBalanced.balanced).toBe(true);
  });

  it("3.8 Oracle reconciliation", async () => {
    const reconciliation = oracle.reconcileAll();
    if (!reconciliation.passed) {
      console.error("Oracle reconciliation failures:", reconciliation.mismatches);
    }
    expect(reconciliation.passed).toBe(true);
  });
});
