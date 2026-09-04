"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const fieldClass = "h-8 rounded-md border border-neutral-200 bg-white px-2.5 text-sm outline-none focus:ring-2 focus:ring-neutral-200";

export function CashBankAccountForm() {
  const router = useRouter();
  const [isBank, setIsBank] = useState(false);
  const [message, setMessage] = useState("");

  return (
    <form
      className="rounded-xl border border-neutral-200 bg-white p-4"
      onSubmit={async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        const response = await fetch("/api/v1/accounting/cash-bank", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: form.get("name"), openingBalance: form.get("openingBalance"), isBank, bankName: form.get("bankName"), accountTitle: form.get("accountTitle"), accountNumber: form.get("accountNumber"), notes: form.get("notes") }),
        });
        const body = await response.json();
        setMessage(response.ok ? "Cash/bank account created." : body.error?.message ?? "Account could not be created.");
        if (response.ok) {
          event.currentTarget.reset();
          setIsBank(false);
          router.refresh();
        }
      }}
    >
      <div className="mb-4"><h2 className="font-semibold">New payment account</h2><p className="mt-1 text-xs text-neutral-500">Available to receipts, supplier vouchers, and expenses after creation.</p></div>
      <div className="grid gap-3 lg:grid-cols-2">
        <label className="space-y-1 lg:col-span-2"><span className="text-xs font-medium text-neutral-600">Account name</span><Input name="name" required maxLength={120} placeholder="Main cash counter" /></label>
        <label className="space-y-1"><span className="text-xs font-medium text-neutral-600">Opening balance (PKR)</span><Input name="openingBalance" type="number" min="0" step="0.01" defaultValue="0" required /></label>
        <label className="mt-5 flex h-8 items-center gap-2 rounded-md border border-neutral-200 px-2.5 text-sm"><input type="checkbox" checked={isBank} onChange={(event) => setIsBank(event.target.checked)} />Bank account</label>
        <label className="space-y-1"><span className="text-xs font-medium text-neutral-600">Bank name</span><Input name="bankName" disabled={!isBank} placeholder="Bank name" /></label>
        <label className="space-y-1"><span className="text-xs font-medium text-neutral-600">Account title</span><Input name="accountTitle" placeholder="Account title" /></label>
        <label className="space-y-1 lg:col-span-2"><span className="text-xs font-medium text-neutral-600">Account number / IBAN</span><Input name="accountNumber" placeholder="Account number / IBAN" /></label>
      </div>
      <textarea name="notes" rows={2} className={`${fieldClass} mt-3 h-auto w-full py-2`} placeholder="Internal notes" />
      {message && <p role={message === "Cash/bank account created." ? "status" : "alert"} className="mt-3 text-sm text-neutral-700">{message}</p>}
      <Button type="submit" size="sm" className="mt-3 w-full">Create account</Button>
    </form>
  );
}
