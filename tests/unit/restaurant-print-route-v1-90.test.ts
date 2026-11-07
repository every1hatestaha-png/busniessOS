import React from "react";
import { beforeEach, expect, it, vi } from "vitest";
vi.stubGlobal("React", React);
const mocks = vi.hoisted(() => ({ auth: vi.fn(), document: vi.fn(), kitchenDocument: vi.fn(), notFound: vi.fn(() => { throw new Error("NOT_FOUND"); }) }));
vi.mock("next/navigation", () => ({ notFound: mocks.notFound }));
vi.mock("@/lib/server/auth", () => ({ requireWorkspace: mocks.auth }));
vi.mock("@/lib/server/restaurant-stations", () => ({ assertRestaurantStation: vi.fn() }));
vi.mock("@/lib/server/restaurant-print", () => ({ getRestaurantPrintDocument: mocks.document }));
vi.mock("@/lib/server/restaurant-kitchen-print", () => ({ getRestaurantKitchenPrintDocument: mocks.kitchenDocument }));
vi.mock("@/components/documents/document-frame", () => ({ DocumentFrame: () => null }));
vi.mock("@/components/invoices/print-button", () => ({ PrintButton: () => null }));
beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.mockResolvedValue({ workspaceId: "workspace-a", role: "STAFF", user: { id: "synthetic-kitchen" }, workspace: { name: "Synthetic" } });
});
it("direct KOT URL cannot instruct fulfilment of an unapproved WhatsApp order", async () => {
  mocks.kitchenDocument.mockResolvedValue({ orderNumber: "R-PENDING", status: "PENDING_REVIEW" });
  const { default: Page } = await import("@/app/(dashboard)/restaurant/orders/[id]/print/page");
  await expect(Page({ params: Promise.resolve({ id: "pending-order" }), searchParams: Promise.resolve({ kind: "kot" }) })).rejects.toThrow("NOT_FOUND");
  expect(mocks.document).not.toHaveBeenCalled();
  expect(mocks.kitchenDocument).toHaveBeenCalledWith("workspace-a", "pending-order");
});
it.each(["CONFIRMED", "PREPARING", "READY", "COMPLETED", "CANCELLED"])("%s kitchen history remains printable", async status => {
  mocks.kitchenDocument.mockResolvedValue({ orderNumber: "R-100", status });
  const { default: Page } = await import("@/app/(dashboard)/restaurant/orders/[id]/print/page");
  await expect(Page({ params: Promise.resolve({ id: "order" }), searchParams: Promise.resolve({ kind: "kot" }) })).resolves.toBeTruthy();
  expect(mocks.document).not.toHaveBeenCalled();
  expect(mocks.kitchenDocument).toHaveBeenCalledWith("workspace-a", "order");
});
