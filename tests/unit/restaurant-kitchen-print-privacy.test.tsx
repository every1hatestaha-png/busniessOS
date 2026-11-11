import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.stubGlobal("React", React);
const mocks = vi.hoisted(() => ({
  require: vi.fn(),
  station: vi.fn(),
  kot: vi.fn(),
  receipt: vi.fn(),
  query: vi.fn(),
  module: vi.fn(),
}));
vi.mock("@/lib/server/auth", () => ({ requireWorkspace: mocks.require }));
vi.mock("@/lib/server/restaurant-stations", () => ({ assertRestaurantStation: mocks.station }));
vi.mock("@/lib/server/restaurant-kitchen-print", () => ({
  getRestaurantKitchenPrintDocument: mocks.kot,
}));
vi.mock("@/lib/server/restaurant-print", () => ({
  getRestaurantPrintDocument: mocks.receipt,
}));
vi.mock("next/navigation", () => ({
  notFound: (): never => { throw Error("notFound"); },
}));
vi.mock("@/components/invoices/print-button", () => ({
  PrintButton: ({ label = "Print" }: { label?: string }) => React.createElement("button", {}, label),
}));
vi.mock("@/components/documents/document-frame", () => ({
  DocumentFrame: ({ children, number }: { children: React.ReactNode; number: string }) =>
    React.createElement("article", {}, number, children),
}));
vi.mock("@/components/documents/restaurant-print-body", () => ({
  RestaurantPrintBody: () => React.createElement("p", {}, "Cashier receipt"),
}));
vi.mock("@/lib/server/db", () => ({
  db: { $transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn({ $queryRaw: mocks.query }) },
}));
vi.mock("@/lib/server/industry-modules", () => ({
  requireWorkspaceModule: mocks.module,
}));

const orderId = "22222222-2222-4222-8222-222222222222";
const ticket = {
  orderNumber: "R-002", status: "PREPARING", fulfillmentType: "DINE_IN",
  tableName: "Table 2", notes: "No onions",
  createdAt: new Date("2026-11-01T14:00:00Z"),
  items: [{ itemName: "Chicken pizza", quantity: 2, notes: "Peanut allergy", modifiers: ["No nuts"] }],
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.require.mockResolvedValue({
    workspaceId: "synthetic-restaurant", workspace: { name: "Private Restaurant", ntn: "SECRET-NTN" },
    role: "STAFF", user: { id: "kitchen-employee" },
  });
  mocks.station.mockResolvedValue(undefined);
  mocks.kot.mockResolvedValue(ticket);
  mocks.receipt.mockResolvedValue({ orderNumber: "R-002", status: "PREPARING" });
  mocks.module.mockResolvedValue(undefined);
  mocks.query.mockResolvedValue([]);
});

describe("Kitchen KOT privacy boundary", () => {
  it("renders a Kitchen copy without invoking any financial receipt read", async () => {
    const Page = (await import("@/app/(dashboard)/restaurant/orders/[id]/print/page")).default;
    const element = await Page({
      params: Promise.resolve({ id: orderId }),
      searchParams: Promise.resolve({ kind: "kot" }),
    });
    const html = renderToStaticMarkup(element);
    expect(html).toContain("Chicken pizza");
    expect(html).toContain("Peanut allergy");
    expect(html).toContain("KITCHEN COPY");
    expect(html).not.toContain("SECRET-NTN");
    expect(html).not.toContain("Rs ");
    expect(html).not.toContain("Cashier receipt");
    expect(mocks.kot).toHaveBeenCalledWith("synthetic-restaurant", orderId);
    expect(mocks.receipt).not.toHaveBeenCalled();
    expect(mocks.station).toHaveBeenCalledWith({
      workspaceId: "synthetic-restaurant", role: "STAFF", userId: "kitchen-employee",
    }, "KITCHEN");
  });

  it("prints a price-free Kitchen ticket despite an invalid legacy workspace timezone", async () => {
    mocks.require.mockResolvedValue({
      workspaceId: "synthetic-restaurant",
      workspace: { name: "Private Restaurant", timezone: "Invalid/Legacy_Zone", ntn: "SECRET-NTN" },
      role: "STAFF", user: { id: "kitchen-employee" },
    });
    const Page = (await import("@/app/(dashboard)/restaurant/orders/[id]/print/page")).default;
    const html = renderToStaticMarkup(await Page({
      params: Promise.resolve({ id: orderId }),
      searchParams: Promise.resolve({ kind: "kot" }),
    }));
    expect(html).toContain("KITCHEN COPY");
    expect(html).toContain("Order placed:");
    expect(html).toContain("7:00 pm");
    expect(html).not.toContain("SECRET-NTN");
    expect(html).not.toContain("Rs ");
    expect(mocks.receipt).not.toHaveBeenCalled();
  });

  it("requires CASHIER station for normal receipts and does not load KOT", async () => {
    const Page = (await import("@/app/(dashboard)/restaurant/orders/[id]/print/page")).default;
    const element = await Page({
      params: Promise.resolve({ id: orderId }),
      searchParams: Promise.resolve({ kind: "receipt" }),
    });
    expect(renderToStaticMarkup(element)).toContain("Cashier receipt");
    expect(mocks.receipt).toHaveBeenCalledWith("synthetic-restaurant", orderId);
    expect(mocks.kot).not.toHaveBeenCalled();
    expect(mocks.station).toHaveBeenCalledWith(expect.anything(), "CASHIER");
  });

  it("selects only operational order/item columns for Kitchen printing", async () => {
    const { getRestaurantKitchenPrintDocument } =
      await vi.importActual<typeof import("@/lib/server/restaurant-kitchen-print")>(
        "@/lib/server/restaurant-kitchen-print"
      );
    mocks.query
      .mockResolvedValueOnce([{
        orderNumber: "R-002", status: "PREPARING", fulfillmentType: "DINE_IN",
        tableName: "Table 2", notes: "No onions", createdAt: new Date(),
      }])
      .mockResolvedValueOnce([{ itemName: "Pizza", quantity: 2, notes: null, modifiers: [] }]);
    const result = await getRestaurantKitchenPrintDocument("synthetic-restaurant", orderId);
    expect(result).not.toHaveProperty("total");
    expect(result).not.toHaveProperty("paymentStatus");
    expect(result).not.toHaveProperty("customerName");
    expect(result).not.toHaveProperty("customerPhone");
    expect(result).not.toHaveProperty("bankAccount");
    const sql = mocks.query.mock.calls.map(args => Array.from(args[0] as TemplateStringsArray).join(" ")).join("\n");
    expect(sql).toContain('ro."workspaceId"=');
    expect(sql).not.toContain('"unitPrice"');
    expect(sql).not.toContain('"lineTotal"');
    expect(sql).not.toContain('"customerName"');
    expect(sql).not.toContain('"payments"');
  });
});
