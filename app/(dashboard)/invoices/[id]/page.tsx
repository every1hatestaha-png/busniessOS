import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Pencil, Truck } from "lucide-react";

import { StatusBadge } from "@/components/business/status-badge";
import { FbrInvoiceStatusCard, type FbrInvoicePanelData } from "@/components/invoices/fbr-invoice-status-card";
import { PrintButton } from "@/components/invoices/print-button";
import { RecordPaymentForm } from "@/components/payments/record-payment-form";
import { CancelSaleButton } from "@/components/sales/cancel-sale-button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { deliveryChallanNumber } from "@/lib/document-references";
import { validateFbrProductionPrintReadiness } from "@/lib/fbr/print-compliance";
import { requireWorkspace } from "@/lib/server/auth";
import { getCashBankAccounts } from "@/lib/server/accounting";
import { buildFbrInvoiceDraft, fingerprintFbrPayload, getFbrSubmissionForInvoice } from "@/lib/server/fbr-digital-invoicing";
import { getInvoice } from "@/lib/server/invoices";
import { canPerformAction } from "@/lib/server/authorization";
import { formatDate, formatPKR } from "@/lib/utils";
import { Prisma } from "@prisma/client";

function calculateSaleLine(item: { quantity: number | Prisma.Decimal; unitPrice: number; discountPerUnit: number }) {
  const qty = Number(item.quantity);
  const gross = qty * item.unitPrice;
  const discountTotal = qty * item.discountPerUnit;
  return { gross, discountTotal, total: gross - discountTotal };
}

function formatUnit(unit: string) {
  if (unit === "PIECE") return "pc";
  return unit.toLowerCase();
}

const actionLink = "inline-flex h-8 items-center justify-center gap-1.5 rounded-lg border border-neutral-200 bg-white px-3 text-sm font-medium hover:bg-neutral-50";

