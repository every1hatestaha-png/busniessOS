import { describe, expect, it } from "vitest";
import { getDedicatedPrintRoute } from "@/lib/print-routing";

describe("getDedicatedPrintRoute", () => {
  it("routes purchase detail to its dedicated print page", () => {
    expect(getDedicatedPrintRoute("/purchases/po-123")).toBe("/purchases/po-123/print");
  });

  it("routes GRN detail to its dedicated print page", () => {
    expect(getDedicatedPrintRoute("/goods-receipts/grn-123/")).toBe("/goods-receipts/grn-123/print");
  });

  it("routes service quotation detail to its dedicated print page", () => {
    expect(getDedicatedPrintRoute("/services/quotes/quote-123")).toBe("/services/quotes/quote-123/print");
  });

  it("routes gate pass details to the signed standalone print surface", () => {
    expect(getDedicatedPrintRoute("/gate-passes/gp-123")).toBe("/gate-passes/gp-123/print");
    expect(getDedicatedPrintRoute("/gate-passes")).toBeNull();
    expect(getDedicatedPrintRoute("/gate-passes/gp-123/print")).toBeNull();
  });

  it("does not recurse from an existing print page", () => {
    expect(getDedicatedPrintRoute("/goods-receipts/grn-123/print")).toBeNull();
  });

  it.each(["new", "pending-invoices", "in-transit"])("never turns the %s screen into a nonexistent print route", (segment) => {
    expect(getDedicatedPrintRoute(`/gate-passes/${segment}`)).toBeNull();
    expect(getDedicatedPrintRoute(`/gate-passes/${segment}/`)).toBeNull();
  });

  it("leaves pages with inline print surfaces alone", () => {
    expect(getDedicatedPrintRoute("/invoices/inv-123")).toBeNull();
    expect(getDedicatedPrintRoute("/payments/pay-123")).toBeNull();
    expect(getDedicatedPrintRoute("/reports/profit-loss")).toBeNull();
  });
});
