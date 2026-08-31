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
  return <form onSubmit={submit} className="space-y-3"><h3 className="font-semibold">Customer return</h3>{items.map((item) => <label key={item.id} className="grid grid-cols-[1fr_100px] items-center gap-3 text-sm"><span>{item.productName} <span className="text-neutral-500">sold {item.quantity}</span></span><input type="number" min="0" max={item.quantity} step="1" value={quantities[item.id] ?? ""} onChange={(event) => setQuantities((current) => ({ ...current, [item.id]: Number(event.target.value) }))} className="h-8 border px-2 text-right" /></label>)}<input name="reason" required maxLength={300} placeholder="Return reason" className="h-9 w-full border px-3 text-sm" /><textarea name="notes" maxLength={1000} rows={2} placeholder="Notes" className="w-full border px-3 py-2 text-sm" /><label className="flex items-center gap-2 text-sm"><input name="restock" type="checkbox" defaultChecked /> Return accepted goods to stock</label>{message && <p className="text-sm text-neutral-700">{message}</p>}<Button type="submit" disabled={busy}>{busy ? "Recording..." : "Record customer return"}</Button></form>;
}
