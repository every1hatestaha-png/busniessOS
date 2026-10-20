import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/app/(dashboard)/gate-passes/lifecycle-actions", () => ({
  issueGatePassAction: vi.fn(), dispatchGatePassAction: vi.fn(),
  cancelGatePassAction: vi.fn(), receivingGatePassAction: vi.fn(),
  returnedGatePassAction: vi.fn(),
}));
vi.mock("@/components/gate-passes/invoice-preparation", () => ({ GatePassInvoicePreparation: () => null }));

import { GatePassWorkflowControls } from "@/components/gate-passes/workflow-controls";

const base = {
  id: "00000000-0000-4000-8000-000000000001",
  status: "DRAFT" as const,
  items: [{ id: "item-1", name: "Example", quantity: "3", accepted: "0", rejected: "0", returned: "0", price: "25" }],
  customerReference: null, recipient: null, receivingNotes: null,
  deferredBillingReady: true, canIssue: true, canCancel: false,
  documentVersion: 0,
  issueDeductsStock: true, issueStockReady: true, stockAlreadyDeducted: false,
  canDispatch: false, canReceive: false, canInvoice: false,
};

function issueButton(props: typeof base) {
  const html = renderToStaticMarkup(createElement(GatePassWorkflowControls, props));
  return { html, button: html.match(/<button[^>]*>Issue Gate Pass<\/button>/)?.[0] ?? "" };
}

describe("Gate Pass V2 read-only pre-issue warning", () => {
  it("blocks V2 ISSUE on insufficient stock without hiding the explanation", () => {
    const { html, button } = issueButton({ ...base, issueStockReady: false });
    expect(button).toMatch(/\sdisabled(?:=|\s|>)/);
    expect(html).toContain("No stock will be deducted");
  });

  it("keeps billing prerequisite independently enforced for V2", () => {
    const { button } = issueButton({ ...base, deferredBillingReady: false });
    expect(button).toMatch(/\sdisabled(?:=|\s|>)/);
  });

  it("allows V2 ISSUE control when stock and billing preflight pass", () => {
    const { button } = issueButton(base);
    expect(button).not.toMatch(/\sdisabled(?:=|\s|>)/);
  });

  it("preserves legacy draft issuance without V2 stock/billing gates", () => {
    const { button } = issueButton({ ...base, issueDeductsStock: false, issueStockReady: false, deferredBillingReady: false });
    expect(button).not.toMatch(/\sdisabled(?:=|\s|>)/);
  });
  it("shows an explicit owner declaration with no preselected consent or enabled submit", () => {
    const html = renderToStaticMarkup(createElement(GatePassWorkflowControls, { ...base, deferredBillingReady: false, ownerAttestationEnabled: true, canAttestBilling: true }));
    expect(html).toContain("Owner invoice-timing declaration");
    expect(html).toContain("not independent professional clearance");
    expect(html).toContain('name="ownerBasis"');
    expect(html).not.toContain('checked=""');
    expect(html.match(/<button[^>]*>Issue Gate Pass<\/button>/)?.[0]).toContain('disabled=""');
  });
  it("offers the exact-document owner declaration at eligible legacy dispatch, with no preselected consents", () => {
    const html = renderToStaticMarkup(createElement(GatePassWorkflowControls, {
      ...base, status:"ISSUED", issueDeductsStock:false, canIssue:false, canDispatch:true,
      deferredBillingReady:false, ownerAttestationEnabled:true, canAttestBilling:true, documentVersion:1,
    }));
    expect(html).toContain("Owner invoice-timing declaration");
    expect(html).toContain('name="ownerDraftVersion" value="1"');
    expect(html).toContain("Legacy Gate Pass:");
    expect(html).not.toContain('checked=""');
    expect(html.match(/<button[^>]*>Confirm Dispatch<\/button>/)?.[0]).toContain('disabled=""');
  });
  it("keeps legacy dispatch unavailable without actual owner authority or available stock", () => {
    for (const props of [{canAttestBilling:false,canDispatch:true},{canAttestBilling:true,canDispatch:false}]) {
      const html = renderToStaticMarkup(createElement(GatePassWorkflowControls, {
        ...base, status:"ISSUED", issueDeductsStock:false, canIssue:false, deferredBillingReady:false,
        ownerAttestationEnabled:true, documentVersion:1, ...props,
      }));
      expect(html).not.toContain('name="ownerBasis"');
      expect(html).not.toContain("Confirm Dispatch</button>");
    }
  });
  it("does not offer owner declarations to other roles or legacy drafts", () => {
    for (const props of [{canAttestBilling:false,issueDeductsStock:true},{canAttestBilling:true,issueDeductsStock:false}]) {
      const html = renderToStaticMarkup(createElement(GatePassWorkflowControls, { ...base, deferredBillingReady:false, ownerAttestationEnabled:true, ...props }));
      expect(html).not.toContain('name="ownerBasis"');
    }
  });
});
