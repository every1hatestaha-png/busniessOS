"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatPKR } from "@/lib/utils";

type CashBankOption = { cashBankAccountId: string; name: string; currentBalance: number; isBank: boolean; bankName?: string | null };
type GrnPayable = { id: string; grnNumber: string; receiptDate: string; purchaseOrderId: string; orderNumber: string; totalAmount: number; settledAmount: number; outstandingAmount: number };
type SupplierPayables = {
  supplierId: string;
  currentBalance: number;
  openingBalance: { originalAmount: number; settledAmount: number; outstandingAmount: number };
  grns: GrnPayable[];
};

const fieldClass = "h-8 rounded-md border border-neutral-200 bg-white px-2 text-sm outline-none focus:ring-2 focus:ring-neutral-200";
const openingKey = "opening-balance";

export function SupplierPaymentForm({ supplierId, cashBankAccounts = [] }: { supplierId: string; cashBankAccounts?: CashBankOption[] }) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [wht, setWht] = useState("0");
  const [allocations, setAllocations] = useState<Record<string, number>>({});
  const [payables, setPayables] = useState<SupplierPayables | null>(null);
  const [loadingPayables, setLoadingPayables] = useState(true);
  const [payablesLoadError, setPayablesLoadError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [retryRequired, setRetryRequired] = useState(false);
  const submittedForm = useRef<FormData | null>(null);
  const [recorded, setRecorded] = useState(false);
  const [payablesLoadAttempt, setPayablesLoadAttempt] = useState(0);
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Karachi", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/v1/suppliers/${supplierId}/payables`, { signal: controller.signal })
      .then((response) => { if (!response.ok) throw new Error("Failed to load supplier payables"); return response.json(); })
      .then((body) => { if (!body.data || !Array.isArray(body.data.grns)) throw new Error("Invalid supplier payables response"); if (!controller.signal.aborted) setPayables(body.data); })
      .catch(() => { if (!controller.signal.aborted) setPayablesLoadError(true); })
      .finally(() => { if (!controller.signal.aborted) setLoadingPayables(false); });
    return () => controller.abort();
  }, [supplierId, payablesLoadAttempt]);

  const grns = payables?.grns.filter((grn) => grn.outstandingAmount > 0) ?? [];
  const openingOutstanding = payables?.openingBalance.outstandingAmount ?? 0;
  const hasPayables = openingOutstanding > 0 || grns.length > 0;
  const gross = Object.values(allocations).reduce((sum, value) => sum + value, 0);
  const net = gross - Number(wht || 0);
  const overWht = Number(wht || 0) > gross;

  function setAlloc(targetId: string, value: string, max: number) {
    const parsed = Math.max(0, parseFloat(value) || 0);
    setAllocations((previous) => ({ ...previous, [targetId]: Math.min(parsed, max) }));
  }

  function allocateFull(targetId: string, amount: number) {
    setAllocations((previous) => ({ ...previous, [targetId]: amount }));
  }

  return (
    <form
      className="rounded-xl border border-neutral-200 bg-white p-4"
      aria-busy={busy}
      onSubmit={async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (busy || recorded || loadingPayables || payablesLoadError || overWht || gross === 0) return;
        setBusy(true);
        setMessage("");
        const form = retryRequired && submittedForm.current ? submittedForm.current : new FormData(event.currentTarget);
        submittedForm.current = form;
        const allocationEntries = [
          ...(allocations[openingKey] > 0 ? [{ openingBalance: true, amount: allocations[openingKey] }] : []),
          ...grns.filter((grn) => (allocations[grn.id] ?? 0) > 0).map((grn) => ({ goodReceivedNoteId: grn.id, amount: allocations[grn.id] })),
        ];
        try {
          const response = await fetch(`/api/v1/suppliers/${supplierId}/payments`, {
            method: "POST",
            headers: { "Content-Type": "application/json", "Idempotency-Key": idempotencyKey },
            body: JSON.stringify({
              amount: gross,
              withholdingTaxAmount: form.get("withholdingTaxAmount"),
              cashBankAccountId: form.get("cashBankAccountId"),
              allocations: allocationEntries,
              method: form.get("method"),
              paymentDate: form.get("paymentDate"),
              reference: form.get("reference"),
              notes: form.get("notes"),
            }),
          });
          const body = await response.json();
          setRetryRequired(!response.ok && response.status >= 500);
          setMessage(response.ok ? "Voucher recorded." : response.status >= 500 ? "The result could not be confirmed. Your inputs are preserved and locked; retry the same voucher." : body.error?.message ?? "Payment could not be recorded. Review your inputs and try again.");
          if (response.ok) {
            setRecorded(true);
            setBusy(false);
            if (body.data?.id) router.push(`/accounting/payment-vouchers/${body.data.id}`);
            else router.refresh();
            return;
          }
        } catch {
          setRetryRequired(true);
          setMessage("The result is unknown because the request or response failed. Your inputs are preserved and locked; retry the same voucher with the same key.");
        }
        setBusy(false);
      }}
    >
      <div className="mb-4 flex flex-wrap items-start justify-between gap-4">
        <div><h2 className="font-semibold">Supplier payment voucher</h2><p className="mt-1 text-xs text-neutral-500">Settle the supplier opening balance or one or more received GRNs. Purchase orders are not payment targets.</p></div>
        <div className="rounded-lg bg-neutral-950 px-3 py-2 text-right text-white"><p className="text-xs text-neutral-300">{overWht ? "Invalid net preview" : "Net cash/bank payment"}</p><p className="font-semibold tabular-nums">{formatPKR(net)}</p></div>
      </div>
      <fieldset disabled={busy || recorded || retryRequired} className="min-w-0">
        <div className="grid gap-3 lg:grid-cols-6">
          <div className="lg:col-span-2">
            <p className="mb-1 block text-xs font-medium text-neutral-500">Selected payables: {Object.values(allocations).filter((value) => value > 0).length}</p>
            <div className="space-y-1 text-xs text-neutral-500">
              <div className="flex justify-between"><span>Gross liability settled (auto)</span><span className="tabular-nums font-medium">{formatPKR(gross)}</span></div>
              <div className="flex justify-between"><span>Less: WHT retained</span><span className="tabular-nums">{formatPKR(Number(wht || 0))}</span></div>
              <div className="flex justify-between border-t pt-1"><span>Net cash/bank payment</span><span className="tabular-nums font-semibold">{formatPKR(net)}</span></div>
            </div>
          </div>
          <label className="grid gap-1 text-xs font-medium text-neutral-500 lg:col-span-2">Withholding tax (PKR)<Input min="0" max={gross} step="0.01" type="number" name="withholdingTaxAmount" value={wht} aria-invalid={overWht} onChange={(event) => setWht(event.target.value)} /></label>
          <label className="grid gap-1 text-xs font-medium text-neutral-500 lg:col-span-2">Pay from cash/bank<select name="cashBankAccountId" required className={fieldClass}><option value="">Select cash/bank account</option>{cashBankAccounts.map((account) => <option key={account.cashBankAccountId} value={account.cashBankAccountId}>{account.name}{account.isBank && account.bankName ? ` · ${account.bankName}` : ""} · {formatPKR(account.currentBalance)}</option>)}</select></label>
          <label className="grid gap-1 text-xs font-medium text-neutral-500 lg:col-span-2">Payment method<select name="method" className={fieldClass}><option value="CASH">Cash</option><option value="BANK_TRANSFER">Bank transfer</option><option value="CHEQUE">Cheque</option><option value="JAZZCASH">JazzCash</option><option value="EASYPAISA">Easypaisa</option><option value="OTHER">Other</option></select></label>
          <label className="grid gap-1 text-xs font-medium text-neutral-500 lg:col-span-2">Reference (optional)<Input name="reference" maxLength={120} /></label>
          <label className="grid gap-1 text-xs font-medium text-neutral-500 lg:col-span-2">Payment date<Input name="paymentDate" type="date" defaultValue={today} required /></label>
        </div>

        <div className="mt-4">
          <h3 className="mb-2 text-sm font-semibold">Allocate supplier payment</h3>
          {loadingPayables ? (
            <p role="status" className="text-sm text-neutral-500">Loading supplier payables...</p>
          ) : payablesLoadError ? (
            <div><p role="alert" className="text-sm text-red-600">Supplier payables could not be loaded. Your inputs are preserved. Retry before recording a voucher.</p><Button type="button" variant="outline" size="sm" className="mt-2" onClick={() => { setLoadingPayables(true); setPayablesLoadError(false); setPayablesLoadAttempt((attempt) => attempt + 1); }}>Retry loading payables</Button></div>
          ) : !hasPayables ? (
            <p className="text-sm text-emerald-700">No unpaid opening balance or active GRN liability remains for this supplier.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs font-medium text-neutral-500">
                    <th className="pb-2 pr-2">Reference</th>
                    <th className="pb-2 pr-2">Date / source</th>
                    <th className="pb-2 pr-2 text-right">Original</th>
                    <th className="pb-2 pr-2 text-right">Settled / adjusted</th>
                    <th className="pb-2 pr-2 text-right font-semibold">Outstanding</th>
                    <th className="pb-2 pr-2 text-right">Allocate now</th>
                    <th className="pb-2 text-right">Remaining</th>
                  </tr>
                </thead>
                <tbody>
                  {openingOutstanding > 0 && (() => {
                    const allocated = allocations[openingKey] || 0;
                    const remaining = Math.max(0, openingOutstanding - allocated);
                    return <tr className="border-b border-neutral-100 bg-amber-50/40"><td className="py-2 pr-2 font-semibold">Opening Balance</td><td className="py-2 pr-2 text-neutral-500">Supplier opening payable</td><td className="py-2 pr-2 text-right tabular-nums">{formatPKR(payables?.openingBalance.originalAmount ?? 0)}</td><td className="py-2 pr-2 text-right tabular-nums">{formatPKR(payables?.openingBalance.settledAmount ?? 0)}</td><td className="py-2 pr-2 text-right font-semibold tabular-nums">{formatPKR(openingOutstanding)}</td><td className="py-2 pr-2 text-right"><div className="flex items-center justify-end gap-1"><input aria-label="Opening balance allocation (PKR)" type="number" min="0" max={openingOutstanding} step="0.01" value={allocated || ""} onChange={(event) => setAlloc(openingKey, event.target.value, openingOutstanding)} className="h-7 w-28 rounded border border-neutral-200 bg-white px-2 text-right text-xs tabular-nums outline-none focus:ring-2 focus:ring-neutral-200" placeholder="0" /><Button type="button" variant="outline" size="sm" className="h-7 px-2 text-xs" onClick={() => allocateFull(openingKey, openingOutstanding)}>Full</Button></div></td><td className={`py-2 text-right tabular-nums ${remaining === 0 ? "text-green-600" : "text-neutral-500"}`}>{formatPKR(remaining)}</td></tr>;
                  })()}
                  {grns.map((grn) => {
                    const allocated = allocations[grn.id] || 0;
                    const remaining = Math.max(0, grn.outstandingAmount - allocated);
                    return (
                      <tr key={grn.id} className="border-b border-neutral-100">
                        <td className="py-2 pr-2 font-mono text-xs font-semibold">{grn.grnNumber}</td>
                        <td className="py-2 pr-2"><div>{new Date(grn.receiptDate).toLocaleDateString()}</div><div className="text-xs text-neutral-500">PO {grn.orderNumber}</div></td>
                        <td className="py-2 pr-2 text-right tabular-nums">{formatPKR(grn.totalAmount)}</td>
                        <td className="py-2 pr-2 text-right tabular-nums">{formatPKR(grn.settledAmount)}</td>
                        <td className="py-2 pr-2 text-right font-semibold tabular-nums">{formatPKR(grn.outstandingAmount)}</td>
                        <td className="py-2 pr-2 text-right"><div className="flex items-center justify-end gap-1"><input aria-label={`Allocation for ${grn.grnNumber} (PKR)`} type="number" min="0" max={grn.outstandingAmount} step="0.01" value={allocated || ""} onChange={(event) => setAlloc(grn.id, event.target.value, grn.outstandingAmount)} className="h-7 w-28 rounded border border-neutral-200 px-2 text-right text-xs tabular-nums outline-none focus:ring-2 focus:ring-neutral-200" placeholder="0" /><Button type="button" variant="outline" size="sm" className="h-7 px-2 text-xs" aria-label={`Allocate full outstanding for ${grn.grnNumber}`} onClick={() => allocateFull(grn.id, grn.outstandingAmount)}>Full</Button></div></td>
                        <td className={`py-2 text-right tabular-nums ${remaining === 0 ? "text-green-600" : "text-neutral-500"}`}>{formatPKR(remaining)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <label className="mt-3 grid gap-1 text-xs font-medium text-neutral-500">Voucher notes (optional)<textarea name="notes" maxLength={500} rows={2} className="w-full rounded-md border border-neutral-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-neutral-200" /></label>
      </fieldset>
      {overWht && <p role="alert" className="mt-3 text-sm text-red-600">Withholding tax cannot exceed the gross settlement. Reduce WHT or adjust allocations; the negative net preview is not a valid payment.</p>}
      {cashBankAccounts.length === 0 && <p className="mt-3 text-sm text-red-600">Create a cash/bank account before recording supplier vouchers.</p>}
      {gross === 0 && hasPayables && <p className="mt-3 text-sm text-amber-600">Allocate at least one opening balance or GRN amount before recording.</p>}
      {message && <p role={message === "Voucher recorded." ? "status" : "alert"} className="mt-3 text-sm text-neutral-700">{message}</p>}
      <Button type="submit" size="sm" disabled={busy || recorded || loadingPayables || payablesLoadError || overWht || cashBankAccounts.length === 0 || gross === 0} className="mt-3">{busy ? "Recording..." : recorded ? "Voucher recorded" : retryRequired ? "Retry voucher" : "Record voucher"}</Button>
    </form>
  );
}
