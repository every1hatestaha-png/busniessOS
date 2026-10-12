import "server-only";
import type { Prisma } from "@prisma/client";

/**
 * Gate Pass invoicing recognizes dispatched inventory without a second stock
 * deduction. A regular Sale edit/cancellation/return assumes the opposite and
 * would restore the wrong quantities or duplicate component movements.
 *
 * Enforce at service boundaries inside the caller's SERIALIZABLE transaction
 * before any inventory, invoice, ledger, or customer balance mutations.
 * This is not a feature flag: historical gate-pass invoices remain protected
 * even if the Gate Pass module is later disabled.
 */
export async function assertStandaloneSaleMutationAllowed(
  tx: Prisma.TransactionClient,
  workspaceId: string,
  salesOrderId: string,
): Promise<void> {
  const gatePass = await tx.outboundGatePass.findFirst({
    where: { workspaceId, salesOrderId },
    select: { id: true },
  });
  if (gatePass) {
    throw new GatePassSaleMutationError(
      "This invoice originates from a dispatched Gate Pass. Ordinary Sale edits, cancellations and customer returns would corrupt its physical-stock and receiving reconciliation. Use the Gate Pass workflow and a separately certified correction process.",
    );
  }
}

export class GatePassSaleMutationError extends Error {}
