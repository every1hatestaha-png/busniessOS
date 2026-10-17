import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Prisma } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import { canPrepareGatePassInvoice, gatePassInvoicePreview, hasFinalGatePassReceiving } from "@/lib/delivery-acceptance/invoice-preparation";

vi.mock("@/app/(dashboard)/gate-passes/lifecycle-actions", () => ({ invoiceGatePassAction: vi.fn() }));
import { GatePassInvoicePreparation } from "@/components/gate-passes/invoice-preparation";

const props = { id: "10000000-0000-4000-8000-000000000001", status: "ISSUED", deferredBillingReady: false,
  items: [{ id: "item", name: "Synthetic item", quantity: "10", accepted: "0", price: "200" }] };

describe("manual Gate Pass invoice preparation", () => {
  it.each(["ISSUED", "IN_TRANSIT", "RECEIVING_PENDING", "ACCEPTED", "PARTIALLY_ACCEPTED"])("allows preparation for %s without granting issuance", (status) => {
    expect(canPrepareGatePassInvoice(status)).toBe(true);
    expect(hasFinalGatePassReceiving(status)).toBe(["ACCEPTED", "PARTIALLY_ACCEPTED"].includes(status));
  });
  it.each(["DRAFT", "REJECTED", "CANCELLED", "INVOICED", "unknown"])("never offers a new invoice for %s", (status) => {
    expect(canPrepareGatePassInvoice(status)).toBe(false);
    expect(renderToStaticMarkup(createElement(GatePassInvoicePreparation, { ...props, status }))).toBe("");
  });
  it.each(["ISSUED", "IN_TRANSIT", "RECEIVING_PENDING"])("renders %s preparation without an issuance payload or submit button", (status) => {
    const html = renderToStaticMarkup(createElement(GatePassInvoicePreparation, { ...props, status, deferredBillingReady: true }));
    expect(html).toContain('id="generate-invoice"');
    expect(html).toContain("Create Invoice from Gate Pass");
    expect(html).toContain("Preparation only");
    expect(html).toContain("open tab only");
    expect(html).not.toContain('name="gatePassId"');
    expect(html).not.toContain('name="linesJson"');
    expect(html).not.toContain('type="submit"');
  });
  it("allows accepted preparation while compliance is blocked, with no issuance controls", () => {
    const html = renderToStaticMarkup(createElement(GatePassInvoicePreparation, { ...props, status: "PARTIALLY_ACCEPTED", items: [{ ...props.items[0], accepted: "8" }] }));
    expect(html).toContain("Final issuance is blocked");
    expect(html).toContain("Accepted product");
    expect(html).not.toContain('name="complianceAcknowledged"');
    expect(html).not.toContain('type="submit"');
  });
  it("requires explicit tax choice and acknowledgement before final issuance and excludes rejected-only lines", () => {
    const html = renderToStaticMarkup(createElement(GatePassInvoicePreparation, { ...props, status: "PARTIALLY_ACCEPTED", deferredBillingReady: true,
      items: [{ ...props.items[0], accepted: "8" }, { ...props.items[0], id: "rejected", name: "Rejected only", accepted: "0" }] }));
    expect(html).toContain('name="complianceAcknowledged"');
    expect(html).toContain('name="linesJson"');
    expect(html).toContain("Create Final Invoice");
    expect(html).toMatch(/<button[^>]*disabled/);
    expect(html).not.toContain("Rejected only");
  });
  it("rounds each taxable line before its tax, including half-cent boundaries", () => {
    expect(gatePassInvoicePreview([{ quantity: "1.5", unitPrice: "0.01", taxRate: "25" }])).toEqual({ subtotal: "0.02", tax: "0.01", total: "0.03" });
    expect(gatePassInvoicePreview([{ quantity: "8", unitPrice: "200", taxRate: "18" }])).toEqual({ subtotal: "1600.00", tax: "288.00", total: "1888.00" });
  });
  it("matches independent Decimal financial rounding over fractional multi-line examples", () => {
    for (let i = 1; i <= 200; i++) {
      const lines = [1, 3, 7].map((n) => ({ quantity: (i * n / 10000).toFixed(4), unitPrice: (i / 100).toFixed(2), taxRate: (n / 10000).toFixed(4) }));
      let subtotal = new Prisma.Decimal(0), tax = new Prisma.Decimal(0);
      for (const line of lines) {
        const base = new Prisma.Decimal(line.quantity).mul(line.unitPrice).toDecimalPlaces(2);
        subtotal = subtotal.plus(base);
        tax = tax.plus(base.mul(line.taxRate).div(100).toDecimalPlaces(2));
      }
      expect(gatePassInvoicePreview(lines)).toEqual({ subtotal: subtotal.toFixed(2), tax: tax.toFixed(2), total: subtotal.plus(tax).toFixed(2) });
    }
  });
  it.each([
    { quantity: "1", unitPrice: "200", taxRate: "" },
    { quantity: "0", unitPrice: "200", taxRate: "18" },
    { quantity: "-1", unitPrice: "200", taxRate: "18" },
    { quantity: "1", unitPrice: "1.001", taxRate: "18" },
    { quantity: "1", unitPrice: "Infinity", taxRate: "18" },
    { quantity: "1", unitPrice: "1", taxRate: "100.0001" },
    { quantity: "1", unitPrice: "1", taxRate: "-1" },
    { quantity: "99999999999", unitPrice: "99999999999", taxRate: "100" },
  ])("rejects invalid or unrepresentable previews %j", (line) => expect(gatePassInvoicePreview([line])).toBeNull());
  it("requires lines and keeps explicit zero tax valid", () => {
    expect(gatePassInvoicePreview([])).toBeNull();
    expect(gatePassInvoicePreview([{ quantity: "0.0001", unitPrice: "1", taxRate: "0" }])).toEqual({ subtotal: "0.00", tax: "0.00", total: "0.00" });
  });
});
