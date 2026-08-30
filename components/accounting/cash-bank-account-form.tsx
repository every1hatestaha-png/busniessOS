"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const fieldClass = "h-9 rounded-md border border-neutral-200 bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-neutral-200";

export function CashBankAccountForm() {
  const router = useRouter();
  const [isBank, setIsBank] = useState(false);
  const [message, setMessage] = useState("");

  return (
    <form
      className="rounded-xl border border-neutral-200 bg-white p-5"
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
      <div className="mb-4"><h2 className="font-semibold">Add cash/bank account</h2><p className="mt-1 text-sm text-neutral-500">Use these accounts for receipts, supplier vouchers, and expense payments.</p></div>
      <div className="grid gap-3 lg:grid-cols-2">
        <Input name="name" required maxLength={120} placeholder="Account name" />
        <Input name="openingBalance" type="number" min="0" step="0.01" defaultValue="0" required placeholder="Opening balance" />
        <label className="flex h-9 items-center gap-2 rounded-md border border-neutral-200 px-3 text-sm"><input type="checkbox" checked={isBank} onChange={(event) => setIsBank(event.target.checked)} />Bank account</label>
        <Input name="bankName" disabled={!isBank} placeholder="Bank name" />
        <Input name="accountTitle" placeholder="Account title" />
        <Input name="accountNumber" placeholder="Account number / IBAN" />
      </div>
      <textarea name="notes" rows={2} className={`${fieldClass} mt-3 h-auto w-full py-2`} placeholder="Internal notes" />
      {message && <p className="mt-3 text-sm text-neutral-700">{message}</p>}
      <Button type="submit" className="mt-3">Create account</Button>
    </form>
  );
}
