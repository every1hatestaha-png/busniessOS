import { describe, expect, it } from "vitest";

import { findCustomerPriceRule } from "@/lib/customer-pricing";

describe("customer price tiers", () => {
  const rules = [
    { customerId: "c1", productId: "p1", minQuantity: 1, unitPrice: 100, discountPerUnit: 0, isActive: true },
    { customerId: "c1", productId: "p1", minQuantity: 10, unitPrice: 95, discountPerUnit: 2, isActive: true },
    { customerId: "c1", productId: "p1", minQuantity: 50, unitPrice: 90, discountPerUnit: 0, isActive: true },
    { customerId: "c2", productId: "p1", minQuantity: 1, unitPrice: 80, discountPerUnit: 0, isActive: true },
  ];

  it("selects the highest satisfied quantity tier for the active customer", () => {
    expect(findCustomerPriceRule(rules, "c1", "p1", 1)?.unitPrice).toBe(100);
    expect(findCustomerPriceRule(rules, "c1", "p1", 25)).toMatchObject({ unitPrice: 95, discountPerUnit: 2 });
    expect(findCustomerPriceRule(rules, "c1", "p1", 50)?.unitPrice).toBe(90);
  });

  it("does not leak pricing across customers or unmatched products", () => {
    expect(findCustomerPriceRule(rules, "c2", "p1", 20)?.unitPrice).toBe(80);
    expect(findCustomerPriceRule(rules, "c1", "p2", 20)).toBeNull();
    expect(findCustomerPriceRule(rules, "", "p1", 20)).toBeNull();
  });

  it("ignores inactive rules", () => {
    expect(findCustomerPriceRule([{ ...rules[0], isActive: false }], "c1", "p1", 2)).toBeNull();
  });
});
