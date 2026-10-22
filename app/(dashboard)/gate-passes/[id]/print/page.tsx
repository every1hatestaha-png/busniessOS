import Link from "next/link";
import { Prisma } from "@prisma/client";
import { notFound } from "next/navigation";
import { GatePassPrintBody } from "@/components/gate-passes/gate-pass-print-body";
import { PrintButton } from "@/components/invoices/print-button";
import { PrintOnLoad } from "@/components/documents/print-on-load";
import { requirePermission } from "@/lib/server/authorization";
import { requireOutboundGatePassDraftFeature } from "@/lib/server/outbound-gate-pass-feature";
import { getOutboundGatePass } from "@/lib/server/outbound-gate-passes";

/**
 * Print-only physical movement document. Never derive it from an invoice,
 * expose pricing or produce accounting entries as a side effect of printing.
 */
export default async function OutboundGatePassPrintPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams?: Promise<{ autoprint?: string }> }) {
  const { id } = await params;
  const autoPrint = (await searchParams)?.autoprint === "1";
  const { workspaceId, workspace } = await requirePermission("business.read");
  requireOutboundGatePassDraftFeature(workspaceId);
  const gp = await getOutboundGatePass(workspaceId, id);
  if (!gp || gp.status === "CANCELLED") notFound();

  const date = gp.gatePassDate.toLocaleDateString("en-GB", { timeZone: "Asia/Karachi" });
  const isSingleUnit = gp.items.every((item) => item.productUnitSnapshot === gp.items[0]?.productUnitSnapshot);
  const totalQuantity = isSingleUnit
    ? gp.items.reduce((sum, item) => sum.plus(item.dispatchedQuantity), new Prisma.Decimal(0)).toString()
    : "—";
  const totalUnit = isSingleUnit ? (gp.items[0]?.productUnitSnapshot ?? "") : "Mixed units";
  const recipient = gp.customer.companyName || gp.customer.name;

  return <main className="mx-auto max-w-4xl space-y-4 px-3 py-5 text-black sm:px-6 print:m-0 print:max-w-none print:space-y-0 print:p-0">
    {autoPrint && <PrintOnLoad />}
    <nav aria-label="Gate pass print actions" className="flex flex-wrap items-center justify-between gap-3 print:hidden">
      <Link href={`/gate-passes/${id}`} className="text-sm font-semibold underline underline-offset-4">Back to Gate Pass</Link>
      <div className="flex flex-wrap gap-2">
        {gp.status === "DRAFT" ? <PrintButton label="Print Draft A4" /> : <PrintButton label="Print A4 Gate Pass" />}
        {gp.status === "DRAFT" ? <PrintButton label="Print Draft 80mm" format="thermal" /> : <PrintButton label="Print 80mm Copy" format="thermal" />}
      </div>
    </nav>

    {gp.status === "DRAFT" && <p role="status" className="rounded-md border-2 border-red-800 bg-red-50 p-3 text-center text-sm font-bold text-red-900 print:hidden">Draft preview only. Not authorized for dispatch, customer delivery or final invoicing.</p>}
    <GatePassPrintBody workspace={workspace} gp={{
      gatePassNumber: gp.gatePassNumber,
      status: gp.status,
      customer: {
        name: gp.customer.name,
        companyName: gp.customer.companyName,
        address: gp.customer.address,
        phone: gp.customer.phone,
      },
      deliveryAddress: gp.deliveryAddress,
      notes: gp.notes,
      items: gp.items.map((item) => ({
        id: item.id,
        productNameSnapshot: item.productNameSnapshot,
        productSkuSnapshot: item.productSkuSnapshot,
        dispatchedQuantity: item.dispatchedQuantity.toString(),
        productUnitSnapshot: item.productUnitSnapshot,
      })),
    }} date={date} recipient={recipient} totalQuantity={totalQuantity} totalUnit={totalUnit} isSingleUnit={isSingleUnit} />

  </main>;
}
