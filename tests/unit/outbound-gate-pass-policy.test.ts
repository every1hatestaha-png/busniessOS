import { describe, expect, it } from "vitest";

import {
  assertOutboundGatePassActionAllowed,
  assertOutboundInvoiceEligibility,
  decideOutboundReceiving,
} from "@/lib/delivery-acceptance/policy";

const full = [{ lineId: "one", dispatchedQuantity: "12", acceptedQuantity: "12", rejectedQuantity: "0" }];

describe("outbound gate pass before commercial invoice policy", () => {
  it("requires gate pass issuance and dispatch before receiving", () => {
    expect(() => assertOutboundGatePassActionAllowed("DRAFT", "ISSUE")).not.toThrow();
    expect(() => assertOutboundGatePassActionAllowed("ISSUED", "MARK_DISPATCHED")).not.toThrow();
    expect(() => assertOutboundGatePassActionAllowed("DRAFT", "ISSUE_INVOICE")).toThrow();
    expect(() => assertOutboundGatePassActionAllowed("IN_TRANSIT", "ISSUE_INVOICE")).toThrow();
    expect(() => assertOutboundGatePassActionAllowed("INVOICED", "ISSUE_INVOICE")).toThrow();
    expect(() => assertOutboundGatePassActionAllowed("IN_TRANSIT", "CANCEL")).toThrow();
  });

  it("requires all dispatched units to be accounted for, including partial receiving", () => {
    const result = decideOutboundReceiving([
      { lineId: "one", dispatchedQuantity: "12.2500", acceptedQuantity: "10.5", rejectedQuantity: "1.25" },
    ]);
    expect(result).toMatchObject({
      status: "RECEIVING_PENDING",
      outstandingQuantity: "0.5000",
      canIssueCommercialInvoice: false,
    });
  });

  it("allows invoice preparation only for accepted quantities after complete reconciliation", () => {
    const decision = decideOutboundReceiving([
      { lineId: "one", dispatchedQuantity: "10", acceptedQuantity: "8", rejectedQuantity: "2" },
      { lineId: "two", dispatchedQuantity: "5", acceptedQuantity: "5", rejectedQuantity: "0" },
    ]);
    expect(decision).toMatchObject({
      status: "PARTIALLY_ACCEPTED",
      acceptedQuantity: "13.0000",
      rejectedQuantity: "2.0000",
      outstandingQuantity: "0.0000",
      canIssueCommercialInvoice: true,
    });
    expect(() => assertOutboundInvoiceEligibility({
      status: decision.status,
      decision,
      customerReceivingEvidenceRecorded: true,
      invoiceAlreadyExists: false,
      complianceReviewed: true,
    })).not.toThrow();
  });

  it("never prepares an invoice for a fully rejected delivery", () => {
    const rejected = decideOutboundReceiving([
      { lineId: "one", dispatchedQuantity: "4", acceptedQuantity: "0", rejectedQuantity: "4" },
    ]);
    expect(rejected.status).toBe("REJECTED");
    expect(rejected.canIssueCommercialInvoice).toBe(false);
    expect(() => assertOutboundGatePassActionAllowed("REJECTED", "ISSUE_INVOICE")).toThrow();
  });

  it("rejects over-receipt, duplicate lines, invalid decimal precision and negative quantities", () => {
    expect(() => decideOutboundReceiving([
      { lineId: "one", dispatchedQuantity: "5", acceptedQuantity: "4", rejectedQuantity: "2" },
    ])).toThrow();
    expect(() => decideOutboundReceiving([full[0]!, full[0]!])).toThrow();
    expect(() => decideOutboundReceiving([
      { lineId: "one", dispatchedQuantity: "5.12345", acceptedQuantity: "0", rejectedQuantity: "0" },
    ])).toThrow();
    expect(() => decideOutboundReceiving([
      { lineId: "one", dispatchedQuantity: "5", acceptedQuantity: "-1", rejectedQuantity: "0" },
    ])).toThrow();
    expect(() => decideOutboundReceiving([])).toThrow();
  });

  it("blocks duplicate invoice, missing receiving evidence, and tax-compliance bypass", () => {
    const decision = decideOutboundReceiving(full);
    const base = { status: "ACCEPTED" as const, decision, customerReceivingEvidenceRecorded: true, invoiceAlreadyExists: false, complianceReviewed: true };
    expect(() => assertOutboundInvoiceEligibility({ ...base, invoiceAlreadyExists: true })).toThrow();
    expect(() => assertOutboundInvoiceEligibility({ ...base, customerReceivingEvidenceRecorded: false })).toThrow();
    expect(() => assertOutboundInvoiceEligibility({ ...base, complianceReviewed: false })).toThrow();
  });
});
