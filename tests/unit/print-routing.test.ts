import { describe, expect, it } from "vitest";
import { getDedicatedPrintRoute } from "@/lib/print-routing";

describe("getDedicatedPrintRoute", () => {
  it("routes purchase detail to its dedicated print page", () => {
    expect(getDedicatedPrintRoute("/purchases/po-123")).toBe("/purchases/po-123/print");
  });

  it("routes GRN detail to its dedicated print page", () => {
    expect(getDedicatedPrintRoute("/goods-receipts/grn-123/")).toBe("/goods-receipts/grn-123/print");
  });

  it("does not recurse from an existing print page", () => {
    expect(getDedicatedPrintRoute("/goods-receipts/grn-123/print")).toBeNull();
  });

  it("leaves pages with inline print surfaces alone", () => {
    expect(getDedicatedPrintRoute("/invoices/inv-123")).toBeNull();
    expect(getDedicatedPrintRoute("/payments/pay-123")).toBeNull();
    expect(getDedicatedPrintRoute("/reports/profit-loss")).toBeNull();
  });
});
