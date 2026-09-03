import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

let db: typeof import("@/lib/server/db")["db"];
let createSupplier: typeof import("@/lib/server/suppliers")["createSupplier"];
let ensureDefaultAccounts: typeof import("@/lib/server/accounting")["ensureDefaultAccounts"];

const runId = randomUUID();
let userId = "";
let workspaceId = "";

describe("supplier opening balance", () => {
  beforeAll(async () => {
    const { config } = await import("dotenv");
    config({ path: ".env.local", quiet: true });
    ({ db } = await import("@/lib/server/db"));
    ({ createSupplier } = await import("@/lib/server/suppliers"));
    ({ ensureDefaultAccounts } = await import("@/lib/server/accounting"));

    await db.workspace.deleteMany({ where: { name: { startsWith: "Supplier Opening " } } });
    await db.user.deleteMany({ where: { clerkId: { startsWith: "supplier-opening-" }, memberships: { none: {} } } });
    const user = await db.user.create({ data: { clerkId: `supplier-opening-${runId}`, email: `supplier-opening-${runId}@example.invalid` } });
    userId = user.id;
    const workspace = await db.workspace.create({ data: { name: `Supplier Opening ${runId}`, members: { create: { userId, role: "OWNER" } } } });
    workspaceId = workspace.id;
    await ensureDefaultAccounts(workspaceId);
  }, 120_000);

  afterAll(async () => {
    if (!db || !workspaceId) return;
    await db.auditLog.deleteMany({ where: { workspaceId } });
    await db.generalLedgerEntry.deleteMany({ where: { workspaceId } });
    await db.ledgerEntry.deleteMany({ where: { workspaceId } });
    await db.supplier.deleteMany({ where: { workspaceId } });
    await db.workspace.delete({ where: { id: workspaceId } });
    await db.user.delete({ where: { id: userId } });
    await db.$disconnect();
  }, 120_000);

  it("creates the payable, balanced GL entry, and attributed audit event", async () => {
    const supplier = await createSupplier({ workspaceId, userId, role: "OWNER" }, {
      name: "Opening Supplier",
      companyName: "",
      phone: "",
      email: "",
      address: "",
      city: "",
      notes: "",
      openingBalance: 1250.5,
    });

    expect(supplier.currentBalance.toString()).toBe("1250.5");

    const ledger = await db.ledgerEntry.findFirst({ where: { workspaceId, supplierId: supplier.id, type: "OPENING_BALANCE" } });
    expect(ledger?.debit.toString()).toBe("0");
    expect(ledger?.credit.toString()).toBe("1250.5");

    const gl = await db.generalLedgerEntry.findMany({ where: { workspaceId, sourceId: supplier.id }, include: { account: true } });
    expect(gl).toHaveLength(2);
    expect(gl.find((entry) => entry.account.systemCode === "OWNER_EQUITY")?.debit.toString()).toBe("1250.5");
    expect(gl.find((entry) => entry.account.systemCode === "ACCOUNTS_PAYABLE")?.credit.toString()).toBe("1250.5");

    const audit = await db.auditLog.findFirst({ where: { workspaceId, entityId: supplier.id, action: "supplier.created" } });
    expect(audit?.actorId).toBe(userId);
    expect(audit?.metadata).toMatchObject({ openingBalance: "1250.5" });
  });
});
