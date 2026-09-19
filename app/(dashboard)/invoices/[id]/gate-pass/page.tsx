import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { PrintButton } from "@/components/invoices/print-button";
import { deliveryChallanNumber } from "@/lib/document-references";
import { requireWorkspace } from "@/lib/server/auth";
import { getInvoice } from "@/lib/server/invoices";
import { formatDate } from "@/lib/utils";

function formatUnit(unit: string) {
  if (unit === "PIECE") return "pc";
  return unit.toLowerCase();
}

export default async function GatePassPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { workspaceId, workspace } = await requireWorkspace();
  const invoice = await getInvoice(workspaceId, id);
  if (!invoice) notFound();

  const dcNumber = deliveryChallanNumber(invoice.invoiceNumber);

  return <div className="mx-auto max-w-5xl space-y-4 print:max-w-none print:space-y-0">
    <div className="flex items-center justify-between print:hidden">
      <Link href={`/invoices/${invoice.id}`} className="inline-flex items-center gap-1 text-sm font-medium text-neutral-500 hover:text-neutral-950"><ArrowLeft className="h-4 w-4" />Invoice</Link>
      <PrintButton label="Print gate pass" />
    </div>

    <article data-document className="bg-white p-8 print:p-0">
      <header className="border-b-2 border-black pb-5">
        <div className="flex items-start justify-between gap-8">
          <div><p className="text-xs font-bold uppercase tracking-[0.2em]">Delivery Challan / Gate Pass</p><h1 className="mt-2 text-2xl font-bold">{workspace.name}</h1><div className="mt-2 text-sm text-neutral-600">{workspace.address && <p>{workspace.address}</p>}<p>{[workspace.city, workspace.country].filter(Boolean).join(", ")}</p>{workspace.phone && <p>{workspace.phone}</p>}{workspace.email && <p>{workspace.email}</p>}{(workspace.ntn || workspace.strn) && <p className="pt-1 font-medium">{[workspace.ntn ? `NTN: ${workspace.ntn}` : null, workspace.strn ? `STRN: ${workspace.strn}` : null].filter(Boolean).join(" · ")}</p>}</div></div>
          <div className="text-right"><p className="font-mono text-xl font-black">{dcNumber}</p><p className="mt-2 text-sm"><span className="text-neutral-500">Date:</span> {formatDate(invoice.date)}</p><p className="text-sm"><span className="text-neutral-500">Invoice:</span> {invoice.invoiceNumber}</p>{invoice.order && <p className="text-sm"><span className="text-neutral-500">Sale:</span> {invoice.order.number}</p>}</div>
        </div>
      </header>

      <section className="grid grid-cols-2 gap-8 border-b border-neutral-300 py-5">
        <div><p className="text-[10px] font-bold uppercase tracking-wide text-neutral-500">Deliver to</p><p className="mt-2 font-semibold">{invoice.customer.companyName}</p>{invoice.customer.companyName !== invoice.customer.name && <p className="text-sm text-neutral-600">{invoice.customer.name}</p>}{invoice.customer.address && <p className="mt-1 text-sm text-neutral-600">{invoice.customer.address}</p>}{invoice.customer.phone && <p className="text-sm text-neutral-600">{invoice.customer.phone}</p>}</div>
        <div><p className="text-[10px] font-bold uppercase tracking-wide text-neutral-500">Dispatch reference</p><p className="mt-2 text-sm">DC No: <span className="font-mono font-semibold">{dcNumber}</span></p><p className="text-sm">Invoice: <span className="font-mono">{invoice.invoiceNumber}</span></p></div>
      </section>

      <section className="py-5">
        <table className="w-full border-collapse text-sm">
          <thead><tr className="border-y border-black"><th className="py-2 text-left">#</th><th className="py-2 text-left">Description</th><th className="py-2 text-left">SKU</th><th className="py-2 text-right">Quantity</th><th className="py-2 text-left">Unit</th></tr></thead>
          <tbody>{invoice.order?.items.map((item, index) => <tr key={item.id} className="border-b border-neutral-200"><td className="py-3">{index + 1}</td><td className="py-3 font-medium">{item.name}{item.pricingMode === "WEIGHT" && <span className="block text-[10px] font-normal text-neutral-500">{item.unitWeight?.toFixed(3)} kg/unit · total {item.totalWeight?.toFixed(3)} kg</span>}</td><td className="py-3 font-mono text-neutral-600">{item.sku || "-"}</td><td className="py-3 text-right tabular-nums">{item.quantity}</td><td className="py-3">{formatUnit(item.unit)}</td></tr>)}</tbody>
        </table>
        {!invoice.order?.items.length && <p className="py-8 text-sm text-neutral-500">No dispatch items are linked to this invoice.</p>}
      </section>

      <section className="mt-10 grid grid-cols-3 gap-10 pt-8 text-center text-xs">
        <div className="border-t border-black pt-2">Prepared by</div><div className="border-t border-black pt-2">Authorized by</div><div className="border-t border-black pt-2">Received by / Signature</div>
      </section>
      <p className="mt-8 text-center text-[10px] text-neutral-500">This delivery challan records physical dispatch only. Commercial values remain on invoice {invoice.invoiceNumber}.</p>
    </article>
  </div>;
}
