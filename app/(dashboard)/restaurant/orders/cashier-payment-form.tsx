"use client";

import { useMemo, useState } from "react";

import { RestaurantMutationForm } from "@/app/(dashboard)/restaurant/mutation-form";
import { recordRestaurantPaymentAction } from "@/app/(dashboard)/restaurant/v1-actions";
import { Button } from "@/components/ui/button";

export type CashierSettlementAccount = {
  cashBankAccountId: string;
  name: string;
  isBank: boolean;
};
const paymentMethods = [
  { value: "CASH", label: "Cash" },
  { value: "CREDIT_CARD", label: "Card" },
  { value: "BANK_TRANSFER", label: "Bank transfer" },
  { value: "JAZZCASH", label: "JazzCash" },
  { value: "EASYPAISA", label: "Easypaisa" },
  { value: "MOBILE_WALLET", label: "Mobile wallet" },
  { value: "CHEQUE", label: "Cheque" },
  { value: "OTHER", label: "Other" },
] as const;

type PaymentMethod = (typeof paymentMethods)[number]["value"];

export function CashierPaymentForm({
  workspaceId,
  orderId,
  paymentRequestId,
  outstanding,
  accounts,
}: {
  workspaceId: string;
  orderId: string;
  paymentRequestId: string;
  outstanding: number;
  accounts: CashierSettlementAccount[];
}) {
  const [method, setMethod] = useState<PaymentMethod>(
    accounts.some(account => !account.isBank) ? "CASH" : "BANK_TRANSFER",
  );
  const eligibleAccounts = useMemo(
    () => accounts.filter(account => account.isBank === (method !== "CASH")),
    [accounts, method],
  );

  return (
    <RestaurantMutationForm
      action={recordRestaurantPaymentAction}
      workspaceId={workspaceId}
      className="grid gap-2 rounded-xl border border-slate-200 bg-white p-3 sm:grid-cols-2"
    >
      <input type="hidden" name="orderId" value={orderId} />
      <input type="hidden" name="paymentRequestId" value={paymentRequestId} />
      <label className="flex flex-col gap-1 text-xs font-semibold text-slate-700">
        Payment method
        <select name="method" value={method} onChange={event => setMethod(event.target.value as PaymentMethod)}
          className="min-h-11 rounded-lg border border-slate-200 bg-white px-2 text-sm font-normal">
          {paymentMethods.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-xs font-semibold text-slate-700">
        Settlement account
        <select key={method} name="cashBankAccountId" required
          defaultValue={eligibleAccounts[0]?.cashBankAccountId ?? ""}
          disabled={eligibleAccounts.length === 0}
          className="min-h-11 rounded-lg border border-slate-200 bg-white px-2 text-sm font-normal">
          {eligibleAccounts.length === 0 && <option value="">No compatible account</option>}
          {eligibleAccounts.map(account =>
            <option key={account.cashBankAccountId} value={account.cashBankAccountId}>{account.name}</option>)}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-xs font-semibold text-slate-700">
        Amount (PKR)
        <input name="amount" type="number" min="0.01" max={outstanding} step="0.01"
          defaultValue={outstanding} required
          className="min-h-11 rounded-lg border border-slate-200 bg-white px-2 text-sm font-normal" />
      </label>
      <label className="flex flex-col gap-1 text-xs font-semibold text-slate-700">
        Transaction reference (optional)
        <input name="reference" maxLength={120} placeholder="Receipt or bank reference"
          className="min-h-11 rounded-lg border border-slate-200 bg-white px-2 text-sm font-normal" />
      </label>
      {method === "CASH" && (
        <p className="text-xs text-slate-500 sm:col-span-2">Cash receipts require an open restaurant cash shift. The server verifies the shift at payment time.</p>
      )}
      {!eligibleAccounts.length && (
        <p role="alert" className="text-xs text-amber-800 sm:col-span-2">
          No {method === "CASH" ? "physical cash" : "bank or digital settlement"} account is configured. Ask a manager to add one.
        </p>
      )}
      <div className="flex justify-end sm:col-span-2">
        <Button size="sm" type="submit" disabled={!eligibleAccounts.length}
          className="min-h-10 rounded-lg bg-emerald-700 hover:bg-emerald-800">Record verified payment</Button>
      </div>
    </RestaurantMutationForm>
  );
}
