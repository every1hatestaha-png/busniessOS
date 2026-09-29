import { describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";

const mocks = vi.hoisted(() => ({ findFirst: vi.fn() }));

vi.mock("@/lib/server/db", () => ({ db: {} }));
vi.mock("@/lib/server/audit", () => ({ writeAudit: vi.fn() }));
vi.mock("@/lib/server/tx-retry", () => ({
  withSerializableRetry: (callback: (tx: unknown) => unknown) => callback({
    customerCreditAllocation: { findFirst: mocks.findFirst },
  }),
}));

import { allocateCustomerCredit } from "@/lib/server/customer-credits";

const context = { workspaceId: "0f2730ee-635b-4d5a-b95f-9282ab09a311", userId: "user-1", role: "OWNER" as const };
const creditNoteId = "8e698a4b-f7b5-4dd6-b55f-95ee7de1ca7a";
const invoiceId = "3c93d974-f2c6-423d-9560-41a8b08343db";
const key = "credit-allocation-key";

describe("customer credit allocation idempotency", () => {
  it("replays the same request without applying credit twice", async () => {
    mocks.findFirst.mockResolvedValueOnce({
      id: "allocation-1",
      creditNoteId,
      invoiceId,
      amount: new Prisma.Decimal(40),
    });

    await expect(allocateCustomerCredit(context, {
      creditNoteId,
      invoiceId,
      amount: 40,
      idempotencyKey: key,
    })).resolves.toEqual({ id: "allocation-1" });
  });

  it("rejects a changed request that reuses the same idempotency key", async () => {
    mocks.findFirst.mockResolvedValueOnce({
      id: "allocation-1",
      creditNoteId,
      invoiceId,
      amount: new Prisma.Decimal(40),
    });

    await expect(allocateCustomerCredit(context, {
      creditNoteId,
      invoiceId,
      amount: 41,
      idempotencyKey: key,
    })).rejects.toThrow("idempotency key was already used for a different customer credit allocation request");
  });
});
