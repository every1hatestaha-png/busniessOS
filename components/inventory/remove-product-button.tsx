"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";

export function RemoveProductButton({ productId, productName }: { productId: string; productName: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function remove() {
    if (!confirm(`Delete product ${productName}? Unused products are permanently deleted. Products with transaction history are archived instead.`)) return;
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

  return <div><Button type="button" variant="destructive" onClick={remove} disabled={busy}><Trash2 className="h-4 w-4" />{busy ? "Checking..." : "Delete"}</Button>{message && <p className={`mt-1 max-w-sm text-xs ${message.includes("archived instead") ? "text-amber-700" : "text-red-700"}`}>{message}</p>}</div>;
}
