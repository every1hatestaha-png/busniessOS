"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export function CancelPurchaseButton({ purchaseId, orderNumber, received }: { purchaseId: string; orderNumber: string; received: boolean }) {
  const router = useRouter(); const [busy, setBusy] = useState(false); const [message, setMessage] = useState("");
  async function cancel() { if (!confirm(received ? `Cancel purchase ${orderNumber} and reverse its stock, payable, and GL history?` : `Cancel purchase ${orderNumber}?`)) return; setBusy(true); setMessage(""); try { const response = await fetch(`/api/v1/purchases/${purchaseId}/cancel`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reverseInitialPayment: received }) }); const body = await response.json(); if (!response.ok) { setMessage(body.error?.message ?? "Purchase could not be cancelled."); setBusy(false); return; } router.refresh(); } catch { setMessage("The cancellation result is unknown. Refresh the purchase before retrying."); setBusy(false); } }
  return <div><Button type="button" variant="outline" onClick={cancel} disabled={busy}>{busy ? "Cancelling..." : "Cancel PO"}</Button>{message && <p className="mt-1 max-w-xs text-xs text-red-700">{message}</p>}</div>;
}
