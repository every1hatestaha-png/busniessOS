import { describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";

const mocks = vi.hoisted(() => ({ findFirst: vi.fn() }));

vi.mock("@/lib/server/db", () => ({
  db: { purchaseOrder: { findFirst: mocks.findFirst } },
}));

import { purchaseMatchesRequest } from "@/lib/server/purchase-idempotency";

const workspaceId = "0f2730ee-635b-4d5a-b95f-9282ab09a311";
const purchaseId = "6c6be740-4204-47b5-8d5f-f4332b499ed3";
const supplierId = "63b758e7-54e2-4d81-96ca-a057e59d64e8";
const productA = "7d155f2e-8bf1-4dd3-9575-6f5a8198b6e0";
const productB = "9d8f19a6-5290-4691-a525-32eb57b15f5e";
const expectedDeliveryDate = new Date("2026-10-05T00:00:00.000Z");

const request = {
  supplierId,
  items: [
    { productId: productA, quantity: 2, unitCost: 100 },
    { productId: productB, quantity: 3, unitCost: 50 },
  ],
  notes: "Initial purchase",
  expectedDeliveryDate,
  department: "Main store",
  pricingMode: "UNIT" as const,
  idempotencyKey: "purchase-key-123",
};

const stored = {
  supplierId,
  notes: "Initial purchase",
  expectedDeliveryDate,
  department: "Main store",
  pricingMode: "UNIT",
  idempotencyKey: "purchase-key-123",
  items: [
    { productId: productA, quantity: new Prisma.Decimal(2), unitCost: new Prisma.Decimal(100), unitWeight: null, perKgRate: null },
    { productId: productB, quantity: new Prisma.Decimal(3), unitCost: new Prisma.Decimal(50), unitWeight: null, perKgRate: null },
  ],
};

describe("purchase idempotency request verification", () => {
  it("accepts an exact replay", async () => {
    mocks.findFirst.mockResolvedValueOnce(stored);
    await expect(purchaseMatchesRequest(workspaceId, purchaseId, request)).resolves.toBe(true);
  });

  it("rejects a duplicate-product payload that could alias the stored item map", async () => {
    mocks.findFirst.mockResolvedValueOnce(stored);
    await expect(purchaseMatchesRequest(workspaceId, purchaseId, {
      ...request,
      items: [
        { productId: productA, quantity: 2, unitCost: 100 },
        { productId: productA, quantity: 2, unitCost: 100 },
      ],
    })).resolves.toBe(false);
  });

  it("rejects changed commercial terms under the same key", async () => {
    mocks.findFirst.mockResolvedValueOnce(stored);
    await expect(purchaseMatchesRequest(workspaceId, purchaseId, { ...request, department: "Secondary store" })).resolves.toBe(false);
  });
});