export default async function InvoiceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { workspaceId, workspace, role } = await requireWorkspace();
  const canRecordPayments = canPerformAction(role, "payments.record");
  const canManageFinancials = canPerformAction(role, "financial.manage");
  const [invoice, cashBankAccounts] = await Promise.all([
    getInvoice(workspaceId, id),
    canRecordPayments ? getCashBankAccounts(workspaceId) : Promise.resolve([]),
  ]);
  if (!invoice) notFound();
  const dcNumber = deliveryChallanNumber(invoice.invoiceNumber);

  const [fbrPrintConfig, fbrProductionSubmission] = await Promise.all([
    db.fbrIntegrationConfig.findUnique({
      where: { workspaceId },
      select: { enabled: true, environment: true, softwareRegistrationNo: true },
    }),
    getFbrSubmissionForInvoice(workspaceId, id, "PRODUCTION"),
  ]);
  const fbrPrintIssues = fbrPrintConfig?.enabled && fbrPrintConfig.environment === "PRODUCTION"
    ? validateFbrProductionPrintReadiness({
        environment: "PRODUCTION",
        submissionStatus: fbrProductionSubmission?.status,
        fbrInvoiceNumber: fbrProductionSubmission?.fbrInvoiceNumber,
        softwareRegistrationNo: fbrPrintConfig.softwareRegistrationNo,
      })
    : [];
  const fbrPrintBlocked = fbrPrintIssues.length > 0;

  let fbrPanel: FbrInvoicePanelData | null = null;
  if (canManageFinancials) {
    const [draftResult, submissionResult] = await Promise.allSettled([
      buildFbrInvoiceDraft(workspaceId, id),
      getFbrSubmissionForInvoice(workspaceId, id),
    ]);
    const draft = draftResult.status === "fulfilled" ? draftResult.value : null;
    const submission = submissionResult.status === "fulfilled" ? submissionResult.value : null;
    const formatter = new Intl.DateTimeFormat("en-PK", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: workspace.timezone || "Asia/Karachi",
    });
    const timestamp = (value: Date | null | undefined) => value ? formatter.format(value) : null;
    const unavailableMessage = draftResult.status === "rejected"
      ? (draftResult.reason instanceof Error ? draftResult.reason.message : "FBR preflight could not be evaluated.")
      : null;
    const payloadStale = Boolean(
      draft
      && submission?.payloadSnapshot
      && fingerprintFbrPayload(submission.payloadSnapshot) !== draft.fingerprint,
    );

    fbrPanel = {
      environment: draft?.environment ?? submission?.environment ?? null,
      readyForRemoteValidation: draft?.readyForRemoteValidation ?? false,
      payloadStale,
      unavailableMessage,
      issues: draft?.issues ?? [],
      submission: submission ? {
        id: submission.id,
        status: submission.status,
        fbrInvoiceNumber: submission.fbrInvoiceNumber,
        lastErrorCode: submission.lastErrorCode,
        lastErrorMessage: submission.lastErrorMessage,
        attemptCount: submission.attemptCount,
        validatedAtLabel: timestamp(submission.validatedAt),
        submittedAtLabel: timestamp(submission.submittedAt),
        lastAttemptAtLabel: timestamp(submission.lastAttemptAt),
        attempts: submission.attempts.slice(0, 3).map((attempt) => ({
          id: attempt.id,
          kind: attempt.kind,
          succeeded: attempt.succeeded,
          httpStatus: attempt.httpStatus,
          errorCode: attempt.errorCode,
          createdAtLabel: timestamp(attempt.createdAt) ?? "Unknown time",
        })),
      } : null,
    };
  }

  return (
    <div className="mx-auto max-w-[1400px] space-y-6 print:max-w-none print:space-y-0">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between print:hidden">
        <div><Link href="/invoices" className="mb-3 inline-flex items-center gap-1 text-sm font-medium text-neutral-500 hover:text-neutral-950"><ArrowLeft className="h-4 w-4" />Invoices</Link><div className="flex flex-wrap items-center gap-3"><h1 className="text-2xl font-bold tracking-tight md:text-3xl">{invoice.invoiceNumber}</h1><StatusBadge status={invoice.status} /></div><p className="mt-1 text-sm text-neutral-500">Issued to {invoice.customer.companyName} · DC {dcNumber}</p></div>
        <div className="flex flex-wrap items-center gap-2">
          {invoice.order && invoice.status !== "CANCELLED" && canManageFinancials && <Link href={`/sales/${invoice.order.id}/edit`} className={actionLink}><Pencil className="h-4 w-4" />Edit invoice</Link>}
          {invoice.order && <Link href={`/invoices/${invoice.id}/gate-pass`} className={actionLink}><Truck className="h-4 w-4" />Gate Pass {dcNumber}</Link>}
          <PrintButton label={fbrPrintBlocked ? "FBR print blocked" : "Print invoice"} disabled={fbrPrintBlocked} />
          {invoice.order && invoice.status !== "CANCELLED" && canManageFinancials && <CancelSaleButton saleId={invoice.order.id} orderNumber={invoice.order.number} />}
        </div>
      </div>

      {fbrPrintBlocked && (
        <div className="hidden print:block border-4 border-black p-8">
          <h1 className="text-2xl font-black">FBR PRODUCTION PRINT BLOCKED</h1>
          <p className="mt-3 text-sm">This invoice must not be issued as an FBR-compliant production invoice yet.</p>
          <ul className="mt-4 list-disc space-y-2 pl-5 text-sm">
            {fbrPrintIssues.map((issue) => <li key={issue.code}>{issue.message}</li>)}
          </ul>
        </div>
      )}
      <div className="grid items-start gap-6 2xl:grid-cols-[minmax(0,1fr)_360px] print:block">
        <article data-document className={"overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-none print:rounded-none print:border-0 " + (fbrPrintBlocked ? "print:hidden" : "")}>
          <header className="border-b border-neutral-200 p-6 sm:p-8">
            <div className="flex flex-col justify-between gap-6 sm:flex-row">
              <div><p className="text-xs font-bold uppercase tracking-[0.2em] text-neutral-400">Invoice</p><h2 className="mt-2 text-2xl font-bold">{workspace.name}</h2><div className="mt-2 space-y-0.5 text-sm text-neutral-500">{workspace.address && <p>{workspace.address}</p>}<p>{[workspace.city, workspace.country].filter(Boolean).join(", ")}</p>{workspace.phone && <p>{workspace.phone}</p>}{workspace.email && <p>{workspace.email}</p>}{(workspace.ntn || workspace.strn) && <p className="pt-1 font-medium">{[workspace.ntn ? `NTN: ${workspace.ntn}` : null, workspace.strn ? `STRN: ${workspace.strn}` : null].filter(Boolean).join(" · ")}</p>}</div></div>
              <div className="sm:text-right"><p className="font-mono text-lg font-bold">{invoice.invoiceNumber}</p><div className="mt-3 space-y-1 text-sm"><p><span className="text-neutral-500">DC / Gate Pass:</span> <span className="font-mono font-semibold">{dcNumber}</span></p><p><span className="text-neutral-500">Issued:</span> {formatDate(invoice.date)}</p><p><span className="text-neutral-500">Due:</span> {invoice.dueDate ? formatDate(invoice.dueDate) : "On receipt"}</p>{invoice.order?.warehouse && <p><span className="text-neutral-500">Warehouse:</span> {invoice.order.warehouse.name}{invoice.order.warehouse.code ? ` · ${invoice.order.warehouse.code}` : ""}</p>}<div className="pt-1"><StatusBadge status={invoice.status} /></div></div></div>
            </div>
          </header>

          <section className="border-b border-neutral-200 p-6 sm:p-8"><p className="text-xs font-semibold uppercase tracking-wide text-neutral-400">Bill to</p><p className="mt-2 text-lg font-semibold">{invoice.customer.companyName}</p>{invoice.customer.companyName !== invoice.customer.name && <p className="text-sm text-neutral-600">{invoice.customer.name}</p>}<div className="mt-2 space-y-0.5 text-sm text-neutral-500">{invoice.customer.address && <p>{invoice.customer.address}</p>}{invoice.customer.phone && <p>{invoice.customer.phone}</p>}</div></section>

          <section className="overflow-x-auto">
            {invoice.order?.items.length ? <Table className="min-w-[700px] table-fixed print:min-w-0"><TableHeader><TableRow><TableHead className="w-[30%] pl-6 sm:pl-8">Description</TableHead><TableHead className="w-[14%]">SKU</TableHead><TableHead className="w-[8%] text-right">Qty</TableHead><TableHead className="w-[8%]">Unit</TableHead><TableHead className="w-[12%] text-right">Rate</TableHead><TableHead className="w-[11%] text-right">Disc/unit</TableHead><TableHead className="w-[8%] text-right">Tax</TableHead><TableHead className="w-[14%] pr-6 text-right sm:pr-8">Amount</TableHead></TableRow></TableHeader><TableBody>{invoice.order.items.map((item) => { const { total } = calculateSaleLine(item); return <TableRow key={item.id}><TableCell className="whitespace-normal break-words pl-6 font-medium sm:pl-8"><span>{item.name}</span>{item.pricingMode === "WEIGHT" && <span className="mt-0.5 block text-[10px] font-medium text-emerald-700">{item.unitWeight?.toFixed(3)} kg/unit · total {item.totalWeight?.toFixed(3)} kg</span>}</TableCell><TableCell className="whitespace-normal break-all text-neutral-500">{item.sku || "-"}</TableCell><TableCell className="text-right">{item.quantity}</TableCell><TableCell className="text-neutral-500">{formatUnit(item.unit)}</TableCell><TableCell className="text-right tabular-nums">{item.pricingMode === "WEIGHT" ? <><span>{formatPKR(item.perKgRate ?? 0)}/kg</span><span className="block text-[10px] text-neutral-500">{formatPKR(item.unitPrice)}/unit</span></> : formatPKR(item.unitPrice)}</TableCell><TableCell className="text-right tabular-nums">{formatPKR(item.discountPerUnit)}</TableCell><TableCell className="text-right tabular-nums">{item.taxRate === null ? "-" : `${item.taxRate}%`}</TableCell><TableCell className="pr-6 text-right font-semibold tabular-nums sm:pr-8">{formatPKR(total)}</TableCell></TableRow>; })}</TableBody></Table> : <p className="p-8 text-sm text-neutral-500">No sales order line items are linked to this invoice.</p>}
          </section>

          {invoice.status === "CANCELLED" && <div className="border-y-4 border-black p-3 text-center text-xl font-black tracking-[0.25em]">CANCELLED</div>}
          <section data-document-totals className="flex justify-end border-t border-neutral-200 p-6 print:p-3 sm:p-8"><div className="w-full max-w-sm space-y-3 print:space-y-1 text-sm"><p className="hidden text-[9px] uppercase tracking-wide text-neutral-500 print:block">Invoice {invoice.invoiceNumber} · DC {dcNumber}</p>{invoice.order && <><div className="flex justify-between"><span className="text-neutral-500">Subtotal</span><span>{formatPKR(invoice.order.subtotal)}</span></div><div className="flex justify-between"><span className="text-neutral-500">Discount</span><span>- {formatPKR(invoice.order.discount)}</span></div><div className="flex justify-between"><span className="text-neutral-500">Taxable amount</span><span>{formatPKR(invoice.order.taxableAmount)}</span></div><div className="flex justify-between"><span className="text-neutral-500">{invoice.order.gstRate === null ? "Sales tax (Mixed)" : `Sales tax (${invoice.order.gstRate}%)`}</span><span>{formatPKR(invoice.order.gstAmount)}</span></div></>}<div className="flex justify-between border-t pt-3 print:pt-1 text-base font-bold"><span>Invoice total</span><span>{formatPKR(invoice.total)}</span></div><div className="flex justify-between"><span className="text-neutral-500">Payments received</span><span className="text-emerald-700">{formatPKR(invoice.paid)}</span></div>{invoice.creditApplied > 0 && <div className="flex justify-between"><span className="text-neutral-500">Customer credit applied</span><span>{formatPKR(invoice.creditApplied)}</span></div>}<div className="flex justify-between rounded-lg bg-neutral-950 p-4 print:p-2 text-base font-bold text-white print:border print:border-neutral-300 print:bg-white print:text-black"><span>Balance due</span><span>{formatPKR(invoice.balance)}</span></div></div></section>

          {invoice.payments.length > 0 && <section className="border-t border-neutral-200 p-6 sm:p-8"><h3 className="font-semibold">Payment history</h3><div className="mt-3 overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Method / status</TableHead><TableHead>Receipt / reference</TableHead><TableHead className="text-right">Amount</TableHead></TableRow></TableHeader><TableBody>{invoice.payments.map((payment) => <TableRow key={payment.id}><TableCell>{formatDate(payment.date)}</TableCell><TableCell>{payment.method.replaceAll("_", " ")}{payment.isReversal ? " · Reversal" : payment.isReversed ? " · Reversed" : ""}</TableCell><TableCell><Link href={`/payments/${payment.id}`} className="font-medium hover:underline">{payment.reference}</Link></TableCell><TableCell className="text-right font-medium">{formatPKR(payment.amount)}</TableCell></TableRow>)}</TableBody></Table></div></section>}
        </article>
        <aside className="space-y-6 print:hidden 2xl:sticky 2xl:top-6">
          {fbrPrintBlocked && (
            <section className="rounded-xl border border-red-200 bg-red-50 p-5 text-sm text-red-900">
              <h2 className="font-semibold">FBR production printing blocked</h2>
              <p className="mt-1 text-xs leading-5">{fbrPrintIssues[0]?.message}</p>
            </section>
          )}
          {fbrPanel && <FbrInvoiceStatusCard invoiceId={invoice.id} data={fbrPanel} />}
          <section className="rounded-xl border border-neutral-200 bg-white p-5">
            <div className="mb-5"><h2 className="font-semibold">Record payment</h2><p className="mt-1 text-sm text-neutral-500">Allocate a manual receipt to this invoice.</p></div>
            {canRecordPayments && invoice.balance > 0 && !["CANCELLED", "DRAFT"].includes(invoice.status)
              ? <RecordPaymentForm invoice={{ id: invoice.id, number: invoice.invoiceNumber, customerId: invoice.customer.id, customerName: invoice.customer.companyName, balance: invoice.balance }} cashBankAccounts={cashBankAccounts} />
              : <p className="rounded-lg bg-neutral-50 p-4 text-sm text-neutral-600">{invoice.balance <= 0 ? "This invoice has been paid in full." : "Payment recording is unavailable for your role or this invoice."}</p>}
          </section>
        </aside>
      </div>
    </div>
  );
}
