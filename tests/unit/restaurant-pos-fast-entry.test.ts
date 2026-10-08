import { describe, expect, it } from "vitest";

import { isPosSearchShortcut, parsePosFastEntry } from "@/lib/restaurant/pos-fast-entry";

describe("Restaurant keyboard POS", () => {
  it("parses a plain dish name as one item", () => {
    expect(parsePosFastEntry("  chicken biryani  ")).toEqual({ term: "chicken biryani", quantity: 1 });
  });

  it.each([
    ["2x biryani", 2, "biryani"],
    ["3 × tea", 3, "tea"],
    ["12* Cold drink", 12, "Cold drink"],
    ["99x burger", 99, "burger"],
    ["2x", 2, ""],
  ])("parses quantity prefix %s", (input, quantity, term) => {
    expect(parsePosFastEntry(input)).toEqual({ term, quantity });
  });

  it("does not interpret zero or triple-digit quantities as a quick add", () => {
    expect(parsePosFastEntry("0x tea")).toEqual({ term: "0x tea", quantity: 1 });
    expect(parsePosFastEntry("100x tea")).toEqual({ term: "100x tea", quantity: 1 });
  });

  it("does not capture typing inside other form fields", () => {
    for (const tagName of ["INPUT", "SELECT", "TEXTAREA"]) {
      expect(isPosSearchShortcut({ tagName } as EventTarget)).toBe(false);
    }
    expect(isPosSearchShortcut({ tagName: "DIV", isContentEditable: true } as EventTarget)).toBe(false);
    expect(isPosSearchShortcut({ tagName: "BODY", isContentEditable: false } as EventTarget)).toBe(true);
  });
});
