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

let workspaceA: string;
let workspaceB: string;
let customerA: string;
let customerB: string;
let productA: string;
let productB: string;
let cashBankAccountA: string;

const context = (workspaceId: string) => ({ workspaceId, role: "OWNER" as const });

function saleInput(customerId: string, productId: string, overrides: { quantity?: number; paidAmount?: number } = {}) {
  return {
    customerId,
    items: [{ productId, quantity: overrides.quantity ?? 2, unitPrice: 100, discount: 10 }],
    orderDiscount: 10,
    paidAmount: overrides.paidAmount ?? 60,
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
    ({ ensureDefaultAccounts } = await import("@/lib/server/accounting"));

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
    await ensureDefaultAccounts(workspaceA);
    cashBankAccountA = (await db.cashBankAccount.findFirstOrThrow({ where: { workspaceId: workspaceA, isActive: true }, select: { id: true } })).id;
  }, 30_000);

  afterAll(async () => {
    if (!db) return;
    if (workspaceIds.length) await db.salesOrder.deleteMany({ where: { workspaceId: { in: workspaceIds } } });
    if (workspaceIds.length) await db.workspace.deleteMany({ where: { id: { in: workspaceIds } } });
    if (userIds.length) await db.user.deleteMany({ where: { id: { in: userIds } } });
    await db.$disconnect();
  }, 30_000);

  it("creates a transactional sale, reduces stock, and isolates reads", async () => {
    const result = await createSale(context(workspaceA), saleInput(customerA, productA));
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
    expect(product.stockQuantity).toBe(18);
    expect(Number(customer.currentBalance)).toBe(120);
    expect(inventory).toEqual([expect.objectContaining({ productId: productA, type: "SALE", quantityChanged: -2 })]);
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

    await expect(createSale(context(workspaceA), input)).rejects.toMatchObject({ code: "INSUFFICIENT_STOCK" });

    const [unchangedProduct, order, inventoryCount] = await Promise.all([
      db.product.findUniqueOrThrow({ where: { id: product.id } }),
      db.salesOrder.findFirst({ where: { workspaceId: workspaceA, idempotencyKey: input.idempotencyKey } }),
      db.inventoryTransaction.count({ where: { workspaceId: workspaceA, productId: product.id } }),
    ]);
    expect(unchangedProduct.stockQuantity).toBe(1);
    expect(order).toBeNull();
    expect(inventoryCount).toBe(0);
  });

  it("rejects customers and products from another workspace", async () => {
    expect(await getCustomer(workspaceA, customerB)).toBeNull();
    expect(await getProduct(productB, workspaceA)).toBeNull();
    await expect(createSale(context(workspaceA), saleInput(customerB, productA))).rejects.toMatchObject({ code: "CUSTOMER_NOT_FOUND" });
    await expect(createSale(context(workspaceA), saleInput(customerA, productB))).rejects.toMatchObject({ code: "PRODUCT_NOT_FOUND" });
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
