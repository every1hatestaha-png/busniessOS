import Link from "next/link";
import { notFound } from "next/navigation";

import { ReverseExpenseButton } from "@/components/accounting/reverse-expense-button";
import { DocumentFrame } from "@/components/documents/document-frame";
import { DocumentSignatures } from "@/components/documents/document-signatures";
import { PrintButton } from "@/components/invoices/print-button";
import { getExpenseVoucher } from "@/lib/server/accounting";
import { requirePermission } from "@/lib/server/authorization";
import { getExpenseReversalState } from "@/lib/server/expense-reversals";
import { formatDate, formatPKR } from "@/lib/utils";

export default async function ExpenseVoucherPage({ params }: { params: Promise<{ id: string }> }) {
  const { workspaceId } = await requirePermission("financial.manage");
  const id = (await params).id;
  const [voucher, reversalState] = await Promise.all([
    getExpenseVoucher(workspaceId, id),
    getExpenseReversalState(workspaceId, id),
  ]);
  if (!voucher || !reversalState) notFound();

  return (
    <div className="mx-auto max-w-[1050px] space-y-4 print:max-w-none print:space-y-0">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link href="/accounting/expenses" className="text-sm font-medium text-neutral-500 hover:text-neutral-950">Expenses / {voucher.voucherNumber}</Link>
        <div className="flex items-center gap-2">{!reversalState.isReversed && <ReverseExpenseButton expenseId={id} voucherNumber={voucher.voucherNumber} />}<PrintButton label="Print voucher" /></div>
      </div>
      <DocumentFrame workspace={voucher.workspace} title="Expense voucher" number={voucher.voucherNumber} status={reversalState.isReversed ? "REVERSED" : undefined} statusReason={reversalState.isReversed ? reversalState.reversalReason ?? "Expense financial effects reversed." : undefined} details={<><p>Date: {formatDate(voucher.expenseDate)}</p><p>Reference: {voucher.reference || "-"}</p>{reversalState.reversedAt && <p>Reversed: {formatDate(reversalState.reversedAt)}</p>}</>}>
        <section data-document-section className="my-6 grid gap-6 border-b border-neutral-200 pb-6 sm:grid-cols-2">
          <div><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-neutral-500">Paid to</p><p className="mt-1 text-base font-semibold">{voucher.payee || "Not specified"}</p></div>
          <div className="sm:text-right"><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-neutral-500">Paid from</p><p className="mt-1 font-semibold">{voucher.paymentAccount.name}</p><p className="font-mono text-xs text-neutral-600">{voucher.paymentAccount.code}</p></div>
        </section>
        <section className="my-6"><table className="w-full border-collapse text-sm"><thead><tr className="bg-neutral-100"><th className="border px-3 py-2 text-left">Expense account</th><th className="border px-3 py-2 text-left">Description</th><th className="border px-3 py-2 text-right">Amount</th></tr></thead><tbody><tr><td className="border px-3 py-2"><p className="font-medium">{voucher.expenseAccount.name}</p><p className="font-mono text-xs text-neutral-600">{voucher.expenseAccount.code}</p></td><td className="border px-3 py-2">{voucher.notes || voucher.reference || "Operating expense"}</td><td className="border px-3 py-2 text-right font-semibold tabular-nums">{formatPKR(voucher.amount)}</td></tr></tbody></table></section>
        <section data-document-totals className="my-6 flex justify-end"><div className="flex w-full max-w-sm justify-between border-y-2 border-neutral-950 py-3 text-lg font-bold"><span>Total paid</span><span>{formatPKR(voucher.amount)}</span></div></section>
        {reversalState.isReversed && <section data-document-section className="my-6 rounded-md border border-neutral-300 p-3 text-sm"><p className="font-semibold">Reversal: {reversalState.reversalDocumentNo ?? `REV-${voucher.voucherNumber}`}</p><p className="mt-1 text-neutral-700">{reversalState.reversalReason || "Financial effects reversed."}</p></section>}
        {voucher.notes && <section data-document-section className="my-6 text-sm"><h2 className="font-semibold">Notes</h2><p className="mt-1 whitespace-pre-wrap text-neutral-700">{voucher.notes}</p></section>}
        <DocumentSignatures slots={[{ label: "Prepared by" }, { label: "Checked by" }, { label: "Approved by" }]} />
      </DocumentFrame>
    </div>
  );
}
