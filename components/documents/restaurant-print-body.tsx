import type { RestaurantPrintDocument } from "@/lib/server/restaurant-print";

export function RestaurantPrintBody({ document: doc, kitchen = false, reprint = false }: {
  document: RestaurantPrintDocument; kitchen?: boolean; reprint?: boolean;
}) {
  const money = (amount: number) => `Rs ${amount.toLocaleString("en-PK", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const date = (value: Date) => new Intl.DateTimeFormat("en-PK", { dateStyle: "medium", timeStyle: "short", timeZone: doc.timezone }).format(value);
  return <div className="space-y-4 text-sm">
    <section data-document-section className="mt-4 space-y-1">
      <p>Date: {date(doc.createdAt)} ({doc.timezone})</p>
      <p>Type: {doc.fulfillmentType.replaceAll("_", " ")}{doc.tableName ? ` · Table: ${doc.tableName}` : ""}</p>
      <p>Status: {doc.status.replaceAll("_", " ")}</p>
      {reprint ? <p className="font-bold">REPRINT COPY</p> : null}
      {doc.status === "CANCELLED" ? <p className="font-bold">CANCELLED, DO NOT FULFIL</p> : null}
      {!kitchen && doc.customerName ? <p>Customer: {doc.customerName}</p> : null}
      {doc.notes ? <p>Order notes: {doc.notes}</p> : null}
    </section>
    <table className="w-full border-collapse text-xs">
      <thead><tr className="border-y"><th className="py-2 text-left">Item</th><th className="text-right">Qty</th>{!kitchen ? <><th className="text-right">Price</th><th className="text-right">Amount</th></> : null}</tr></thead>
      <tbody>{doc.items.map((item, index) => <tr key={index} className="border-b align-top"><td className="py-2 break-words">{item.itemName}{item.modifiers.length ? <p>Modifiers: {item.modifiers.join(", ")}</p> : null}{item.notes ? <p>Notes: {item.notes}</p> : null}</td><td className="text-right">{item.quantity}</td>{!kitchen ? <><td className="text-right">{money(item.unitPrice)}</td><td className="text-right">{money(item.lineTotal)}</td></> : null}</tr>)}</tbody>
    </table>
    {!kitchen ? <>
      <section data-document-totals className="flex justify-end"><div className="w-64 space-y-1">
        {[['Subtotal', doc.subtotal], ['Discount', doc.discountAmount], ['Tax', doc.taxAmount], ['Original total', doc.total], ['Net due after returns', doc.adjustedDue], ['Retained payments', doc.retainedPaid], ['Remaining balance', doc.outstanding]].map(([label, amount]) => <p key={label} className="flex justify-between gap-2"><span>{label}</span><strong>{money(Number(amount))}</strong></p>)}
      </div></section>
      <section data-document-section><h2 className="font-bold">Payments</h2><p>Payment status: {doc.paymentStatus.replaceAll("_", " ")}</p>{doc.payments.length ? doc.payments.map((payment, index) => <p key={index}>{payment.method.replaceAll("_", " ")} · {money(payment.amount)} · {payment.voidedAt ? "VOID" : payment.postedAt ? "POSTED" : "UNPOSTED"} · {date(payment.createdAt)}</p>) : <p>No payments recorded</p>}</section>
      {doc.returns.length ? <section data-document-section><h2 className="font-bold">Returns and reversals</h2>{doc.returns.map((entry, index) => <p key={index}>{entry.returnNumber} · {entry.isReversal ? "REVERSAL" : "RETURN"} · {money(entry.total)} · {date(entry.createdAt)} · {entry.reason}</p>)}</section> : null}
      {doc.refunds.length ? <section data-document-section><h2 className="font-bold">Refunds</h2>{doc.refunds.map((entry, index) => <p key={index}>REFUND · {money(entry.amount)} · {date(entry.createdAt)} · {entry.reason}</p>)}</section> : null}
    </> : <p className="font-semibold">KITCHEN COPY</p>}
  </div>;
}
