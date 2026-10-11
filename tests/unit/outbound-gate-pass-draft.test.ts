import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { outboundGatePassDraftSchema } from "@/lib/delivery-acceptance/draft-validation";

const customerId = "11111111-1111-4111-8111-111111111111";
const productId = "22222222-2222-4222-8222-222222222222";
const productTwo = "33333333-3333-4333-8333-333333333333";
const warehouseId = "44444444-4444-4444-8444-444444444444";
const key = "55555555-5555-4555-8555-555555555555";

const draft = {
  customerId,
  warehouseId,
  date: "2026-10-11",
  deliveryAddress: "Receiving warehouse",
  notes: "Gate pass ahead of invoice",
  idempotencyKey: key,
  items: [{ productId, quantity: "1.2500" }, { productId: productTwo, quantity: "2" }],
};

describe("outbound gate pass draft safety", () => {
  it("accepts a valid draft with precise fractional quantities", () => {
    expect(outboundGatePassDraftSchema.safeParse(draft).success).toBe(true);
  });

  it("accepts legacy warehouse mode with no warehouse ID", () => {
    expect(outboundGatePassDraftSchema.safeParse({ ...draft, warehouseId: "" }).success).toBe(true);
  });

  it("rejects duplicate products and invalid decimal quantities", () => {
    expect(outboundGatePassDraftSchema.safeParse({
      ...draft,
      items: [draft.items[0], draft.items[0]],
    }).success).toBe(false);
    for (const quantity of ["-1", "0", "1.00001", "NaN", "Infinity", "1e10", "01", "100000000000"]) {
      expect(outboundGatePassDraftSchema.safeParse({
        ...draft,
        items: [{ productId, quantity }],
      }).success).toBe(false);
    }
  });

  it("rejects missing customer, malformed date, arbitrary warehouse and replay key", () => {
    for (const patch of [
      { customerId: "bad" },
      { date: "2026-02-30" },
      { warehouseId: "foreign" },
      { idempotencyKey: "non-uuid" },
      { items: [] },
    ]) {
      expect(outboundGatePassDraftSchema.safeParse({ ...draft, ...patch }).success).toBe(false);
    }
  });

  it("does not post commercial sale, GL, payment or stock changes during draft capture", () => {
    const source = readFileSync("lib/server/outbound-gate-passes.ts", "utf8");
    for (const forbidden of [
      "tx.invoice.create(",
      "tx.salesOrder.create(",
      "tx.generalLedgerEntry.create(",
      "tx.ledgerEntry.create(",
      "tx.payment.create(",
      "tx.inventoryTransaction.create(",
      "tx.product.update(",
      "tx.product.updateMany(",
      "applyManagedWarehouseStockDelta(",
    ]) {
      expect(source).not.toContain(forbidden);
    }
  });

  it("keeps the feature opt-in", () => {
    const source = readFileSync("lib/server/outbound-gate-pass-feature.ts", "utf8");
    expect(source).toContain("OUTBOUND_GATE_PASS_V1_ENABLED");
    expect(source).toContain("OUTBOUND_GATE_PASS_V1_WORKSPACE_ID");
    expect(source).toContain("outboundGatePassWorkspaceAllowed");
  });
});
