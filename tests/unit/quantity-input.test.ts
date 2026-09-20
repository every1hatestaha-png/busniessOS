import { describe, expect, it } from "vitest";

import { quantityInputConstraints } from "@/lib/inventory/quantity-input";

describe("quantity input constraints", () => {
  it("allows four-decimal quantities for measured units", () => {
    for (const unit of ["KG", "LITER", "METER"]) {
      expect(quantityInputConstraints(unit)).toEqual({ min: "0.0001", step: "0.0001" });
    }
  });

  it("keeps countable units whole-number by default", () => {
    for (const unit of ["PIECE", "BOX", "CARTON", "SET", undefined]) {
      expect(quantityInputConstraints(unit)).toEqual({ min: "1", step: "1" });
    }
  });
});
