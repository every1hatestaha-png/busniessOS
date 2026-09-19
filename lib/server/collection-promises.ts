import "server-only";

import { randomUUID } from "node:crypto";
import { Prisma, type Role } from "@prisma/client";

import { writeAudit } from "@/lib/server/audit";
import { businessDateKey } from "@/lib/server/business-time";
import { db } from "@/lib/server/db";
import { withSerializableRetry } from "@/lib/server/tx-retry";
import type { CollectionPromiseInput, CollectionPromiseStatusInput } from "@/lib/validation/collection-promise";

type PromiseMutationContext = { workspaceId: string; role: Role; userId?: string };
export type CollectionPromiseStatus = "PENDING" | "FULFILLED" | "CANCELLED";
export type CollectionPromiseTiming = "MISSED" | "TODAY" | "UPCOMING" | "FULFILLED" | "CANCELLED";

export class CollectionPromiseError extends Error {
  constructor(
    public readonly code: "CUSTOMER_NOT_FOUND" | "NO_OUTSTANDING_BALANCE" | "AMOUNT_EXCEEDS_BALANCE" | "PROMISE_NOT_FOUND" | "PROMISE_NOT_PENDING",
    message: string,
  ) {
    super(message);
  }
}

type RawPromise = {
  id: string;
  workspaceId: string;
  customerId: string;
  amount: Prisma.Decimal;
  promiseDate: Date;
  status: CollectionPromiseStatus;
  note: string | null;
  createdAt: Date;
  updatedAt: Date;
  fulfilledAt: Date | null;
  cancelledAt: Date | null;
  customerName: string;
  currentBalance: Prisma.Decimal;
};

export type CollectionPromise = {
  id: string;
  customerId: string;
  customerName: string;
  amount: number;
  promiseDate: string;
  status: CollectionPromiseStatus;
  timing: CollectionPromiseTiming;
  daysLate: number;
  note: string;
  currentBalance: number;
  createdAt: string;
  updatedAt: string;
};

function dateDiffDays(fromDate: string, toDate: string) {
  const from = Date.parse(`${fromDate}T00:00:00.000Z`);
  const to = Date.parse(`${toDate}T00:00:00.000Z`);
  return Math.max(0, Math.round((to - from) / 86_400_000));
}

function classifyPromise(status: CollectionPromiseStatus, promiseDate: string, today: string): { timing: CollectionPromiseTiming; daysLate: number } {
  if (status === "FULFILLED") return { timing: "FULFILLED", daysLate: 0 };
  if (status === "CANCELLED") return { timing: "CANCELLED", daysLate: 0 };
  if (promiseDate < today) return { timing: "MISSED", daysLate: dateDiffDays(promiseDate, today) };
  if (promiseDate === today) return { timing: "TODAY", daysLate: 0 };
  return { timing: "UPCOMING", daysLate: 0 };
}

