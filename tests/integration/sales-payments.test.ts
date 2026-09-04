import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

const runId = randomUUID();
const workspaceIds: string[] = [];
const userIds: string[] = [];

let db: typeof import("@/lib/server/db")["db"];
let createSale: typeof import("@/lib/server/sales")["createSale"];
let listSales: typeof import("@/lib/server/sales")["listSales"];
let getSale: typeof import("@/lib/server/sales")["getSale"];
let recordPayment: typeof import("@/lib/server/payments")["recordPayment"];
let getCustomer: typeof import("@/lib/server/customers")["getCustomer"];
let getProduct: typeof import("@/lib/server/products")["getProduct"];
let ensureDefaultAccounts: typeof import("@/lib/server/accounting")["ensureDefaultAccounts"];
let createCashBankAccount: typeof import("@/lib/server/accounting")["createCashBankAccount"];
let getReceivablesAging: typeof import("@/lib/server/receivables")["getReceivablesAging"];

let workspaceA: string;
let workspaceB: string;
let customerA: string;
let customerB: string;
let productA: string;
let productB: string;
let cashBankAccountA: string;
let bankCashBankAccountA: string;
let cashBankAccountB: string;

const context = (workspaceId: string, role: "OWNER" | "ADMIN" | "STAFF" = "OWNER") => ({ workspaceId, role });

function saleInput(customerId: string, productId: string, overrides: { quantity?: number; paidAmount?: number; cashBankAccountId?: string } = {}) {
  return {
    customerId,
    items: [{ productId, quantity: overrides.quantity ?? 2, unitPrice: 100, discount: 10 }],
    orderDiscount: 10,
    paidAmount: overrides.paidAmount ?? 60,
    cashBankAccountId: overrides.cashBankAccountId,
    notes: `integration ${runId}`,
    idempotencyKey: randomUUID(),
  };
}

