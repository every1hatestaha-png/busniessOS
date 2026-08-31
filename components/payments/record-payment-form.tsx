"use client";

import { useActionState, useEffect, useRef, useState } from "react";

import { recordPaymentAction, type RecordPaymentState } from "@/app/(dashboard)/invoices/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatPKR } from "@/lib/utils";

type CustomerOption = { id: string; name: string; balance: number };
type FixedInvoice = { id: string; number: string; customerId: string; customerName: string; balance: number };
type CashBankOption = { cashBankAccountId: string; name: string; currentBalance: number; isBank: boolean; bankName?: string | null };

const initialState: RecordPaymentState = {};
const labelClass = "mb-1.5 block text-sm font-medium text-neutral-700";
const fieldClass = "h-8 w-full rounded-lg border border-neutral-200 bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-neutral-200";

export function RecordPaymentForm({ customers = [], invoice, cashBankAccounts = [] }: { customers?: CustomerOption[]; invoice?: FixedInvoice; cashBankAccounts?: CashBankOption[] }) {
  const [state, action, pending] = useActionState(recordPaymentAction, initialState);
  const formRef = useRef<HTMLFormElement>(null);
  const [customerId, setCustomerId] = useState(invoice?.customerId ?? "");
  const idempotencyKeyRef = useRef(crypto.randomUUID());
  const selectedCustomer = customers.find((customer) => customer.id === customerId);
  const maximum = invoice?.balance ?? selectedCustomer?.balance;

  useEffect(() => {
    if (state.successToken) {
      formRef.current?.reset();
      idempotencyKeyRef.current = crypto.randomUUID();
      const hidden = formRef.current?.elements.namedItem("idempotencyKey") as HTMLInputElement | null;
      if (hidden) hidden.value = idempotencyKeyRef.current;
    }
  }, [state.successToken]);

  const today = new Date();
  const localDate = new Date(today.getTime() - today.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
  const disabled = pending || (!invoice && customers.length === 0) || cashBankAccounts.length === 0;

  return (
    <form ref={formRef} action={action} className="space-y-4">
      <input type="hidden" name="idempotencyKey" ref={(el) => { if (el) el.value = idempotencyKeyRef.current; }} />
      {invoice ? (
        <div className="rounded-lg bg-neutral-50 p-3"><p className="text-xs font-medium uppercase tracking-wide text-neutral-500">Applying to</p><p className="mt-1 font-semibold">{invoice.number}</p><p className="text-sm text-neutral-500">{invoice.customerName} · {formatPKR(invoice.balance)} due</p><input type="hidden" name="customerId" value={invoice.customerId} /><input type="hidden" name="invoiceId" value={invoice.id} /></div>
      ) : (
        <div><label className={labelClass} htmlFor="payment-customer">Customer</label><select id="payment-customer" name="customerId" required value={customerId} onChange={(event) => setCustomerId(event.target.value)} className={fieldClass}><option value="">Select an account</option>{customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name} · {formatPKR(customer.balance)}</option>)}</select>{customers.length === 0 && <p className="mt-1.5 text-xs text-neutral-500">There are no customer balances available to collect.</p>}</div>
      )}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
        <div><label className={labelClass} htmlFor={`payment-amount-${invoice?.id ?? "khata"}`}>Amount (PKR)</label><Input id={`payment-amount-${invoice?.id ?? "khata"}`} name="amount" type="number" min="0.01" max={maximum} step="0.01" required placeholder="0.00" /></div>
        <div><label className={labelClass} htmlFor={`payment-date-${invoice?.id ?? "khata"}`}>Payment date</label><Input id={`payment-date-${invoice?.id ?? "khata"}`} name="paymentDate" type="date" defaultValue={localDate} required /></div>
      </div>
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
