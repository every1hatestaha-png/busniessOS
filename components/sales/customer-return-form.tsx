"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export function CustomerReturnForm({ salesOrderId, items }: { salesOrderId: string; items: Array<{ id: string; productName: string; quantity: number }> }) {
  const router = useRouter();
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [key] = useState(() => crypto.randomUUID());
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (busy) return; setBusy(true); setMessage("");
    const form = new FormData(event.currentTarget);
    const returnItems = items.map((item) => ({ itemId: item.id, quantity: quantities[item.id] ?? 0 })).filter((item) => item.quantity > 0);
    if (!returnItems.length) { setMessage("Enter at least one return quantity."); setBusy(false); return; }
    try {
      const response = await fetch("/api/v1/customer-returns", { method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": key }, body: JSON.stringify({ salesOrderId, items: returnItems, restock: form.get("restock") === "on", reason: form.get("reason"), notes: form.get("notes") }) });
      const body = await response.json(); if (!response.ok) { setMessage(body.error?.message ?? "Return could not be recorded."); setBusy(false); return; }
      setMessage("Customer return and credit note recorded."); router.refresh();
    } catch { setMessage("The result is unknown because the network failed. Retry to safely reuse the same return key."); setBusy(false); }
  }
  const success = message === "Customer return and credit note recorded.";
  const uncertain = message.startsWith("The result is unknown");
  return <form onSubmit={submit} className="space-y-3"><div><h3 className="text-sm font-semibold">Customer Return</h3><p className="mt-0.5 text-[11px] text-slate-500">Record returned quantities and issue the corresponding credit note.</p></div><div className="overflow-hidden rounded-md border">{items.map((item) => <label key={item.id} className="grid min-h-10 grid-cols-[1fr_100px] items-center gap-3 border-b px-3 py-1.5 text-xs last:border-0"><span className="font-medium">{item.productName} <span className="font-normal text-slate-500">· sold {item.quantity}</span></span><input type="number" min="0" max={item.quantity} step="1" value={quantities[item.id] ?? ""} onChange={(event) => setQuantities((current) => ({ ...current, [item.id]: Number(event.target.value) }))} className="h-8 rounded-md border px-2 text-right outline-none focus:border-primary focus:ring-2 focus:ring-primary/15" /></label>)}</div><input name="reason" required maxLength={300} placeholder="Return reason" className="h-8 w-full rounded-md border px-2.5 text-xs outline-none focus:border-primary focus:ring-2 focus:ring-primary/15" /><textarea name="notes" maxLength={1000} rows={2} placeholder="Notes" className="w-full rounded-md border px-2.5 py-2 text-xs outline-none focus:border-primary focus:ring-2 focus:ring-primary/15" /><label className="flex items-center gap-2 text-xs text-slate-700"><input name="restock" type="checkbox" defaultChecked /> Return accepted goods to stock</label>{message && <p role={success ? "status" : "alert"} className={`rounded-md border px-3 py-2 text-xs ${success ? "border-green-200 bg-green-50 text-green-700" : uncertain ? "border-amber-200 bg-amber-50 text-amber-700" : "border-red-200 bg-red-50 text-red-700"}`}>{message}</p>}<Button type="submit" size="sm" disabled={busy}>{busy ? "Recording..." : "Record Customer Return"}</Button></form>;
}
