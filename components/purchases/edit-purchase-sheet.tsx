"use client";

import { FormEvent, useState } from "react";
import { Pencil } from "lucide-react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";

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
      <SheetContent side="right" className="w-full sm:max-w-md">
        <SheetHeader className="border-b"><SheetTitle>Edit {purchase.orderNumber}</SheetTitle><SheetDescription>Update document notes and expected delivery. Supplier and line values remain unchanged.</SheetDescription></SheetHeader>
        <form onSubmit={submit} className="flex flex-1 flex-col">
          <div className="space-y-4 px-4"><div><label className="text-xs font-medium text-slate-700" htmlFor="purchase-delivery-date">Expected delivery</label><Input id="purchase-delivery-date" name="expectedDeliveryDate" type="date" defaultValue={purchase.expectedDeliveryDate?.slice(0, 10) ?? ""} className="mt-1" /></div><div><label className="text-xs font-medium text-slate-700" htmlFor="purchase-notes">Notes</label><textarea id="purchase-notes" name="notes" defaultValue={purchase.notes} rows={6} maxLength={1000} className="mt-1 w-full rounded-md border bg-white px-2.5 py-2 text-xs outline-none focus:border-primary focus:ring-2 focus:ring-primary/15" /></div>{message && <p role="alert" className="rounded-md border border-red-200 bg-red-50 p-3 text-xs text-red-700">{message}</p>}</div>
          <SheetFooter className="border-t"><Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={busy}>Cancel</Button><Button type="submit" disabled={busy}>{busy ? "Saving..." : "Save Changes"}</Button></SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
