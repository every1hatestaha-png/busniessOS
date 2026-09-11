/**
 * Database helpers for finance-grade QA tests.
 * Provides isolated workspace setup, teardown, and verification queries.
 */

import { Prisma, type GeneralLedgerSourceType, type Role } from "@prisma/client";

type PrismaClient = typeof import("@/lib/server/db")["db"];

let _db: PrismaClient | null = null;

export async function getDb(): Promise<PrismaClient> {
  if (!_db) {
    const { config } = await import("dotenv");
    config({ path: ".env.local", quiet: true });
    const { db } = await import("@/lib/server/db");
    _db = db;
  }
  return _db;
}

export async function getServiceContext(workspaceId: string, userId: string, role: Role = "OWNER") {
  return { workspaceId, userId, role };
}

/** Create an isolated test workspace with a user. */
export async function createTestWorkspace(label: string) {
  const db = await getDb();
  const runId = `${label}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const user = await db.user.create({
    data: { clerkId: `qa-${runId}`, email: `qa-${runId}@test.invalid` },
  });
  const workspace = await db.workspace.create({
    data: {
      name: `QA ${label} ${runId}`,
      currency: "PKR",
      members: { create: { userId: user.id, role: "OWNER" } },
    },
  });
  return { userId: user.id, workspaceId: workspace.id, runId };
}

/** Tear down a test workspace and all its data. */
export async function teardownTestWorkspace(workspaceId: string, userId: string) {
  const db = await getDb();
  // Delete in dependency order
  await db.auditLog.deleteMany({ where: { workspaceId } });
  await db.generalLedgerEntry.deleteMany({ where: { workspaceId } });
  await db.customerCreditAllocation.deleteMany({ where: { workspaceId } });
  await db.creditNote.deleteMany({ where: { workspaceId } });
  await db.debitNote.deleteMany({ where: { workspaceId } });
  await db.supplierReturnItem.deleteMany({ where: { supplierReturn: { workspaceId } } });
  await db.supplierReturn.deleteMany({ where: { workspaceId } });
  await db.customerReturnItem.deleteMany({ where: { customerReturn: { workspaceId } } });
  await db.customerReturn.deleteMany({ where: { workspaceId } });
  await db.paymentAllocation.deleteMany({ where: { workspaceId } });
  await db.payment.deleteMany({ where: { workspaceId } });
  await db.goodReceivedNoteItem.deleteMany({ where: { goodReceivedNote: { workspaceId } } });
  await db.goodReceivedNote.deleteMany({ where: { workspaceId } });
  await db.invoice.deleteMany({ where: { workspaceId } });
  await db.salesOrderItem.deleteMany({ where: { salesOrder: { workspaceId } } });
  await db.salesOrder.deleteMany({ where: { workspaceId } });
  await db.purchaseOrderItem.deleteMany({ where: { purchaseOrder: { workspaceId } } });
  await db.purchaseOrder.deleteMany({ where: { workspaceId } });
  await db.expense.deleteMany({ where: { workspaceId } });
  await db.inventoryTransaction.deleteMany({ where: { workspaceId } });
  await db.ledgerEntry.deleteMany({ where: { workspaceId } });
  await db.documentSequence.deleteMany({ where: { workspaceId } });
  await db.product.deleteMany({ where: { workspaceId } });
  await db.supplier.deleteMany({ where: { workspaceId } });
  await db.customer.deleteMany({ where: { workspaceId } });
  await db.cashBankAccount.deleteMany({ where: { workspaceId } });
  await db.account.deleteMany({ where: { workspaceId } });
  await db.workspaceInvitation.deleteMany({ where: { workspaceId } });
  await db.workspaceMember.deleteMany({ where: { workspaceId } });
  await db.workspace.delete({ where: { id: workspaceId } }).catch(() => {});
  await db.user.delete({ where: { id: userId } }).catch(() => {});
}

/** Get actual GL entries for a source document. */
export async function getGLEntries(workspaceId: string, sourceType: GeneralLedgerSourceType, sourceId: string) {
  const db = await getDb();
  return db.generalLedgerEntry.findMany({
    where: { workspaceId, sourceType, sourceId },
    orderBy: [{ date: "asc" }, { createdAt: "asc" }],
  });
}

/** Get all GL entries for a workspace. */
export async function getAllGLEntries(workspaceId: string) {
  const db = await getDb();
  return db.generalLedgerEntry.findMany({
    where: { workspaceId },
    orderBy: [{ date: "asc" }, { createdAt: "asc" }, { id: "asc" }],
    include: { account: { select: { code: true, name: true, category: true, normalBalance: true } } },
  });
}

/** Verify GL is balanced for a workspace. */
export async function verifyGLBalanced(workspaceId: string): Promise<{ balanced: boolean; totalDebit: number; totalCredit: number }> {
  const db = await getDb();
  const result = await db.generalLedgerEntry.aggregate({
    where: { workspaceId },
    _sum: { debit: true, credit: true },
  });
  const totalDebit = Number(result._sum.debit ?? 0);
  const totalCredit = Number(result._sum.credit ?? 0);
  return {
    balanced: Math.abs(totalDebit - totalCredit) < 0.001,
    totalDebit,
    totalCredit,
  };
}

/** Get actual customer balance from DB. */
export async function getCustomerBalance(workspaceId: string, customerId: string): Promise<number> {
  const db = await getDb();
  const customer = await db.customer.findFirstOrThrow({
    where: { id: customerId, workspaceId },
    select: { currentBalance: true },
  });
  return Number(customer.currentBalance);
}

/** Get actual supplier balance from DB. */
export async function getSupplierBalance(workspaceId: string, supplierId: string): Promise<number> {
  const db = await getDb();
  const supplier = await db.supplier.findFirstOrThrow({
    where: { id: supplierId, workspaceId },
    select: { currentBalance: true },
  });
  return Number(supplier.currentBalance);
}

/** Get actual product stock from DB. */
export async function getProductStock(workspaceId: string, productId: string): Promise<number> {
  const db = await getDb();
  const product = await db.product.findFirstOrThrow({
    where: { id: productId, workspaceId },
    select: { stockQuantity: true },
  });
  return Number(product.stockQuantity);
}

/** Get actual product cost price from DB. */
export async function getProductCostPrice(workspaceId: string, productId: string): Promise<number> {
  const db = await getDb();
  const product = await db.product.findFirstOrThrow({
    where: { id: productId, workspaceId },
    select: { costPrice: true },
  });
  return Number(product.costPrice);
}

/** Get actual cash/bank balance from DB. */
export async function getCashBankBalance(workspaceId: string, cashBankAccountId: string): Promise<number> {
  const db = await getDb();
  const account = await db.cashBankAccount.findFirstOrThrow({
    where: { id: cashBankAccountId, workspaceId },
    select: { currentBalance: true },
  });
  return Number(account.currentBalance);
}

/** Get inventory transaction count for a reference. */
export async function getInventoryTransactions(workspaceId: string, productId: string, reference?: string) {
  const db = await getDb();
  const where: any = { workspaceId, productId };
  if (reference) where.reference = reference;
  return db.inventoryTransaction.findMany({ where, orderBy: { createdAt: "asc" } });
}

/** Get ledger entries for a customer. */
export async function getCustomerLedgerEntries(workspaceId: string, customerId: string) {
  const db = await getDb();
  return db.ledgerEntry.findMany({
    where: { workspaceId, customerId },
    orderBy: [{ date: "asc" }, { createdAt: "asc" }],
  });
}

/** Get ledger entries for a supplier. */
export async function getSupplierLedgerEntries(workspaceId: string, supplierId: string) {
  const db = await getDb();
  return db.ledgerEntry.findMany({
    where: { workspaceId, supplierId },
    orderBy: [{ date: "asc" }, { createdAt: "asc" }],
  });
}

/** Verify no orphan GL entries exist. */
export async function verifyNoOrphanGLEntries(workspaceId: string): Promise<string[]> {
  const db = await getDb();
  const issues: string[] = [];
  const entries = await db.generalLedgerEntry.findMany({
    where: { workspaceId },
    select: { id: true, sourceType: true, sourceId: true, documentNo: true },
  });
  for (const entry of entries) {
    switch (entry.sourceType) {
      case "SALE": {
        const exists = await db.salesOrder.findFirst({ where: { id: entry.sourceId, workspaceId }, select: { id: true } });
        if (!exists) issues.push(`Orphan GL entry ${entry.id}: SALE ${entry.sourceId} not found`);
        break;
      }
      case "PURCHASE": {
        const exists = await db.purchaseOrder.findFirst({ where: { id: entry.sourceId, workspaceId }, select: { id: true } });
        if (!exists) issues.push(`Orphan GL entry ${entry.id}: PURCHASE ${entry.sourceId} not found`);
        break;
      }
      case "RECEIPT": {
        const exists = await db.payment.findFirst({ where: { id: entry.sourceId, workspaceId }, select: { id: true } });
        if (!exists) issues.push(`Orphan GL entry ${entry.id}: RECEIPT ${entry.sourceId} not found`);
        break;
      }
      case "PAYMENT": {
        const exists = await db.payment.findFirst({ where: { id: entry.sourceId, workspaceId }, select: { id: true } });
        if (!exists) issues.push(`Orphan GL entry ${entry.id}: PAYMENT ${entry.sourceId} not found`);
        break;
      }
      case "PURCHASE_RECEIPT": {
        const exists = await db.goodReceivedNote.findFirst({ where: { id: entry.sourceId, workspaceId }, select: { id: true } });
        if (!exists) issues.push(`Orphan GL entry ${entry.id}: PURCHASE_RECEIPT ${entry.sourceId} not found`);
        break;
      }
      case "EXPENSE": {
        const exists = await db.expense.findFirst({ where: { id: entry.sourceId, workspaceId }, select: { id: true } });
        if (!exists) issues.push(`Orphan GL entry ${entry.id}: EXPENSE ${entry.sourceId} not found`);
        break;
      }
      case "CUSTOMER_RETURN": {
        const exists = await db.customerReturn.findFirst({ where: { id: entry.sourceId, workspaceId }, select: { id: true } });
        if (!exists) issues.push(`Orphan GL entry ${entry.id}: CUSTOMER_RETURN ${entry.sourceId} not found`);
        break;
      }
      case "SUPPLIER_RETURN": {
        const exists = await db.supplierReturn.findFirst({ where: { id: entry.sourceId, workspaceId }, select: { id: true } });
        if (!exists) issues.push(`Orphan GL entry ${entry.id}: SUPPLIER_RETURN ${entry.sourceId} not found`);
        break;
      }
      case "ADJUSTMENT": {
        // Adjustments reference account IDs, not documents — acceptable
        break;
      }
      case "REVERSAL": {
        // Reversals reference original entry IDs — check reversalOfId
        break;
      }
    }
  }
  return issues;
}
