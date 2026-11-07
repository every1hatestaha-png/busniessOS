import "server-only";

import { Prisma, type Role } from "@prisma/client";
import { db } from "@/lib/server/db";
import { writeAudit } from "@/lib/server/audit";
import { IndustryDomainError, requireWorkspaceModule, type IndustryContext } from "@/lib/server/industry-modules";
import { withSerializableRetry } from "@/lib/server/tx-retry";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MANAGEMENT = new Set<Role>(["OWNER", "ADMIN", "MANAGER"]);
const ACTION = "restaurant.cash_shift.variance_reviewed";

export async function listRestaurantCashVarianceReviews(workspaceId: string, shiftIds: string[]) {
  await requireWorkspaceModule(workspaceId, "restaurant");
  if (!shiftIds.length) return new Set<string>();
  if (shiftIds.length > 30 || shiftIds.some(id => !UUID.test(id))) {
    throw new IndustryDomainError("INVALID_STATE", "Invalid cash shift review selection.");
  }
  const reviewEvents = await db.auditLog.findMany({
    where: { workspaceId, entityType: "CashShift", action: ACTION, entityId: { in: shiftIds } },
    select: { entityId: true },
  });
  return new Set(reviewEvents.map(event => event.entityId));
}

/**
 * Audit a closed cash shortage/overage. Does not change cash, ledger,
 * payments, variance, or original shift evidence.
 */
export async function reviewRestaurantCashVariance(
  context: IndustryContext,
  shiftId: string,
  explanationInput: string,
) {
  if (!MANAGEMENT.has(context.role) || !context.userId || !UUID.test(context.userId)) {
    throw new IndustryDomainError("PERMISSION_DENIED", "Only a restaurant manager can acknowledge cash differences.");
  }
  if (!UUID.test(shiftId)) {
    throw new IndustryDomainError("INVALID_STATE", "Choose a valid cash shift.");
  }
  const explanation = explanationInput.trim();
  if (explanation.length < 10 || explanation.length > 500) {
    throw new IndustryDomainError("INVALID_STATE", "Provide a review explanation between 10 and 500 characters.");
  }
  await requireWorkspaceModule(context.workspaceId, "restaurant");
  return withSerializableRetry(async tx => {
    const rows = await tx.$queryRaw<Array<{
      id: string; status: string; variance: Prisma.Decimal | null; expectedCash: Prisma.Decimal | null;
      closingCash: Prisma.Decimal | null; closedAt: Date | null;
    }>>`
      SELECT "id"::text AS "id", "status", "variance",
             "expectedCash", "closingCash", "closedAt"
      FROM "cash_shifts"
      WHERE "workspaceId"=${context.workspaceId}::uuid
        AND "id"=${shiftId}::uuid
      FOR UPDATE
    `;
    const shift = rows[0];
    if (!shift) throw new IndustryDomainError("NOT_FOUND", "Cash shift is not in this workspace.");
    if (shift.status !== "CLOSED" || shift.variance === null || shift.closedAt === null) {
      throw new IndustryDomainError("INVALID_STATE", "A cash variance can only be reviewed after shift close.");
    }
    const variance = new Prisma.Decimal(shift.variance);
    if (variance.abs().lt("0.01")) {
      throw new IndustryDomainError("INVALID_STATE", "This cash shift has no reportable variance.");
    }
    const previous = await tx.auditLog.findFirst({
      where: { workspaceId: context.workspaceId, action: ACTION, entityType: "CashShift", entityId: shift.id },
      select: { id: true },
    });
    if (previous) {
      return { reviewed: false, variance: variance.toNumber() };
    }
    await writeAudit(tx, {
      workspaceId: context.workspaceId, actorId: context.userId,
      action: ACTION, entityType: "CashShift", entityId: shift.id,
      metadata: {
        explanation, variance: variance.toFixed(2),
        expectedCash: new Prisma.Decimal(shift.expectedCash ?? 0).toFixed(2),
        countedCash: new Prisma.Decimal(shift.closingCash ?? 0).toFixed(2),
        reviewedByRole: context.role, closedAt: shift.closedAt.toISOString(),
      },
    });
    return { reviewed: true, variance: variance.toNumber() };
  });
}
