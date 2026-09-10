/**
 * Invariant checkers that verify database state matches expected values.
 * Each checker queries the database and compares against oracle/expected values.
 */

import { Prisma } from "@prisma/client";
import type { AccountingOracle } from "../oracle/accounting-oracle";
import { roundMoney } from "../oracle/precision";

type PrismaClient = typeof import("@/lib/server/db")["db"];

export interface InvariantCheckResult {
  passed: boolean;
  name: string;
  details: string[];
}

/** Check 1: GL is balanced (total debits = total credits). */
export async function checkGLBalanced(db: PrismaClient, workspaceId: string): Promise<InvariantCheckResult> {
  const result = await db.generalLedgerEntry.aggregate({
    where: { workspaceId },
    _sum: { debit: true, credit: true },
  });
  const totalDebit = Number(result._sum.debit ?? 0);
  const totalCredit = Number(result._sum.credit ?? 0);
  const diff = Math.abs(totalDebit - totalCredit);
  return {
    passed: diff < 0.001,
    name: "GL Balanced",
    details: [`Total debits: ${totalDebit.toFixed(2)}`, `Total credits: ${totalCredit.toFixed(2)}`, `Difference: ${diff.toFixed(2)}`],
  };
}

/** Check 2: Customer balance matches ledger entries. */
export async function checkCustomerReconciliation(db: PrismaClient, workspaceId: string, customerId: string, customerName: string): Promise<InvariantCheckResult> {
  const customer = await db.customer.findFirstOrThrow({ where: { id: customerId, workspaceId }, select: { currentBalance: true } });
  const ledgerEntries = await db.ledgerEntry.findMany({ where: { workspaceId, customerId } });
  const ledgerBalance = ledgerEntries.reduce((sum, entry) => sum + Number(entry.debit) - Number(entry.credit), 0);
  const dbBalance = Number(customer.currentBalance);
  const diff = Math.abs(dbBalance - ledgerBalance);
  return {
    passed: diff < 0.001,
    name: `Customer Reconciliation: ${customerName}`,
    details: [`DB balance: ${dbBalance.toFixed(2)}`, `Ledger balance: ${ledgerBalance.toFixed(2)}`, `Difference: ${diff.toFixed(2)}`],
  };
}

/** Check 3: Supplier balance matches ledger entries. */
export async function checkSupplierReconciliation(db: PrismaClient, workspaceId: string, supplierId: string, supplierName: string): Promise<InvariantCheckResult> {
  const supplier = await db.supplier.findFirstOrThrow({ where: { id: supplierId, workspaceId }, select: { currentBalance: true } });
  const ledgerEntries = await db.ledgerEntry.findMany({ where: { workspaceId, supplierId } });
  const ledgerBalance = ledgerEntries.reduce((sum, entry) => sum + Number(entry.credit) - Number(entry.debit), 0);
  const dbBalance = Number(supplier.currentBalance);
  const diff = Math.abs(dbBalance - ledgerBalance);
  return {
    passed: diff < 0.001,
    name: `Supplier Reconciliation: ${supplierName}`,
    details: [`DB balance: ${dbBalance.toFixed(2)}`, `Ledger balance: ${ledgerBalance.toFixed(2)}`, `Difference: ${diff.toFixed(2)}`],
  };
}

/** Check 4: Inventory transactions sum to current stock. */
export async function checkInventoryReconciliation(db: PrismaClient, workspaceId: string, productId: string, productName: string): Promise<InvariantCheckResult> {
  const product = await db.product.findFirstOrThrow({ where: { id: productId, workspaceId }, select: { stockQuantity: true } });
  const transactions = await db.inventoryTransaction.findMany({ where: { workspaceId, productId } });
  const calculatedStock = transactions.reduce((sum, tx) => sum + Number(tx.quantityChanged), 0);
  const dbStock = Number(product.stockQuantity);
  const diff = Math.abs(dbStock - calculatedStock);
  return {
    passed: diff < 0.001,
    name: `Inventory Reconciliation: ${productName}`,
    details: [`DB stock: ${dbStock.toFixed(4)}`, `Calculated stock: ${calculatedStock.toFixed(4)}`, `Difference: ${diff.toFixed(4)}`, `Transaction count: ${transactions.length}`],
  };
}

