import { format } from "date-fns";
import { notFound } from "next/navigation";

import { ChequePrintSheet } from "@/components/cheques/cheque-print-sheet";
import { formatPkrAmountInWords } from "@/lib/amount-in-words";
import { requirePermission } from "@/lib/server/authorization";
import { getSupplierPaymentReversalState } from "@/lib/server/supplier-payment-reversals";
import { getSupplierPaymentVoucher } from "@/lib/server/suppliers";

export default async function ChequePrintPage({ params }: { params: Promise<{ id: string }> }) {
  const { workspaceId } = await requirePermission("financial.manage");
  const id = (await params).id;
  const [voucher, reversalState] = await Promise.all([
    getSupplierPaymentVoucher(workspaceId, id),
    getSupplierPaymentReversalState(workspaceId, id),
  ]);

  if (!voucher || !reversalState || reversalState.isReversal || reversalState.isReversed) notFound();
  if (voucher.method !== "CHEQUE" || !voucher.cashBankAccount?.isBank) notFound();

  const payeeName = voucher.supplier?.companyName ?? voucher.supplier?.name ?? "Payee";
  const chequeDate = format(new Date(voucher.paymentDate), "ddMMyyyy");

  return (
    <ChequePrintSheet
      voucherId={voucher.id}
      payeeName={payeeName}
      amount={voucher.netAmount}
      amountWords={formatPkrAmountInWords(voucher.netAmount)}
      chequeDate={chequeDate}
      voucherNumber={voucher.documentNumber}
      chequeNumber={voucher.reference}
      bankName={voucher.cashBankAccount.bankName}
      accountTitle={voucher.cashBankAccount.accountTitle}
    />
  );
}
