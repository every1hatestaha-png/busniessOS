import { Prisma, type OutboundGatePassStatus } from "@prisma/client";

export type TransitLine = {
  dispatched: Prisma.Decimal;
  accepted: Prisma.Decimal;
  rejected: Prisma.Decimal;
  returned: Prisma.Decimal;
  status: OutboundGatePassStatus;
  unitCost: Prisma.Decimal;
};

/**
 * Inventory removed physically from a warehouse, but still held as an asset
 * until sold/recognized or physically returned. Used for financial and stock
 * reconciliation, including rejected items awaiting arrival back at source.
 */
export function ownedTransitInventory(line: TransitLine): { quantity: Prisma.Decimal; value: Prisma.Decimal } {
  const recognizedSale = line.status === "INVOICED" ? line.accepted : new Prisma.Decimal(0);
  const quantity = line.dispatched.minus(line.returned).minus(recognizedSale);
  if (quantity.isNegative() || line.returned.isNegative() || line.returned.gt(line.rejected) ||
      line.accepted.plus(line.rejected).gt(line.dispatched)) {
    throw new Error("Gate pass transit stock does not reconcile.");
  }
  return { quantity, value: quantity.mul(line.unitCost).toDecimalPlaces(2) };
}
