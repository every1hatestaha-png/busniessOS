"use client";

import { useState } from "react";
import { AlertTriangle, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";

export function DeleteSupplierButton({ supplierId, supplierName }: { supplierId: string; supplierName: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [open, setOpen] = useState(false);

  async function remove() {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(`/api/v1/suppliers/${supplierId}`, { method: "DELETE" });
      if (!response.ok) {
        const body = await response.json();
        setMessage(body.error?.message ?? "Supplier could not be deleted.");
        return;
      }
      router.push("/suppliers");
      router.refresh();
    } catch {
      setMessage("Network error. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return <Sheet open={open} onOpenChange={setOpen}><SheetTrigger render={<Button type="button" variant="outline" size="sm" />}><Trash2 className="h-3.5 w-3.5" />Delete</SheetTrigger><SheetContent side="right" className="w-full sm:max-w-md"><SheetHeader className="border-b"><SheetTitle>Delete {supplierName}?</SheetTitle><SheetDescription>Suppliers do not have an archive lifecycle.</SheetDescription></SheetHeader><div className="px-4"><div className="flex gap-3 rounded-md border border-red-200 bg-red-50 p-3 text-red-900"><AlertTriangle className="mt-0.5 size-4 shrink-0" /><p className="text-xs leading-relaxed">Permanent deletion succeeds only when the supplier has zero balance and no purchase, payment, or ledger history.</p></div>{message && <p role="alert" className="mt-3 rounded-md border border-red-200 bg-red-50 p-3 text-xs text-red-700">{message}</p>}</div><SheetFooter className="border-t"><Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={busy}>Keep supplier</Button><Button type="button" variant="destructive" onClick={remove} disabled={busy}>{busy ? "Deleting..." : "Delete supplier"}</Button></SheetFooter></SheetContent></Sheet>;
}
