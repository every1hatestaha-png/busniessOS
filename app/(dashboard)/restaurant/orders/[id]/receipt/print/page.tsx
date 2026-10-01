import { notFound } from "next/navigation";

import { PrintOnLoad } from "@/components/documents/print-on-load";
import { WorkspaceIdentity } from "@/components/documents/workspace-identity";
import { requireWorkspace } from "@/lib/server/auth";
import { IndustryDomainError } from "@/lib/server/industry-modules";
import { listRestaurantPayments } from "@/lib/server/restaurant-integrity";
import { listRestaurantNetPaymentSummaries } from "@/lib/server/restaurant-payment-summary";
import { getRestaurantOrder } from "@/lib/server/restaurant-workspace";

function money(value: number) {
  return new Intl.NumberFormat("en-PK", { style: "currency", currency: "PKR", maximumFractionDigits: 2 }).format(value);
}

export default async function RestaurantReceiptPrintPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { workspaceId, workspace } = await requireWorkspace();

  let order: Awaited<ReturnType<typeof getRestaurantOrder>>;
  try {
    order = await getRestaurantOrder(workspaceId, id);
  } catch (error) {
    if (error instanceof IndustryDomainError && error.code === "NOT_FOUND") notFound();
    throw error;
  }

  const [payments, summaries] = await Promise.all([
    listRestaurantPayments(workspaceId, order.id),
    listRestaurantNetPaymentSummaries(workspaceId, [order.id]),
  ]);
  const summary = summaries[0] ?? { adjustedDue: order.total, retainedPaid: 0, outstanding: order.total };
  const timezone = workspace.timezone || "Asia/Karachi";
  const timestamp = new Intl.DateTimeFormat("en-PK", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: timezone,
  }).format(order.createdAt);

  return (
    <>
      <article data-document className="mx-auto w-full max-w-[72mm] bg-white text-black">
        <header className="border-b border-dashed border-black p-3 text-center">
          <WorkspaceIdentity
            workspace={workspace}
            eyebrow="Restaurant receipt"
            nameClassName="text-lg font-bold"
            detailsClassName="mt-1 space-y-0.5 text-[10px] text-neutral-700"
          />
          <div className="mt-3 text-[10px]">
            <p className="font-mono text-sm font-bold">{order.orderNumber}</p>
            <p>{timestamp}</p>
            <p>{order.fulfillmentType.replaceAll("_", " ")}{order.tableName ? ` · ${order.tableName}` : ""}</p>
            <p>{order.status} · Payment {order.paymentStatus}</p>
          </div>
        </header>

        {(order.customerName || order.customerPhone) && (
          <section className="border-b border-dashed border-black p-2 text-[10px]">
            <p className="font-semibold">{order.customerName || "Customer"}</p>
            {order.customerPhone ? <p>{order.customerPhone}</p> : null}
          </section>
        )}

        <section className="p-2">
          <table className="w-full border-collapse text-[10px]">
            <thead>
              <tr className="border-b border-black">
                <th className="py-1 text-left">Item</th>
                <th className="w-10 py-1 text-right">Qty</th>
                <th className="w-16 py-1 text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {order.items.map((item) => (
                <tr key={item.id} className="border-b border-dotted border-neutral-400 align-top">
                  <td className="py-1 pr-1">
                    <span className="font-medium">{item.itemName}</span>
                    {item.notes ? <span className="block text-[9px]">{item.notes}</span> : null}
                  </td>
                  <td className="py-1 text-right tabular-nums">{item.quantity}</td>
                  <td className="py-1 text-right tabular-nums">{money(item.lineTotal)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section data-document-totals className="border-t border-dashed border-black p-2 text-[10px]">
          <div className="ml-auto w-full space-y-1">
            <div className="flex justify-between"><span>Subtotal</span><span>{money(order.subtotal)}</span></div>
            {order.discountAmount > 0 ? <div className="flex justify-between"><span>Discount</span><span>- {money(order.discountAmount)}</span></div> : null}
            {order.taxAmount > 0 ? <div className="flex justify-between"><span>Tax</span><span>{money(order.taxAmount)}</span></div> : null}
            <div className="flex justify-between border-t border-black pt-1 text-xs font-bold"><span>Total</span><span>{money(order.total)}</span></div>
            {summary.adjustedDue !== order.total ? <div className="flex justify-between"><span>Net after returns</span><span>{money(summary.adjustedDue)}</span></div> : null}
            <div className="flex justify-between"><span>Retained payments</span><span>{money(summary.retainedPaid)}</span></div>
            <div className="flex justify-between text-xs font-bold"><span>Balance due</span><span>{money(summary.outstanding)}</span></div>
          </div>
        </section>

        {payments.length ? (
          <section className="border-t border-dashed border-black p-2 text-[9px]">
            <p className="mb-1 font-bold uppercase tracking-wide">Payment history</p>
            {payments.slice(0, 8).map((payment) => (
              <div key={payment.id} className="flex justify-between gap-2">
                <span>{payment.method.replaceAll("_", " ")}{payment.voidedAt ? " · VOID" : ""}</span>
                <span className="tabular-nums">{money(payment.amount)}</span>
              </div>
            ))}
          </section>
        ) : null}

        {order.notes ? <section className="border-t border-dashed border-black p-2 text-[9px]"><strong>Note:</strong> {order.notes}</section> : null}
        {order.status === "CANCELLED" ? <div className="border-y-2 border-black p-2 text-center text-base font-black tracking-[0.2em]">CANCELLED</div> : null}

        <footer className="p-3 text-center text-[9px]">
          <p>Thank you.</p>
          <p className="mt-1">Operational receipt · not a claim of tax-invoice compliance.</p>
        </footer>
      </article>
      <PrintOnLoad format="thermal" />
    </>
  );
}