function mapPromise(row: RawPromise, today: string): CollectionPromise {
  const promiseDate = row.promiseDate.toISOString().slice(0, 10);
  const timing = classifyPromise(row.status, promiseDate, today);
  return {
    id: row.id,
    customerId: row.customerId,
    customerName: row.customerName,
    amount: row.amount.toNumber(),
    promiseDate,
    status: row.status,
    timing: timing.timing,
    daysLate: timing.daysLate,
    note: row.note ?? "",
    currentBalance: row.currentBalance.toNumber(),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function listCollectionPromises(
  workspaceId: string,
  options: { customerId?: string; status?: CollectionPromiseStatus; timeZone?: string } = {},
): Promise<CollectionPromise[]> {
  const rows = await db.$queryRaw<RawPromise[]>`
    SELECT
      cp."id", cp."workspaceId", cp."customerId", cp."amount", cp."promiseDate", cp."status",
      cp."note", cp."createdAt", cp."updatedAt", cp."fulfilledAt", cp."cancelledAt",
      COALESCE(c."companyName", c."name") AS "customerName", c."currentBalance"
    FROM "collection_promises" cp
    INNER JOIN "customers" c ON c."id" = cp."customerId" AND c."workspaceId" = cp."workspaceId"
    WHERE cp."workspaceId" = ${workspaceId}
    ORDER BY cp."promiseDate" ASC, cp."createdAt" DESC
  `;

  const today = businessDateKey(new Date(), options.timeZone ?? "Asia/Karachi");
  return rows
    .filter((row) => !options.customerId || row.customerId === options.customerId)
    .filter((row) => !options.status || row.status === options.status)
    .map((row) => mapPromise(row, today));
}

export async function getPendingPromisesByCustomer(workspaceId: string, timeZone = "Asia/Karachi") {
  const rows = await listCollectionPromises(workspaceId, { status: "PENDING", timeZone });
  return new Map(rows.map((row) => [row.customerId, row]));
}

export async function upsertCollectionPromise(context: PromiseMutationContext, input: CollectionPromiseInput) {
  return withSerializableRetry(async (tx) => {
    const customer = await tx.customer.findFirst({
      where: { id: input.customerId, workspaceId: context.workspaceId },
      select: { id: true, currentBalance: true },
    });
    if (!customer) throw new CollectionPromiseError("CUSTOMER_NOT_FOUND", "Customer not found.");
    if (customer.currentBalance.lte(0)) throw new CollectionPromiseError("NO_OUTSTANDING_BALANCE", "This customer has no outstanding receivable to promise against.");

    const amount = new Prisma.Decimal(input.amount);
    if (amount.gt(customer.currentBalance)) {
      throw new CollectionPromiseError("AMOUNT_EXCEEDS_BALANCE", "Promise amount cannot exceed the customer's current outstanding balance.");
    }

    const [existing] = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT "id"
      FROM "collection_promises"
      WHERE "workspaceId" = ${context.workspaceId} AND "customerId" = ${input.customerId} AND "status" = 'PENDING'
      FOR UPDATE
      LIMIT 1
    `;

    const promiseId = existing?.id ?? randomUUID();
    if (existing) {
      await tx.$executeRaw`
        UPDATE "collection_promises"
        SET "amount" = ${amount}, "promiseDate" = CAST(${input.promiseDate} AS DATE), "note" = ${input.note || null}, "updatedAt" = CURRENT_TIMESTAMP
        WHERE "id" = ${promiseId} AND "workspaceId" = ${context.workspaceId}
      `;
    } else {
      await tx.$executeRaw`
        INSERT INTO "collection_promises" ("id", "workspaceId", "customerId", "amount", "promiseDate", "status", "note", "createdById")
        VALUES (${promiseId}, ${context.workspaceId}, ${input.customerId}, ${amount}, CAST(${input.promiseDate} AS DATE), 'PENDING', ${input.note || null}, ${context.userId ?? null})
      `;
    }

    await writeAudit(tx, {
      workspaceId: context.workspaceId,
      actorId: context.userId,
      action: existing ? "collection.promise.updated" : "collection.promise.created",
      entityType: "CollectionPromise",
      entityId: promiseId,
      metadata: { customerId: input.customerId, amount: input.amount, promiseDate: input.promiseDate },
    });

    return promiseId;
  });
}

export async function updateCollectionPromiseStatus(context: PromiseMutationContext, input: CollectionPromiseStatusInput) {
  return withSerializableRetry(async (tx) => {
    const [promise] = await tx.$queryRaw<Array<{ id: string; status: CollectionPromiseStatus; customerId: string }>>`
      SELECT "id", "status", "customerId"
      FROM "collection_promises"
      WHERE "id" = ${input.promiseId} AND "workspaceId" = ${context.workspaceId}
      FOR UPDATE
      LIMIT 1
    `;
    if (!promise) throw new CollectionPromiseError("PROMISE_NOT_FOUND", "Promise not found.");
    if (promise.status !== "PENDING") throw new CollectionPromiseError("PROMISE_NOT_PENDING", "Only a pending promise can be resolved.");

    if (input.status === "FULFILLED") {
      await tx.$executeRaw`
        UPDATE "collection_promises"
        SET "status" = 'FULFILLED', "fulfilledAt" = CURRENT_TIMESTAMP, "updatedAt" = CURRENT_TIMESTAMP
        WHERE "id" = ${input.promiseId} AND "workspaceId" = ${context.workspaceId}
      `;
    } else {
      await tx.$executeRaw`
        UPDATE "collection_promises"
        SET "status" = 'CANCELLED', "cancelledAt" = CURRENT_TIMESTAMP, "updatedAt" = CURRENT_TIMESTAMP
        WHERE "id" = ${input.promiseId} AND "workspaceId" = ${context.workspaceId}
      `;
    }

    await writeAudit(tx, {
      workspaceId: context.workspaceId,
      actorId: context.userId,
      action: input.status === "FULFILLED" ? "collection.promise.fulfilled" : "collection.promise.cancelled",
      entityType: "CollectionPromise",
      entityId: input.promiseId,
      metadata: { customerId: promise.customerId },
    });
  });
}

export { classifyPromise };
