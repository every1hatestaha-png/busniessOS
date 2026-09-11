"use client";

import { FormEvent, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const fieldClass = "h-9 rounded-lg border border-neutral-200 bg-white px-3 text-sm";

export function ExpenseForm({ expenseAccounts, paymentAccounts }: { expenseAccounts: Array<{ id: string; code: string; name: string }>; paymentAccounts: Array<{ id: string; name: string }> }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [retryRequired, setRetryRequired] = useState(false);
  const submittedForm = useRef<FormData | null>(null);
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID());
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Karachi", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setMessage("");
    const formElement = event.currentTarget;
    const form = retryRequired && submittedForm.current ? submittedForm.current : new FormData(formElement);
    submittedForm.current = form;
    try {
      const response = await fetch("/api/v1/accounting/expenses", { method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": idempotencyKey }, body: JSON.stringify({ expenseAccountId: form.get("expenseAccountId"), paymentAccountId: form.get("paymentAccountId"), amount: form.get("amount"), expenseDate: form.get("expenseDate"), payee: form.get("payee"), reference: form.get("reference"), notes: form.get("notes") }) });
      const body = await response.json();
      if (!response.ok) {
        setRetryRequired(response.status >= 500);
        setMessage(response.status >= 500 ? "The result could not be confirmed. Your inputs are preserved and locked; retry the same expense." : body.error?.message ?? "Expense could not be recorded. Review your inputs and try again.");
        setBusy(false);
        return;
      }
      formElement.reset();
      setRetryRequired(false);
      setIdempotencyKey(crypto.randomUUID());
      setMessage("Expense recorded.");
      setBusy(false);
      router.refresh();
    } catch {
      setRetryRequired(true);
      setMessage("The result is unknown because the request or response failed. Your inputs are preserved and locked; retry the same expense with the same key.");
      setBusy(false);
    }
  }

  return <form onSubmit={submit} aria-busy={busy} className="space-y-3 border bg-white p-4">
    <h2 className="font-semibold">Record expense</h2>
    <fieldset disabled={busy || retryRequired} className="min-w-0">
      <div className="grid gap-3 md:grid-cols-2">
        <label className="grid gap-1 text-xs font-medium text-neutral-500">Expense category<select name="expenseAccountId" required className={fieldClass}><option value="">Select expense category</option>{expenseAccounts.map((account) => <option key={account.id} value={account.id}>{account.code} · {account.name}</option>)}</select></label>
        <label className="grid gap-1 text-xs font-medium text-neutral-500">Pay from cash/bank<select name="paymentAccountId" required className={fieldClass}><option value="">Select cash/bank account</option>{paymentAccounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}</select></label>
        <label className="grid gap-1 text-xs font-medium text-neutral-500">Amount (PKR)<Input name="amount" type="number" min="0.01" step="0.01" required /></label>
        <label className="grid gap-1 text-xs font-medium text-neutral-500">Expense date<Input name="expenseDate" type="date" defaultValue={today} required /></label>
        <label className="grid gap-1 text-xs font-medium text-neutral-500">Payee (optional)<Input name="payee" maxLength={160} /></label>
        <label className="grid gap-1 text-xs font-medium text-neutral-500">Reference (optional)<Input name="reference" maxLength={120} /></label>
        <label className="grid gap-1 text-xs font-medium text-neutral-500 md:col-span-2">Narration / notes (optional)<textarea name="notes" maxLength={500} rows={3} className={`${fieldClass} h-auto py-2`} /></label>
      </div>
    </fieldset>
    {!expenseAccounts.length && <p className="text-sm text-amber-700">An expense category is required before recording an expense.</p>}
    {!paymentAccounts.length && <p className="text-sm text-amber-700">A cash/bank account is required before recording an expense.</p>}
    {message && <p role={message === "Expense recorded." ? "status" : "alert"} className="text-sm text-neutral-700">{message}</p>}
    <Button type="submit" disabled={busy || !expenseAccounts.length || !paymentAccounts.length}>{busy ? "Recording..." : retryRequired ? "Retry expense" : "Record expense"}</Button>
  </form>;
}
