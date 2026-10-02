import React from "react";
import { createRoot } from "react-dom/client";
import { RestaurantMutationForm } from "../../../app/(dashboard)/restaurant/mutation-form";
import { RestaurantPrintBody } from "../../../components/documents/restaurant-print-body";
import type { RestaurantPrintDocument } from "../../../lib/server/restaurant-print";
import "../../../app/globals.css";

const doc: RestaurantPrintDocument = {
  orderNumber: "SYNTHETIC-100", status: "CANCELLED", paymentStatus: "UNPAID", fulfillmentType: "DINE_IN", tableName: "Table 100", customerName: "Synthetic customer", notes: "Synthetic kitchen note", createdAt: new Date("2026-10-01T20:00:00Z"), timezone: "Asia/Karachi", subtotal: 200, discountAmount: 10, taxAmount: 5, total: 195, adjustedDue: 95, retainedPaid: 95, outstanding: 0,
  items: Array.from({ length: 30 }, (_, index) => ({ itemName: `Historical meal ${index} with a long name that must wrap safely`, quantity: 2, unitPrice: 100, lineTotal: 200, notes: "No onions", modifiers: ["Extra sauce"] })),
  payments: [{ method: "BANK_TRANSFER", amount: 195, createdAt: new Date("2026-10-01T20:00:00Z"), postedAt: new Date(), voidedAt: new Date() }],
  returns: [{ returnNumber: "SYNTHETIC-RR-100", total: 100, reason: "Synthetic return", createdAt: new Date(), isReversal: false }], refunds: [{ amount: 95, reason: "Synthetic refund", createdAt: new Date() }],
};
async function mutation(form: FormData) {
  const response = await fetch("/synthetic-mutation", { method: "POST", body: new URLSearchParams([...form.entries()].map(([key, value]) => [key, String(value)])) });
  return await response.json();
}
const kitchen = new URLSearchParams(location.search).get("kind") === "kot";
createRoot(document.getElementById("root")!).render(<>
  <div className="print:hidden"><RestaurantMutationForm action={mutation} workspaceId="synthetic-workspace"><input name="reason" defaultValue="Synthetic reason" /><button type="submit">Submit synthetic mutation</button></RestaurantMutationForm></div>
  <article data-document data-print-surface className="mx-auto max-w-[210mm] bg-white p-6 text-neutral-950 print:p-0"><header><h1>{doc.orderNumber}</h1></header><RestaurantPrintBody document={doc} kitchen={kitchen} reprint /></article>
</>);
