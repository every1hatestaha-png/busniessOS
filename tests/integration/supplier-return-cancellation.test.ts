import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

let db: typeof import("@/lib/server/db")["db"];
let ensureDefaultAccounts: typeof import("@/lib/server/accounting")["ensureDefaultAccounts"];
let cancelSupplierReturn: typeof import("@/lib/server/supplier-return-reversals")["cancelSupplierReturn"];

const runId = randomUUID();
let userId = "";
let workspaceId = "";
let supplierId = "";
let purchaseOrderId = "";
let productId = "";
let supplierReturnId = "";

describe("supplier return cancellation", () => {
  beforeAll(async () => {
    const { config } = await import("dotenv");
    config({ path: ".env.local", quiet: true });
    ({ db } = await import("@/lib/server/db"));
    ({ ensureDefaultAccounts } = await import("@/lib/server/accounting"));
    ({ cancelSupplierReturn } = await import("@/lib/server/supplier-return-reversals"));

    const user = await db.user.create({ data: { clerkId: `supplier-return-cancel-${runId}`, email: `supplier-return-cancel-${runId}@example.invalid` } });
    userId = user.id;
    const workspace = await db.workspace.create({ data: { name: `Supplier return cancel ${runId}`, members: { create: { userId, role: "OWNER" } } } });
    workspaceId = workspace.id;
    await ensureDefaultAccounts(workspaceId);

    const supplier = await db.supplier.create({ data: { workspaceId, name: "Return Supplier", currentBalance: 80 } });
    supplierId = supplier.id;
    const product = await db.product.create({ data: { workspaceId, name: "Return Product", sku: `RET-${runId}`, stockQuantity: 8, costPrice: 10, sellingPrice: 20 } });
    productId = product.id;
    const purchase = await db.purchaseOrder.create({ data: { workspaceId, supplierId, orderNumber: `PO-RET-${runId}`, status: "RECEIVED", totalAmount: 100, paidAmount: 0, balanceAmount: 80 } });
    purchaseOrderId = purchase.id;
    const poItem = await db.purchaseOrderItem.create({ data: { purchaseOrderId, productId, quantity: 10, receivedQuantity: 10, unitCost: 10, totalCost: 100, productName: "Return Product" } });
    const supplierReturn = await db.supplierReturn.create({ data: { workspaceId, supplierId, purchaseOrderId, number: `SR-${runId}`, status: "POSTED", totalAmount: 20, reason: "Test return" } });
    supplierReturnId = supplierReturn.id;
    await db.supplierReturnItem.create({ data: { supplierReturnId, purchaseOrderItemId: poItem.id, productId, quantity: 2, unitCost: 10, totalCost: 20 } });
    await db.inventoryTransaction.create({ data: { workspaceId, productId, type: "RETURN_OUT", quantityChanged: -2, unitCost: 10, reference: supplierReturn.number } });
    await db.ledgerEntry.create({ data: { workspaceId, supplierId, type: "PURCHASE_RETURN", debit: 20, description: `Supplier return ${supplierReturn.number}`, referenceId: supplierReturn.id } });

    const [ap, inventory] = await Promise.all([
      db.account.findUniqueOrThrow({ where: { workspaceId_systemCode: { workspaceId, systemCode: "ACCOUNTS_PAYABLE" } } }),
      db.account.findUniqueOrThrow({ where: { workspaceId_systemCode: { workspaceId, systemCode: "INVENTORY" } } }),
    ]);
    await db.generalLedgerEntry.createMany({ data: [
      { workspaceId, accountId: ap.id, sourceType: "SUPPLIER_RETURN", sourceId: supplierReturn.id, documentNo: supplierReturn.number, narration: "Supplier return", debit: 20, credit: 0 },
      { workspaceId, accountId: inventory.id, sourceType: "SUPPLIER_RETURN", sourceId: supplierReturn.id, documentNo: supplierReturn.number, narration: "Supplier return", debit: 0, credit: 20 },
    ] });
  }, 60_000);

  afterAll(async () => {
    if (!db) return;
    if (workspaceId) await db.workspace.delete({ where: { id: workspaceId } });
    if (userId) await db.user.deleteMany({ where: { id: userId } });
    await db.$disconnect();
  }, 60_000);

  it("restores stock, payable, PO balance and GL while preserving the original return", async () => {
    const result = await cancelSupplierReturn({ workspaceId, role: "OWNER", userId }, supplierReturnId, "Return entered by mistake");
    expect(result.alreadyCancelled).toBe(false);

    const [supplierReturn, supplier, purchase, product, movements, ledgerRows, glRows] = await Promise.all([
      db.supplierReturn.findUniqueOrThrow({ where: { id: supplierReturnId } }),
      db.supplier.findUniqueOrThrow({ where: { id: supplierId } }),
      db.purchaseOrder.findUniqueOrThrow({ where: { id: purchaseOrderId } }),
      db.product.findUniqueOrThrow({ where: { id: productId } }),
      db.inventoryTransaction.findMany({ where: { workspaceId, productId }, orderBy: { createdAt: "asc" } }),
      db.ledgerEntry.findMany({ where: { workspaceId, supplierId }, orderBy: { createdAt: "asc" } }),
      db.generalLedgerEntry.findMany({ where: { workspaceId, OR: [{ sourceId: supplierReturnId }, { reversalOfId: { not: null } }] } }),
    ]);

    expect(supplierReturn.status).toBe("CANCELLED");
    expect(supplierReturn.notes).toContain("Cancellation reason: Return entered by mistake");
    expect(Number(supplier.currentBalance)).toBe(100);
    expect(Number(purchase.balanceAmount)).toBe(100);
    expect(Number(product.stockQuantity)).toBe(10);
    expect(Number(product.costPrice)).toBe(10);
    expect(movements.some((row) => row.type === "ADJUSTMENT" && Number(row.quantityChanged) === 2 && row.reference === `REV-${supplierReturn.number}`)).toBe(true);
    expect(ledgerRows.some((row) => row.type === "REVERSAL" && Number(row.credit) === 20)).toBe(true);

    const debit = glRows.reduce((sum, row) => sum + Number(row.debit), 0);
    const credit = glRows.reduce((sum, row) => sum + Number(row.credit), 0);
    expect(debit).toBe(credit);
    expect(glRows.filter((row) => row.reversalOfId)).toHaveLength(2);

    const repeated = await cancelSupplierReturn({ workspaceId, role: "OWNER", userId }, supplierReturnId, "Return entered by mistake");
    expect(repeated).toEqual({ id: supplierReturnId, alreadyCancelled: true });
  }, 60_000);
});