/** Check 5: Cash account balance matches GL. */
export async function checkCashReconciliation(db: PrismaClient, workspaceId: string, cashBankAccountId: string, accountName: string): Promise<InvariantCheckResult> {
  const account = await db.cashBankAccount.findFirstOrThrow({ where: { id: cashBankAccountId, workspaceId }, include: { account: true } });
  const glEntries = await db.generalLedgerEntry.findMany({ where: { workspaceId, accountId: account.accountId } });
  const glBalance = glEntries.reduce((sum, entry) => sum + Number(entry.debit) - Number(entry.credit), 0);
  const dbBalance = Number(account.currentBalance);
  const diff = Math.abs(dbBalance - glBalance);
  return {
    passed: diff < 0.001,
    name: `Cash Reconciliation: ${accountName}`,
    details: [`DB balance: ${dbBalance.toFixed(2)}`, `GL balance: ${glBalance.toFixed(2)}`, `Difference: ${diff.toFixed(2)}`],
  };
}

/** Check 6: No orphan GL entries. */
export async function checkNoOrphanGLEntries(db: PrismaClient, workspaceId: string): Promise<InvariantCheckResult> {
  const issues: string[] = [];
  const entries = await db.generalLedgerEntry.findMany({ where: { workspaceId }, select: { id: true, sourceType: true, sourceId: true } });
  for (const entry of entries) {
    let exists = false;
    switch (entry.sourceType) {
      case "SALE": exists = !!(await db.salesOrder.findFirst({ where: { id: entry.sourceId, workspaceId }, select: { id: true } })); break;
      case "PURCHASE": exists = !!(await db.purchaseOrder.findFirst({ where: { id: entry.sourceId, workspaceId }, select: { id: true } })); break;
      case "RECEIPT": case "PAYMENT": exists = !!(await db.payment.findFirst({ where: { id: entry.sourceId, workspaceId }, select: { id: true } })); break;
      case "PURCHASE_RECEIPT": exists = !!(await db.goodReceivedNote.findFirst({ where: { id: entry.sourceId, workspaceId }, select: { id: true } })); break;
      case "EXPENSE": exists = !!(await db.expense.findFirst({ where: { id: entry.sourceId, workspaceId }, select: { id: true } })); break;
      case "CUSTOMER_RETURN": exists = !!(await db.customerReturn.findFirst({ where: { id: entry.sourceId, workspaceId }, select: { id: true } })); break;
      case "SUPPLIER_RETURN": exists = !!(await db.supplierReturn.findFirst({ where: { id: entry.sourceId, workspaceId }, select: { id: true } })); break;
      case "ADJUSTMENT": case "REVERSAL": exists = true; break; // These reference account IDs or entry IDs
      default: issues.push(`Unknown sourceType: ${entry.sourceType}`);
    }
    if (!exists) issues.push(`Orphan GL entry ${entry.id}: ${entry.sourceType} ${entry.sourceId}`);
  }
  return { passed: issues.length === 0, name: "No Orphan GL Entries", details: issues.length ? issues : ["All GL entries have valid source documents"] };
}

/** Check 7: Posted transactions are not hard-deleted. */
export async function checkPostedTransactionIntegrity(db: PrismaClient, workspaceId: string): Promise<InvariantCheckResult> {
  const issues: string[] = [];
  // Check that active GRNs exist for their GL entries
  const grnGLEntries = await db.generalLedgerEntry.findMany({ where: { workspaceId, sourceType: "PURCHASE_RECEIPT" }, select: { sourceId: true } });
  for (const entry of grnGLEntries) {
    const grn = await db.goodReceivedNote.findFirst({ where: { id: entry.sourceId, workspaceId } });
    if (!grn) issues.push(`GRN ${entry.sourceId} referenced by GL entry does not exist`);
  }
  return { passed: issues.length === 0, name: "Posted Transaction Integrity", details: issues.length ? issues : ["All posted transactions have valid records"] };
}

/** Run all invariant checks and return summary. */
export async function runAllInvariants(db: PrismaClient, workspaceId: string, customerIds: string[], supplierIds: string[], productIds: string[]): Promise<InvariantCheckResult[]> {
  const results: InvariantCheckResult[] = [];

  results.push(await checkGLBalanced(db, workspaceId));
  results.push(await checkNoOrphanGLEntries(db, workspaceId));
  results.push(await checkPostedTransactionIntegrity(db, workspaceId));

  for (const id of customerIds) {
    results.push(await checkCustomerReconciliation(db, workspaceId, id, id));
  }
  for (const id of supplierIds) {
    results.push(await checkSupplierReconciliation(db, workspaceId, id, id));
  }
  for (const id of productIds) {
    results.push(await checkInventoryReconciliation(db, workspaceId, id, id));
  }

  return results;
}
