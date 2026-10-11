import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { posPayablePreview } from "@/lib/restaurant/pos-payable-preview";

const fixture = vi.hoisted(() => ({ states: [] as unknown[], pending: false }));
vi.mock("react", async (original) => {
  const actual = await original<typeof import("react")>();
  return { ...actual, useState: (initial: unknown) => actual.useState(fixture.states.length ? fixture.states.shift() : initial) };
});
vi.mock("next/link", () => ({ default: ({ children, ...props }: React.ComponentProps<"a">) => React.createElement("a", props, children) }));
vi.mock("@/app/(dashboard)/restaurant/v1-actions", () => ({ createPosOrderAction: vi.fn() }));
vi.mock("@/app/(dashboard)/restaurant/use-restaurant-action-state", () => ({
  useRestaurantActionState: () => [{ status: "idle", message: "" }, "/synthetic-action", fixture.pending, vi.fn()],
}));

async function render({ discount = "10", tax = "15", privileged = true, pending = false } = {}) {
  fixture.pending = pending;
  fixture.states = [[{ menuItemId: "burger", name: "QA Burger", price: 200, quantity: 1 }], "", discount, tax, "all", "TAKEAWAY"];
  const { RestaurantPos } = await import("@/app/(dashboard)/restaurant/pos/restaurant-pos");
  return renderToStaticMarkup(React.createElement(RestaurantPos, {
    workspaceId: "synthetic-workspace", categories: [], items: [], tables: [], canFinancialOverride: privileged,
  }));
}

describe("Restaurant POS QA UI regressions", () => {
  beforeEach(() => { fixture.states = []; fixture.pending = false; });
  it("names all populated-cart controls for assistive technology", async () => {
    const html = await render();
    for (const name of ["Remove QA Burger from order", "Decrease quantity of QA Burger", "Increase quantity of QA Burger"]) {
      expect(html).toContain(`aria-label="${name}"`);
      expect(html).toMatch(new RegExp(`<button[^>]*type="button"[^>]*aria-label="${name}"`));
    }
  });
  it("keeps each cart control disabled while a submission is pending", async () => {
    const html = await render({ pending: true });
    for (const name of ["Remove QA Burger from order", "Decrease quantity of QA Burger", "Increase quantity of QA Burger"]) {
      const button = html.match(new RegExp(`<button[^>]*aria-label="${name}"[^>]*>`))?.[0];
      expect(button).toBeDefined();
      expect(button).toContain('disabled=""');
    }
  });
  it("renders the final 200 - 10 + 15 payable estimate and preserves the scoped item-only payload", async () => {
    const html = await render();
    expect(html).toContain('aria-label="Final payable preview"');
    expect(html).toMatch(/Final payable<\/span><span>Rs 205<\/span>/);
    expect(html).toContain('name="formWorkspaceId" value="synthetic-workspace"');
    expect(html).toContain('name="orderRequestId"');
    expect(html).toContain('&quot;menuItemId&quot;:&quot;burger&quot;,&quot;quantity&quot;:1');
    expect(html).not.toContain('name="total"');
    expect(html).toContain("Server validates final prices and totals");
  });
  it("does not expose or apply financial overrides for unprivileged POS users", async () => {
    const html = await render({ privileged: false });
    expect(html).not.toMatch(/name="(?:taxAmount|discountAmount)"/);
    expect(html).toMatch(/Final payable<\/span><span>Rs 200<\/span>/);
  });
  it("blocks confirmation when a reduced cart subtotal is below the discount", async () => {
    const html = await render({ discount: "201" });
    expect(html).toContain("Check discount and tax");
    expect(html).toMatch(/<button[^>]*type="submit"[^>]*disabled=""/);
  });
  it("matches server line rounding before summing and final rounding", () => {
    expect(posPayablePreview([{ price: 0.335, quantity: 1 }, { price: 0.335, quantity: 1 }], "0.10", "0.15", true))
      .toEqual({ subtotal: 0.68, discount: 0.1, tax: 0.15, payable: 0.73 });
  });
  it.each([['-1', '0'], ['0', '-1'], ['NaN', '0'], ['0', 'Infinity'], ['201', '0']])("rejects invalid estimate amounts %s / %s", (discount, tax) => {
    expect(posPayablePreview([{ price: 200, quantity: 1 }], discount, tax, true).payable).toBeNull();
  });
  it("updates estimates for quantity changes, removal and cleared overrides", () => {
    expect(posPayablePreview([{ price: 200, quantity: 2 }], "10", "15", true).payable).toBe(405);
    expect(posPayablePreview([{ price: 200, quantity: 1 }], "10", "15", true).payable).toBe(205);
    expect(posPayablePreview([], "0", "0", true).payable).toBe(0);
  });
});
