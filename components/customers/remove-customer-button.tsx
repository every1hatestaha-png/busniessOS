"use client";

import { useState } from "react";
import { AlertTriangle, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";

export function RemoveCustomerButton({ customerId, customerName }: { customerId: string; customerName: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [open, setOpen] = useState(false);

  async function remove() {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(`/api/v1/customers/${customerId}`, { method: "DELETE" });
      const body = await response.json();
      if (!response.ok) {
        setMessage(body.error?.message ?? "Customer could not be deleted or deactivated.");
        return;
      }
      if (body.data.disposition === "DELETED") router.push("/customers");
      else setMessage(body.data.message);
      router.refresh();
    } catch {
      setMessage("Network error. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return <Sheet open={open} onOpenChange={setOpen}><SheetTrigger render={<Button type="button" variant="outline" size="sm" />}><Trash2 className="h-3.5 w-3.5" />Remove</SheetTrigger><SheetContent side="right" className="w-full sm:max-w-md"><SheetHeader className="border-b"><SheetTitle>Remove {customerName}?</SheetTitle><SheetDescription>The account history determines whether removal is permanent.</SheetDescription></SheetHeader><div className="px-4"><div className="flex gap-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-amber-900"><AlertTriangle className="mt-0.5 size-4 shrink-0" /><p className="text-xs leading-relaxed">An unused customer with zero balance is deleted. A customer with a balance or transaction history is deactivated so financial records remain intact.</p></div>{message && <p role="alert" className={`mt-3 rounded-md border p-3 text-xs ${message.includes("deactivated instead") ? "border-amber-200 bg-amber-50 text-amber-800" : "border-red-200 bg-red-50 text-red-700"}`}>{message}</p>}</div><SheetFooter className="border-t"><Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={busy}>Keep customer</Button><Button type="button" variant="destructive" onClick={remove} disabled={busy}>{busy ? "Checking..." : "Remove customer"}</Button></SheetFooter></SheetContent></Sheet>;
}
