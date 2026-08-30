"use client";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatPKR } from "@/lib/utils";

type CashBankOption = { cashBankAccountId: string; name: string; currentBalance: number; isBank: boolean; bankName?: string | null };

const fieldClass = "h-8 border bg-white px-2 text-sm";

export function PurchaseForm({ suppliers, products, cashBankAccounts = [] }: { suppliers: Array<{ id: string; name: string }>; products: Array<{ id: string; name: string }>; cashBankAccounts?: CashBankOption[] }) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [paidAmount, setPaidAmount] = useState("");

  return (
    <form
      className="grid gap-3 border p-4 md:grid-cols-5"
      onSubmit={async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setBusy(true);
        const form = new FormData(event.currentTarget);
        const key = crypto.randomUUID();
        const response = await fetch("/api/v1/purchases", {
          method: "POST",
          headers: { "Content-Type": "application/json", "Idempotency-Key": key },
          body: JSON.stringify({
            supplierId: form.get("supplierId"),
            items: [{ productId: form.get("productId"), quantity: form.get("quantity"), unitCost: form.get("unitCost") }],
            paidAmount: form.get("paidAmount") || 0,
            cashBankAccountId: form.get("cashBankAccountId") || "",
            paymentMethod: "CASH",
          }),
        });
        const body = await response.json();
        if (response.ok && body.data?.id) {
          router.push(`/purchases/${body.data.id}`);
          router.refresh();
          return;
        }
        setMessage(body.error?.message ?? "Could not receive purchase.");
        setBusy(false);
      }}
    >
      <select required name="supplierId" className={fieldClass}><option value="">Supplier</option>{suppliers.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
      <select required name="productId" className={fieldClass}><option value="">Product</option>{products.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
      <Input required type="number" min="1" name="quantity" placeholder="Quantity" />
      <Input required type="number" min="0" step="0.01" name="unitCost" placeholder="Unit cost" />
      <Input type="number" min="0" step="0.01" name="paidAmount" placeholder="Paid now" value={paidAmount} onChange={(e) => setPaidAmount(e.target.value)} />
      {Number(paidAmount) > 0 && (
        <select name="cashBankAccountId" required className={fieldClass}>
          <option value="">Pay from...</option>
          {cashBankAccounts.map((account) => (
            <option key={account.cashBankAccountId} value={account.cashBankAccountId}>
              {account.name}{account.isBank && account.bankName ? ` · ${account.bankName}` : ""} · {formatPKR(account.currentBalance)}
            </option>
          ))}
        </select>
      )}
      <div className="flex items-center gap-3 md:col-span-5">
        <Button disabled={busy || !suppliers.length || !products.length} type="submit">{busy ? "Receiving..." : "Receive purchase"}</Button>
        {message && <p className="text-sm text-red-600">{message}</p>}
      </div>
    </form>
  );
}
