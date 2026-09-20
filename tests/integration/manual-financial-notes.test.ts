import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

let db: typeof import("@/lib/server/db")["db"];
let ensureDefaultAccounts: typeof import("@/lib/server/accounting")["ensureDefaultAccounts"];
let createManualCustomerCreditNote: typeof import("@/lib/server/manual-notes")["createManualCustomerCreditNote"];
let createManualSupplierDebitNote: typeof import("@/lib/server/manual-notes")["createManualSupplierDebitNote"];
let cancelManualCustomerCreditNote: typeof import("@/lib/server/manual-notes")["cancelManualCustomerCreditNote"];
let cancelManualSupplierDebitNote: typeof import("@/lib/server/manual-notes")["cancelManualSupplierDebitNote"];

const runId = randomUUID();
let userId = "";
let workspaceId = "";
let customerId = "";
let supplierId = "";
let purchaseOrderId = "";

const context = () => ({ workspaceId, role: "OWNER" as const, userId });

async function glBalance(sourceId: string) {
  const rows = await db.generalLedgerEntry.findMany({ where: { workspaceId, sourceId } });
  const debit = rows.reduce((sum, row) => sum + Number(row.debit), 0);
  const credit = rows.reduce((sum, row) => sum + Number(row.credit), 0);
  return { debit, credit };
}

