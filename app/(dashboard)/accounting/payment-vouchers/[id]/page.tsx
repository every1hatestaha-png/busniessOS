import { notFound } from "next/navigation";

import { PrintButton } from "@/components/invoices/print-button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireWorkspace } from "@/lib/server/auth";
import { getSupplierPaymentVoucher } from "@/lib/server/suppliers";
import { formatDate, formatPKR } from "@/lib/utils";

export default async function PaymentVoucherPage({ params }: { params: Promise<{ id: string }> }) {
  const { workspaceId } = await requireWorkspace();
  const voucher = await getSupplierPaymentVoucher(workspaceId, (await params).id);
  if (!voucher) notFound();

  return (
    <div className="mx-auto max-w-[1050px] space-y-4 print:max-w-none print:space-y-0">
      <div className="flex items-center justify-between print:hidden"><div><p className="text-sm text-neutral-500">Supplier payment voucher</p><h1 className="text-2xl font-bold">{voucher.documentNumber}</h1></div><PrintButton label="Print voucher" /></div>
      <article className="bg-white p-8 shadow-sm print:p-0 print:shadow-none">
        <header className="border-b-2 border-neutral-900 pb-5">
          <div className="flex items-start justify-between gap-8"><div><p className="text-xs font-bold uppercase tracking-[0.25em] text-neutral-500">Bank Payment Voucher</p><h2 className="mt-2 text-2xl font-bold">{voucher.workspace.name}</h2><div className="mt-2 text-sm text-neutral-600">{voucher.workspace.address && <p>{voucher.workspace.address}</p>}<p>{[voucher.workspace.city, voucher.workspace.country].filter(Boolean).join(", ")}</p>{voucher.workspace.phone && <p>{voucher.workspace.phone}</p>}</div></div><div className="text-right"><p className="font-mono text-lg font-bold">{voucher.documentNumber}</p><p className="mt-2 text-sm text-neutral-600">Date: {formatDate(voucher.paymentDate)}</p><p className="text-sm text-neutral-600">Method: {voucher.method.replaceAll("_", " ")}</p></div></div>
        </header>
        <section className="grid gap-6 border-b border-neutral-200 py-6 md:grid-cols-2">
          <div><p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Paid to</p><p className="mt-2 text-lg font-semibold">{voucher.supplier?.companyName ?? voucher.supplier?.name}</p>{voucher.supplier?.companyName && <p className="text-sm text-neutral-600">{voucher.supplier.name}</p>}<div className="mt-2 text-sm text-neutral-500">{voucher.supplier?.address && <p>{voucher.supplier.address}</p>}{voucher.supplier?.phone && <p>{voucher.supplier.phone}</p>}</div></div>
          <div><p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Paid from</p><p className="mt-2 text-lg font-semibold">{voucher.cashBankAccount?.name ?? "Legacy payment account"}</p><div className="mt-2 text-sm text-neutral-500">{voucher.cashBankAccount?.bankName && <p>{voucher.cashBankAccount.bankName}</p>}{voucher.cashBankAccount?.accountTitle && <p>{voucher.cashBankAccount.accountTitle}</p>}{voucher.cashBankAccount?.accountNumber && <p>{voucher.cashBankAccount.accountNumber}</p>}</div></div>
        </section>
        <section className="py-6">
          <Table><TableHeader><TableRow><TableHead>Description</TableHead><TableHead className="text-right">Amount</TableHead></TableRow></TableHeader><TableBody><TableRow><TableCell>Gross supplier payable settled</TableCell><TableCell className="text-right tabular-nums">{formatPKR(voucher.grossAmount)}</TableCell></TableRow><TableRow><TableCell>Withholding tax payable</TableCell><TableCell className="text-right tabular-nums">{formatPKR(voucher.withholdingTaxAmount)}</TableCell></TableRow><TableRow><TableCell className="font-bold">Net payment</TableCell><TableCell className="text-right font-bold tabular-nums">{formatPKR(voucher.netAmount)}</TableCell></TableRow></TableBody></Table>
        </section>
        {voucher.allocations.length > 0 && <section className="border-t border-neutral-200 py-6"><h3 className="font-semibold">Purchase allocations</h3><div className="mt-3 overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Purchase</TableHead><TableHead>Date</TableHead><TableHead className="text-right">Allocated</TableHead></TableRow></TableHeader><TableBody>{voucher.allocations.map((allocation) => <TableRow key={allocation.id}><TableCell>{allocation.purchaseOrder?.orderNumber ?? "-"}</TableCell><TableCell>{allocation.purchaseOrder ? formatDate(allocation.purchaseOrder.orderDate) : "-"}</TableCell><TableCell className="text-right tabular-nums">{formatPKR(allocation.amount)}</TableCell></TableRow>)}</TableBody></Table></div></section>}
        <section className="grid gap-6 border-t border-neutral-200 pt-8 text-sm md:grid-cols-3"><div><p className="border-t border-neutral-400 pt-2">Prepared by</p></div><div><p className="border-t border-neutral-400 pt-2">Checked by</p></div><div><p className="border-t border-neutral-400 pt-2">Approved / received by</p></div></section>
      </article>
    </div>
  );
}
