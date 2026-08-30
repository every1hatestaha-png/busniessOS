"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatPKR } from "@/lib/utils";

type CashBankOption = { cashBankAccountId: string; name: string; currentBalance: number; isBank: boolean; bankName?: string | null };

const fieldClass = "h-8 rounded-md border border-neutral-200 bg-white px-2 text-sm outline-none focus:ring-2 focus:ring-neutral-200";

export function SupplierPaymentForm({ supplierId, cashBankAccounts = [] }: { supplierId: string; cashBankAccounts?: CashBankOption[] }) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [gross, setGross] = useState("");
  const [wht, setWht] = useState("0");
  const net = Math.max(0, Number(gross || 0) - Number(wht || 0));

  return (
    <form
      className="rounded-xl border border-neutral-200 bg-white p-4"
      onSubmit={async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        const response = await fetch(`/api/v1/suppliers/${supplierId}/payments`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ amount: form.get("amount"), withholdingTaxAmount: form.get("withholdingTaxAmount"), cashBankAccountId: form.get("cashBankAccountId"), method: form.get("method"), reference: form.get("reference"), notes: form.get("notes") }),
        });
        const body = await response.json();
        setMessage(response.ok ? "Voucher recorded." : body.error?.message ?? "Payment could not be recorded.");
        if (response.ok) {
          event.currentTarget.reset();
          setGross("");
          setWht("0");
          if (body.data?.id) router.push(`/accounting/payment-vouchers/${body.data.id}`);
          else router.refresh();
        }
      }}
    >
      <div className="mb-4 flex items-start justify-between gap-4">
        <div><h2 className="font-semibold">Bank payment voucher</h2><p className="mt-1 text-sm text-neutral-500">Gross payable settlement can include WHT; only net cash/bank is paid out.</p></div>
        <div className="rounded-lg bg-neutral-950 px-3 py-2 text-right text-white"><p className="text-xs text-neutral-300">Net payment</p><p className="font-semibold tabular-nums">{formatPKR(net)}</p></div>
      </div>
      <div className="grid gap-3 lg:grid-cols-6">
        <Input className="lg:col-span-1" required min="0.01" step="0.01" type="number" name="amount" placeholder="Gross amount" value={gross} onChange={(event) => setGross(event.target.value)} />
        <Input className="lg:col-span-1" min="0" step="0.01" type="number" name="withholdingTaxAmount" placeholder="WHT" value={wht} onChange={(event) => setWht(event.target.value)} />
        <select name="cashBankAccountId" required className={`${fieldClass} lg:col-span-2`}><option value="">Pay from cash/bank</option>{cashBankAccounts.map((account) => <option key={account.cashBankAccountId} value={account.cashBankAccountId}>{account.name}{account.isBank && account.bankName ? ` · ${account.bankName}` : ""} · {formatPKR(account.currentBalance)}</option>)}</select>
        <select name="method" className={fieldClass}><option value="CASH">Cash</option><option value="BANK_TRANSFER">Bank transfer</option><option value="CHEQUE">Cheque</option><option value="JAZZCASH">JazzCash</option><option value="EASYPAISA">Easypaisa</option><option value="OTHER">Other</option></select>
        <Input name="reference" placeholder="Reference" />
      </div>
      <textarea name="notes" rows={2} className="mt-3 w-full rounded-md border border-neutral-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-neutral-200" placeholder="Voucher notes" />
      {cashBankAccounts.length === 0 && <p className="mt-3 text-sm text-red-600">Create a cash/bank account before recording supplier vouchers.</p>}
      {message && <p className="mt-3 text-sm text-neutral-700">{message}</p>}
      <Button type="submit" disabled={cashBankAccounts.length === 0} className="mt-3">Record voucher</Button>
    </form>
  );
}