describe("manual financial notes", () => {
  beforeAll(async () => {
    const { config } = await import("dotenv");
    config({ path: ".env.local", quiet: true });
    ({ db } = await import("@/lib/server/db"));
    ({ ensureDefaultAccounts } = await import("@/lib/server/accounting"));
    ({
      createManualCustomerCreditNote,
      createManualSupplierDebitNote,
      cancelManualCustomerCreditNote,
      cancelManualSupplierDebitNote,
    } = await import("@/lib/server/manual-notes"));

    const user = await db.user.create({ data: { clerkId: `manual-notes-${runId}`, email: `manual-notes-${runId}@example.invalid` } });
    userId = user.id;
    const workspace = await db.workspace.create({
      data: { name: `Manual Notes ${runId}`, members: { create: { userId, role: "OWNER" } } },
    });
    workspaceId = workspace.id;
    const customer = await db.customer.create({ data: { workspaceId, name: "Manual Credit Customer", currentBalance: 1000 } });
    const supplier = await db.supplier.create({ data: { workspaceId, name: "Manual Debit Supplier", currentBalance: 1000 } });
    customerId = customer.id;
    supplierId = supplier.id;
    const po = await db.purchaseOrder.create({
      data: { workspaceId, supplierId, orderNumber: `PO-MANUAL-${runId}`, status: "PARTIALLY_RECEIVED", totalAmount: 600, balanceAmount: 600 },
    });
    purchaseOrderId = po.id;
    await ensureDefaultAccounts(workspaceId);
  }, 60_000);

  afterAll(async () => {
    if (!db) return;
    await db.auditLog.deleteMany({ where: { workspaceId } });
    await db.generalLedgerEntry.deleteMany({ where: { workspaceId } });
    await db.ledgerEntry.deleteMany({ where: { workspaceId } });
    await db.customerCreditAllocation.deleteMany({ where: { workspaceId } });
    await db.creditNote.deleteMany({ where: { workspaceId } });
    await db.debitNote.deleteMany({ where: { workspaceId } });
    await db.purchaseOrder.deleteMany({ where: { workspaceId } });
    await db.cashBankAccount.deleteMany({ where: { workspaceId } });
    await db.account.deleteMany({ where: { workspaceId } });
    await db.customer.deleteMany({ where: { workspaceId } });
    await db.supplier.deleteMany({ where: { workspaceId } });
    await db.workspace.delete({ where: { id: workspaceId } });
    await db.user.delete({ where: { id: userId } });
    await db.$disconnect();
  }, 60_000);

  it("creates an auditable customer credit note and reverses it without deletion", async () => {
    const key = randomUUID();
    const note = await createManualCustomerCreditNote(context(), {
      customerId,
      amount: 250,
      reason: "Volume rebate",
      reference: "REBATE-01",
      notes: "Quarterly adjustment",
      idempotencyKey: key,
    });
    const replay = await createManualCustomerCreditNote(context(), {
      customerId,
      amount: 250,
      reason: "Volume rebate",
      reference: "REBATE-01",
      notes: "Quarterly adjustment",
      idempotencyKey: key,
    });
    expect(replay.id).toBe(note.id);
    await expect(createManualCustomerCreditNote(context(), {
      customerId,
      amount: 200,
      reason: "Changed request",
      reference: "REBATE-01",
      notes: "",
      idempotencyKey: key,
    })).rejects.toThrow("idempotency key was already used");

    const [customer, saved, ledger, audit] = await Promise.all([
      db.customer.findUniqueOrThrow({ where: { id: customerId } }),
      db.creditNote.findUniqueOrThrow({ where: { id: note.id } }),
      db.ledgerEntry.findFirstOrThrow({ where: { workspaceId, referenceId: note.id, type: "CREDIT_NOTE" } }),
      db.auditLog.findFirstOrThrow({ where: { workspaceId, entityId: note.id, action: "customer_credit_note.created" } }),
    ]);
    expect(Number(customer.currentBalance)).toBe(750);
    expect(saved.status).toBe("OPEN");
    expect(Number(saved.remainingAmount)).toBe(250);
    expect(Number(ledger.credit)).toBe(250);
    expect(audit.actorId).toBe(userId);
    expect(await glBalance(note.id)).toEqual({ debit: 250, credit: 250 });

    await cancelManualCustomerCreditNote(context(), note.id, "Rebate entered in error");
    const [restored, cancelled, reversal] = await Promise.all([
      db.customer.findUniqueOrThrow({ where: { id: customerId } }),
      db.creditNote.findUniqueOrThrow({ where: { id: note.id } }),
      db.ledgerEntry.findFirstOrThrow({ where: { workspaceId, referenceId: note.id, type: "REVERSAL" } }),
    ]);
    expect(Number(restored.currentBalance)).toBe(1000);
    expect(cancelled.status).toBe("CANCELLED");
    expect(Number(reversal.debit)).toBe(250);
    expect(await glBalance(note.id)).toEqual({ debit: 500, credit: 500 });
  }, 60_000);

  it("creates a supplier debit note linked to a PO and restores both balances on cancellation", async () => {
    const key = randomUUID();
    const note = await createManualSupplierDebitNote(context(), {
      supplierId,
      purchaseOrderId,
      amount: 150,
      reason: "Supplier rate rebate",
      reference: "SUP-REBATE-01",
      notes: "Agreed after invoice",
      idempotencyKey: key,
    });

    const [supplier, po, saved, ledger, audit] = await Promise.all([
      db.supplier.findUniqueOrThrow({ where: { id: supplierId } }),
      db.purchaseOrder.findUniqueOrThrow({ where: { id: purchaseOrderId } }),
      db.debitNote.findUniqueOrThrow({ where: { id: note.id } }),
      db.ledgerEntry.findFirstOrThrow({ where: { workspaceId, referenceId: note.id, type: "DEBIT_NOTE" } }),
      db.auditLog.findFirstOrThrow({ where: { workspaceId, entityId: note.id, action: "supplier_debit_note.created" } }),
    ]);
    expect(Number(supplier.currentBalance)).toBe(850);
    expect(Number(po.balanceAmount)).toBe(450);
    expect(saved.status).toBe("OPEN");
    expect(Number(ledger.debit)).toBe(150);
    expect(audit.actorId).toBe(userId);
    expect(await glBalance(note.id)).toEqual({ debit: 150, credit: 150 });

    await cancelManualSupplierDebitNote(context(), note.id, "Supplier withdrew rebate");
    const [restoredSupplier, restoredPo, cancelled, reversal] = await Promise.all([
      db.supplier.findUniqueOrThrow({ where: { id: supplierId } }),
      db.purchaseOrder.findUniqueOrThrow({ where: { id: purchaseOrderId } }),
      db.debitNote.findUniqueOrThrow({ where: { id: note.id } }),
      db.ledgerEntry.findFirstOrThrow({ where: { workspaceId, referenceId: note.id, type: "REVERSAL" } }),
    ]);
    expect(Number(restoredSupplier.currentBalance)).toBe(1000);
    expect(Number(restoredPo.balanceAmount)).toBe(600);
    expect(cancelled.status).toBe("CANCELLED");
    expect(Number(reversal.credit)).toBe(150);
    expect(await glBalance(note.id)).toEqual({ debit: 300, credit: 300 });
  }, 60_000);
});
