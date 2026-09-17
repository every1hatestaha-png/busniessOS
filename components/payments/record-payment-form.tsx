"use client";

import { useActionState, useEffect, useRef, useState } from "react";

import { recordPaymentAction, type RecordPaymentState } from "@/app/(dashboard)/invoices/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatPKR } from "@/lib/utils";

type CustomerOption = { id: string; name: string; balance: number };
type FixedInvoice = { id: string; number: string; customerId: string; customerName: string; balance: number };
type CashBankOption = { cashBankAccountId: string; name: string; currentBalance: number; isBank: boolean; bankName?: string | null };
type CustomerInvoiceTarget = { id: string; invoiceNumber: string; issuedAt: string; originalAmount: number; paidAmount: number; creditApplied: number; outstandingAmount: number };
type CustomerReceivables = { customerId: string; currentBalance: number; invoices: CustomerInvoiceTarget[] };

const initialState: RecordPaymentState = {};
const labelClass = "mb-1.5 block text-sm font-medium text-neutral-700";
const fieldClass = "h-8 w-full rounded-lg border border-neutral-200 bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-neutral-200";

export function RecordPaymentForm({ customers = [], invoice, cashBankAccounts = [] }: { customers?: CustomerOption[]; invoice?: FixedInvoice; cashBankAccounts?: CashBankOption[] }) {
  const [state, action, pending] = useActionState(recordPaymentAction, initialState);
  const formRef = useRef<HTMLFormElement>(null);
  const [customerId, setCustomerId] = useState(invoice?.customerId ?? "");
  const [mode, setMode] = useState<"UNALLOCATED" | "ALLOCATED">(invoice ? "ALLOCATED" : "UNALLOCATED");
  const [manualAmount, setManualAmount] = useState("");
  const [withholdingTax, setWithholdingTax] = useState("0");
  const [allocations, setAllocations] = useState<Record<string, number>>({});
  const [receivables, setReceivables] = useState<CustomerReceivables | null>(null);
  const [loadingReceivables, setLoadingReceivables] = useState(false);
  const [receivablesError, setReceivablesError] = useState("");
  const idempotencyKeyRef = useRef(crypto.randomUUID());
  const selectedCustomer = customers.find((customer) => customer.id === customerId);
  const maximum = invoice?.balance ?? selectedCustomer?.balance;

  const allocationTotal = Object.values(allocations).reduce((sum, value) => sum + value, 0);
  const grossAmount = invoice || mode === "UNALLOCATED" ? Number(manualAmount || 0) : allocationTotal;
  const withholdingAmount = Number(withholdingTax || 0);
  const netAmount = grossAmount - withholdingAmount;
  const overWht = withholdingAmount > grossAmount;
  const allocationPayload = !invoice && mode === "ALLOCATED"
    ? Object.entries(allocations).filter(([, amount]) => amount > 0).map(([invoiceId, amount]) => ({ invoiceId, amount }))
    : [];

  useEffect(() => {
    if (invoice || !customerId || mode !== "ALLOCATED") return;
    const controller = new AbortController();
    setLoadingReceivables(true);
    setReceivablesError("");
    fetch(`/api/v1/customers/${customerId}/receivables`, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error("Could not load customer invoices.");
        return response.json();
      })
      .then((body) => {
        if (!controller.signal.aborted) setReceivables(body.data ?? null);
      })
      .catch(() => {
        if (!controller.signal.aborted) setReceivablesError("Customer invoices could not be loaded.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoadingReceivables(false);
      });
    return () => controller.abort();
  }, [customerId, invoice, mode]);

  useEffect(() => {
    if (!state.successToken) return;
    formRef.current?.reset();
    idempotencyKeyRef.current = crypto.randomUUID();
    const hidden = formRef.current?.elements.namedItem("idempotencyKey") as HTMLInputElement | null;
    if (hidden) hidden.value = idempotencyKeyRef.current;
    queueMicrotask(() => {
      setManualAmount("");
      setWithholdingTax("0");
      setAllocations({});
      setReceivables(null);
      setReceivablesError("");
      if (!invoice) setMode("UNALLOCATED");
    });
  }, [invoice, state.successToken]);

  function setAllocation(targetId: string, value: string, max: number) {
    const parsed = Math.max(0, parseFloat(value) || 0);
    setAllocations((previous) => ({ ...previous, [targetId]: Math.min(parsed, max) }));
  }

  const today = new Date();
  const localDate = new Date(today.getTime() - today.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
  const noAllocation = !invoice && mode === "ALLOCATED" && allocationPayload.length === 0;
  const disabled = pending || (!invoice && customers.length === 0) || cashBankAccounts.length === 0 || grossAmount <= 0 || overWht || noAllocation || loadingReceivables || Boolean(receivablesError);

  return (
    <form ref={formRef} action={action} className="space-y-4">
      <input type="hidden" name="idempotencyKey" ref={(el) => { if (el) el.value = idempotencyKeyRef.current; }} />
      <input type="hidden" name="allocationsJson" value={allocationPayload.length ? JSON.stringify(allocationPayload) : ""} />
      {invoice ? (
        <div className="rounded-lg bg-neutral-50 p-3"><p className="text-xs font-medium uppercase tracking-wide text-neutral-500">Applying to</p><p className="mt-1 font-semibold">{invoice.number}</p><p className="text-sm text-neutral-500">{invoice.customerName} · {formatPKR(invoice.balance)} due</p><input type="hidden" name="customerId" value={invoice.customerId} /><input type="hidden" name="invoiceId" value={invoice.id} /></div>
      ) : (
        <div><label className={labelClass} htmlFor="payment-customer">Customer</label><select id="payment-customer" name="customerId" required value={customerId} onChange={(event) => { setCustomerId(event.target.value); setAllocations({}); setManualAmount(""); setWithholdingTax("0"); setReceivables(null); setReceivablesError(""); }} className={fieldClass}><option value="">Select an account</option>{customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name} · {formatPKR(customer.balance)}</option>)}</select>{customers.length === 0 && <p className="mt-1.5 text-xs text-neutral-500">There are no customer balances available to collect.</p>}</div>
      )}

      {!invoice && customerId && (
        <div className="grid grid-cols-2 gap-2 rounded-lg bg-neutral-50 p-1">
          <Button type="button" size="sm" variant={mode === "UNALLOCATED" ? "default" : "ghost"} onClick={() => { setMode("UNALLOCATED"); setAllocations({}); setReceivables(null); setReceivablesError(""); }}>On-account payment</Button>
          <Button type="button" size="sm" variant={mode === "ALLOCATED" ? "default" : "ghost"} onClick={() => { setMode("ALLOCATED"); setManualAmount(""); setReceivables(null); setReceivablesError(""); }}>Allocate to invoices</Button>
        </div>
      )}

      {!invoice && mode === "ALLOCATED" && customerId && (
        <div className="rounded-lg border border-neutral-200">
          <div className="flex items-center justify-between border-b border-neutral-100 px-3 py-2"><div><p className="text-sm font-semibold">Invoice allocation</p><p className="text-xs text-neutral-500">Allocate this receipt across one or more open invoices.</p></div><p className="text-sm font-semibold tabular-nums">{formatPKR(allocationTotal)}</p></div>
          {loadingReceivables ? <p className="p-3 text-sm text-neutral-500">Loading open invoices...</p> : receivablesError ? <p role="alert" className="p-3 text-sm text-red-600">{receivablesError}</p> : !receivables?.invoices.length ? <p className="p-3 text-sm text-neutral-500">No open invoices are available for allocation.</p> : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="border-b text-left text-xs text-neutral-500"><th className="px-3 py-2">Invoice</th><th className="px-3 py-2">Date</th><th className="px-3 py-2 text-right">Outstanding</th><th className="px-3 py-2 text-right">Allocate</th></tr></thead>
                <tbody>{receivables.invoices.map((target) => {
                  const allocated = allocations[target.id] ?? 0;
                  return <tr key={target.id} className="border-b border-neutral-100 last:border-0"><td className="px-3 py-2 font-mono text-xs font-semibold">{target.invoiceNumber}</td><td className="px-3 py-2 text-neutral-500">{new Date(target.issuedAt).toLocaleDateString()}</td><td className="px-3 py-2 text-right tabular-nums">{formatPKR(target.outstandingAmount)}</td><td className="px-3 py-2"><div className="flex justify-end gap-1"><input aria-label={`Allocation for ${target.invoiceNumber}`} type="number" min="0" max={target.outstandingAmount} step="0.01" value={allocated || ""} onChange={(event) => setAllocation(target.id, event.target.value, target.outstandingAmount)} className="h-8 w-28 rounded-lg border border-neutral-200 bg-white px-2 text-right text-sm outline-none focus:ring-2 focus:ring-neutral-200" placeholder="0.00" /><Button type="button" size="sm" variant="outline" onClick={() => setAllocation(target.id, String(target.outstandingAmount), target.outstandingAmount)}>Full</Button></div></td></tr>;
                })}</tbody>
              </table>
            </div>
          )}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
        {(!customerId || invoice || mode === "UNALLOCATED") ? <div><label className={labelClass} htmlFor={`payment-amount-${invoice?.id ?? "khata"}`}>{invoice ? "Gross settlement (PKR)" : "Payment amount (PKR)"}</label><Input id={`payment-amount-${invoice?.id ?? "khata"}`} name="amount" type="number" min="0.01" max={maximum} step="0.01" required value={manualAmount} onChange={(event) => setManualAmount(event.target.value)} placeholder="0.00" /></div> : <input type="hidden" name="amount" value={allocationTotal || ""} />}
        <div><label className={labelClass} htmlFor={`payment-wht-${invoice?.id ?? "khata"}`}>Withholding tax deducted by customer (PKR)</label><Input id={`payment-wht-${invoice?.id ?? "khata"}`} name="withholdingTaxAmount" type="number" min="0" max={grossAmount || undefined} step="0.01" value={withholdingTax} onChange={(event) => setWithholdingTax(event.target.value)} placeholder="0.00" /></div>
        <div><label className={labelClass} htmlFor={`payment-date-${invoice?.id ?? "khata"}`}>Payment date</label><Input id={`payment-date-${invoice?.id ?? "khata"}`} name="paymentDate" type="date" defaultValue={localDate} required /></div>
      </div>

      {grossAmount > 0 && (
        <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-3 text-sm">
          <div className="flex justify-between"><span>Gross customer balance settled</span><span className="font-medium tabular-nums">{formatPKR(grossAmount)}</span></div>
          <div className="mt-1 flex justify-between text-neutral-500"><span>Less: customer WHT</span><span className="tabular-nums">{formatPKR(withholdingAmount)}</span></div>
          <div className="mt-2 flex justify-between border-t border-neutral-200 pt-2 font-semibold"><span>Net cash/bank received</span><span className="tabular-nums">{formatPKR(Math.max(0, netAmount))}</span></div>
        </div>
      )}

      <div><label className={labelClass} htmlFor={`payment-cash-bank-${invoice?.id ?? "khata"}`}>Receive into</label><select id={`payment-cash-bank-${invoice?.id ?? "khata"}`} name="cashBankAccountId" required className={fieldClass}><option value="">Select cash/bank</option>{cashBankAccounts.map((account) => <option key={account.cashBankAccountId} value={account.cashBankAccountId}>{account.name}{account.isBank && account.bankName ? ` · ${account.bankName}` : ""} · {formatPKR(account.currentBalance)}</option>)}</select>{cashBankAccounts.length === 0 && <p className="mt-1.5 text-xs text-red-600">Create a cash/bank account before recording receipts.</p>}</div>
      <div><label className={labelClass} htmlFor={`payment-method-${invoice?.id ?? "khata"}`}>Method</label><select id={`payment-method-${invoice?.id ?? "khata"}`} name="method" defaultValue="CASH" className={fieldClass}><option value="CASH">Cash</option><option value="BANK_TRANSFER">Bank transfer</option><option value="JAZZCASH">JazzCash</option><option value="EASYPAISA">Easypaisa</option><option value="CHEQUE">Cheque</option><option value="OTHER">Other</option></select></div>
      <div><label className={labelClass} htmlFor={`payment-reference-${invoice?.id ?? "khata"}`}>Reference <span className="font-normal text-neutral-400">(optional)</span></label><Input id={`payment-reference-${invoice?.id ?? "khata"}`} name="reference" maxLength={120} placeholder="Cheque or transaction number" /></div>
      <div><label className={labelClass} htmlFor={`payment-notes-${invoice?.id ?? "khata"}`}>Notes <span className="font-normal text-neutral-400">(optional)</span></label><textarea id={`payment-notes-${invoice?.id ?? "khata"}`} name="notes" maxLength={500} rows={3} className="w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-neutral-200" placeholder="Collection notes" /></div>
      {overWht && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">Withholding tax cannot exceed the gross customer balance being settled.</p>}
      {state.error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{state.error}</p>}
      {state.success && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">{state.success}</p>}
      <Button type="submit" disabled={disabled} className="w-full">{pending ? "Recording..." : "Record payment"}</Button>
    </form>
  );
}
