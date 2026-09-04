"use client";

import { FormEvent, useState } from "react";
import { Pencil } from "lucide-react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";

export function EditPurchaseSheet({ purchase }: { purchase: { id: string; orderNumber: string; notes: string; expectedDeliveryDate: string | null } }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch(`/api/v1/purchases/${purchase.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes: form.get("notes"), expectedDeliveryDate: form.get("expectedDeliveryDate") || null }),
      });
      const body = await response.json();
      if (!response.ok) {
        setMessage(body.error?.message ?? "Purchase could not be updated.");
        return;
      }
      setOpen(false);
      router.refresh();
    } catch {
      setMessage("Network error. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger render={<Button type="button" variant="outline" size="sm"><Pencil className="h-3.5 w-3.5" /> Edit</Button>} />
      <SheetContent side="right" className="w-full max-w-lg sm:max-w-lg">
        <SheetHeader><SheetTitle>Edit {purchase.orderNumber}</SheetTitle></SheetHeader>
        <form onSubmit={submit} className="space-y-5 px-4 pb-4">
          <div><label className="text-sm font-medium" htmlFor="purchase-delivery-date">Expected delivery</label><Input id="purchase-delivery-date" name="expectedDeliveryDate" type="date" defaultValue={purchase.expectedDeliveryDate?.slice(0, 10) ?? ""} className="mt-1" /></div>
          <div><label className="text-sm font-medium" htmlFor="purchase-notes">Notes</label><textarea id="purchase-notes" name="notes" defaultValue={purchase.notes} rows={5} maxLength={1000} className="mt-1 w-full border bg-white px-3 py-2 text-sm" /></div>
          {message && <p className="text-sm text-red-700">{message}</p>}
          <Button type="submit" disabled={busy}>{busy ? "Saving..." : "Save changes"}</Button>
        </form>
      </SheetContent>
    </Sheet>
  );
}
