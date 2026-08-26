"use client";

import { useState } from "react";
import { CheckCircle2, SlidersHorizontal, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function StockAdjustment({ initialStock, unit }: { initialStock: number; unit: string }) {
  const [stock, setStock] = useState(initialStock);
  const [open, setOpen] = useState(false);
  const [quantity, setQuantity] = useState(1);
  const [direction, setDirection] = useState<"ADD" | "REMOVE">("ADD");
  const [reviewing, setReviewing] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const change = direction === "ADD" ? quantity : -quantity;
  const nextStock = stock + change;
  const valid = Number.isInteger(quantity) && quantity > 0 && nextStock >= 0;

  function close() {
    setOpen(false); setReviewing(false); setConfirmed(false); setQuantity(1); setDirection("ADD");
  }

  function apply() {
    if (!valid) return;
    setStock(nextStock);
    setReviewing(false);
    setConfirmed(true);
  }

  if (!open) return <Button onClick={() => setOpen(true)}><SlidersHorizontal />Adjust stock</Button>;

  return (
    <div className="w-full rounded-xl border bg-white p-4 shadow-sm sm:w-[360px]" role="region" aria-label="Stock adjustment">
      <div className="flex items-start justify-between gap-3"><div><p className="font-semibold">Adjust stock</p><p className="text-xs text-neutral-500">Current local balance: {stock} {unit}</p></div><Button variant="ghost" size="icon-xs" onClick={close} aria-label="Close adjustment"><X /></Button></div>
      {confirmed ? (
        <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800" role="status"><div className="flex items-center gap-2 font-medium"><CheckCircle2 className="h-4 w-4" />Adjusted to {stock} {unit}</div><p className="mt-1 text-xs">This change is local to this page and was not saved.</p><Button variant="outline" size="sm" className="mt-3 bg-white" onClick={() => setConfirmed(false)}>Make another</Button></div>
      ) : reviewing ? (
        <div className="mt-4 space-y-3"><div className="rounded-lg bg-neutral-50 p-3 text-sm"><p className="text-neutral-500">Please confirm the adjustment</p><p className="mt-1 font-semibold">{stock} {change >= 0 ? "+" : "-"} {quantity} = {nextStock} {unit}</p></div><div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setReviewing(false)}>Back</Button><Button onClick={apply}>Confirm adjustment</Button></div></div>
      ) : (
        <div className="mt-4 space-y-3">
          <div className="grid grid-cols-2 gap-2"><Button type="button" variant={direction === "ADD" ? "default" : "outline"} onClick={() => setDirection("ADD")}>Add stock</Button><Button type="button" variant={direction === "REMOVE" ? "default" : "outline"} onClick={() => setDirection("REMOVE")}>Remove stock</Button></div>
          <div><label htmlFor="adjustment-quantity" className="text-xs font-medium text-neutral-600">Quantity</label><Input id="adjustment-quantity" className="mt-1" type="number" min="1" step="1" value={quantity} onChange={(event) => setQuantity(Number(event.target.value))} aria-invalid={!valid} />{!valid && <p className="mt-1 text-xs text-red-600">Enter a whole quantity that does not make stock negative.</p>}</div>
          <Button className="w-full" disabled={!valid} onClick={() => setReviewing(true)}>Review adjustment</Button>
        </div>
      )}
    </div>
  );
}
