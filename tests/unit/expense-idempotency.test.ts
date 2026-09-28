import { describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";

const mocks = vi.hoisted(() => ({ findFirst: vi.fn() }));

vi.mock("@/lib/server/db", () => ({
  db: { expense: { findFirst: mocks.findFirst } },
}));

import { expenseMatchesRequest } from "@/lib/server/expense-idempotency";

const workspaceId = "0f2730ee-635b-4d5a-b95f-9282ab09a311";
const expenseId = "98fe7f57-207a-4ae3-b101-033e78b648d4";
const expenseAccountId = "b2514756-86d0-446a-80e5-ae88bc1cba03";
const paymentAccountId = "894dd74e-e35b-4fb7-ad1e-030a7cf451fb";
const expenseDate = new Date("2026-09-28T09:30:00.000Z");
const request = {
  expenseAccountId,
  paymentAccountId,
  amount: 2500,
  expenseDate,
  payee: "Vendor A",
  reference: "EXP-REF",
  notes: "Office supplies",
  idempotencyKey: "expense-key-123",
};
const stored = {
  expenseAccountId,
  paymentAccountId,
  amount: new Prisma.Decimal(2500),
  expenseDate,
  payee: "Vendor A",
  reference: "EXP-REF",
  notes: "Office supplies",
  idempotencyKey: "expense-key-123",
};

describe("expense idempotency request verification", () => {
  it("accepts an exact replay", async () => {
    mocks.findFirst.mockResolvedValueOnce(stored);
    await expect(expenseMatchesRequest(workspaceId, expenseId, request)).resolves.toBe(true);
  });

  it("rejects an amount change under the same key", async () => {
    mocks.findFirst.mockResolvedValueOnce(stored);
    await expect(expenseMatchesRequest(workspaceId, expenseId, { ...request, amount: 2600 })).resolves.toBe(false);
  });

  it("rejects a date or metadata change under the same key", async () => {
    mocks.findFirst.mockResolvedValueOnce(stored);
    await expect(expenseMatchesRequest(workspaceId, expenseId, { ...request, expenseDate: new Date("2026-09-29T09:30:00.000Z") })).resolves.toBe(false);
    mocks.findFirst.mockResolvedValueOnce(stored);
    await expect(expenseMatchesRequest(workspaceId, expenseId, { ...request, notes: "Changed memo" })).resolves.toBe(false);
  });
});
