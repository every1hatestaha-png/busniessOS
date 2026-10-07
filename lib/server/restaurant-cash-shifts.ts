import "server-only";

import { Prisma, type Role } from "@prisma/client";

import { writeAudit } from "@/lib/server/audit";
import { IndustryDomainError, requireWorkspaceModule, type IndustryContext } from "@/lib/server/industry-modules";
import { withSerializableRetry } from "@/lib/server/tx-retry";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MANAGER_ROLES = new Set<Role>(["OWNER", "ADMIN", "MANAGER"]);

function money(value: Prisma.Decimal.Value) {
  return new Prisma.Decimal(value).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
}

function requireActor(context: IndustryContext) {
  if (!context.userId || !UUID.test(context.userId)) {
    throw new IndustryDomainError("PERMISSION_DENIED", "Authenticated user identity is required for cash shifts.");
  }
  return context.userId;
}

function cleanNotes(notes?: string) {
  const clean = notes?.trim();
  if (clean && clean.length > 500) {
    throw new IndustryDomainError("INVALID_STATE", "Cash shift notes must be 500 characters or fewer.");
  }
  return clean || null;
}

export async function openRestaurantCashShiftSafely(
  context: IndustryContext,
  openingCashInput: number | string,
  notes?: string,
) {
  await requireWorkspaceModule(context.workspaceId, "restaurant");
  const actorId = requireActor(context);
  const openingCash = money(openingCashInput);
  if (!openingCash.isFinite() || openingCash.lt(0) || openingCash.gt(1_000_000_000)) {
    throw new IndustryDomainError("INVALID_STATE", "Opening cash must be a valid non-negative amount.");
  }
  const clean = cleanNotes(notes);

  return withSerializableRetry(async (tx) => {
    const existing = await tx.$queryRaw<Array<{ id: string; openedById: string | null }>>`
      SELECT "id"::text AS "id", "openedById"::text AS "openedById"
      FROM "cash_shifts"
      WHERE "workspaceId"=${context.workspaceId}::uuid AND "status"='OPEN'
      FOR UPDATE
    `;
    if (existing[0]) {
      throw new IndustryDomainError("CONFLICT", "A restaurant cash shift is already open for this workspace.");
    }

    const rows = await tx.$queryRaw<Array<{ id: string; openedAt: Date; openingCash: Prisma.Decimal }>>`
      INSERT INTO "cash_shifts" ("workspaceId", "openedById", "openingCash", "notes")
      VALUES (${context.workspaceId}::uuid, ${actorId}::uuid, ${openingCash}, ${clean})
      RETURNING "id"::text AS "id", "openedAt", "openingCash"
    `;
    const shift = rows[0]!;

    await writeAudit(tx, {
      workspaceId: context.workspaceId,
      actorId,
      action: "restaurant.cash_shift.opened",
      entityType: "CashShift",
      entityId: shift.id,
      metadata: {
        openingCash: openingCash.toFixed(2),
        openedAt: shift.openedAt.toISOString(),
        role: context.role,
      },
    });

    return { id: shift.id, openedAt: shift.openedAt, openingCash: openingCash.toNumber() };
  });
}

export async function closeRestaurantCashShiftFromLedger(
  context: IndustryContext,
  shiftId: string,
  closingCashInput: number | string,
  notes?: string,
) {
  await requireWorkspaceModule(context.workspaceId, "restaurant");
  const actorId = requireActor(context);
  if (!UUID.test(shiftId)) throw new IndustryDomainError("INVALID_STATE", "Cash shift is invalid.");
  const closingCash = money(closingCashInput);
  if (!closingCash.isFinite() || closingCash.lt(0) || closingCash.gt(1_000_000_000)) {
    throw new IndustryDomainError("INVALID_STATE", "Closing cash must be a valid non-negative amount.");
  }
  const clean = cleanNotes(notes);

  return withSerializableRetry(async (tx) => {
    const shifts = await tx.$queryRaw<Array<{
      id: string;
      openedAt: Date;
      openedById: string | null;
      openingCash: Prisma.Decimal;
      status: string;
    }>>`
      SELECT "id"::text AS "id", "openedAt", "openedById"::text AS "openedById", "openingCash", "status"
      FROM "cash_shifts"
      WHERE "id"=${shiftId}::uuid AND "workspaceId"=${context.workspaceId}::uuid
      FOR UPDATE
    `;
    const shift = shifts[0];
    if (!shift) throw new IndustryDomainError("NOT_FOUND", "Cash shift was not found.");
    if (shift.status !== "OPEN") throw new IndustryDomainError("INVALID_STATE", "Cash shift is already closed.");
    if (!MANAGER_ROLES.has(context.role) && shift.openedById !== actorId) {
      throw new IndustryDomainError("PERMISSION_DENIED", "Staff can close only the restaurant cash shift they opened.");
    }

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
        -- general_ledger_entries.createdAt is a legacy timestamp WITHOUT
        -- time zone. Prisma/Node persist DateTime values there as UTC wall time,
        -- so interpret it explicitly as UTC before comparing it with the
        -- timestamptz cash-shift lifecycle. Never depend on the session timezone.
        AND (gle."createdAt" AT TIME ZONE 'UTC')>=(
          SELECT cs."openedAt"
          FROM "cash_shifts" cs
          WHERE cs."id"=${shift.id}::uuid
            AND cs."workspaceId"=${context.workspaceId}::uuid
        )
        AND (gle."createdAt" AT TIME ZONE 'UTC')<=CURRENT_TIMESTAMP
    `;
    const ledger = ledgerRows[0]!;
    const openingCash = money(shift.openingCash);
    const cashInflows = money(ledger.debit ?? 0);
    const cashOutflows = money(ledger.credit ?? 0);
    const netCashMovement = money(ledger.net ?? 0);
    const expectedCash = money(openingCash.plus(netCashMovement));
    const variance = money(closingCash.minus(expectedCash));

    const closedRows = await tx.$queryRaw<Array<{ closedAt: Date }>>`
      UPDATE "cash_shifts"
      SET "status"='CLOSED',
          "closedAt"=CURRENT_TIMESTAMP,
          "closedById"=${actorId}::uuid,
          "expectedCash"=${expectedCash},
          "closingCash"=${closingCash},
          "variance"=${variance},
          "notes"=COALESCE(${clean}, "notes")
      WHERE "id"=${shift.id}::uuid
        AND "workspaceId"=${context.workspaceId}::uuid
        AND "status"='OPEN'
      RETURNING "closedAt"
    `;
    const closedAt = closedRows[0]?.closedAt;
    if (!closedAt) throw new IndustryDomainError("CONFLICT", "Restaurant cash shift changed before it could be closed.");

    await writeAudit(tx, {
      workspaceId: context.workspaceId,
      actorId,
      action: "restaurant.cash_shift.closed",
      entityType: "CashShift",
      entityId: shift.id,
      metadata: {
        openedById: shift.openedById,
        closedById: actorId,
        closedByRole: context.role,
        managerOverride: shift.openedById !== actorId,
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
      openedById: shift.openedById,
      closedById: actorId,
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
