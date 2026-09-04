"use client";

import { useState } from "react";
import { AlertTriangle, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";

export function RemoveProductButton({ productId, productName }: { productId: string; productName: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [open, setOpen] = useState(false);

  async function remove() {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(`/api/v1/products/${productId}`, { method: "DELETE" });
      const body = await response.json();
      if (!response.ok) {
        setMessage(body.error?.message ?? "Product could not be deleted or archived.");
        return;
      }
      if (body.data.disposition === "DELETED") {
        router.push("/inventory");
      } else {
        setMessage(body.data.message);
      }
      router.refresh();
    } catch {
      setMessage("Network error. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return <Sheet open={open} onOpenChange={setOpen}><SheetTrigger render={<Button type="button" variant="outline" size="sm" />}><Trash2 className="h-3.5 w-3.5" />Remove</SheetTrigger><SheetContent side="right" className="w-full sm:max-w-md"><SheetHeader className="border-b"><SheetTitle>Remove {productName}?</SheetTitle><SheetDescription>The result depends on the product stock and transaction history.</SheetDescription></SheetHeader><div className="px-4"><div className="flex gap-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-amber-900"><AlertTriangle className="mt-0.5 size-4 shrink-0" /><p className="text-xs leading-relaxed">An unused product with zero stock is permanently deleted. A stocked or referenced product is archived instead so its history remains intact.</p></div>{message && <p role="alert" className={`mt-3 rounded-md border p-3 text-xs ${message.includes("archived instead") ? "border-amber-200 bg-amber-50 text-amber-800" : "border-red-200 bg-red-50 text-red-700"}`}>{message}</p>}</div><SheetFooter className="border-t"><Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={busy}>Keep product</Button><Button type="button" variant="destructive" onClick={remove} disabled={busy}>{busy ? "Checking..." : "Remove product"}</Button></SheetFooter></SheetContent></Sheet>;
}
