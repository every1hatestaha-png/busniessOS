"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Ban } from "lucide-react";
import { Button } from "@/components/ui/button";

export function VoidGrnButton({ grnId, disabled }: { grnId: string; disabled?: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function handleVoid() {
    const reason = prompt("Enter a reason for voiding this GRN (required):");
    if (reason === null) return;
    if (!reason.trim()) {
      setMessage("A void reason is required.");
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(`/api/v1/goods-receipts/${grnId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ voidedReason: reason.trim() }),
      });
      const body = await response.json();
      if (!response.ok) {
        setMessage(body.error?.message ?? "GRN could not be voided.");
        setBusy(false);
        return;
      }
      router.refresh();
    } catch {
      setMessage("Network error. Please try again.");
      setBusy(false);
    }
  }

  return (
    <div>
      <Button type="button" variant="destructive" onClick={handleVoid} disabled={busy || disabled}>
        <Ban className="h-4 w-4" />
        {busy ? "Voiding..." : "Void GRN"}
      </Button>
      {message && <p className="mt-1 max-w-xs text-xs text-red-700">{message}</p>}
    </div>
  );
}
