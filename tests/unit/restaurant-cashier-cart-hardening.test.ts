import { describe, expect, it } from "vitest";
import {
  addCashierItem,
  cashierOrderLines,
  cashierSubmissionSignature,
  changeCashierItemQuantity,
  CASHIER_MAX_LINES,
  CASHIER_MAX_QUANTITY,
} from "@/lib/restaurant/cashier-cart";

const menuItemId = "cce505a4-9c17-4910-9af9-7d2634d9da47";
const item = { menuItemId, name: "Chicken tikka pizza", price: 1250 };

describe("Cashier POS cart and handoff input", () => {
  it("adds the same product once and caps repeated touches at 99 units", () => {
    let cart = addCashierItem([], item);
    for (let i = 0; i < 105; i++) cart = addCashierItem(cart, item);
    expect(cart).toHaveLength(1);
    expect(cart[0].quantity).toBe(CASHIER_MAX_QUANTITY);
    expect(cart[0].name).toBe(item.name);
  });

  it("cannot add 101 different menu items, and removes quantity-zero rows", () => {
    const cart = Array.from({ length: CASHIER_MAX_LINES }, (_, i) =>
      ({ ...item, menuItemId: `item-${i}`, quantity: 1, notes: "" }));
    expect(addCashierItem(cart, { ...item, menuItemId: "extra" })).toHaveLength(CASHIER_MAX_LINES);
    expect(changeCashierItemQuantity(cart.slice(0, 1), "item-0", -1)).toEqual([]);
  });

  it("transmits item-specific cooking notes without losing quantity", () => {
    const payload = cashierOrderLines([{ ...item, quantity: 2, notes: "  Peanut allergy; no onions  " }]);
    expect(payload).toEqual([{ menuItemId, quantity: 2, notes: "Peanut allergy; no onions" }]);
    expect(cashierOrderLines([{ ...item, quantity: 1, notes: "" }])[0]).not.toHaveProperty("notes");
  });

  it("rejects oversized notes, invalid quantities and empty baskets", () => {
    expect(() => cashierOrderLines([])).toThrow();
    expect(() => cashierOrderLines([{ ...item, quantity: 0, notes: "" }])).toThrow();
    expect(() => cashierOrderLines([{ ...item, quantity: 100, notes: "" }])).toThrow();
    expect(() => cashierOrderLines([{ ...item, quantity: 1.5, notes: "" }])).toThrow();
    expect(() => cashierOrderLines([{ ...item, quantity: 1, notes: "x".repeat(301) }])).toThrow();
  });

  it("retains the same retry signature with only the generated request ID changed", () => {
    const draft = new FormData();
    draft.set("itemsJson", JSON.stringify(cashierOrderLines([{ ...item, quantity: 2, notes: "extra spicy" }])));
    draft.set("orderRequestId", "first-id");
    draft.set("fulfillmentType", "TAKEAWAY");
    const a = cashierSubmissionSignature(draft);
    draft.set("orderRequestId", "second-id");
    expect(cashierSubmissionSignature(draft)).toBe(a);
    draft.set("fulfillmentType", "DINE_IN");
    expect(cashierSubmissionSignature(draft)).not.toBe(a);
  });
});
