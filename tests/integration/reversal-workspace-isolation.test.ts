import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { teardownTestWorkspace } from "../finance-grade/helpers/db-helpers";

let db: typeof import("@/lib/server/db")["db"];
let reverseCustomerPayment: typeof import("@/lib/server/payments")["reverseCustomerPayment"];
let reverseSupplierPayment: typeof import("@/lib/server/supplier-payment-reversals")["reverseSupplierPayment"];
let cancelSupplierReturn: typeof import("@/lib/server/supplier-return-reversals")["cancelSupplierReturn"];
let reverseExpense: typeof import("@/lib/server/expense-reversals")["reverseExpense"];

const runId = randomUUID();
let userId = "";
let workspaceA = "";
let workspaceB = "";
let customerPaymentId = "";
let supplierPaymentId = "";
let supplierReturnId = "";
let expenseId = "";

describe("financial reversal workspace isolation", () => {
  beforeAll(async () => {
    const { config } = await import("dotenv");
    config({ path: ".env.local", quiet: true });
    ({ db } = await import("@/lib/server/db"));
    ({ reverseCustomerPayment } = await import("@/lib/server/payments"));
    ({ reverseSupplierPayment } = await import("@/lib/server/supplier-payment-reversals"));
    ({ cancelSupplierReturn } = await import("@/lib/server/supplier-return-reversals"));
    ({ reverseExpense } = await import("@/lib/server/expense-reversals"));

    const user = await db.user.create({ data: { clerkId: `reversal-isolation-${runId}`, email: `reversal-isolation-${runId}@example.invalid` } });
    userId = user.id;
    const [a, b] = await Promise.all([
      db.workspace.create({ data: { name: `Reversal A ${runId}`, members: { create: { userId, role: "OWNER" } } } }),
      db.workspace.create({ data: { name: `Reversal B ${runId}`, members: { create: { userId, role: "OWNER" } } } }),
    ]);
    workspaceA = a.id;
    workspaceB = b.id;

    const customer = await db.customer.create({ data: { workspaceId: workspaceA, name: "Isolation Customer" } });
    const supplier = await db.supplier.create({ data: { workspaceId: workspaceA, name: "Isolation Supplier" } });
    const product = await db.product.create({ data: { workspaceId: workspaceA, name: "Isolation Product", sku: `ISO-${runId}`, stockQuantity: 1, costPrice: 1, sellingPrice: 2 } });
    const account = await db.account.create({ data: { workspaceId: workspaceA, code: `ISO-${runId}`, name: "Isolation Expense", category: "EXPENSE", normalBalance: "DEBIT" } });

    customerPaymentId = (await db.payment.create({ data: { workspaceId: workspaceA, customerId: customer.id, amount: 10, netAmount: 10, method: "CASH" } })).id;
    supplierPaymentId = (await db.payment.create({ data: { workspaceId: workspaceA, supplierId: supplier.id, amount: 10, netAmount: 10, method: "CASH" } })).id;
    const purchase = await db.purchaseOrder.create({ data: { workspaceId: workspaceA, supplierId: supplier.id, orderNumber: `PO-ISO-${runId}`, status: "RECEIVED", totalAmount: 10, balanceAmount: 10 } });
    const poItem = await db.purchaseOrderItem.create({ data: { purchaseOrderId: purchase.id, productId: product.id, productName: product.name, quantity: 1, receivedQuantity: 1, unitCost: 10, totalCost: 10 } });
    const supplierReturn = await db.supplierReturn.create({ data: { workspaceId: workspaceA, supplierId: supplier.id, purchaseOrderId: purchase.id, number: `SR-ISO-${runId}`, status: "POSTED", totalAmount: 10 } });
    supplierReturnId = supplierReturn.id;
    await db.supplierReturnItem.create({ data: { supplierReturnId: supplierReturn.id, purchaseOrderItemId: poItem.id, productId: product.id, quantity: 1, unitCost: 10, totalCost: 10 } });
    expenseId = (await db.expense.create({ data: { workspaceId: workspaceA, expenseAccountId: account.id, paymentAccountId: account.id, voucherNumber: `EXP-ISO-${runId}`, expenseDate: new Date(), amount: 10 } })).id;
  }, 60_000);

  afterAll(async () => {
    if (!db) return;
    if (workspaceA && userId) await teardownTestWorkspace(workspaceA, userId);
    if (workspaceB) await db.workspace.delete({ where: { id: workspaceB } }).catch(() => undefined);
    await db.$disconnect();
  }, 60_000);

  it("cannot reverse customer payments from another workspace", async () => {
    await expect(reverseCustomerPayment({ workspaceId: workspaceB, role: "OWNER", userId }, customerPaymentId, "Cross workspace attempt")).rejects.toThrow("Customer payment not found.");
    expect((await db.payment.findUniqueOrThrow({ where: { id: customerPaymentId } })).isReversed).toBe(false);
  });
  it("cannot reverse supplier payments from another workspace", async () => {
    await expect(reverseSupplierPayment({ workspaceId: workspaceB, role: "OWNER", userId }, supplierPaymentId, "Cross workspace attempt")).rejects.toThrow("Supplier payment not found.");
    expect((await db.payment.findUniqueOrThrow({ where: { id: supplierPaymentId } })).isReversed).toBe(false);
  });
  it("cannot cancel supplier returns from another workspace", async () => {
    await expect(cancelSupplierReturn({ workspaceId: workspaceB, role: "OWNER", userId }, supplierReturnId, "Cross workspace attempt")).rejects.toThrow("Supplier return not found.");
    expect((await db.supplierReturn.findUniqueOrThrow({ where: { id: supplierReturnId } })).status).toBe("POSTED");
  });
  it("cannot reverse expenses from another workspace", async () => {
    await expect(reverseExpense({ workspaceId: workspaceB, role: "OWNER", userId }, expenseId, "Cross workspace attempt")).rejects.toThrow("Expense not found.");
    expect(await db.expense.findUnique({ where: { id: expenseId } })).not.toBeNull();
  });
});
