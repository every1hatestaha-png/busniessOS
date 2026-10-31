import type { RestaurantKitchenPrintDocument } from "@/lib/server/restaurant-kitchen-print";

/** Never accept a financial receipt object as a Kitchen document. */
export function RestaurantKitchenPrintBody({ document: doc, reprint = false }: {
  document: RestaurantKitchenPrintDocument;
  reprint?: boolean;
}) {
  const date = new Intl.DateTimeFormat("en-PK", {
    dateStyle: "medium", timeStyle: "short",
  }).format(doc.createdAt);
  return <div className="space-y-4 text-sm">
    <section data-document-section className="mt-4 space-y-1">
      <p>Order placed: {date}</p>
      <p>Type: {doc.fulfillmentType.replaceAll("_", " ")}{doc.tableName ? ` · Table: ${doc.tableName}` : ""}</p>
      <p>Status: {doc.status.replaceAll("_", " ")}</p>
      {reprint ? <p className="font-bold">REPRINT COPY</p> : null}
      {doc.status === "CANCELLED" ? <p className="font-bold">CANCELLED, DO NOT FULFIL</p> : null}
      {doc.notes ? <p className="font-semibold">Kitchen instructions: {doc.notes}</p> : null}
    </section>
    <table className="w-full border-collapse text-xs">
      <thead><tr className="border-y"><th scope="col" className="py-2 text-left">Item</th><th scope="col" className="text-right">Qty</th></tr></thead>
      <tbody>
        {doc.items.map((item, index) => <tr key={index} className="border-b align-top">
          <td className="py-2 break-words">
            {item.itemName}
            {item.modifiers.length ? <p>Options: {item.modifiers.join(", ")}</p> : null}
            {item.notes ? <p className="font-semibold">Notes: {item.notes}</p> : null}
          </td>
          <td className="text-right font-semibold">{item.quantity}</td>
        </tr>)}
      </tbody>
    </table>
    <p className="font-semibold">KITCHEN COPY · NO PRICES</p>
  </div>;
}
