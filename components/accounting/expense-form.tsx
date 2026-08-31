"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const fieldClass = "h-9 rounded-lg border border-neutral-200 bg-white px-3 text-sm";

export function ExpenseForm({ expenseAccounts, paymentAccounts }: { expenseAccounts: Array<{ id: string; code: string; name: string }>; paymentAccounts: Array<{ id: string; name: string }> }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID());
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Karachi", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setMessage("");
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/v1/accounting/expenses", { method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": idempotencyKey }, body: JSON.stringify({ expenseAccountId: form.get("expenseAccountId"), paymentAccountId: form.get("paymentAccountId"), amount: form.get("amount"), expenseDate: form.get("expenseDate"), payee: form.get("payee"), reference: form.get("reference"), notes: form.get("notes") }) });
      const body = await response.json();
      if (!response.ok) {
        setMessage(body.error?.message ?? "Expense could not be recorded.");
        setBusy(false);
        return;
      }
      event.currentTarget.reset();
      setIdempotencyKey(crypto.randomUUID());
      setMessage("Expense recorded.");
      setBusy(false);
      router.refresh();
    } catch {
      setMessage("The result is unknown because the network request failed. Retry to safely reuse the same expense key.");
      setBusy(false);
    }
  }

  return <form onSubmit={submit} className="space-y-3 border bg-white p-4">
    <h2 className="font-semibold">Record expense</h2>
    <div className="grid gap-3 md:grid-cols-2">
      <select name="expenseAccountId" required className={fieldClass}><option value="">Expense category</option>{expenseAccounts.map((account) => <option key={account.id} value={account.id}>{account.code} · {account.name}</option>)}</select>
      <select name="paymentAccountId" required className={fieldClass}><option value="">Pay from cash/bank</option>{paymentAccounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}</select>
      <Input name="amount" type="number" min="0.01" step="0.01" required placeholder="Amount" />
      <Input name="expenseDate" type="date" defaultValue={today} required />
      <Input name="payee" maxLength={160} placeholder="Payee" />
      <Input name="reference" maxLength={120} placeholder="Reference" />
      <textarea name="notes" maxLength={500} rows={3} className={`${fieldClass} h-auto py-2 md:col-span-2`} placeholder="Narration / notes" />
    </div>
    {message && <p className="text-sm text-neutral-700">{message}</p>}
    <Button type="submit" disabled={busy || !expenseAccounts.length || !paymentAccounts.length}>{busy ? "Recording..." : "Record expense"}</Button>
  </form>;
}
