"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export function DeleteGrnButton({ grnId, grnNumber, disabled }: { grnId: string; grnNumber: string; disabled?: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function handleDelete() {
    if (!confirm(`Delete GRN ${grnNumber}? Posted receipts are protected; use Void GRN to reverse an active receipt while preserving history.`)) return;
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(`/api/v1/goods-receipts/${grnId}`, {
        method: "DELETE",
      });
      const body = await response.json();
      if (!response.ok) {
        setMessage(body.error?.message ?? "GRN could not be deleted.");
        setBusy(false);
        return;
      }
      router.push("/goods-receipts");
      router.refresh();
    } catch {
      setMessage("Network error. Please try again.");
      setBusy(false);
    }
  }

  return (
    <div>
      <Button type="button" variant="destructive" onClick={handleDelete} disabled={busy || disabled}>
        <Trash2 className="h-4 w-4" />
        {busy ? "Deleting..." : "Delete GRN"}
      </Button>
      {message && <p className="mt-1 max-w-xs text-xs text-red-700">{message}</p>}
    </div>
  );
}