describe("sales and payments against Neon", () => {
  beforeAll(async () => {
    const { config } = await import("dotenv");
    config({ path: ".env.local", quiet: true });

    ({ db } = await import("@/lib/server/db"));
    ({ createSale, listSales, getSale } = await import("@/lib/server/sales"));
    ({ recordPayment } = await import("@/lib/server/payments"));
    ({ getCustomer } = await import("@/lib/server/customers"));
    ({ getProduct } = await import("@/lib/server/products"));
    ({ ensureDefaultAccounts, createCashBankAccount } = await import("@/lib/server/accounting"));
    ({ getReceivablesAging } = await import("@/lib/server/receivables"));

    const [userA, userB] = await Promise.all([
      db.user.create({ data: { clerkId: `test-clerk-a-${runId}`, email: `test-a-${runId}@example.invalid` } }),
      db.user.create({ data: { clerkId: `test-clerk-b-${runId}`, email: `test-b-${runId}@example.invalid` } }),
    ]);
    userIds.push(userA.id, userB.id);

    const [firstWorkspace, secondWorkspace] = await Promise.all([
      db.workspace.create({ data: { name: `Integration A ${runId}`, members: { create: { userId: userA.id, role: "OWNER" } } } }),
      db.workspace.create({ data: { name: `Integration B ${runId}`, members: { create: { userId: userB.id, role: "OWNER" } } } }),
    ]);
    workspaceA = firstWorkspace.id;
    workspaceB = secondWorkspace.id;
    workspaceIds.push(workspaceA, workspaceB);

    const [firstCustomer, secondCustomer, firstProduct, secondProduct] = await Promise.all([
      db.customer.create({ data: { workspaceId: workspaceA, name: `Customer A ${runId}`, creditLimit: 10000 } }),
      db.customer.create({ data: { workspaceId: workspaceB, name: `Customer B ${runId}`, creditLimit: 10000 } }),
      db.product.create({ data: { workspaceId: workspaceA, name: `Product A ${runId}`, sku: `A-${runId}`, costPrice: 40, sellingPrice: 100, stockQuantity: 20 } }),
      db.product.create({ data: { workspaceId: workspaceB, name: `Product B ${runId}`, sku: `B-${runId}`, costPrice: 45, sellingPrice: 100, stockQuantity: 20 } }),
    ]);
    customerA = firstCustomer.id;
    customerB = secondCustomer.id;
    productA = firstProduct.id;
    productB = secondProduct.id;
    await Promise.all([ensureDefaultAccounts(workspaceA), ensureDefaultAccounts(workspaceB)]);
    cashBankAccountA = (await db.cashBankAccount.findFirstOrThrow({ where: { workspaceId: workspaceA, isActive: true }, select: { id: true } })).id;
    cashBankAccountB = (await db.cashBankAccount.findFirstOrThrow({ where: { workspaceId: workspaceB, isActive: true }, select: { id: true } })).id;
    const bankAccount = await createCashBankAccount({ workspaceId: workspaceA, userId: userA.id, role: "OWNER" as const }, { name: `Sales bank ${runId}`, isBank: true, openingBalance: 0, bankName: "Test Bank", accountTitle: "BusinessOS", accountNumber: "123" });
    bankCashBankAccountA = (await db.cashBankAccount.findFirstOrThrow({ where: { accountId: bankAccount.id }, select: { id: true } })).id;
  }, 30_000);

  afterAll(async () => {
    if (!db) return;
    if (workspaceIds.length) await db.salesOrder.deleteMany({ where: { workspaceId: { in: workspaceIds } } });
    if (workspaceIds.length) await db.workspace.deleteMany({ where: { id: { in: workspaceIds } } });
    if (userIds.length) await db.user.deleteMany({ where: { id: { in: userIds } } });
    await db.$disconnect();
  }, 30_000);

  it("creates a transactional sale, reduces stock, and isolates reads", async () => {
    const result = await createSale(context(workspaceA), saleInput(customerA, productA, { cashBankAccountId: cashBankAccountA }));
    const [order, product, customer, inventory, ledger, payments] = await Promise.all([
      db.salesOrder.findUniqueOrThrow({ where: { id: result.id }, include: { items: true, invoices: true } }),
      db.product.findUniqueOrThrow({ where: { id: productA } }),
      db.customer.findUniqueOrThrow({ where: { id: customerA } }),
      db.inventoryTransaction.findMany({ where: { workspaceId: workspaceA, reference: { startsWith: "SO-" } } }),
      db.ledgerEntry.findMany({ where: { workspaceId: workspaceA, referenceId: { in: [result.id] } } }),
      db.payment.findMany({ where: { workspaceId: workspaceA, customerId: customerA } }),
    ]);

    expect(order).toMatchObject({ subtotal: expect.anything(), status: "CONFIRMED" });
    expect(Number(order.subtotal)).toBe(200);
    expect(Number(order.discount)).toBe(20);
    expect(Number(order.total)).toBe(180);
    expect(Number(order.paidAmount)).toBe(60);
    expect(Number(order.balanceAmount)).toBe(120);
    expect(order.items).toHaveLength(1);
    expect(order.invoices).toHaveLength(1);
    expect(order.invoices[0].status).toBe("PARTIALLY_PAID");
    expect(Number(order.invoices[0].paidAmount)).toBe(60);
    expect(product.stockQuantity.toNumber()).toBe(18);
    expect(Number(customer.currentBalance)).toBe(120);
    expect(inventory).toHaveLength(1);
    expect(inventory[0].productId).toBe(productA);
    expect(inventory[0].type).toBe("SALE");
    expect(inventory[0].quantityChanged.toNumber()).toBe(-2);
    expect(ledger).toEqual([expect.objectContaining({ type: "SALE", debit: expect.anything() })]);
    expect(payments).toHaveLength(1);

    const paymentLedger = await db.ledgerEntry.findFirst({ where: { workspaceId: workspaceA, referenceId: payments[0].id } });
    expect(paymentLedger).toMatchObject({ type: "PAYMENT_RECEIVED" });
    expect(Number(paymentLedger?.credit)).toBe(60);
    expect(await getSale(workspaceB, result.id)).toBeNull();
    expect((await listSales(workspaceB)).some((sale) => sale.id === result.id)).toBe(false);
  });

  it("rolls back the entire sale when stock is insufficient", async () => {
    const product = await db.product.create({
      data: { workspaceId: workspaceA, name: `Scarce ${runId}`, sku: `scarce-${runId}`, costPrice: 20, sellingPrice: 100, stockQuantity: 1 },
    });
    const input = saleInput(customerA, product.id, { quantity: 2, paidAmount: 0 });

    await expect(createSale(context(workspaceA), input)).rejects.toMatchObject({ code: "INSUFFICIENT_STOCK", message: expect.stringContaining("Available quantity: 1") });

    const [unchangedProduct, order, inventoryCount] = await Promise.all([
      db.product.findUniqueOrThrow({ where: { id: product.id } }),
      db.salesOrder.findFirst({ where: { workspaceId: workspaceA, idempotencyKey: input.idempotencyKey } }),
      db.inventoryTransaction.count({ where: { workspaceId: workspaceA, productId: product.id } }),
    ]);
    expect(unchangedProduct.stockQuantity.toNumber()).toBe(1);
    expect(order).toBeNull();
    expect(inventoryCount).toBe(0);
  });

  it("rejects customers and products from another workspace", async () => {
    expect(await getCustomer(workspaceA, customerB)).toBeNull();
    expect(await getProduct(productB, workspaceA)).toBeNull();
    await expect(createSale(context(workspaceA), saleInput(customerB, productA, { cashBankAccountId: cashBankAccountA }))).rejects.toMatchObject({ code: "CUSTOMER_NOT_FOUND" });
    await expect(createSale(context(workspaceA), saleInput(customerA, productB, { cashBankAccountId: cashBankAccountA }))).rejects.toMatchObject({ code: "PRODUCT_NOT_FOUND" });
  });

  it("posts paid-at-sale cash receipt to the selected cash/bank account", async () => {
    const defaultBefore = await db.cashBankAccount.findUniqueOrThrow({ where: { id: cashBankAccountA }, select: { currentBalance: true } });
    const bankBefore = await db.cashBankAccount.findUniqueOrThrow({ where: { id: bankCashBankAccountA }, select: { currentBalance: true, accountId: true } });
    const customerBefore = await db.customer.findUniqueOrThrow({ where: { id: customerA }, select: { currentBalance: true } });

    const result = await createSale(context(workspaceA), saleInput(customerA, productA, { quantity: 1, paidAmount: 50, cashBankAccountId: bankCashBankAccountA }));

    const [defaultAfter, bankAfter, customerAfter, invoice, glReceipt] = await Promise.all([
      db.cashBankAccount.findUniqueOrThrow({ where: { id: cashBankAccountA }, select: { currentBalance: true } }),
      db.cashBankAccount.findUniqueOrThrow({ where: { id: bankCashBankAccountA }, select: { currentBalance: true } }),
      db.customer.findUniqueOrThrow({ where: { id: customerA }, select: { currentBalance: true } }),
      db.invoice.findUniqueOrThrow({ where: { salesOrderId: result.id } }),
      db.generalLedgerEntry.findFirstOrThrow({ where: { workspaceId: workspaceA, sourceId: result.id, sourceType: "RECEIPT", debit: { gt: 0 } } }),
    ]);
    const payment = await db.payment.findFirstOrThrow({ where: { workspaceId: workspaceA, invoiceId: invoice.id, notes: "Payment received with sale" }, include: { allocations: true } });

    expect(Number(defaultAfter.currentBalance)).toBe(Number(defaultBefore.currentBalance));
    expect(Number(bankAfter.currentBalance)).toBe(Number(bankBefore.currentBalance) + 50);
    expect(Number(customerAfter.currentBalance) - Number(customerBefore.currentBalance)).toBe(30);
    expect(glReceipt.accountId).toBe(bankBefore.accountId);
    expect(payment.cashBankAccountId).toBe(bankCashBankAccountA);
    expect(payment.method).toBe("BANK_TRANSFER");
    expect(Number(payment.amount)).toBe(50);
    expect(Number(payment.netAmount)).toBe(50);
    expect(payment.documentNumber).toMatch(/^PAY-/);
    expect(payment.allocations).toEqual([expect.objectContaining({ invoiceId: invoice.id, amount: expect.anything() })]);
    expect(Number(payment.allocations[0].amount)).toBe(50);
  });

  it("creates the 67 x Rs 950 unpaid sale without a configured credit limit or cash movement", async () => {
    const customer = await db.customer.create({ data: { workspaceId: workspaceA, name: `Unlimited customer ${runId}` } });
    const product = await db.product.create({ data: { workspaceId: workspaceA, name: `950 product ${runId}`, sku: `950-${runId}`, costPrice: 500, sellingPrice: 950, stockQuantity: 67 } });
    const cashBefore = await db.cashBankAccount.findMany({ where: { workspaceId: workspaceA }, select: { id: true, currentBalance: true }, orderBy: { id: "asc" } });

    const result = await createSale(context(workspaceA), {
      customerId: customer.id,
      items: [{ productId: product.id, quantity: 67, unitPrice: 950, discount: 0 }],
      orderDiscount: 0,
      paidAmount: 0,
      notes: "Unpaid regression",
      idempotencyKey: randomUUID(),
    });

    const [order, invoice, updatedCustomer, payments, receiptEntries, cashAfter, receivables] = await Promise.all([
      db.salesOrder.findUniqueOrThrow({ where: { id: result.id } }),
      db.invoice.findUniqueOrThrow({ where: { salesOrderId: result.id } }),
      db.customer.findUniqueOrThrow({ where: { id: customer.id } }),
      db.payment.findMany({ where: { workspaceId: workspaceA, customerId: customer.id } }),
      db.generalLedgerEntry.findMany({ where: { workspaceId: workspaceA, sourceId: result.id, sourceType: "RECEIPT" } }),
      db.cashBankAccount.findMany({ where: { workspaceId: workspaceA }, select: { id: true, currentBalance: true }, orderBy: { id: "asc" } }),
      getReceivablesAging(workspaceA, { customerId: customer.id }),
    ]);

    expect(Number(order.total)).toBe(63650);
    expect(Number(order.paidAmount)).toBe(0);
    expect(Number(order.balanceAmount)).toBe(63650);
    expect(invoice.status).toBe("UNPAID");
    expect(Number(invoice.paidAmount)).toBe(0);
    expect(Number(updatedCustomer.currentBalance)).toBe(63650);
    expect(payments).toHaveLength(0);
    expect(receiptEntries).toHaveLength(0);
    expect(cashAfter.map((account) => [account.id, account.currentBalance.toString()])).toEqual(cashBefore.map((account) => [account.id, account.currentBalance.toString()]));
    expect(receivables.totalOutstanding).toBe(63650);
  });

  it("enforces configured credit using existing outstanding and reports available credit", async () => {
    const withinCustomer = await db.customer.create({ data: { workspaceId: workspaceA, name: `Within limit ${runId}`, creditLimit: 100000, currentBalance: 20000 } });
    const overCustomer = await db.customer.create({ data: { workspaceId: workspaceA, name: `Over limit ${runId}`, creditLimit: 100000, currentBalance: 20000 } });
    const product = await db.product.create({ data: { workspaceId: workspaceA, name: `Credit product ${runId}`, sku: `credit-${runId}`, costPrice: 400, sellingPrice: 1000, stockQuantity: 200 } });

    await createSale(context(workspaceA), {
      customerId: withinCustomer.id,
      items: [{ productId: product.id, quantity: 60, unitPrice: 1000, discount: 0 }],
      orderDiscount: 0,
      paidAmount: 0,
      notes: "Within credit",
      idempotencyKey: randomUUID(),
    });
    expect(Number((await db.customer.findUniqueOrThrow({ where: { id: withinCustomer.id } })).currentBalance)).toBe(80000);

    const rejectedKey = randomUUID();
    await expect(createSale(context(workspaceA), {
      customerId: overCustomer.id,
      items: [{ productId: product.id, quantity: 90, unitPrice: 1000, discount: 0 }],
      orderDiscount: 0,
      paidAmount: 0,
      notes: "Over credit",
      idempotencyKey: rejectedKey,
    })).rejects.toMatchObject({ code: "CREDIT_LIMIT_EXCEEDED", message: "Customer credit limit exceeded. Available credit: Rs 80,000." });
    expect(await db.salesOrder.findFirst({ where: { workspaceId: workspaceA, idempotencyKey: rejectedKey } })).toBeNull();
    expect(Number((await db.customer.findUniqueOrThrow({ where: { id: overCustomer.id } })).currentBalance)).toBe(20000);
  });

  it("requires an active same-workspace cash/bank account only when paid amount is positive", async () => {
    const customer = await db.customer.create({ data: { workspaceId: workspaceA, name: `Account policy ${runId}` } });
    const product = await db.product.create({ data: { workspaceId: workspaceA, name: `Account product ${runId}`, sku: `account-${runId}`, costPrice: 20, sellingPrice: 100, stockQuantity: 10 } });
    const inactiveAccount = await createCashBankAccount({ workspaceId: workspaceA, role: "OWNER" as const }, { name: `Inactive ${runId}`, isBank: false, openingBalance: 0, bankName: "", accountTitle: "", accountNumber: "" });
    const inactiveCashBank = await db.cashBankAccount.findFirstOrThrow({ where: { accountId: inactiveAccount.id } });
    await db.cashBankAccount.update({ where: { id: inactiveCashBank.id }, data: { isActive: false } });

    const missingAccountKey = randomUUID();
    await expect(createSale(context(workspaceA), { customerId: customer.id, items: [{ productId: product.id, quantity: 1, unitPrice: 100, discount: 0 }], orderDiscount: 0, paidAmount: 10, notes: "", idempotencyKey: missingAccountKey })).rejects.toThrow("Select the cash/bank account receiving this payment.");
    await expect(createSale(context(workspaceA), { customerId: customer.id, items: [{ productId: product.id, quantity: 1, unitPrice: 100, discount: 0 }], orderDiscount: 0, paidAmount: 10, cashBankAccountId: cashBankAccountB, notes: "", idempotencyKey: randomUUID() })).rejects.toMatchObject({ code: "PAYMENT_ACCOUNT_UNAVAILABLE" });
    await expect(createSale(context(workspaceA), { customerId: customer.id, items: [{ productId: product.id, quantity: 1, unitPrice: 100, discount: 0 }], orderDiscount: 0, paidAmount: 10, cashBankAccountId: inactiveCashBank.id, notes: "", idempotencyKey: randomUUID() })).rejects.toMatchObject({ code: "PAYMENT_ACCOUNT_UNAVAILABLE" });

    expect(await db.salesOrder.findFirst({ where: { workspaceId: workspaceA, idempotencyKey: missingAccountKey } })).toBeNull();
    expect(Number((await db.product.findUniqueOrThrow({ where: { id: product.id } })).stockQuantity)).toBe(10);
  });

  it("allows staff to create unpaid sales but not initial payments", async () => {
    const customer = await db.customer.create({ data: { workspaceId: workspaceA, name: `Staff customer ${runId}` } });
    const product = await db.product.create({ data: { workspaceId: workspaceA, name: `Staff product ${runId}`, sku: `staff-${runId}`, costPrice: 20, sellingPrice: 100, stockQuantity: 5 } });

    const unpaid = await createSale(context(workspaceA, "STAFF"), { customerId: customer.id, items: [{ productId: product.id, quantity: 1, unitPrice: 100, discount: 0 }], orderDiscount: 0, paidAmount: 0, notes: "", idempotencyKey: randomUUID() });
    expect(unpaid.id).toBeTruthy();

    await expect(createSale(context(workspaceA, "STAFF"), { customerId: customer.id, items: [{ productId: product.id, quantity: 1, unitPrice: 100, discount: 0 }], orderDiscount: 0, paidAmount: 10, cashBankAccountId: cashBankAccountA, notes: "", idempotencyKey: randomUUID() })).rejects.toMatchObject({ code: "PAYMENT_PERMISSION_DENIED" });
    expect(Number((await db.product.findUniqueOrThrow({ where: { id: product.id } })).stockQuantity)).toBe(4);
  });

  it("records a payment transaction and reduces customer, invoice, and order balances", async () => {
    const customer = await db.customer.create({ data: { workspaceId: workspaceA, name: `Payment customer ${runId}`, creditLimit: 10000 } });
    const product = await db.product.create({
      data: { workspaceId: workspaceA, name: `Payment product ${runId}`, sku: `payment-${runId}`, costPrice: 30, sellingPrice: 100, stockQuantity: 5 },
    });
    const sale = await createSale(context(workspaceA), saleInput(customer.id, product.id, { quantity: 1, paidAmount: 0 }));
    const invoice = await db.invoice.findUniqueOrThrow({ where: { salesOrderId: sale.id } });

    const result = await recordPayment(context(workspaceA), {
      customerId: customer.id,
      invoiceId: invoice.id,
      cashBankAccountId: cashBankAccountA,
      amount: 35,
      paymentDate: new Date(),
      method: "BANK_TRANSFER",
      reference: `integration-${runId}`,
      notes: "",
    });

    const [updatedCustomer, updatedInvoice, updatedOrder, payment, ledger] = await Promise.all([
      db.customer.findUniqueOrThrow({ where: { id: customer.id } }),
      db.invoice.findUniqueOrThrow({ where: { id: invoice.id } }),
      db.salesOrder.findUniqueOrThrow({ where: { id: sale.id } }),
      db.payment.findUniqueOrThrow({ where: { id: result.id } }),
      db.ledgerEntry.findFirstOrThrow({ where: { workspaceId: workspaceA, referenceId: result.id } }),
    ]);
    expect(Number(updatedCustomer.currentBalance)).toBe(45);
    expect(Number(updatedInvoice.paidAmount)).toBe(35);
    expect(updatedInvoice.status).toBe("PARTIALLY_PAID");
    expect(Number(updatedOrder.paidAmount)).toBe(35);
    expect(Number(updatedOrder.balanceAmount)).toBe(45);
    expect(payment).toMatchObject({ customerId: customer.id, invoiceId: invoice.id, method: "BANK_TRANSFER" });
    expect(ledger.type).toBe("PAYMENT_RECEIVED");
    expect(Number(ledger.credit)).toBe(35);
  });

  it("rejects a payment for a customer from another workspace", async () => {
    const before = await db.payment.count({ where: { workspaceId: workspaceA, customerId: customerB } });
    await expect(recordPayment(context(workspaceA), {
      customerId: customerB,
      cashBankAccountId: cashBankAccountA,
      amount: 1,
      paymentDate: new Date(),
      method: "CASH",
      reference: "",
      notes: "",
    })).rejects.toThrow("Customer not found.");
    expect(await db.payment.count({ where: { workspaceId: workspaceA, customerId: customerB } })).toBe(before);
  });
});
