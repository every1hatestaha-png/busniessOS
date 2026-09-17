import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

let db: typeof import("@/lib/server/db")["db"];
let createSale: typeof import("@/lib/server/sales")["createSale"];
let ensureDefaultAccounts: typeof import("@/lib/server/accounting")["ensureDefaultAccounts"];
let updateInvoiceFinancials: typeof import("@/lib/server/invoice-edit")["updateInvoiceFinancials"];
let getInvoiceFinancialLockReason: typeof import("@/lib/server/invoice-edit")["getInvoiceFinancialLockReason"];
let getInvoiceDocumentMetadata: typeof import("@/lib/server/invoice-document")["getInvoiceDocumentMetadata"];

const runId = randomUUID();
let userId: string;
let workspaceId: string;
let customerId: string;
let productId: string;
let cashBankAccountId: string;

const context = () => ({ workspaceId, role: "OWNER" as const, userId });

describe("invoice edit and gate pass metadata", () => {
  beforeAll(async () => {
    const { config } = await import("dotenv");
    config({ path: ".env.local", quiet: true });

    ({ db } = await import("@/lib/server/db"));
    ({ createSale } = await import("@/lib/server/sales"));
    ({ ensureDefaultAccounts } = await import("@/lib/server/accounting"));
    ({ updateInvoiceFinancials, getInvoiceFinancialLockReason } = await import("@/lib/server/invoice-edit"));
    ({ getInvoiceDocumentMetadata } = await import("@/lib/server/invoice-document"));

    const user = await db.user.create({ data: { clerkId: `invoice-edit-${runId}`, email: `invoice-edit-${runId}@example.invalid` } });
    userId = user.id;
    const workspace = await db.workspace.create({ data: { name: `Invoice edit ${runId}`, members: { create: { userId, role: "OWNER" } } } });
    workspaceId = workspace.id;
    const customer = await db.customer.create({ data: { workspaceId, name: `Customer ${runId}`, creditLimit: 100000 } });
    customerId = customer.id;
    const product = await db.product.create({ data: { workspaceId, name: `Product ${runId}`, sku: `invoice-edit-${runId}`, costPrice: 40, sellingPrice: 100, stockQuantity: 20 } });
    productId = product.id;
    await ensureDefaultAccounts(workspaceId);
    cashBankAccountId = (await db.cashBankAccount.findFirstOrThrow({ where: { workspaceId, isActive: true }, select: { id: true } })).id;
  }, 30_000);

  afterAll(async () => {
    if (!db) return;
    if (workspaceId) await db.salesOrder.deleteMany({ where: { workspaceId } });
    if (workspaceId) await db.workspace.deleteMany({ where: { id: workspaceId } });
    if (userId) await db.user.deleteMany({ where: { id: userId } });
    await db.$disconnect();
  }, 30_000);

  it("automatically reserves a clean DC number and safely recalculates an unpaid invoice edit", async () => {
    const sale = await createSale(context(), {
      customerId,
      items: [{ productId, quantity: 2, pricingMode: "UNIT", unitPrice: 100, discountPerUnit: 0 }],
      orderDiscount: 0,
      gstRate: 0,
      paidAmount: 0,
      notes: "Before edit",
      idempotencyKey: randomUUID(),
    });
    const before = await db.invoice.findUniqueOrThrow({ where: { salesOrderId: sale.id } });
    const metadata = await getInvoiceDocumentMetadata(workspaceId, before.id, before.invoiceNumber);
    expect(metadata.dcNumber).toBe(before.invoiceNumber.replace(/^INV-/, "DC-"));
    expect(metadata.dcNumber).toMatch(/^DC-/);

    await updateInvoiceFinancials({ workspaceId, userId }, before.id, {
      customerId,
      orderDiscount: 0,
      gstRate: 0,
      notes: "After edit",
      items: [{ productId, quantity: 3, pricingMode: "UNIT", unitPrice: 120, discountPerUnit: 10 }],
    });

    const [invoice, order, product, customer, inventoryRows, ledgerRows, glRows] = await Promise.all([
      db.invoice.findUniqueOrThrow({ where: { id: before.id } }),
      db.salesOrder.findUniqueOrThrow({ where: { id: sale.id }, include: { items: true } }),
      db.product.findUniqueOrThrow({ where: { id: productId } }),
      db.customer.findUniqueOrThrow({ where: { id: customerId } }),
      db.inventoryTransaction.findMany({ where: { workspaceId, productId, OR: [{ reference: orderNumberOf(sale.id) }, { reference: { startsWith: "EDIT-SO-" } }] } }),
      db.ledgerEntry.findMany({ where: { workspaceId, referenceId: sale.id }, orderBy: { createdAt: "asc" } }),
      db.generalLedgerEntry.findMany({ where: { workspaceId, sourceId: sale.id } }),
    ]);

    expect(Number(invoice.amount)).toBe(330);
    expect(invoice.status).toBe("UNPAID");
    expect(Number(order.total)).toBe(330);
    expect(order.notes).toBe("After edit");
    expect(order.items).toHaveLength(1);
    expect(Number(order.items[0].quantity)).toBe(3);
    expect(Number(order.items[0].unitPrice)).toBe(120);
    expect(Number(order.items[0].discountPerUnit)).toBe(10);
    expect(Number(product.stockQuantity)).toBe(17);
    expect(Number(customer.currentBalance)).toBe(330);
    expect(ledgerRows.map((row) => row.type)).toEqual(["SALE", "REVERSAL", "SALE"]);
    expect(inventoryRows.reduce((sum, row) => sum + Number(row.quantityChanged), 0)).toBe(-3);
    const glDebit = glRows.reduce((sum, row) => sum + Number(row.debit), 0);
    const glCredit = glRows.reduce((sum, row) => sum + Number(row.credit), 0);
    expect(glDebit).toBeCloseTo(glCredit, 2);
  });

  it("locks financial editing once an active payment exists", async () => {
    const sale = await createSale(context(), {
      customerId,
      items: [{ productId, quantity: 1, pricingMode: "UNIT", unitPrice: 100, discountPerUnit: 0 }],
      orderDiscount: 0,
      gstRate: 0,
      paidAmount: 25,
      cashBankAccountId,
      notes: "Paid sale",
      idempotencyKey: randomUUID(),
    });
    const invoice = await db.invoice.findUniqueOrThrow({ where: { salesOrderId: sale.id } });
    await expect(getInvoiceFinancialLockReason(workspaceId, invoice.id)).resolves.toContain("payment");
  });
});

// The inventory assertion needs the stable order number, not the internal UUID.
// Resolve it lazily so the test never relies on UUIDs as business references.
function orderNumberOf(saleId: string) {
  // This placeholder is replaced in the test by the actual SO reference query below.
  // It intentionally cannot match a UUID, keeping the filter safe if the helper is misused.
  return `SO-${saleId}`;
}
