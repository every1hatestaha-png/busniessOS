import Link from "next/link";
import { notFound } from "next/navigation";
import { Prisma } from "@prisma/client";

import { GatePassReceivingPrintBody, type GatePassReceivingPrintData } from "@/components/gate-passes/gate-pass-receiving-print-body";
import { PrintButton } from "@/components/invoices/print-button";
import { PrintOnLoad } from "@/components/documents/print-on-load";
import { requirePermission } from "@/lib/server/authorization";
import { requireOutboundGatePassDraftFeature } from "@/lib/server/outbound-gate-pass-feature";
import { getOutboundGatePass } from "@/lib/server/outbound-gate-passes";

/** Authenticated, read-only receiving evidence: never an invoice or paid receipt. */
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
  const data: GatePassReceivingPrintData = {
    gatePassNumber: gp.gatePassNumber,
    receivedAt: gp.receivingAt.toLocaleString("en-GB", {
      timeZone: "Asia/Karachi", dateStyle: "medium", timeStyle: "short",
    }),
    interim,
    customer: {
      name: gp.customer.name, companyName: gp.customer.companyName,
      address: gp.customer.address,
    },
    deliveryAddress: gp.deliveryAddress,
    reference: gp.receivingReference,
    recipient: gp.receivingRecipient,
    notes: gp.receivingNotes,
    items: gp.items.map((item) => ({
      id: item.id, name: item.productNameSnapshot,
      sent: item.dispatchedQuantity.toString(),
      accepted: item.acceptedQuantity.toString(),
      rejected: item.rejectedQuantity.toString(),
      awaiting: item.dispatchedQuantity.minus(item.acceptedQuantity).minus(item.rejectedQuantity).toString(),
      unit: item.productUnitSnapshot,
    })),
    totals: singleUnit ? {
      sent: totals.sent.toString(), accepted: totals.accepted.toString(),
      rejected: totals.rejected.toString(), awaiting: totals.awaiting.toString(),
      unit: gp.items[0]?.productUnitSnapshot ?? "",
    } : null,
  };
  return <main className="mx-auto max-w-4xl space-y-4 p-4 text-black print:m-0 print:max-w-none print:space-y-0 print:p-0">
    {autoPrint && <PrintOnLoad />}
    <nav aria-label="Receiving print actions" className="flex flex-wrap items-center justify-between gap-3 print:hidden">
      <Link href={`/gate-passes/${id}`} className="text-sm underline underline-offset-4">Back to Gate Pass</Link>
      <div className="flex flex-wrap gap-2">
        <PrintButton label="Print Receiving A4" />
        <PrintButton label="Print Receiving 80mm" format="thermal" />
      </div>
    </nav>
    <GatePassReceivingPrintBody workspace={workspace} data={data} />
  </main>;
}
