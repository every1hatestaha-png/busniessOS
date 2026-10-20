import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { GatePassStockShortageGuidance } from "@/components/gate-passes/stock-shortage-guidance";

const gatePassId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const productId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const shortage = [{ productId, name: "front hub 150 CC", required: "300.0000", available: "4.0000", shortfall: "296.0000" }];

function render(overrides: Partial<Parameters<typeof GatePassStockShortageGuidance>[0]> = {}) {
  return renderToStaticMarkup(createElement(GatePassStockShortageGuidance, {
    shortages: shortage, isV2Draft: false, canReviewInventory: true,
    canCreateReplacement: true, gatePassId, ...overrides,
  }));
}

describe("actionable Gate Pass stock shortages", () => {
  it("shows exact physical shortfall without claiming a reservation or stock adjustment", () => {
    const html = render();
    expect(html).toContain("front hub 150 CC");
    expect(html).toContain("required 300.0000");
    expect(html).toContain("available 4.0000");
    expect(html).toContain("short 296.0000");
    expect(html).toContain("not a reservation");
    expect(html).toContain("Do not enter stock that does not physically exist.");
    expect(html).toContain(`href="/inventory/${productId}"`);
    expect(html).toContain(`/gate-passes/new?copyFrom=${gatePassId}`);
  });

  it("does not show unauthorized stock navigation or a replacement action", () => {
    const html = render({ canReviewInventory: false, canCreateReplacement: false });
    expect(html).toContain("short 296.0000");
    expect(html).not.toContain('href="/inventory/');
    expect(html).not.toContain("Prepare replacement draft");
  });

  it("does not link to a missing product or pretend it can be dispatched", () => {
    const html = render({
      shortages: [{ productId: null, name: "Unavailable inventory product", required: "5", available: "0", shortfall: "5" }],
      canCreateReplacement: false,
    });
    expect(html).toContain("Product record unavailable");
    expect(html).not.toContain("href=\"/inventory/");
    expect(html).toContain("cannot proceed yet");
  });

  it("distinguishes V2 ISSUE-time stock blocks from legacy DISPATCH blocks", () => {
    const html = render({ isV2Draft: true, canCreateReplacement: false });
    expect(html).toContain("Insufficient V2 issue stock");
    expect(html).toContain("issuance");
    expect(html).not.toContain("Prepare replacement draft");
  });

  it("renders nothing for a ready Gate Pass", () => {
    expect(render({ shortages: [] })).toBe("");
  });
});
