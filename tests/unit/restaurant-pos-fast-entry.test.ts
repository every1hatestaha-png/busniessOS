import { describe, expect, it } from "vitest";

import { isPosSearchShortcut, parsePosFastEntry, resolvePosFastEntryItem } from "@/lib/restaurant/pos-fast-entry";

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
      expect(isPosSearchShortcut(Object.assign(new EventTarget(), { tagName }))).toBe(false);
    }
    expect(isPosSearchShortcut(Object.assign(new EventTarget(), { tagName: "DIV", isContentEditable: true }))).toBe(false);
    expect(isPosSearchShortcut(Object.assign(new EventTarget(), { tagName: "BODY", isContentEditable: false }))).toBe(true);
  });
});

describe("safe POS quick selection", () => {
  const available = (name: string, isAvailable = true) => ({ name, isAvailable });

  it("refuses ambiguous partial names instead of picking the first dish", () => {
    const menu = [available("Chicken Burger"), available("Chicken Biryani"), available("Tea")];
    expect(resolvePosFastEntryItem(menu, "chicken")).toBeNull();
    expect(resolvePosFastEntryItem(menu, "burger")).toEqual(menu[0]);
  });

  it("prefers one exact name even with substring matches", () => {
    const menu = [available("Chicken Curry"), available("Chicken")];
    expect(resolvePosFastEntryItem(menu, "  CHICKEN ")).toEqual(menu[1]);
  });

  it("rejects identical menu names and unavailable matches", () => {
    const duplicate = [available("Fries"), available("Fries")];
    expect(resolvePosFastEntryItem(duplicate, "fries")).toBeNull();
    expect(resolvePosFastEntryItem([available("Burger", false)], "burger")).toBeNull();
    expect(resolvePosFastEntryItem([available("Burger")], " ")).toBeNull();
  });
});
