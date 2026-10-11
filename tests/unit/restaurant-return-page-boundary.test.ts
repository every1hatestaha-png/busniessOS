import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.stubGlobal("React", React);
const mocks = vi.hoisted(() => ({ auth: vi.fn(), state: vi.fn(), reversals: vi.fn(), notFound: vi.fn(() => { throw new Error("NEXT_NOT_FOUND"); }) }));
vi.mock("next/navigation", () => ({ notFound: mocks.notFound }));
vi.mock("@/lib/server/auth", () => ({ requireWorkspace: mocks.auth }));
vi.mock("@/lib/server/db", () => ({ db: {} }));
vi.mock("@/lib/server/restaurant-return-ui", () => ({ getRestaurantReturnUiState: mocks.state }));
vi.mock("@/lib/server/restaurant-return-reversal-ui", () => ({ listRestaurantReturnReversalState: mocks.reversals }));
vi.mock("@/app/(dashboard)/restaurant/v1-actions", () => ({ createRestaurantItemReturnAction: vi.fn() }));
vi.mock("@/app/(dashboard)/restaurant/orders/[id]/return/reversal-actions", () => ({ reverseRestaurantReturnAction: vi.fn() }));
vi.mock("@/app/(dashboard)/restaurant/mutation-form", () => ({ RestaurantMutationForm: () => null }));

import { IndustryDomainError } from "@/lib/server/industry-modules";
import Page from "@/app/(dashboard)/restaurant/orders/[id]/return/page";

describe("Restaurant return page tenant boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({ workspaceId: "workspace-A", role: "OWNER" });
    mocks.reversals.mockResolvedValue([]);
  });
  it.each(["NOT_FOUND", "INVALID_STATE"] as const)("renders not-found for %s without changing tenant scope", async code => {
    mocks.state.mockRejectedValue(new IndustryDomainError(code, "Unavailable order."));
    await expect(Page({ params: Promise.resolve({ id: "foreign-or-invalid-order" }) })).rejects.toThrow("NEXT_NOT_FOUND");
    expect(mocks.state).toHaveBeenCalledWith("workspace-A", "foreign-or-invalid-order");
    expect(mocks.reversals).toHaveBeenCalledWith("workspace-A", "foreign-or-invalid-order");
  });
  it("preserves unexpected database errors", async () => {
    const failure = new Error("database unavailable");
    mocks.state.mockRejectedValue(failure);
    await expect(Page({ params: Promise.resolve({ id: "order" }) })).rejects.toBe(failure);
    expect(mocks.notFound).not.toHaveBeenCalled();
  });
  it("keeps authentication failures closed before reading an order", async () => {
    mocks.auth.mockRejectedValue(new Error("AUTH_REQUIRED"));
    await expect(Page({ params: Promise.resolve({ id: "order" }) })).rejects.toThrow("AUTH_REQUIRED");
    expect(mocks.state).not.toHaveBeenCalled();
  });
  it("renders an available same-workspace order", async () => {
    mocks.state.mockResolvedValue({ order: { orderNumber: "SYNTHETIC", status: "COMPLETED", subtotal: 10, discountAmount: 0, taxAmount: 0, total: 10 }, items: [], returns: [] });
    await expect(Page({ params: Promise.resolve({ id: "allowed-order" }) })).resolves.toBeTruthy();
    expect(mocks.notFound).not.toHaveBeenCalled();
  });
});
