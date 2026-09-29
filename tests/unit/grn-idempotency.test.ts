import { describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";

const mocks = vi.hoisted(() => ({ findFirst: vi.fn() }));

vi.mock("@/lib/server/db", () => ({
  db: { goodReceivedNote: { findFirst: mocks.findFirst } },
}));

import { goodsReceiptMatchesRequest } from "@/lib/server/grn-idempotency";

const workspaceId = "0f2730ee-635b-4d5a-b95f-9282ab09a311";
const grnId = "63df8524-f56e-44ba-a12d-dc29c56b95d5";
const purchaseOrderId = "2920c78f-50ea-4cf8-9884-cc4d2b8f6786";
const purchaseOrderItemId = "8fd16779-9e04-4658-99a3-e607e98da56e";
const key = "grn-key-1";
const receiptDate = new Date("2026-09-28T12:00:00.000Z");

const request = {
  purchaseOrderId,
  receiptDate,
  notes: "Received cleanly",
  receivedBy: "Store A",
  checkedBy: "Manager A",
  idempotencyKey: key,
  items: [{
    purchaseOrderItemId,
    receivedQuantity: 3,
    acceptedQuantity: 3,
    actualUnitCost: 125,
  }],
};

function stored(overrides: Record<string, unknown> = {}) {
  return {
    purchaseOrderId,
    receiptDate,
    notes: "Received cleanly",
    receivedBy: "Store A",
    checkedBy: "Manager A",
    warehouseId: null,
    idempotencyKey: key,
    items: [{
      purchaseOrderItemId,
      receivedQuantity: new Prisma.Decimal(3),
      acceptedQuantity: new Prisma.Decimal(3),
      unitCost: new Prisma.Decimal(125),
      receivedWeightKg: null,
      acceptedWeightKg: null,
      ratePerKg: null,
    }],
    ...overrides,
  };
}

describe("goods receipt idempotency verification", () => {
  it("accepts an exact replay", async () => {
    mocks.findFirst.mockResolvedValueOnce(stored());
    await expect(goodsReceiptMatchesRequest(workspaceId, grnId, request)).resolves.toBe(true);
  });

  it("rejects a changed financial payload using the same key", async () => {
    mocks.findFirst.mockResolvedValueOnce(stored());
    await expect(goodsReceiptMatchesRequest(workspaceId, grnId, {
      ...request,
      items: [{ ...request.items[0], actualUnitCost: 126 }],
    })).resolves.toBe(false);
  });

  it("rejects changed header data using the same key", async () => {
    mocks.findFirst.mockResolvedValueOnce(stored());
    await expect(goodsReceiptMatchesRequest(workspaceId, grnId, {
      ...request,
      notes: "Different receipt",
    })).resolves.toBe(false);
  });
});
