import { describe, expect, it } from "vitest";

import { findProductByScanCode, normalizeScanCode } from "@/lib/product-scan";

describe("product scan matching", () => {
  const products = [
    { id: "1", sku: "04465-33450/A" },
    { id: "2", sku: "NGK.BKR6E-11" },
  ];

  it("normalizes scanner whitespace and case", () => {
    expect(normalizeScanCode("  ngk.bkr6e-11\n")).toBe("NGK.BKR6E-11");
    expect(findProductByScanCode(products, "ngk.bkr6e-11")?.id).toBe("2");
  });

  it("matches automotive SKU punctuation exactly", () => {
    expect(findProductByScanCode(products, "04465-33450/A")?.id).toBe("1");
  });

  it("returns null for blank or unknown scans", () => {
    expect(findProductByScanCode(products, "")).toBeNull();
    expect(findProductByScanCode(products, "UNKNOWN")).toBeNull();
  });
});
