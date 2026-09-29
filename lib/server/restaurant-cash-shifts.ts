import "server-only";

import { Prisma } from "@prisma/client";

import { writeAudit } from "@/lib/server/audit";
import { IndustryDomainError, requireWorkspaceModule, type IndustryContext } from "@/lib/server/industry-modules";
import { withSerializableRetry } from "@/lib/server/tx-retry";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function money(value: Prisma.Decimal.Value) {
  return new Prisma.Decimal(value).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
}

export async function closeRestaurantCashShiftFromLedger(
  context: IndustryContext,
  shiftId: string,
  closingCashInput: number | string,
  notes?: string,
) {
  await requireWorkspaceModule(context.workspaceId, "restaurant");
  if (!UUID.test(shiftId)) throw new IndustryDomainError("INVALID_STATE", "Cash shift is invalid.");
  const closingCash = money(closingCashInput);
  if (!closingCash.isFinite() || closingCash.lt(0) || closingCash.gt(1_000_000_000)) {
    throw new IndustryDomainError("INVALID_STATE", "Closing cash must be a valid non-negative amount.");
  }
  const cleanNotes = notes?.trim();
  if (cleanNotes && cleanNotes.length > 500) {
    throw new IndustryDomainError("INVALID_STATE", "Cash shift notes must be 500 characters or fewer.");
  }

  return withSerializableRetry(async (tx) => {
    const shifts = await tx.$queryRaw<Array<{
      id: string;
      openedAt: Date;
      openingCash: Prisma.Decimal;
      status: string;
    }>>`
      SELECT "id"::text AS "id", "openedAt", "openingCash", "status"
      FROM "cash_shifts"
      WHERE "id"=${shiftId}::uuid AND "workspaceId"=${context.workspaceId}::uuid
      FOR UPDATE
    `;
    const shift = shifts[0];
    if (!shift) throw new IndustryDomainError("NOT_FOUND", "Cash shift was not found.");
    if (shift.status !== "OPEN") throw new IndustryDomainError("INVALID_STATE", "Cash shift is already closed.");

    const closedAt = new Date();
    const ledgerRows = await tx.$queryRaw<Array<{
      debit: Prisma.Decimal;
      credit: Prisma.Decimal;
      net: Prisma.Decimal;
      entryCount: number;
    }>>`
      SELECT
        COALESCE(SUM(gle."debit"), 0)::numeric AS "debit",
        COALESCE(SUM(gle."credit"), 0)::numeric AS "credit",
        COALESCE(SUM(gle."debit" - gle."credit"), 0)::numeric AS "net",
        COUNT(*)::int AS "entryCount"
      FROM "general_ledger_entries" gle
      INNER JOIN "cash_bank_accounts" cba
        ON cba."workspaceId"=gle."workspaceId"
       AND cba."accountId"=gle."accountId"
      WHERE gle."workspaceId"=${context.workspaceId}
        AND cba."isBank"=false
        AND gle."createdAt">=${shift.openedAt}
        AND gle."createdAt"<=${closedAt}
    `;
    const ledger = ledgerRows[0]!;
    const openingCash = money(shift.openingCash);
    const cashInflows = money(ledger.debit ?? 0);
    const cashOutflows = money(ledger.credit ?? 0);
    const netCashMovement = money(ledger.net ?? 0);
    const expectedCash = money(openingCash.plus(netCashMovement));
    const variance = money(closingCash.minus(expectedCash));

    await tx.$executeRaw`
      UPDATE "cash_shifts"
      SET "status"='CLOSED',
          "closedAt"=${closedAt},
          "closedById"=${context.userId ?? null}::uuid,
          "expectedCash"=${expectedCash},
          "closingCash"=${closingCash},
          "variance"=${variance},
          "notes"=COALESCE(${cleanNotes || null}, "notes")
      WHERE "id"=${shift.id}::uuid
        AND "workspaceId"=${context.workspaceId}::uuid
        AND "status"='OPEN'
    `;

    await writeAudit(tx, {
      workspaceId: context.workspaceId,
      actorId: context.userId,
      action: "restaurant.cash_shift.closed",
      entityType: "CashShift",
      entityId: shift.id,
      metadata: {
        openedAt: shift.openedAt.toISOString(),
        closedAt: closedAt.toISOString(),
        openingCash: openingCash.toFixed(2),
        cashInflows: cashInflows.toFixed(2),
        cashOutflows: cashOutflows.toFixed(2),
        netCashMovement: netCashMovement.toFixed(2),
        expectedCash: expectedCash.toFixed(2),
        closingCash: closingCash.toFixed(2),
        variance: variance.toFixed(2),
        ledgerEntryCount: ledger.entryCount ?? 0,
      },
    });

    return {
      id: shift.id,
      openingCash: openingCash.toNumber(),
      cashInflows: cashInflows.toNumber(),
      cashOutflows: cashOutflows.toNumber(),
      netCashMovement: netCashMovement.toNumber(),
      expectedCash: expectedCash.toNumber(),
      closingCash: closingCash.toNumber(),
      variance: variance.toNumber(),
      ledgerEntryCount: ledger.entryCount ?? 0,
      closedAt,
    };
  });
}
