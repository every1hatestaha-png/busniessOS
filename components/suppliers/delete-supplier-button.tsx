"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";

export function DeleteSupplierButton({ supplierId, supplierName }: { supplierId: string; supplierName: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function remove() {
    if (!confirm(`Delete supplier ${supplierName}? Only suppliers without balances or transaction history can be permanently deleted.`)) return;
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

  return <div><Button type="button" variant="destructive" onClick={remove} disabled={busy}><Trash2 className="h-4 w-4" />{busy ? "Deleting..." : "Delete"}</Button>{message && <p className="mt-1 max-w-sm text-xs text-red-700">{message}</p>}</div>;
}
