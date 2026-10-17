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
});
