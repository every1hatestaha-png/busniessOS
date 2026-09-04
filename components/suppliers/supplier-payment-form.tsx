"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatPKR } from "@/lib/utils";

type CashBankOption = { cashBankAccountId: string; name: string; currentBalance: number; isBank: boolean; bankName?: string | null };
type PurchaseOption = { id: string; orderNumber: string; orderDate: string; totalAmount: number; paidAmount: number; balanceAmount: number };

const fieldClass = "h-8 rounded-md border border-neutral-200 bg-white px-2 text-sm outline-none focus:ring-2 focus:ring-neutral-200";

export function SupplierPaymentForm({ supplierId, cashBankAccounts = [] }: { supplierId: string; cashBankAccounts?: CashBankOption[] }) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [wht, setWht] = useState("0");
  const [allocations, setAllocations] = useState<Record<string, number>>({});
  const [purchases, setPurchases] = useState<PurchaseOption[]>([]);
  const [loadingPurchases, setLoadingPurchases] = useState(true);
  const [busy, setBusy] = useState(false);
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Karachi", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());

  useEffect(() => {
    fetch(`/api/v1/suppliers/${supplierId}/purchases`)
      .then((r) => r.json())
      .then((body) => { if (body.data) setPurchases(body.data); })
      .catch(() => {})
      .finally(() => setLoadingPurchases(false));
  }, [supplierId]);

  const gross = Object.values(allocations).reduce((sum, v) => sum + v, 0);
  const net = Math.max(0, gross - Number(wht || 0));

  function setAlloc(purchaseId: string, value: string) {
    const num = Math.max(0, parseFloat(value) || 0);
    setAllocations((prev) => ({ ...prev, [purchaseId]: num }));
  }

  function allocateFull(purchase: PurchaseOption) {
    setAllocations((prev) => ({ ...prev, [purchase.id]: purchase.balanceAmount }));
  }

  return (
    <form
      className="rounded-xl border border-neutral-200 bg-white p-4"
      onSubmit={async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (busy) return;
        setBusy(true);
        setMessage("");
        const form = new FormData(event.currentTarget);
        const allocEntries = Object.entries(allocations)
          .filter(([, v]) => v > 0)
          .map(([purchaseOrderId, amount]) => ({ purchaseOrderId, amount }));
        try {
          const response = await fetch(`/api/v1/suppliers/${supplierId}/payments`, {
            method: "POST",
            headers: { "Content-Type": "application/json", "Idempotency-Key": idempotencyKey },
            body: JSON.stringify({
              amount: gross,
              withholdingTaxAmount: form.get("withholdingTaxAmount"),
              cashBankAccountId: form.get("cashBankAccountId"),
              allocations: allocEntries,
              method: form.get("method"),
              paymentDate: form.get("paymentDate"),
              reference: form.get("reference"),
              notes: form.get("notes"),
            }),
          });
          const body = await response.json();
          setMessage(response.ok ? "Voucher recorded." : body.error?.message ?? "Payment could not be recorded.");
          if (response.ok) {
            if (body.data?.id) router.push(`/accounting/payment-vouchers/${body.data.id}`);
            else router.refresh();
            return;
          }
        } catch {
          setMessage("The result is unknown because the network request failed. Retry to safely reuse the same voucher key.");
        }
        setBusy(false);
      }}
    >
      <div className="mb-4 flex items-start justify-between gap-4">
        <div><h2 className="font-semibold">Supplier payment voucher</h2><p className="mt-1 text-xs text-neutral-500">Allocate gross settlement against open purchase bills. WHT is deducted from the net cash/bank payment.</p></div>
        <div className="rounded-lg bg-neutral-950 px-3 py-2 text-right text-white"><p className="text-xs text-neutral-300">Net payment</p><p className="font-semibold tabular-nums">{formatPKR(net)}</p></div>
      </div>
      <div className="grid gap-3 lg:grid-cols-6">
        <div className="lg:col-span-1"><label className="mb-1 block text-xs font-medium text-neutral-500">Gross (auto)</label><input type="number" readOnly value={gross} className={`${fieldClass} w-full bg-neutral-50 tabular-nums`} /></div>
        <Input className="lg:col-span-1" min="0" step="0.01" type="number" name="withholdingTaxAmount" placeholder="WHT" value={wht} onChange={(event) => setWht(event.target.value)} />
        <select name="cashBankAccountId" required className={`${fieldClass} lg:col-span-2`}><option value="">Pay from cash/bank</option>{cashBankAccounts.map((account) => <option key={account.cashBankAccountId} value={account.cashBankAccountId}>{account.name}{account.isBank && account.bankName ? ` · ${account.bankName}` : ""} · {formatPKR(account.currentBalance)}</option>)}</select>
        <select name="method" className={fieldClass}><option value="CASH">Cash</option><option value="BANK_TRANSFER">Bank transfer</option><option value="CHEQUE">Cheque</option><option value="JAZZCASH">JazzCash</option><option value="EASYPAISA">Easypaisa</option><option value="OTHER">Other</option></select>
        <Input name="reference" placeholder="Reference" />
        <Input name="paymentDate" type="date" defaultValue={today} required />
      </div>

      <div className="mt-4">
        <h3 className="mb-2 text-sm font-semibold">Allocate against purchase bills</h3>
        {loadingPurchases ? (
          <p className="text-sm text-neutral-500">Loading open purchases...</p>
        ) : purchases.length === 0 ? (
          <p className="text-sm text-neutral-500">No outstanding purchase bills for this supplier.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs font-medium text-neutral-500">
                  <th className="pb-2 pr-2">Document</th>
                  <th className="pb-2 pr-2">Date</th>
                  <th className="pb-2 pr-2 text-right">Original</th>
                  <th className="pb-2 pr-2 text-right">Settled</th>
                  <th className="pb-2 pr-2 text-right">Outstanding</th>
                  <th className="pb-2 pr-2 text-right">Allocate Now</th>
                  <th className="pb-2 text-right">Remaining</th>
                </tr>
              </thead>
              <tbody>
                {purchases.map((purchase) => {
                  const allocated = allocations[purchase.id] || 0;
                  const remaining = Math.max(0, purchase.balanceAmount - allocated);
                  return (
                    <tr key={purchase.id} className="border-b border-neutral-100">
                      <td className="py-2 pr-2 font-mono text-xs">{purchase.orderNumber}</td>
                      <td className="py-2 pr-2">{new Date(purchase.orderDate).toLocaleDateString()}</td>
                      <td className="py-2 pr-2 text-right tabular-nums">{formatPKR(purchase.totalAmount)}</td>
                      <td className="py-2 pr-2 text-right tabular-nums">{formatPKR(purchase.paidAmount)}</td>
                      <td className="py-2 pr-2 text-right font-semibold tabular-nums">{formatPKR(purchase.balanceAmount)}</td>
                      <td className="py-2 pr-2 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <input type="number" min="0" max={purchase.balanceAmount} step="0.01" value={allocated || ""} onChange={(e) => setAlloc(purchase.id, e.target.value)} className="h-7 w-28 rounded border border-neutral-200 px-2 text-right text-xs tabular-nums outline-none focus:ring-2 focus:ring-neutral-200" placeholder="0" />
                          <Button type="button" variant="outline" size="sm" className="h-7 px-2 text-xs" onClick={() => allocateFull(purchase)}>Full</Button>
                        </div>
                      </td>
                      <td className={`py-2 text-right tabular-nums ${remaining === 0 ? "text-green-600" : "text-neutral-500"}`}>{formatPKR(remaining)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <textarea name="notes" rows={2} className="mt-3 w-full rounded-md border border-neutral-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-neutral-200" placeholder="Voucher notes" />
      {cashBankAccounts.length === 0 && <p className="mt-3 text-sm text-red-600">Create a cash/bank account before recording supplier vouchers.</p>}
      {gross === 0 && purchases.length > 0 && <p className="mt-3 text-sm text-amber-600">Allocate at least one purchase bill before recording.</p>}
       {message && <p role={message === "Voucher recorded." ? "status" : "alert"} className="mt-3 text-sm text-neutral-700">{message}</p>}
       <Button type="submit" size="sm" disabled={busy || cashBankAccounts.length === 0 || gross === 0} className="mt-3">{busy ? "Recording..." : "Record voucher"}</Button>
    </form>
  );
}
