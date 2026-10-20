import { afterEach, describe, expect, it, vi } from "vitest";
import { ownerBillingDeclarationSchema } from "@/lib/delivery-acceptance/owner-billing-declaration";
import { readOwnerBillingDeclaration } from "@/lib/server/outbound-gate-pass-billing-authorization";

const workspaceId = "4bc313cf-2869-4d87-8f1e-22a147f18d2d";
const createdAt = new Date("2026-10-18T10:00:00.000Z");
const gp = { id: "synthetic-gp", workspaceId, customerId: "synthetic-customer", createdAt, status: "ISSUED", version: 1, issueStockDeductedAt: createdAt };
const declaration = { draftVersion: 0, reference: "SYNTHETIC-CONTRACT-ONLY", basis: "Synthetic test-only factual tax position and customer delivery terms; not a real approval.", taxTimingAssessed: true, noEarlierInvoiceObligation: true, responsibilityAcknowledged: true };
const metadata = { ...declaration, version: 1, kind: "OWNER_DECLARATION_NOT_INDEPENDENT_CLEARANCE", actorRole: "OWNER", customerId: gp.customerId, gatePassCreatedAt: createdAt.toISOString() };
afterEach(() => vi.unstubAllEnvs());
function enable() {
  vi.stubEnv("OUTBOUND_GP_OWNER_ATTESTATION_ENABLED", "true");
  vi.stubEnv("OUTBOUND_GATE_PASS_V1_ENABLED", "true");
  vi.stubEnv("OUTBOUND_GATE_PASS_V1_WORKSPACE_ID", workspaceId);
}
describe("explicit owner declaration without fictitious professional certification", () => {
  it("requires a concrete reference, substantive basis and every express acknowledgement", () => {
    expect(ownerBillingDeclarationSchema.parse(declaration)).toEqual(declaration);
    for (const key of ["taxTimingAssessed", "noEarlierInvoiceObligation", "responsibilityAcknowledged"]) {
      expect(ownerBillingDeclarationSchema.safeParse({ ...declaration, [key]: false }).success).toBe(false);
      expect(ownerBillingDeclarationSchema.safeParse({ ...declaration, [key]: undefined }).success).toBe(false);
    }
    expect(ownerBillingDeclarationSchema.safeParse({ ...declaration, reference: " " }).success).toBe(false);
    expect(ownerBillingDeclarationSchema.safeParse({ ...declaration, basis: "owner approved" }).success).toBe(false);
  });
  it("uses an actor-bound, exact-document audit record and preserves its honest classification", async () => {
    enable();
    const findFirst = vi.fn().mockResolvedValue({ actorId: "owner-id", createdAt, metadata });
    expect(await readOwnerBillingDeclaration({ auditLog: { findFirst } } as never, gp)).toMatchObject({ actorId: "owner-id", kind: "OWNER_DECLARATION_NOT_INDEPENDENT_CLEARANCE" });
    expect(findFirst.mock.calls[0]![0].where).toMatchObject({ workspaceId, entityId: gp.id, action: "gate_pass.owner_billing_declared" });
  });
  it.each([
    { actorId: null, createdAt, metadata },
    { actorId: "owner-id", createdAt: new Date("2000-01-01"), metadata },
    { actorId: "owner-id", createdAt, metadata: { ...metadata, customerId: "different-customer" } },
    { actorId: "owner-id", createdAt, metadata: { ...metadata, gatePassCreatedAt: "2000-01-01T00:00:00.000Z" } },
    { actorId: "owner-id", createdAt, metadata: { ...metadata, kind: "INDEPENDENT_LEGAL_CLEARANCE" } },
    { actorId: "owner-id", createdAt, metadata: { ...metadata, actorRole: "ADMIN" } },
  ])("rejects missing, mismatched or mislabelled evidence %#", async row => {
    enable();
    expect(await readOwnerBillingDeclaration({ auditLog: { findFirst: vi.fn().mockResolvedValue(row) } } as never, gp)).toBeNull();
  });
  it("reads a signed historical dispatch declaration only with explicit legacy opt-in", async () => {
    enable();
    vi.stubEnv("OUTBOUND_GP_ISSUE_STOCK_V2_ENABLED", "true");
    vi.stubEnv("OUTBOUND_GP_ISSUE_STOCK_V2_CUTOVER_AT", "2099-01-01T00:00:00.000Z");
    const legacyGp = { ...gp, issueStockDeductedAt: null, status: "IN_TRANSIT" };
    const findFirst = vi.fn().mockResolvedValue({ actorId: "owner-id", createdAt, metadata });
    const db = { auditLog: { findFirst } } as never;
    expect(await readOwnerBillingDeclaration(db, legacyGp)).toBeNull();
    vi.stubEnv("OUTBOUND_GP_LEGACY_OWNER_DISPATCH_ENABLED", "true");
    expect(await readOwnerBillingDeclaration(db, legacyGp)).toMatchObject({ actorId: "owner-id", kind: "OWNER_DECLARATION_NOT_INDEPENDENT_CLEARANCE" });
    expect(findFirst).toHaveBeenCalledTimes(1);
    expect(await readOwnerBillingDeclaration(db, { ...legacyGp, workspaceId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" })).toBeNull();
  });
  it("never widens other tenants, historical documents or a disabled opt-in", async () => {
    enable(); const findFirst = vi.fn(); const db = { auditLog: { findFirst } } as never;
    expect(await readOwnerBillingDeclaration(db, { ...gp, workspaceId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" })).toBeNull();
    vi.stubEnv("OUTBOUND_GP_ISSUE_STOCK_V2_ENABLED", "true");
    vi.stubEnv("OUTBOUND_GP_ISSUE_STOCK_V2_CUTOVER_AT", "2099-01-01T00:00:00.000Z");
    expect(await readOwnerBillingDeclaration(db, { ...gp, issueStockDeductedAt: null })).toBeNull();
    vi.stubEnv("OUTBOUND_GP_LEGACY_OWNER_DISPATCH_ENABLED", "false");
    vi.stubEnv("OUTBOUND_GP_OWNER_ATTESTATION_ENABLED", "false");
    expect(await readOwnerBillingDeclaration(db, gp)).toBeNull();
    expect(findFirst).not.toHaveBeenCalled();
  });
});
