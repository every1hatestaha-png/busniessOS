"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";

export function RemoveCustomerButton({ customerId, customerName }: { customerId: string; customerName: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function remove() {
    if (!confirm(`Delete customer ${customerName}? Unused customers are permanently deleted. Customers with transaction history are deactivated instead.`)) return;
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

  return <div><Button type="button" variant="destructive" size="sm" onClick={remove} disabled={busy}><Trash2 className="h-4 w-4" />{busy ? "Checking..." : "Delete"}</Button>{message && <p className={`mt-1 max-w-sm text-xs ${message.includes("deactivated instead") ? "text-amber-700" : "text-red-700"}`}>{message}</p>}</div>;
}
