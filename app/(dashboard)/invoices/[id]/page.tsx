import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { StatusBadge } from "@/components/business/status-badge";
import { PrintButton } from "@/components/invoices/print-button";
import { RecordPaymentForm } from "@/components/payments/record-payment-form";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireWorkspace } from "@/lib/server/auth";
import { getCashBankAccounts } from "@/lib/server/accounting";
import { getInvoice } from "@/lib/server/invoices";
import { canPerformAction } from "@/lib/server/authorization";
import { formatDate, formatPKR } from "@/lib/utils";

export default async function InvoiceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { workspaceId, workspace, role } = await requireWorkspace();
  const canRecordPayments = canPerformAction(role, "payments.record");
  const [invoice, cashBankAccounts] = await Promise.all([
    getInvoice(workspaceId, id),
    canRecordPayments ? getCashBankAccounts(workspaceId) : Promise.resolve([]),
  ]);
  if (!invoice) notFound();

  return (
    <div className="mx-auto max-w-[1400px] space-y-6 print:max-w-none print:space-y-0">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between print:hidden">
        <div><Link href="/invoices" className="mb-3 inline-flex items-center gap-1 text-sm font-medium text-neutral-500 hover:text-neutral-950"><ArrowLeft className="h-4 w-4" />Invoices</Link><div className="flex flex-wrap items-center gap-3"><h1 className="text-2xl font-bold tracking-tight md:text-3xl">{invoice.invoiceNumber}</h1><StatusBadge status={invoice.status} /></div><p className="mt-1 text-sm text-neutral-500">Issued to {invoice.customer.companyName}</p></div>
        <PrintButton label="Print invoice" />
      </div>

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_360px] print:block">
        <article className="overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-none print:rounded-none print:border-0">
          <header className="border-b border-neutral-200 p-6 sm:p-8">
            <div className="flex flex-col justify-between gap-6 sm:flex-row">
              <div><p className="text-xs font-bold uppercase tracking-[0.2em] text-neutral-400">Invoice</p><h2 className="mt-2 text-2xl font-bold">{workspace.name}</h2><div className="mt-2 space-y-0.5 text-sm text-neutral-500">{workspace.address && <p>{workspace.address}</p>}<p>{[workspace.city, workspace.country].filter(Boolean).join(", ")}</p>{workspace.phone && <p>{workspace.phone}</p>}{workspace.email && <p>{workspace.email}</p>}</div></div>
              <div className="sm:text-right"><p className="font-mono text-lg font-bold">{invoice.invoiceNumber}</p><div className="mt-3 space-y-1 text-sm"><p><span className="text-neutral-500">Issued:</span> {formatDate(invoice.date)}</p><p><span className="text-neutral-500">Due:</span> {invoice.dueDate ? formatDate(invoice.dueDate) : "On receipt"}</p><div className="pt-1"><StatusBadge status={invoice.status} /></div></div></div>
            </div>
          </header>

          <section className="border-b border-neutral-200 p-6 sm:p-8"><p className="text-xs font-semibold uppercase tracking-wide text-neutral-400">Bill to</p><p className="mt-2 text-lg font-semibold">{invoice.customer.companyName}</p>{invoice.customer.companyName !== invoice.customer.name && <p className="text-sm text-neutral-600">{invoice.customer.name}</p>}<div className="mt-2 space-y-0.5 text-sm text-neutral-500">{invoice.customer.address && <p>{invoice.customer.address}</p>}{invoice.customer.phone && <p>{invoice.customer.phone}</p>}</div></section>

          <section className="overflow-x-auto">
            {invoice.order?.items.length ? <Table className="min-w-[650px]"><TableHeader><TableRow><TableHead className="pl-6 sm:pl-8">Description</TableHead><TableHead>SKU</TableHead><TableHead className="text-right">Qty</TableHead><TableHead className="text-right">Rate</TableHead><TableHead className="text-right">Discount</TableHead><TableHead className="pr-6 text-right sm:pr-8">Amount</TableHead></TableRow></TableHeader><TableBody>{invoice.order.items.map((item) => <TableRow key={item.id}><TableCell className="pl-6 font-medium sm:pl-8">{item.name}</TableCell><TableCell className="text-neutral-500">{item.sku || "-"}</TableCell><TableCell className="text-right">{item.quantity}</TableCell><TableCell className="text-right tabular-nums">{formatPKR(item.unitPrice)}</TableCell><TableCell className="text-right tabular-nums">{formatPKR(item.discount)}</TableCell><TableCell className="pr-6 text-right font-semibold tabular-nums sm:pr-8">{formatPKR(item.total)}</TableCell></TableRow>)}</TableBody></Table> : <p className="p-8 text-sm text-neutral-500">No sales order line items are linked to this invoice.</p>}
          </section>

          {invoice.status === "CANCELLED" && <div className="border-y-4 border-black p-3 text-center text-xl font-black tracking-[0.25em]">CANCELLED</div>}
          <section className="flex justify-end border-t border-neutral-200 p-6 sm:p-8"><div className="w-full max-w-sm space-y-3 text-sm">{invoice.order && <><div className="flex justify-between"><span className="text-neutral-500">Subtotal</span><span>{formatPKR(invoice.order.subtotal)}</span></div><div className="flex justify-between"><span className="text-neutral-500">Discount</span><span>- {formatPKR(invoice.order.discount)}</span></div></>}<div className="flex justify-between border-t pt-3 text-base font-bold"><span>Invoice total</span><span>{formatPKR(invoice.total)}</span></div><div className="flex justify-between"><span className="text-neutral-500">Paid</span><span className="text-emerald-700">{formatPKR(invoice.paid)}</span></div><div className="flex justify-between rounded-lg bg-neutral-950 p-4 text-base font-bold text-white print:border print:border-neutral-300 print:bg-white print:text-black"><span>Balance due</span><span>{formatPKR(invoice.balance)}</span></div></div></section>

          {invoice.payments.length > 0 && <section className="border-t border-neutral-200 p-6 sm:p-8"><h3 className="font-semibold">Payment history</h3><div className="mt-3 overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Method / status</TableHead><TableHead>Reference</TableHead><TableHead className="text-right">Amount</TableHead></TableRow></TableHeader><TableBody>{invoice.payments.map((payment) => <TableRow key={payment.id}><TableCell>{formatDate(payment.date)}</TableCell><TableCell>{payment.method.replaceAll("_", " ")}{payment.isReversal ? " · Reversal" : payment.isReversed ? " · Reversed" : ""}</TableCell><TableCell>{payment.reference}</TableCell><TableCell className="text-right font-medium">{formatPKR(payment.amount)}</TableCell></TableRow>)}</TableBody></Table></div></section>}
        </article>
        <aside className="rounded-xl border border-neutral-200 bg-white p-5 print:hidden xl:sticky xl:top-6"><div className="mb-5"><h2 className="font-semibold">Record payment</h2><p className="mt-1 text-sm text-neutral-500">Allocate a manual receipt to this invoice.</p></div>{canRecordPayments && invoice.balance > 0 && !["CANCELLED", "DRAFT"].includes(invoice.status) ? <RecordPaymentForm invoice={{ id: invoice.id, number: invoice.invoiceNumber, customerId: invoice.customer.id, customerName: invoice.customer.companyName, balance: invoice.balance }} cashBankAccounts={cashBankAccounts} /> : <p className="rounded-lg bg-neutral-50 p-4 text-sm text-neutral-600">{invoice.balance <= 0 ? "This invoice has been paid in full." : "Payment recording is unavailable for your role or this invoice."}</p>}</aside>
      </div>
    </div>
  );
}
