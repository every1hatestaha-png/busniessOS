import { describe, expect, it } from "vitest";
import { validateRestaurantModifiers } from "@/lib/restaurant/order-modifier-validation";

describe("Restaurant menu options cannot be silently lost", () => {
  it("preserves each accepted preparation option in its original order", () => {
    expect(validateRestaurantModifiers([" No onions ", "Extra cheese"])).toEqual(["No onions", "Extra cheese"]);
    expect(validateRestaurantModifiers(undefined)).toEqual([]);
    expect(validateRestaurantModifiers(null)).toEqual([]);
    const options = Array.from({ length: 20 }, (_, i) => `Choice ${i + 1}`);
    expect(validateRestaurantModifiers(options)).toEqual(options);
  });
  it("rejects overflow rather than trimming away the customer's instructions", () => {
    expect(() => validateRestaurantModifiers(Array.from({ length: 21 }, () => "No peanuts")))
      .toThrow("at most 20 options");
  });
  it("rejects malformed, blank or overlong modifiers", () => {
    expect(() => validateRestaurantModifiers(["valid", ""])).toThrow("1 to 80 characters");
    expect(() => validateRestaurantModifiers(["x".repeat(81)])).toThrow("1 to 80 characters");
    expect(() => validateRestaurantModifiers(["valid", 7])).toThrow("must be text");
    expect(() => validateRestaurantModifiers("No onions")).toThrow("must be a list");
  });
});
