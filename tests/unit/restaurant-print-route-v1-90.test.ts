import React from "react";
import { beforeEach, expect, it, vi } from "vitest";
vi.stubGlobal("React", React);
const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  document: vi.fn(),
  kitchenDocument: vi.fn(),
  station: vi.fn(),
  notFound: vi.fn(() => { throw new Error("NOT_FOUND"); }),
}));
vi.mock("next/navigation", () => ({ notFound: mocks.notFound }));
vi.mock("@/lib/server/auth", () => ({ requireWorkspace: mocks.auth }));
vi.mock("@/lib/server/restaurant-stations", () => ({ assertRestaurantStation: mocks.station }));
vi.mock("@/lib/server/restaurant-print", () => ({ getRestaurantPrintDocument: mocks.document }));
vi.mock("@/lib/server/restaurant-kitchen-print", () => ({ getRestaurantKitchenPrintDocument: mocks.kitchenDocument }));
vi.mock("@/components/documents/document-frame", () => ({ DocumentFrame: () => null }));
vi.mock("@/components/invoices/print-button", () => ({ PrintButton: () => null }));
beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.mockResolvedValue({ workspaceId: "workspace-a", role: "STAFF", user: { id: "synthetic-kitchen" }, workspace: { name: "Synthetic" } });
});
it("denies cashier KOT before loading the operational print projection", async () => {
  mocks.auth.mockResolvedValue({ workspaceId: "workspace-a", role: "STAFF", user: { id: "synthetic-cashier" }, workspace: { name: "Synthetic" } });
  mocks.station.mockRejectedValue(new Error("STATION_ONLY"));
  const { default: Page } = await import("@/app/(dashboard)/restaurant/orders/[id]/print/page");
  await expect(Page({ params: Promise.resolve({ id: "order" }), searchParams: Promise.resolve({ kind: "kot" }) })).rejects.toThrow("STATION_ONLY");
  expect(mocks.station).toHaveBeenCalledWith({ workspaceId: "workspace-a", role: "STAFF", userId: "synthetic-cashier" }, "KITCHEN");
  expect(mocks.kitchenDocument).not.toHaveBeenCalled();
  expect(mocks.document).not.toHaveBeenCalled();
});
it("denies kitchen receipt access before loading financial receipt data", async () => {
  mocks.station.mockRejectedValue(new Error("STATION_ONLY"));
  const { default: Page } = await import("@/app/(dashboard)/restaurant/orders/[id]/print/page");
  await expect(Page({ params: Promise.resolve({ id: "order" }), searchParams: Promise.resolve({ kind: "receipt" }) })).rejects.toThrow("STATION_ONLY");
  expect(mocks.station).toHaveBeenCalledWith({ workspaceId: "workspace-a", role: "STAFF", userId: "synthetic-kitchen" }, "CASHIER");
  expect(mocks.document).not.toHaveBeenCalled();
  expect(mocks.kitchenDocument).not.toHaveBeenCalled();
});
it("direct KOT URL cannot instruct fulfilment of an unapproved WhatsApp order", async () => {
  mocks.kitchenDocument.mockResolvedValue({ orderNumber: "R-PENDING", status: "PENDING_REVIEW" });
  const { default: Page } = await import("@/app/(dashboard)/restaurant/orders/[id]/print/page");
  await expect(Page({ params: Promise.resolve({ id: "pending-order" }), searchParams: Promise.resolve({ kind: "kot" }) })).rejects.toThrow("NOT_FOUND");
  expect(mocks.document).not.toHaveBeenCalled();
  expect(mocks.kitchenDocument).toHaveBeenCalledWith("workspace-a", "pending-order");
  expect(mocks.station).toHaveBeenCalledWith({ workspaceId: "workspace-a", role: "STAFF", userId: "synthetic-kitchen" }, "KITCHEN");
});
it.each(["CONFIRMED", "PREPARING", "READY", "COMPLETED", "CANCELLED"])("%s kitchen history remains printable", async status => {
  mocks.kitchenDocument.mockResolvedValue({ orderNumber: "R-100", status });
  const { default: Page } = await import("@/app/(dashboard)/restaurant/orders/[id]/print/page");
  await expect(Page({ params: Promise.resolve({ id: "order" }), searchParams: Promise.resolve({ kind: "kot" }) })).resolves.toBeTruthy();
  expect(mocks.document).not.toHaveBeenCalled();
  expect(mocks.kitchenDocument).toHaveBeenCalledWith("workspace-a", "order");
  expect(mocks.station).toHaveBeenCalledWith({ workspaceId: "workspace-a", role: "STAFF", userId: "synthetic-kitchen" }, "KITCHEN");
});
