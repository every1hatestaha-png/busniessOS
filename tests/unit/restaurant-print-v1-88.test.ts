import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { RestaurantPrintDocument } from "@/lib/server/restaurant-print";
vi.stubGlobal("React", React);
const doc: RestaurantPrintDocument = {
  orderNumber: "R-100", status: "CANCELLED", paymentStatus: "UNPAID", fulfillmentType: "DINE_IN", tableName: "Table 1", customerName: "Customer", notes: "No salt", createdAt: new Date("2026-10-01T20:00:00Z"), timezone: "Asia/Karachi", subtotal: 200, discountAmount: 10, taxAmount: 5, total: 195, adjustedDue: 95, retainedPaid: 95, outstanding: 0,
  items: [{ itemName: '<script>alert("x")</script>', quantity: 2, unitPrice: 100, lineTotal: 200, notes: "No onions", modifiers: ["Extra sauce"] }],
  payments: [{ method: "BANK_TRANSFER", amount: 195, createdAt: new Date("2026-10-01T20:00:00Z"), postedAt: new Date(), voidedAt: new Date() }],
  returns: [{ returnNumber: "RR-100", total: 100, reason: "Returned", createdAt: new Date(), isReversal: false }], refunds: [{ amount: 95, reason: "Refunded", createdAt: new Date() }],
};
describe("Restaurant V1.88 operational print output", () => {
  it("renders statuses, payments, balances, return/refund history, and workspace date safely", async () => {
    const { RestaurantPrintBody } = await import("@/components/documents/restaurant-print-body");
    const html = renderToStaticMarkup(React.createElement(RestaurantPrintBody, { document: doc, reprint: true }));
    for (const text of ["CANCELLED, DO NOT FULFIL", "REPRINT COPY", "VOID", "BANK TRANSFER", "Remaining balance", "RR-100", "REFUND", "Asia/Karachi", "02-Oct-2026"]) expect(html).toContain(text);
    expect(html).not.toContain('<script>alert');
    expect(html).toContain('&lt;script&gt;');
  });
  it("kitchen copy includes quantities, modifiers and notes without financial/customer fields", async () => {
    const { RestaurantPrintBody } = await import("@/components/documents/restaurant-print-body");
    const html = renderToStaticMarkup(React.createElement(RestaurantPrintBody, { document: doc, kitchen: true }));
    for (const text of ["KITCHEN COPY", "Extra sauce", "No onions", "No salt", "Qty", "Table 1"]) expect(html).toContain(text);
    for (const text of ["Payments", "Subtotal", "BANK TRANSFER", "Customer", "Rs "]) expect(html).not.toContain(text);
  });
});
