"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

type GRNInfo = {
  id: string;
  grnNumber: string;
  items: Array<{
    id: string;
    poItemId: string;
    productName: string;
    acceptedQuantity: number;
    returnedQuantity: number;
    unitCost: number;
    unit: string;
    acceptedWeightKg: number | null;
    ratePerKg: number | null;
  }>;
};

type SupplierReturnFormProps = {
  purchaseOrderId: string;
  items: Array<{ id: string; productName: string; receivedQuantity: number; unit: string; perKgRate: number | null; unitWeight: number | null }>;
  grns?: GRNInfo[];
};

export function SupplierReturnForm({ purchaseOrderId, items, grns }: SupplierReturnFormProps) {
  const router = useRouter();
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [selectedGrnId, setSelectedGrnId] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [key] = useState(() => crypto.randomUUID());

  const displayItems = selectedGrnId && grns
    ? grns.find((g) => g.id === selectedGrnId)?.items.map((gi) => ({
        id: gi.poItemId,
        productName: gi.productName,
        receivedQuantity: gi.acceptedQuantity - gi.returnedQuantity,
        unit: items.find((i) => i.id === gi.poItemId)?.unit ?? "PIECE",
        perKgRate: gi.ratePerKg,
        acceptedWeightKg: gi.acceptedWeightKg,
      })) ?? []
    : items.filter((item) => item.receivedQuantity > 0).map((item) => ({
        ...item,
        perKgRate: item.perKgRate,
        acceptedWeightKg: null,
      }));

  function getReturnedWeightKg(itemId: string, quantity: number): number | null {
    const item = displayItems.find((i) => i.id === itemId);
    if (!item?.perKgRate || !item.acceptedWeightKg) return null;
    const totalAcceptedQty = displayItems.reduce((sum, i) => sum + i.receivedQuantity, 0);
    if (totalAcceptedQty <= 0) return null;
    return (quantity / totalAcceptedQty) * item.acceptedWeightKg;
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setMessage("");
    const form = new FormData(event.currentTarget);
    const returnItems = displayItems
      .map((item) => {
        const qty = quantities[item.id] ?? 0;
        if (qty <= 0) return null;
        const payload: { itemId: string; quantity: number; returnedWeightKg?: number } = { itemId: item.id, quantity: qty };
        const wg = getReturnedWeightKg(item.id, qty);
        if (wg != null) payload.returnedWeightKg = wg;
        return payload;
      })
      .filter((item): item is NonNullable<typeof item> => item !== null);
    if (!returnItems.length) {
      setMessage("Enter at least one return quantity.");
      setBusy(false);
      return;
    }
    try {
      const payload: Record<string, unknown> = {
        purchaseOrderId,
        items: returnItems,
        reason: form.get("reason"),
        notes: form.get("notes"),
      };
      if (selectedGrnId) payload.goodReceivedNoteId = selectedGrnId;
      const response = await fetch("/api/v1/supplier-returns", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": key },
        body: JSON.stringify(payload),
      });
      const body = await response.json();
      if (!response.ok) {
        setMessage(body.error?.message ?? "Return could not be recorded.");
        setBusy(false);
        return;
      }
      setMessage("Supplier return and debit note recorded.");
      router.refresh();
    } catch {
      setMessage("The result is unknown because the network failed. Retry to safely reuse the same return key.");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <div><h3 className="text-sm font-semibold">Supplier Return</h3><p className="mt-0.5 text-[11px] text-slate-500">Return accepted goods and record a supplier debit note.</p></div>
      {grns && grns.length > 0 && (
        <label className="block text-xs">
          <span className="font-medium text-slate-700">Link to GRN <span className="font-normal text-slate-400">(optional)</span></span>
          <select
            className="mt-1 h-8 w-full rounded-md border px-2.5 text-xs outline-none focus:border-primary focus:ring-2 focus:ring-primary/15"
            value={selectedGrnId}
            onChange={(e) => { setSelectedGrnId(e.target.value); setQuantities({}); }}
          >
            <option value="">All received items</option>
            {grns.map((grn) => (
              <option key={grn.id} value={grn.id}>{grn.grnNumber}</option>
            ))}
          </select>
        </label>
      )}
      {displayItems.map((item) => {
        const unitLabel = item.unit === "KG" ? "kg" : item.unit.toLowerCase();
        const qty = quantities[item.id] ?? 0;
        const wg = getReturnedWeightKg(item.id, qty);
        return (
          <label key={item.id} className="grid min-h-10 grid-cols-[1fr_100px] items-center gap-3 rounded-md border px-3 py-1.5 text-xs">
            <span className="font-medium">{item.productName} <span className="font-normal text-slate-500">· accepted {item.receivedQuantity} {unitLabel}{item.perKgRate ? ` · ${item.perKgRate}/kg` : ""}{wg != null ? ` · ${wg.toFixed(1)} kg` : ""}</span></span>
            <input
              type="number"
              min="0"
              step="0.01"
              max={item.receivedQuantity}
              value={quantities[item.id] ?? ""}
              onChange={(event) => setQuantities((current) => ({ ...current, [item.id]: Number(event.target.value) }))}
              className="h-8 rounded-md border px-2 text-right outline-none focus:border-primary focus:ring-2 focus:ring-primary/15"
            />
          </label>
        );
      })}
      <input name="reason" required maxLength={300} placeholder="Return reason" className="h-8 w-full rounded-md border px-2.5 text-xs outline-none focus:border-primary focus:ring-2 focus:ring-primary/15" />
      <textarea name="notes" maxLength={1000} rows={2} placeholder="Notes" className="w-full rounded-md border px-2.5 py-2 text-xs outline-none focus:border-primary focus:ring-2 focus:ring-primary/15" />
      {message && <p className="text-xs text-slate-700">{message}</p>}
      <Button type="submit" size="sm" disabled={busy}>{busy ? "Recording..." : "Record Supplier Return"}</Button>
    </form>
  );
}
