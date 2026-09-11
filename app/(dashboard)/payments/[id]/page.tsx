import Link from "next/link";
import { notFound } from "next/navigation";

import { DocumentFrame } from "@/components/documents/document-frame";
import { DocumentSignatures } from "@/components/documents/document-signatures";
import { PrintButton } from "@/components/invoices/print-button";
import { ReversePaymentButton } from "@/components/payments/reverse-payment-button";
import { canPerformAction } from "@/lib/server/authorization";
import { requireWorkspace } from "@/lib/server/auth";
import { getPaymentReceipt } from "@/lib/server/payments";
import { formatDate, formatPKR } from "@/lib/utils";

export default async function PaymentReceiptPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { workspaceId, workspace, role } = await requireWorkspace();
  const receipt = await getPaymentReceipt(workspaceId, id);
  if (!receipt) notFound();
  const status = receipt.isReversal ? "REVERSAL" : receipt.isReversed ? "REVERSED" : undefined;
  const canReverse = canPerformAction(role, "financial.manage") && !receipt.isReversed && !receipt.isReversal;
  const isReversal = receipt.isReversal;
  const documentTitle = isReversal ? "Customer payment reversal" : "Customer payment receipt";

  return (
    <div className="mx-auto max-w-[1400px] space-y-4 print:max-w-none print:space-y-0">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link href={receipt.allocations[0]?.invoiceId ? `/invoices/${receipt.allocations[0].invoiceId}` : "/khata"} className="text-sm font-medium text-neutral-500 hover:text-neutral-950">Back to account</Link>
        <div className="flex items-center gap-2">
          {canReverse && <ReversePaymentButton paymentId={receipt.id} documentNumber={receipt.documentNumber} />}
          <PrintButton label={isReversal ? "Print reversal" : "Print receipt"} />
        </div>
      </div>
      <DocumentFrame workspace={workspace} title={documentTitle} number={receipt.documentNumber} status={status} statusReason={receipt.reversalOf?.documentNumber ? `Reversal of ${receipt.reversalOf.documentNumber}` : undefined} details={<><p>Date: {formatDate(receipt.paymentDate)}</p><p>Method: {receipt.method.replaceAll("_", " ")}</p></>}>
        <section data-document-section className="my-6 grid gap-6 border-b border-neutral-200 pb-6 sm:grid-cols-2">
          <div><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-neutral-500">{isReversal ? "Customer" : "Received from"}</p><p className="mt-1 text-base font-semibold">{receipt.customer.companyName}</p>{receipt.customer.companyName !== receipt.customer.name && <p className="text-sm text-neutral-600">{receipt.customer.name}</p>}{receipt.customer.address && <p className="mt-1 text-sm text-neutral-600">{receipt.customer.address}</p>}{receipt.customer.phone && <p className="text-sm text-neutral-600">{receipt.customer.phone}</p>}</div>
          <div className="sm:text-right"><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-neutral-500">{isReversal ? "Reversal detail" : "Payment detail"}</p><p className="mt-1">Account: {receipt.cashBankAccount ? `${receipt.cashBankAccount.name} (${receipt.cashBankAccount.account.code})` : "Not specified"}</p><p>Reference: {receipt.reference || "-"}</p>{isReversal && receipt.reversalOf?.documentNumber && <p className="mt-1 font-medium">Original receipt: {receipt.reversalOf.documentNumber}</p>}</div>
        </section>

        <section data-document-totals className="my-6 flex justify-end"><div className="w-full max-w-sm space-y-2 text-sm"><div className="flex justify-between border-t border-neutral-300 pt-3 text-lg font-bold"><span>{isReversal ? "Amount reversed" : "Amount received"}</span><span>{formatPKR(receipt.amount)}</span></div>{!isReversal && receipt.allocations.length > 0 && <div className="flex justify-between"><span className="text-neutral-600">Allocated</span><span>{formatPKR(receipt.allocatedAmount)}</span></div>}{!isReversal && receipt.unallocatedAmount > 0 && <div className="flex justify-between"><span className="text-neutral-600">Credit on account</span><span>{formatPKR(receipt.unallocatedAmount)}</span></div>}</div></section>

        {!isReversal && receipt.allocations.length > 0 && <section data-document-section className="my-6"><h2 className="mb-2 text-xs font-bold uppercase tracking-[0.14em] text-neutral-500">Invoice allocation</h2><table className="w-full border-collapse text-sm"><thead><tr className="bg-neutral-100"><th className="border px-3 py-2 text-left">Invoice</th><th className="border px-3 py-2 text-right">Amount</th></tr></thead><tbody>{receipt.allocations.map((allocation) => <tr key={allocation.id}><td className="border px-3 py-2">{allocation.invoiceNumber}</td><td className="border px-3 py-2 text-right font-medium tabular-nums">{formatPKR(allocation.amount)}</td></tr>)}</tbody></table></section>}
        {receipt.notes && <section data-document-section className="my-6 text-sm"><h2 className="font-semibold">Notes</h2><p className="mt-1 whitespace-pre-wrap text-neutral-700">{receipt.notes}</p></section>}
        <DocumentSignatures slots={isReversal ? [{ label: "Prepared by" }, { label: "Approved by" }] : [{ label: "Received by" }, { label: "Customer acknowledgement" }]} />
      </DocumentFrame>
    </div>
  );
}
