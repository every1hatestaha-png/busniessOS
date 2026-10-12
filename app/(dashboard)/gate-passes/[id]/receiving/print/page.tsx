import Link from "next/link";
import { notFound } from "next/navigation";
import { Prisma } from "@prisma/client";

import { WorkspaceIdentity } from "@/components/documents/workspace-identity";
import { PrintButton } from "@/components/invoices/print-button";
import { PrintOnLoad } from "@/components/documents/print-on-load";
import { requirePermission } from "@/lib/server/authorization";
import { requireOutboundGatePassDraftFeature } from "@/lib/server/outbound-gate-pass-feature";
import { getOutboundGatePass } from "@/lib/server/outbound-gate-passes";

/**
 * This is customer receiving evidence, NOT a fiscal invoice or sales receipt.
 * All values come from the persisted, workspace-scoped receiving record.
 * Printing this page never changes inventory, GL, invoices, or receiving.
 */
export default async function ReceivingAcknowledgementPrintPage({
  params, searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ autoprint?: string }>;
}) {
  const { id } = await params;
  const autoPrint = (await searchParams)?.autoprint === "1";
  const { workspaceId, workspace } = await requirePermission("business.read");
  requireOutboundGatePassDraftFeature(workspaceId);
  const gp = await getOutboundGatePass(workspaceId, id);
  if (!gp?.receivingAt ||
      !["RECEIVING_PENDING", "ACCEPTED", "PARTIALLY_ACCEPTED", "REJECTED", "INVOICED"].includes(gp.status)) notFound();

  const receivedAt = gp.receivingAt.toLocaleString("en-GB", {
    timeZone: "Asia/Karachi", dateStyle: "medium", timeStyle: "short",
  });
  const interim = gp.items.some((item) =>
    item.dispatchedQuantity.minus(item.acceptedQuantity).minus(item.rejectedQuantity).gt(0),
  );
  const singleUnit = gp.items.every((item) => item.productUnitSnapshot === gp.items[0]?.productUnitSnapshot);
  const totals = gp.items.reduce(
    (acc, item) => ({
      sent: acc.sent.plus(item.dispatchedQuantity),
      accepted: acc.accepted.plus(item.acceptedQuantity),
      rejected: acc.rejected.plus(item.rejectedQuantity),
      awaiting: acc.awaiting.plus(item.dispatchedQuantity.minus(item.acceptedQuantity).minus(item.rejectedQuantity)),
    }),
    { sent: new Prisma.Decimal(0), accepted: new Prisma.Decimal(0),
      rejected: new Prisma.Decimal(0), awaiting: new Prisma.Decimal(0) },
  );

  return <main className="mx-auto max-w-4xl space-y-4 p-4 text-black print:m-0 print:max-w-none print:space-y-0 print:p-0">
    {autoPrint && <PrintOnLoad />}
    <nav aria-label="Receiving print actions" className="flex flex-wrap items-center justify-between gap-3 print:hidden">
      <Link href={`/gate-passes/${id}`} className="text-sm underline underline-offset-4">Back to Gate Pass</Link>
      <div className="flex flex-wrap gap-2">
        <PrintButton label="Print Receiving A4" />
        <PrintButton label="Print Receiving 80mm" format="thermal" />
      </div>
    </nav>
    <article data-document data-gate-pass-print data-receiving-acknowledgement-print data-print-orientation="portrait"
      className="space-y-5 rounded-md border border-neutral-300 bg-white p-5 text-black shadow-sm sm:p-8 print:space-y-4 print:rounded-none print:border-0 print:p-0 print:shadow-none">
      <header data-document-section className="flex flex-wrap items-start justify-between gap-4 border-b-2 border-black pb-4">
        <WorkspaceIdentity workspace={workspace} eyebrow="Customer Receiving Acknowledgement"
          nameClassName="text-lg font-bold" detailsClassName="mt-2 space-y-0.5 text-xs" />
        <div className="min-w-0 text-right text-xs">
          <p className="font-bold">GATE PASS {gp.gatePassNumber}</p>
          <p className="mt-1">Received: {receivedAt}</p>
          <p className="mt-1 font-semibold">{interim ? "INTERIM RECEIVING — NOT FINAL" : "RECEIVING RECONCILED"}</p>
        </div>
      </header>
      <section data-document-section className="grid grid-cols-2 gap-4 border-b border-neutral-300 pb-3 text-xs">
        <div className="min-w-0">
          <p className="font-bold uppercase">Customer</p>
          <p className="mt-1 break-words">{gp.customer.companyName || gp.customer.name}</p>
          <p className="break-words">{gp.deliveryAddress || gp.customer.address || ""}</p>
        </div>
        <div className="min-w-0">
          <p className="font-bold uppercase">Recorded receiving</p>
          <p className="mt-1 break-all">Reference: {gp.receivingReference || "Not provided"}</p>
          <p className="break-words">Received by: {gp.receivingRecipient || "Not specified"}</p>
        </div>
      </section>
      <section className="min-w-0">
        <table data-gatepass-items className="w-full table-fixed border-collapse text-left text-xs">
          <thead><tr className="border-y-2 border-black">
            <th className="w-[40%] py-2 pr-2">Product / Description</th>
            <th data-gp-thermal-hide className="w-[13%] py-2 text-right">Sent</th>
            <th className="w-[13%] py-2 text-right">Accepted</th>
            <th className="w-[13%] py-2 text-right">Rejected</th>
            <th data-gp-thermal-hide className="w-[13%] py-2 text-right">Awaiting</th>
            <th className="w-[8%] py-2 pl-1">Unit</th>
          </tr></thead>
          <tbody>{gp.items.map((item) => {
            const remaining = item.dispatchedQuantity.minus(item.acceptedQuantity).minus(item.rejectedQuantity);
            return <tr key={item.id} className="border-b border-neutral-200 align-top">
              <td className="break-words py-2 pr-2">{item.productNameSnapshot}</td>
              <td data-gp-thermal-hide className="py-2 text-right tabular-nums">{item.dispatchedQuantity.toString()}</td>
              <td className="py-2 text-right tabular-nums">{item.acceptedQuantity.toString()}</td>
              <td className="py-2 text-right tabular-nums">{item.rejectedQuantity.toString()}</td>
              <td data-gp-thermal-hide className="py-2 text-right tabular-nums">{remaining.toString()}</td>
              <td className="break-words py-2 pl-1">{item.productUnitSnapshot}</td>
            </tr>;
          })}</tbody>
        </table>
        {singleUnit &&
          <p data-document-section className="mt-2 text-right text-xs font-semibold">
            Totals: Sent {totals.sent.toString()} · Accepted {totals.accepted.toString()} ·
            Rejected {totals.rejected.toString()} · Awaiting {totals.awaiting.toString()}
            {" "}({gp.items[0]?.productUnitSnapshot})
          </p>}
        {!singleUnit && <p className="mt-2 text-[10px]">
          Mixed units: physical quantities are shown per line; no misleading combined total.
        </p>}
      </section>
      {gp.receivingNotes && <section data-document-section className="text-xs">
        <p className="font-semibold">Receiving notes</p>
        <p className="whitespace-pre-wrap break-words">{gp.receivingNotes}</p>
      </section>}
      <section data-document-signatures className="grid grid-cols-2 gap-5 pt-12 text-center text-xs">
        <div className="border-t border-black pt-2">Customer receiving signature / stamp</div>
        <div className="border-t border-black pt-2">Recorded by / verified by</div>
      </section>
      <p className="border-t border-neutral-300 pt-2 text-center text-[10px]">
        This acknowledgement records entered customer receiving quantities only. It is not an invoice,
        proof of payment, or a certified customer signature.
      </p>
    </article>
  </main>;
}
