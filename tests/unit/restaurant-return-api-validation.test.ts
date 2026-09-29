import { describe, expect, it } from "vitest";

import { restaurantItemReturnApiSchema } from "@/lib/validation/restaurant-returns";

const valid = {
  orderId: "11111111-1111-4111-8111-111111111111",
  cashBankAccountId: "22222222-2222-4222-8222-222222222222",
  reason: "Customer returned one item",
  lines: [{ orderItemId: "33333333-3333-4333-8333-333333333333", quantity: 1 }],
  idempotencyKey: "restaurant:return:test-001",
};

describe("restaurant return API validation", () => {
  it("accepts the bounded return payload", () => {
    expect(restaurantItemReturnApiSchema.parse(valid)).toEqual(valid);
  });

  it("rejects client supplied workspace identity", () => {
    expect(() => restaurantItemReturnApiSchema.parse({ ...valid, workspaceId: "44444444-4444-4444-8444-444444444444" })).toThrow();
  });

  it("rejects invalid quantities and weak request ids", () => {
    expect(() => restaurantItemReturnApiSchema.parse({ ...valid, lines: [{ ...valid.lines[0], quantity: 0 }] })).toThrow();
    expect(() => restaurantItemReturnApiSchema.parse({ ...valid, idempotencyKey: "short" })).toThrow();
    expect(() => restaurantItemReturnApiSchema.parse({ ...valid, idempotencyKey: "bad key with spaces" })).toThrow();
  });

  it("rejects oversized return line batches", () => {
    const lines = Array.from({ length: 101 }, (_, index) => ({
      orderItemId: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
      quantity: 1,
    }));
    expect(() => restaurantItemReturnApiSchema.parse({ ...valid, lines })).toThrow();
  });
});
