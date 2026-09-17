import Link from "next/link";
import { notFound } from "next/navigation";

import { PrintButton } from "@/components/invoices/print-button";
import { requireWorkspace } from "@/lib/server/auth";
import { getInvoiceDocumentMetadata } from "@/lib/server/invoice-document";
import { getInvoice } from "@/lib/server/invoices";
import { formatDate } from "@/lib/utils";

function unitLabel(unit: string) {
  if (unit === "PIECE") return "pcs";
  return unit.toLowerCase();
}

export default async function GatePassPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { workspaceId, workspace } = await requireWorkspace();
  const invoice = await getInvoice(workspaceId, id);
  if (!invoice) notFound();
  const metadata = await getInvoiceDocumentMetadata(workspaceId, invoice.id, invoice.invoiceNumber);

  return <main className="min-h-screen bg-neutral-100 px-4 py-6 print:bg-white print:p-0">
    <div className="mx-auto mb-4 flex max-w-[900px] items-center justify-between print:hidden">
      <Link href={`/invoices/${invoice.id}`} className="text-sm font-medium text-neutral-600 hover:text-neutral-950">← Back to invoice</Link>
      <PrintButton label="Print Gate Pass" />
    </div>

    <article data-document className="mx-auto max-w-[900px] bg-white p-8 shadow-sm print:max-w-none print:p-4 print:shadow-none">
      <header className="flex items-start justify-between gap-8 border-b-2 border-neutral-950 pb-5">
        <div><p className="text-xs font-bold uppercase tracking-[0.22em] text-neutral-500">Delivery Challan / Gate Pass</p><h1 className="mt-2 text-2xl font-bold">{workspace.name}</h1><div className="mt-2 space-y-0.5 text-sm text-neutral-600">{workspace.address && <p>{workspace.address}</p>}<p>{[workspace.city, workspace.country].filter(Boolean).join(", ")}</p>{workspace.phone && <p>{workspace.phone}</p>}{workspace.email && <p>{workspace.email}</p>}</div></div>
        <div className="min-w-[210px] text-right"><p className="font-mono text-xl font-black">{metadata.dcNumber}</p><div className="mt-3 space-y-1 text-sm"><p><span className="text-neutral-500">Date:</span> {formatDate(invoice.date)}</p><p><span className="text-neutral-500">Invoice:</span> {invoice.invoiceNumber}</p>{invoice.order && <p><span className="text-neutral-500">Sale ref:</span> {invoice.order.number}</p>}</div></div>
      </header>

      <section className="grid gap-6 border-b py-5 sm:grid-cols-2">
        <div><p className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">Deliver to</p><p className="mt-2 text-lg font-semibold">{invoice.customer.companyName}</p>{invoice.customer.companyName !== invoice.customer.name && <p className="text-sm text-neutral-600">{invoice.customer.name}</p>}<div className="mt-2 text-sm text-neutral-600">{invoice.customer.address && <p>{invoice.customer.address}</p>}{invoice.customer.phone && <p>{invoice.customer.phone}</p>}</div></div>
        <div><p className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">Purpose</p><p className="mt-2 text-sm text-neutral-700">Goods dispatched against invoice {invoice.invoiceNumber}.</p>{metadata.notes && <div className="mt-3"><p className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">Notes</p><p className="mt-1 whitespace-pre-wrap text-sm text-neutral-700">{metadata.notes}</p></div>}</div>
      </section>

      <section className="py-5">
        <table className="w-full border-collapse text-sm">
          <thead><tr className="border-y border-neutral-300 bg-neutral-50"><th className="w-12 px-3 py-2 text-left">#</th><th className="px-3 py-2 text-left">Description</th><th className="w-32 px-3 py-2 text-left">SKU</th><th className="w-28 px-3 py-2 text-right">Quantity</th><th className="w-24 px-3 py-2 text-left">Unit</th></tr></thead>
          <tbody>{invoice.order?.items.map((item, index) => <tr key={item.id} className="border-b border-neutral-200"><td className="px-3 py-3">{index + 1}</td><td className="px-3 py-3 font-medium">{item.name}{item.pricingMode === "WEIGHT" && <span className="mt-0.5 block text-xs font-normal text-neutral-500">{item.unitWeight?.toFixed(3)} kg/unit · total {item.totalWeight?.toFixed(3)} kg</span>}</td><td className="px-3 py-3 font-mono text-xs text-neutral-600">{item.sku || "-"}</td><td className="px-3 py-3 text-right font-semibold tabular-nums">{item.quantity}</td><td className="px-3 py-3">{unitLabel(item.unit)}</td></tr>) ?? <tr><td colSpan={5} className="px-3 py-6 text-center text-neutral-500">No line items.</td></tr>}</tbody>
        </table>
      </section>

      <footer className="mt-10 grid grid-cols-3 gap-10 pt-8 text-center text-xs text-neutral-600">
        <div><div className="border-t border-neutral-500 pt-2">Prepared by</div></div><div><div className="border-t border-neutral-500 pt-2">Authorized by</div></div><div><div className="border-t border-neutral-500 pt-2">Received by</div></div>
      </footer>
      <p className="mt-8 text-center text-[10px] text-neutral-400">Gate Pass {metadata.dcNumber} · Invoice {invoice.invoiceNumber}</p>
    </article>
  </main>;
}
