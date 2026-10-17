import { Prisma, type OutboundGatePassStatus } from "@prisma/client";

export type TransitLine = {
  dispatched: Prisma.Decimal;
  accepted: Prisma.Decimal;
  rejected: Prisma.Decimal;
  returned: Prisma.Decimal;
  status: OutboundGatePassStatus;
  unitCost: Prisma.Decimal;
};

/** Currency valuation is rounded once per line, consistently with COGS. */
export function gatePassInventoryValue(quantity: Prisma.Decimal, unitCost: Prisma.Decimal): Prisma.Decimal {
  if (!quantity.isFinite() || quantity.isNegative() || !unitCost.isFinite() || unitCost.isNegative()) {
    throw new Error("Gate pass inventory valuation is invalid.");
  }
  return quantity.mul(unitCost).toDecimalPlaces(2);
}

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
  // Allocate the residual cent to the remaining asset. Rounding two halves
  // independently can invent a cent (e.g. 50.01 split into two 25.005 portions).
  const value = gatePassInventoryValue(line.dispatched.minus(line.returned),line.unitCost)
    .minus(gatePassInventoryValue(recognizedSale,line.unitCost));
  return { quantity, value };
}
