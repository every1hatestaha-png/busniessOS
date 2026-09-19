"use client";

import { useActionState, useEffect, useState } from "react";

import { recordPaymentAction, type RecordPaymentState } from "@/app/(dashboard)/invoices/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatPKR } from "@/lib/utils";

type CustomerOption = { id: string; name: string; balance: number; openingBalance?: number };
type FixedInvoice = { id: string; number: string; customerId: string; customerName: string; balance: number };
type CashBankOption = { cashBankAccountId: string; name: string; currentBalance: number; isBank: boolean; bankName?: string | null };
type CustomerInvoiceTarget = { id: string; invoiceNumber: string; issuedAt: string; outstandingAmount: number };
type CustomerReceivables = { customerId: string; currentBalance: number; invoices: CustomerInvoiceTarget[] };

type PaymentFieldsProps = {
  customers: CustomerOption[];
  invoice?: FixedInvoice;
  cashBankAccounts: CashBankOption[];
  state: RecordPaymentState;
  action: (formData: FormData) => void;
  pending: boolean;
};

const initialState: RecordPaymentState = {};
const labelClass = "mb-1.5 block text-sm font-medium text-neutral-700";
const fieldClass = "h-8 w-full rounded-lg border border-neutral-200 bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-neutral-200";

export function RecordPaymentForm({ customers = [], invoice, cashBankAccounts = [] }: { customers?: CustomerOption[]; invoice?: FixedInvoice; cashBankAccounts?: CashBankOption[] }) {
  const [state, action, pending] = useActionState(recordPaymentAction, initialState);
  return <PaymentFields key={state.successToken ?? "initial"} customers={customers} invoice={invoice} cashBankAccounts={cashBankAccounts} state={state} action={action} pending={pending} />;
}

