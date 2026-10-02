import React from "react";
import { initialRestaurantV1ActionState, type RestaurantV1ActionState } from "../../../app/(dashboard)/restaurant/v1-action-state";
import { createRoot } from "react-dom/client";
import { RestaurantMutationForm } from "../../../app/(dashboard)/restaurant/mutation-form";
import { RestaurantPrintBody } from "../../../components/documents/restaurant-print-body";
import RestaurantError from "../../../app/(dashboard)/restaurant/error";
import { DocumentFrame } from "../../../components/documents/document-frame";
import { RestaurantPos } from "../../../app/(dashboard)/restaurant/pos/restaurant-pos";
import type { RestaurantPrintDocument } from "../../../lib/server/restaurant-print";
import "../../../app/globals.css";
import "../../../components/documents/restaurant-print.css";

let doc: RestaurantPrintDocument = {
  orderNumber: "SYNTHETIC-100", status: "COMPLETED", paymentStatus: "PAID", fulfillmentType: "DINE_IN", tableName: "Table 100", customerName: "Synthetic customer", notes: "Synthetic kitchen note", createdAt: new Date("2026-10-01T20:00:00Z"), timezone: "Asia/Karachi", subtotal: 6000, discountAmount: 0, taxAmount: 0, total: 6000, adjustedDue: 5900, retainedPaid: 5900, outstanding: 0,
  items: Array.from({ length: 30 }, (_, index) => ({ itemName: `Historical meal ${index} with a long name that must wrap safely`, quantity: 2, unitPrice: 100, lineTotal: 200, notes: "No onions", modifiers: ["Extra sauce"] })),
  payments: [{ method: "BANK_TRANSFER", amount: 6000, createdAt: new Date("2026-10-01T20:00:00Z"), postedAt: new Date("2026-10-01T20:00:01Z"), voidedAt: null }],
  returns: [{ returnNumber: "SYNTHETIC-RR-100", total: 100, reason: "Synthetic return", createdAt: new Date("2026-10-01T21:00:00Z"), isReversal: false }], refunds: [],
};
const printState = new URLSearchParams(location.search).get("state");
if (printState === "cancelled") doc = { ...doc, status:"CANCELLED", paymentStatus:"UNPAID", adjustedDue:6000, retainedPaid:0, outstanding:6000, payments:[], returns:[], refunds:[] };
if (printState === "refund") doc = { ...doc, paymentStatus:"UNPAID", adjustedDue:6000, retainedPaid:0, outstanding:6000, payments:doc.payments.map(payment => ({ ...payment,voidedAt:new Date("2026-10-01T21:00:00Z") })), returns:[], refunds:[{ amount:6000,reason:"Synthetic full refund",createdAt:new Date("2026-10-01T21:00:00Z") }] };
async function mutation(form: FormData) {
  const response = await fetch("/synthetic-mutation", { method: "POST", body: new URLSearchParams([...form.entries()].map(([key, value]) => [key, String(value)])) });
  return await response.json();
}
const kitchen = new URLSearchParams(location.search).get("kind") === "kot";
const errorPreview = new URLSearchParams(location.search).get("kind") === "error";
const unguardedPreview = new URLSearchParams(location.search).get("kind") === "unguarded";
const posPreview = new URLSearchParams(location.search).get("kind") === "pos";
function UnguardedStatefulProbe() {
  // Reproduce the previous stateful-form pattern: pending alone cannot stop
  // two submit events dispatched before React renders the pending state.
  const [state, action, pending] = React.useActionState((_previous: RestaurantV1ActionState, form: FormData) => mutation(form), initialRestaurantV1ActionState);
  return <form action={action} data-pending={String(pending)}><input type="hidden" name="formWorkspaceId" value="synthetic-workspace" /><button type="submit" disabled={pending}>Unguarded synthetic form</button>{state.message ? <p role="alert">{state.message}</p> : null}</form>;
}
// eslint-disable-next-line @next/next/no-location-assign-relative-destination -- Standalone browser fixture has no Next router.
createRoot(document.getElementById("root")!).render(errorPreview ? <RestaurantError reset={() => location.assign("/")} /> : unguardedPreview ? <UnguardedStatefulProbe /> : posPreview ? <RestaurantPos workspaceId="synthetic-workspace" categories={[{ id:"synthetic-category",name:"Synthetic category",sortOrder:0,isActive:true }]} items={[{ id:"synthetic-menu",categoryId:"synthetic-category",categoryName:"Synthetic category",name:"Synthetic meal",description:null,price:100,isAvailable:true }]} tables={[]} canFinancialOverride={false} /> : <>
  <div className="print:hidden"><RestaurantMutationForm action={mutation} workspaceId="synthetic-workspace"><input name="reason" defaultValue="Synthetic reason" /><button type="submit">Submit synthetic mutation</button></RestaurantMutationForm></div>
  <div data-restaurant-print><DocumentFrame workspace={{ name: "Synthetic Restaurant" }} title={kitchen ? "Kitchen order ticket" : "Restaurant receipt"} number={doc.orderNumber}><RestaurantPrintBody document={doc} kitchen={kitchen} reprint /></DocumentFrame></div>
</>);
