import { describe, expect, it } from "vitest";

import { calculateAcceptedValue, expectedWeightKg } from "@/lib/grn-calculations";

describe("GRN calculations", () => {
  it("values weight-priced receipts from accepted weight and rate per kg", () => {
    expect(calculateAcceptedValue({ isWeightPriced: true, acceptedQuantity: 49, actualUnitCost: 0, acceptedWeightKg: 220.5, ratePerKg: 282 })).toBe(62_181);
  });

  it("values unit-priced receipts from accepted quantity and unit cost", () => {
    expect(calculateAcceptedValue({ isWeightPriced: false, acceptedQuantity: 4.6, actualUnitCost: 286, acceptedWeightKg: "", ratePerKg: "" })).toBe(1_315.6);
  });

  it("returns null for incomplete weighted inputs instead of presenting zero", () => {
    expect(calculateAcceptedValue({ isWeightPriced: true, acceptedQuantity: 49, actualUnitCost: 0, acceptedWeightKg: "", ratePerKg: 282 })).toBeNull();
  });

  it("derives an editable expected weight for pieces and kilograms", () => {
    expect(expectedWeightKg(49, "PIECE", 4.5)).toBe("220.5");
    expect(expectedWeightKg(4.6, "KG", null)).toBe("4.6");
  });

  it("returns null for negative weight or rate", () => {
    expect(calculateAcceptedValue({ isWeightPriced: true, acceptedQuantity: 10, actualUnitCost: 0, acceptedWeightKg: -5, ratePerKg: 100 })).toBeNull();
    expect(calculateAcceptedValue({ isWeightPriced: true, acceptedQuantity: 10, actualUnitCost: 0, acceptedWeightKg: 5, ratePerKg: -100 })).toBeNull();
  });

  it("returns null for non-finite inputs", () => {
    expect(calculateAcceptedValue({ isWeightPriced: true, acceptedQuantity: 10, actualUnitCost: 0, acceptedWeightKg: NaN, ratePerKg: 100 })).toBeNull();
    expect(calculateAcceptedValue({ isWeightPriced: false, acceptedQuantity: 10, actualUnitCost: Infinity, acceptedWeightKg: "", ratePerKg: "" })).toBeNull();
  });

  it("rounds to two decimal places", () => {
    expect(calculateAcceptedValue({ isWeightPriced: true, acceptedQuantity: 3, actualUnitCost: 0, acceptedWeightKg: 10, ratePerKg: 33.333 })).toBe(333.33);
  });

  it("returns empty string for weight when quantity is negative", () => {
    expect(expectedWeightKg(-5, "PIECE", 4.5)).toBe("");
  });

  it("returns empty string for weight when unitWeight is zero or null for non-KG units", () => {
    expect(expectedWeightKg(10, "PIECE", null)).toBe("");
    expect(expectedWeightKg(10, "PIECE", 0)).toBe("");
  });
});
