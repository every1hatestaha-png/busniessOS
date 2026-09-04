"use client";

import { useActionState, useState } from "react";
import { AlertCircle, CheckCircle2, SlidersHorizontal } from "lucide-react";
import { adjustStockAction } from "@/app/(dashboard)/inventory/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";

export function StockAdjustment({ productId, initialStock, unit }: { productId: string; initialStock: number; unit: string }) {
  const [actionState, formAction, isPending] = useActionState(adjustStockAction, {});
  const [open, setOpen] = useState(false);
  const [quantity, setQuantity] = useState(1);
  const [reason, setReason] = useState("");
  const [direction, setDirection] = useState<"ADD" | "REMOVE">("ADD");
  const [reviewing, setReviewing] = useState(false);
  const [dismissedToken, setDismissedToken] = useState<number>();
  const stock = actionState.stockQuantity ?? initialStock;
  const confirmed = actionState.successToken !== undefined && actionState.successToken !== dismissedToken;
  const change = direction === "ADD" ? quantity : -quantity;
  const nextStock = stock + change;
  const valid = Number.isInteger(quantity) && quantity > 0 && nextStock >= 0;
  const canReview = valid && reason.trim().length >= 3;

  function close() {
    setOpen(false); setReviewing(false); setQuantity(1); setReason(""); setDirection("ADD");
    setDismissedToken(actionState.successToken);
  }

  return (
    <Sheet open={open} onOpenChange={(nextOpen) => nextOpen ? setOpen(true) : close()}>
      <SheetTrigger render={<Button type="button" size="sm" />}><SlidersHorizontal />Adjust stock</SheetTrigger>
      <SheetContent side="right" className="w-full sm:max-w-md">
      <SheetHeader className="border-b"><SheetTitle>Adjust stock</SheetTitle><SheetDescription>Current balance: {stock} {unit}. Every adjustment creates a stock movement.</SheetDescription></SheetHeader>
      <div className="px-4">
      {confirmed ? (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800" role="status"><div className="flex items-center gap-2 font-medium"><CheckCircle2 className="h-4 w-4" />Adjusted to {stock} {unit}</div><p className="mt-1 text-xs">The stock movement has been saved.</p><Button variant="outline" size="sm" className="mt-3 bg-white" onClick={() => { setDismissedToken(actionState.successToken); setReviewing(false); }}>Make another</Button></div>
      ) : reviewing ? (
        <form action={formAction} className="space-y-3">
          <input type="hidden" name="productId" value={productId} />
          <input type="hidden" name="quantity" value={change} />
          <input type="hidden" name="reason" value={reason} />
          <div className="rounded-lg bg-neutral-50 p-3 text-sm"><p className="text-neutral-500">Please confirm the adjustment</p><p className="mt-1 font-semibold">{stock} {change >= 0 ? "+" : "-"} {quantity} = {nextStock} {unit}</p></div>
          {actionState.error && <p className="flex items-start gap-1.5 text-xs text-red-600" role="alert"><AlertCircle className="mt-px size-3.5 shrink-0" />{actionState.error}</p>}
           <SheetFooter className="-mx-4 mt-5 border-t"><Button type="button" variant="outline" onClick={() => setReviewing(false)}>Back</Button><Button type="submit" disabled={isPending}>{isPending ? "Saving..." : "Confirm adjustment"}</Button></SheetFooter>
        </form>
      ) : (
        <div className="mt-4 space-y-3">
          <div className="grid grid-cols-2 gap-2"><Button type="button" variant={direction === "ADD" ? "default" : "outline"} onClick={() => setDirection("ADD")}>Add stock</Button><Button type="button" variant={direction === "REMOVE" ? "default" : "outline"} onClick={() => setDirection("REMOVE")}>Remove stock</Button></div>
          <div><label htmlFor="adjustment-quantity" className="text-xs font-medium text-neutral-600">Quantity</label><Input id="adjustment-quantity" className="mt-1" type="number" min="1" step="1" value={quantity} onChange={(event) => setQuantity(Number(event.target.value))} aria-invalid={!valid} />{!valid && <p className="mt-1 text-xs text-red-600">Enter a whole quantity that does not make stock negative.</p>}</div>
          <div><label htmlFor="adjustment-reason" className="text-xs font-medium text-neutral-600">Reason</label><Input id="adjustment-reason" className="mt-1" minLength={3} maxLength={160} required value={reason} onChange={(event) => setReason(event.target.value)} placeholder="e.g. Cycle count correction" />{reason.length > 0 && reason.trim().length < 3 && <p className="mt-1 text-xs text-red-600">Enter at least 3 characters.</p>}</div>
           <Button className="w-full" disabled={!canReview} onClick={() => setReviewing(true)}>Review adjustment</Button>
         </div>
       )}
      </div>
      </SheetContent>
    </Sheet>
  );
}
