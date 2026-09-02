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
  }>;
};

type SupplierReturnFormProps = {
  purchaseOrderId: string;
  items: Array<{ id: string; productName: string; receivedQuantity: number; unit: string }>;
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
      })) ?? []
    : items.filter((item) => item.receivedQuantity > 0);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setMessage("");
    const form = new FormData(event.currentTarget);
    const returnItems = displayItems
      .map((item) => ({ itemId: item.id, quantity: quantities[item.id] ?? 0 }))
      .filter((item) => item.quantity > 0);
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
      <h3 className="font-semibold">Supplier return</h3>
      {grns && grns.length > 0 && (
        <label className="block text-sm">
          <span className="text-neutral-500">Link to GRN (optional)</span>
          <select
            className="mt-1 h-9 w-full border px-3 text-sm"
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
        return (
          <label key={item.id} className="grid grid-cols-[1fr_100px] items-center gap-3 text-sm">
            <span>{item.productName} <span className="text-neutral-500">accepted {item.receivedQuantity} {unitLabel}</span></span>
            <input
              type="number"
              min="0"
              step="0.01"
              max={item.receivedQuantity}
              value={quantities[item.id] ?? ""}
              onChange={(event) => setQuantities((current) => ({ ...current, [item.id]: Number(event.target.value) }))}
              className="h-8 border px-2 text-right"
            />
          </label>
        );
      })}
      <input name="reason" required maxLength={300} placeholder="Return reason" className="h-9 w-full border px-3 text-sm" />
      <textarea name="notes" maxLength={1000} rows={2} placeholder="Notes" className="w-full border px-3 py-2 text-sm" />
      {message && <p className="text-sm text-neutral-700">{message}</p>}
      <Button type="submit" disabled={busy}>{busy ? "Recording..." : "Record supplier return"}</Button>
    </form>
  );
}
