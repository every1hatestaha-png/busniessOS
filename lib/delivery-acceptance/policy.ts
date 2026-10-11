import { Prisma } from "@prisma/client";

/**
 * Pure rules for the proposed outbound gate-pass / receiving workflow.
 *
 * This module deliberately has no database writes. A future service must enforce
 * these rules inside a serializable, workspace-scoped transaction.
 * Existing invoice-first sales must not call this module implicitly.
 */
export type OutboundGatePassStatus =
  | "DRAFT"
  | "ISSUED"
  | "IN_TRANSIT"
  | "RECEIVING_PENDING"
  | "ACCEPTED"
  | "PARTIALLY_ACCEPTED"
  | "REJECTED"
  | "INVOICED"
  | "CANCELLED";

export type OutboundGatePassAction =
  | "ISSUE"
  | "MARK_DISPATCHED"
  | "RECORD_RECEIVING"
  | "ISSUE_INVOICE"
  | "CANCEL";

const allowedFrom: Record<OutboundGatePassAction, readonly OutboundGatePassStatus[]> = {
  ISSUE: ["DRAFT"],
  MARK_DISPATCHED: ["ISSUED"],
  RECORD_RECEIVING: ["IN_TRANSIT", "RECEIVING_PENDING"],
  ISSUE_INVOICE: ["ACCEPTED", "PARTIALLY_ACCEPTED"],
  CANCEL: ["DRAFT", "ISSUED"],
};

export function assertOutboundGatePassActionAllowed(
  status: OutboundGatePassStatus,
  action: OutboundGatePassAction,
): void {
  if (!allowedFrom[action].includes(status)) {
    throw new Error("This gate pass action is not allowed in its current status.");
  }
}

export type OutboundReceivingLine = {
  lineId: string;
  dispatchedQuantity: string;
  acceptedQuantity: string;
  rejectedQuantity: string;
};

export type OutboundReceivingDecision = {
  status: "RECEIVING_PENDING" | "ACCEPTED" | "PARTIALLY_ACCEPTED" | "REJECTED";
  dispatchedQuantity: string;
  acceptedQuantity: string;
  rejectedQuantity: string;
  outstandingQuantity: string;
  canIssueCommercialInvoice: boolean;
};

const quantityPattern = /^(0|[1-9][0-9]*)(\.[0-9]{1,4})?$/;

function readQuantity(value: string): Prisma.Decimal {
  if (!quantityPattern.test(value)) {
    throw new Error("Quantities must be non-negative decimals with up to four places.");
  }
  return new Prisma.Decimal(value);
}

/** All outstanding/rejected quantities remain accountable until formally resolved. */
export function decideOutboundReceiving(lines: readonly OutboundReceivingLine[]): OutboundReceivingDecision {
  if (lines.length === 0) throw new Error("A gate pass requires at least one item.");
  const ids = new Set<string>();
  let dispatched = new Prisma.Decimal(0);
  let accepted = new Prisma.Decimal(0);
  let rejected = new Prisma.Decimal(0);
  let outstanding = new Prisma.Decimal(0);

  for (const line of lines) {
    if (!line.lineId || ids.has(line.lineId)) throw new Error("Duplicate or missing gate pass item.");
    ids.add(line.lineId);
    const sent = readQuantity(line.dispatchedQuantity);
    const good = readQuantity(line.acceptedQuantity);
    const bad = readQuantity(line.rejectedQuantity);
    if (!sent.gt(0)) throw new Error("Dispatched quantity must be positive.");
    if (good.plus(bad).gt(sent)) {
      throw new Error("Accepted plus rejected quantity cannot exceed dispatched quantity.");
    }
    dispatched = dispatched.plus(sent);
    accepted = accepted.plus(good);
    rejected = rejected.plus(bad);
    outstanding = outstanding.plus(sent.minus(good).minus(bad));
  }

  const status: OutboundReceivingDecision["status"] = outstanding.gt(0)
    ? "RECEIVING_PENDING"
    : accepted.isZero()
      ? "REJECTED"
      : rejected.isZero()
        ? "ACCEPTED"
        : "PARTIALLY_ACCEPTED";

  return {
    status,
    dispatchedQuantity: dispatched.toFixed(4),
    acceptedQuantity: accepted.toFixed(4),
    rejectedQuantity: rejected.toFixed(4),
    outstandingQuantity: outstanding.toFixed(4),
    canIssueCommercialInvoice: outstanding.isZero() && accepted.gt(0),
  };
}

export function assertOutboundInvoiceEligibility(input: {
  status: OutboundGatePassStatus;
  decision: OutboundReceivingDecision;
  customerReceivingEvidenceRecorded: boolean;
  invoiceAlreadyExists: boolean;
  complianceReviewed: boolean;
}): void {
  assertOutboundGatePassActionAllowed(input.status, "ISSUE_INVOICE");
  if (!input.decision.canIssueCommercialInvoice || input.decision.outstandingQuantity !== "0.0000") {
    throw new Error("Receiving must be fully reconciled before invoice preparation.");
  }
  if (!input.customerReceivingEvidenceRecorded) {
    throw new Error("Record the customer's receiving reference and acceptance evidence first.");
  }
  if (input.invoiceAlreadyExists) throw new Error("An invoice already exists for this gate pass.");
  if (!input.complianceReviewed) {
    throw new Error("Check tax invoice timing and transaction classification before invoicing.");
  }
}