function PaymentFields({ customers, invoice, cashBankAccounts, state, action, pending }: PaymentFieldsProps) {
  const [customerId, setCustomerId] = useState(invoice?.customerId ?? "");
  const [amount, setAmount] = useState("");
  const [withholdingTax, setWithholdingTax] = useState("0");
  const [target, setTarget] = useState<"ON_ACCOUNT" | "OPENING_BALANCE" | "INVOICES">("ON_ACCOUNT");
  const [allocations, setAllocations] = useState<Record<string, number>>({});
  const [receivables, setReceivables] = useState<CustomerReceivables | null>(null);
  const [loadingReceivables, setLoadingReceivables] = useState(false);
  const [receivablesError, setReceivablesError] = useState("");
  const [idempotencyKey] = useState(() => crypto.randomUUID());

  const selectedCustomer = customers.find((customer) => customer.id === customerId);
  const openingBalance = selectedCustomer?.openingBalance ?? 0;
  const effectiveTarget = invoice ? "INVOICE" : target;
  const allocationPayload = Object.entries(allocations)
    .filter(([, value]) => value > 0)
    .map(([invoiceId, value]) => ({ invoiceId, amount: value }));
  const allocationTotal = allocationPayload.reduce((sum, entry) => sum + entry.amount, 0);
  const grossAmount = effectiveTarget === "INVOICES" ? allocationTotal : Number(amount || 0);
  const withholdingAmount = Number(withholdingTax || 0);
  const netReceived = Math.max(0, grossAmount - withholdingAmount);
  const invalidWithholding = withholdingAmount > grossAmount;
  const maximum = invoice?.balance ?? (effectiveTarget === "OPENING_BALANCE" ? openingBalance : selectedCustomer?.balance);

  useEffect(() => {
    if (invoice || target !== "INVOICES" || !customerId) return;
    const controller = new AbortController();
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
  }, [customerId, invoice, target]);

  function changeCustomer(nextCustomerId: string) {
    setCustomerId(nextCustomerId);
    setTarget("ON_ACCOUNT");
    setAllocations({});
    setReceivables(null);
    setReceivablesError("");
    setAmount("");
    setWithholdingTax("0");
  }

  function changeTarget(next: "ON_ACCOUNT" | "OPENING_BALANCE" | "INVOICES") {
    setTarget(next);
    setAllocations({});
    setReceivables(null);
    setReceivablesError("");
    setAmount("");
    if (next === "INVOICES" && customerId) setLoadingReceivables(true);
    else setLoadingReceivables(false);
  }

  function setAllocation(invoiceId: string, value: string, max: number) {
    const parsed = Math.max(0, Number(value) || 0);
    setAllocations((previous) => ({ ...previous, [invoiceId]: Math.min(parsed, max) }));
  }

  const today = new Date();
  const localDate = new Date(today.getTime() - today.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
  const noInvoiceAllocation = !invoice && effectiveTarget === "INVOICES" && allocationPayload.length === 0;
  const disabled = pending || invalidWithholding || noInvoiceAllocation || loadingReceivables || Boolean(receivablesError) || grossAmount <= 0 || (!invoice && customers.length === 0) || cashBankAccounts.length === 0;

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="idempotencyKey" value={idempotencyKey} readOnly />
      {!invoice && <input type="hidden" name="applyToOpeningBalance" value={effectiveTarget === "OPENING_BALANCE" ? "true" : "false"} />}
      {!invoice && <input type="hidden" name="allocationsJson" value={effectiveTarget === "INVOICES" ? JSON.stringify(allocationPayload) : ""} />}
      {invoice ? (
        <div className="rounded-lg bg-neutral-50 p-3"><p className="text-xs font-medium uppercase tracking-wide text-neutral-500">Applying to</p><p className="mt-1 font-semibold">{invoice.number}</p><p className="text-sm text-neutral-500">{invoice.customerName} · {formatPKR(invoice.balance)} due</p><input type="hidden" name="customerId" value={invoice.customerId} /><input type="hidden" name="invoiceId" value={invoice.id} /></div>
      ) : (
        <div className="space-y-3">
          <div><label className={labelClass} htmlFor="payment-customer">Customer</label><select id="payment-customer" name="customerId" required value={customerId} onChange={(event) => changeCustomer(event.target.value)} className={fieldClass}><option value="">Select an account</option>{customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name} · {formatPKR(customer.balance)}</option>)}</select>{customers.length === 0 && <p className="mt-1.5 text-xs text-neutral-500">There are no customer balances available to collect.</p>}</div>
          {selectedCustomer && <div><label className={labelClass} htmlFor="payment-target">Apply payment to</label><select id="payment-target" value={target} onChange={(event) => changeTarget(event.target.value as "ON_ACCOUNT" | "OPENING_BALANCE" | "INVOICES")} className={fieldClass}><option value="ON_ACCOUNT">Customer account, unallocated</option><option value="INVOICES">Open invoices, allocated</option>{openingBalance > 0 && <option value="OPENING_BALANCE">Opening balance · {formatPKR(openingBalance)} outstanding</option>}</select></div>}
        </div>
      )}

      {!invoice && effectiveTarget === "INVOICES" && customerId && (
        <div className="rounded-lg border border-neutral-200">
          <div className="flex items-center justify-between border-b border-neutral-100 px-3 py-2"><div><p className="text-sm font-semibold">Invoice allocation</p><p className="text-xs text-neutral-500">Split one receipt across open invoices.</p></div><p className="text-sm font-semibold tabular-nums">{formatPKR(allocationTotal)}</p></div>
          {loadingReceivables ? <p className="p-3 text-sm text-neutral-500">Loading open invoices...</p> : receivablesError ? <p role="alert" className="p-3 text-sm text-red-600">{receivablesError}</p> : !receivables?.invoices.length ? <p className="p-3 text-sm text-neutral-500">No open invoices are available for allocation.</p> : (
            <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b text-left text-xs text-neutral-500"><th className="px-3 py-2">Invoice</th><th className="px-3 py-2">Date</th><th className="px-3 py-2 text-right">Outstanding</th><th className="px-3 py-2 text-right">Allocate</th></tr></thead><tbody>{receivables.invoices.map((row) => <tr key={row.id} className="border-b border-neutral-100 last:border-0"><td className="px-3 py-2 font-mono text-xs font-semibold">{row.invoiceNumber}</td><td className="px-3 py-2 text-neutral-500">{new Date(row.issuedAt).toLocaleDateString()}</td><td className="px-3 py-2 text-right tabular-nums">{formatPKR(row.outstandingAmount)}</td><td className="px-3 py-2"><div className="flex justify-end gap-1"><input aria-label={`Allocation for ${row.invoiceNumber}`} type="number" min="0" max={row.outstandingAmount} step="0.01" value={allocations[row.id] || ""} onChange={(event) => setAllocation(row.id, event.target.value, row.outstandingAmount)} className="h-8 w-28 rounded-lg border border-neutral-200 bg-white px-2 text-right text-sm outline-none focus:ring-2 focus:ring-neutral-200" placeholder="0.00" /><Button type="button" size="sm" variant="outline" onClick={() => setAllocation(row.id, String(row.outstandingAmount), row.outstandingAmount)}>Full</Button></div></td></tr>)}</tbody></table></div>
          )}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
        {effectiveTarget === "INVOICES" && !invoice ? <input type="hidden" name="amount" value={allocationTotal || ""} /> : <div><label className={labelClass} htmlFor={`payment-amount-${invoice?.id ?? "khata"}`}>Gross amount settled (PKR)</label><Input id={`payment-amount-${invoice?.id ?? "khata"}`} name="amount" type="number" min="0.01" max={maximum} step="0.01" required placeholder="0.00" value={amount} onChange={(event) => setAmount(event.target.value)} />{!invoice && effectiveTarget === "OPENING_BALANCE" && <p className="mt-1.5 text-xs text-neutral-500">Maximum opening balance settlement: {formatPKR(openingBalance)}</p>}</div>}
        <div><label className={labelClass} htmlFor={`payment-wht-${invoice?.id ?? "khata"}`}>Withholding tax deducted (PKR)</label><Input id={`payment-wht-${invoice?.id ?? "khata"}`} name="withholdingTaxAmount" type="number" min="0" max={grossAmount || undefined} step="0.01" value={withholdingTax} onChange={(event) => setWithholdingTax(event.target.value)} aria-invalid={invalidWithholding} /></div>
        <div><label className={labelClass} htmlFor={`payment-date-${invoice?.id ?? "khata"}`}>Payment date</label><Input id={`payment-date-${invoice?.id ?? "khata"}`} name="paymentDate" type="date" defaultValue={localDate} required /></div>
      </div>
      <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-3 text-sm"><div className="flex justify-between"><span className="text-neutral-500">Gross balance cleared</span><span className="font-medium tabular-nums">{formatPKR(grossAmount)}</span></div><div className="mt-1 flex justify-between"><span className="text-neutral-500">Less withholding tax</span><span className="tabular-nums">{formatPKR(withholdingAmount)}</span></div><div className="mt-2 flex justify-between border-t border-neutral-200 pt-2"><span className="font-medium">Net cash/bank received</span><span className="font-semibold tabular-nums">{formatPKR(netReceived)}</span></div></div>
      {invalidWithholding && <p role="alert" className="text-sm text-red-600">Withholding tax cannot exceed the gross amount being settled.</p>}
      <div><label className={labelClass} htmlFor={`payment-cash-bank-${invoice?.id ?? "khata"}`}>Receive into</label><select id={`payment-cash-bank-${invoice?.id ?? "khata"}`} name="cashBankAccountId" required className={fieldClass}><option value="">Select cash/bank</option>{cashBankAccounts.map((account) => <option key={account.cashBankAccountId} value={account.cashBankAccountId}>{account.name}{account.isBank && account.bankName ? ` · ${account.bankName}` : ""} · {formatPKR(account.currentBalance)}</option>)}</select>{cashBankAccounts.length === 0 && <p className="mt-1.5 text-xs text-red-600">Create a cash/bank account before recording receipts.</p>}</div>
      <div><label className={labelClass} htmlFor={`payment-method-${invoice?.id ?? "khata"}`}>Method</label><select id={`payment-method-${invoice?.id ?? "khata"}`} name="method" defaultValue="CASH" className={fieldClass}><option value="CASH">Cash</option><option value="BANK_TRANSFER">Bank transfer</option><option value="JAZZCASH">JazzCash</option><option value="EASYPAISA">Easypaisa</option><option value="CHEQUE">Cheque</option><option value="OTHER">Other</option></select></div>
      <div><label className={labelClass} htmlFor={`payment-reference-${invoice?.id ?? "khata"}`}>Reference <span className="font-normal text-neutral-400">(optional)</span></label><Input id={`payment-reference-${invoice?.id ?? "khata"}`} name="reference" maxLength={120} placeholder="Cheque or transaction number" /></div>
      <div><label className={labelClass} htmlFor={`payment-notes-${invoice?.id ?? "khata"}`}>Notes <span className="font-normal text-neutral-400">(optional)</span></label><textarea id={`payment-notes-${invoice?.id ?? "khata"}`} name="notes" maxLength={500} rows={3} className="w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-neutral-200" placeholder="Collection notes" /></div>
      {state.error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{state.error}</p>}
      {state.success && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">{state.success}</p>}
      <Button type="submit" disabled={disabled} className="w-full">{pending ? "Recording..." : "Record payment"}</Button>
    </form>
  );
}
