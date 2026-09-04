"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";

export function DeletePurchaseButton({ purchaseId, orderNumber }: { purchaseId: string; orderNumber: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function remove() {
    if (!confirm(`Delete purchase ${orderNumber}? Only orders without receiving, payment, return, or accounting history can be deleted.`)) return;
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(`/api/v1/purchases/${purchaseId}`, { method: "DELETE" });
      const body = await response.json();
      if (!response.ok) {
        setMessage(body.error?.message ?? "Purchase could not be deleted.");
        return;
      }
      router.push("/purchases");
      router.refresh();
    } catch {
      setMessage("Network error. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return <div><Button type="button" variant="destructive" size="sm" onClick={remove} disabled={busy}><Trash2 className="h-3.5 w-3.5" />{busy ? "Deleting..." : "Delete"}</Button>{message && <p className="mt-1 max-w-sm text-xs text-red-700">{message}</p>}</div>;
}
