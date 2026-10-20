import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/app/(dashboard)/gate-passes/actions", () => ({
  createOutboundGatePassDraftAction: vi.fn(),
  updateOutboundGatePassDraftAction: vi.fn(),
}));

import { OutboundGatePassDraftForm } from "@/components/gate-passes/gate-pass-draft-form";

const customerId = "11111111-1111-4111-8111-111111111111";
const productId = "22222222-2222-4222-8222-222222222222";
const props = {
  customers: [{ id: customerId, name: "Test customer" }],
  products: [{ id: productId, name: "Front hub 150 CC", sku: "HUB-MCL-150CC", unit: "PIECE", stockQuantity: "4.0000" }],
  warehouses: [],
  managedWarehouse: false,
  idempotencyKey: "33333333-3333-4333-8333-333333333333",
};

describe("insufficient-stock replacement draft UI", () => {
  it("prefills the existing customer and product without pretending stock was received", () => {
    const html = renderToStaticMarkup(createElement(OutboundGatePassDraftForm, {
      ...props,
      initialDraft: {
        customerId, warehouseId: "", date: "2026-10-20", deliveryAddress: "Test delivery",
        notes: "Replacement draft based on GP-000001.",
        items: [{ productId, quantity: "300" }],
      },
    }));
    expect(html).toContain("Test delivery");
    expect(html).toContain("Replacement draft based on GP-000001.");
    expect(html).toContain('value="300"');
    expect(html).toContain("Core available: 4.0000 PIECE");
    expect(html).toContain("Requested quantity exceeds current core stock.");
    expect(html).toContain("Use core available quantity");
    expect(html).toContain("Save gate pass draft");
    // Copying never carries an existing GP id, version, or an already issued state.
    expect(html).not.toContain('name="gatePassId"');
    expect(html).not.toContain('name="version"');
  });

  it("does not show a fake availability warning before a product is chosen", () => {
    const html = renderToStaticMarkup(createElement(OutboundGatePassDraftForm, props));
    expect(html).not.toContain("Requested quantity exceeds current core stock.");
    expect(html).not.toContain("Use core available quantity");
  });

  it("preserves draft identity and edit form fields in the existing editing workflow", () => {
    const html = renderToStaticMarkup(createElement(OutboundGatePassDraftForm, {
      ...props, editing: {
        gatePassId: "44444444-4444-4444-8444-444444444444",
        version: 2, customerId, warehouseId: "", date: "2026-10-20",
        deliveryAddress: "", notes: "", items: [{ productId, quantity: "2" }],
      },
    }));
    expect(html).toContain('name="gatePassId"');
    expect(html).toContain('name="version"');
    expect(html).toContain("Save draft changes");
    expect(html).not.toContain("Requested quantity exceeds current core stock.");
  });
});
