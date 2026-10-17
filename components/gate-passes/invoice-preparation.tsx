"use client";

import { useActionState, useState } from "react";
import { invoiceGatePassAction, type GatePassActionState } from "@/app/(dashboard)/gate-passes/lifecycle-actions";
import { canPrepareGatePassInvoice, gatePassInvoicePreview, hasFinalGatePassReceiving } from "@/lib/delivery-acceptance/invoice-preparation";

type InvoiceItem = { id: string; name: string; quantity: string; accepted: string; price: string };

export function GatePassInvoicePreparation({ id, status, items, deferredBillingReady }: {
  id: string; status: string; items: InvoiceItem[]; deferredBillingReady: boolean;
}) {
  const confirmed = hasFinalGatePassReceiving(status);
  const pricedItems = confirmed ? items.filter((item) => Number(item.accepted) > 0) : items;
  const [state, invoice, pending] = useActionState(invoiceGatePassAction, {} as GatePassActionState);
  const [lines, setLines] = useState(pricedItems.map((item) => ({ itemId: item.id, unitPrice: item.price, taxRate: "" })));
  if (!canPrepareGatePassInvoice(status)) return null;
  const canFinalize = confirmed && deferredBillingReady;
  const preview = gatePassInvoicePreview(pricedItems.map((item) => {
    const line = lines.find((value) => value.itemId === item.id);
    return { quantity: confirmed ? item.accepted : item.quantity, unitPrice: line?.unitPrice ?? "", taxRate: line?.taxRate ?? "" };
  }));
  const validTotal = Boolean(preview && preview.total !== "0.00");
  const inputClass = "w-full rounded-md border bg-background px-3 py-2 text-base disabled:opacity-50";
  function update(itemId: string, field: "unitPrice" | "taxRate", value: string) {
    setLines((old) => old.map((line) => line.itemId === itemId ? { ...line, [field]: value } : line));
  }
  return <form id="generate-invoice" action={canFinalize ? invoice : undefined}
    onSubmit={(event) => { if (!canFinalize || !validTotal) event.preventDefault(); }}
    aria-labelledby="gate-pass-invoice-heading" className="scroll-mt-24 space-y-4 rounded-md border p-4">
    <h2 id="gate-pass-invoice-heading" className="font-semibold">Create Invoice from Gate Pass</h2>
    <p className="text-sm text-muted-foreground">Prepare prices and tax manually for this Gate Pass. Creating or issuing a Gate Pass never creates an invoice automatically.</p>
    <div role="status" className="space-y-1 text-sm">
      {!confirmed && <p>Preparation only — not an invoice. Quantities below are planned; final invoicing uses only confirmed accepted quantities. Complete customer receiving before final issuance.</p>}
      {!deferredBillingReady && <p>Final issuance is blocked until documented billing approval is configured and FBR compatibility is confirmed. If an invoice is required at delivery, use the standard Sales workflow; this preparation does not authorize deferred billing.</p>}
      <p>Preparation stays in this open tab only. Refreshing or updating receiving resets these prices; review them again before final issuance. No invoice, balance or stock changes occur while preparing.</p>
    </div>
    {canFinalize && <><input type="hidden" name="gatePassId" value={id}/><input type="hidden" name="linesJson" value={JSON.stringify(lines.map((line) => ({ ...line, taxRate: line.taxRate === "" ? null : Number(line.taxRate) })))} readOnly/></>}
    <div className="overflow-x-auto"><table className="w-full min-w-[600px] text-sm">
      <thead><tr><th scope="col" className="p-2 text-left">{confirmed ? "Accepted product" : "Planned product"}</th><th scope="col" className="p-2 text-right">Quantity</th><th scope="col" className="p-2">Unit price (PKR)</th><th scope="col" className="p-2">Tax %</th></tr></thead>
      <tbody>{pricedItems.map((item) => {
        const line = lines.find((value) => value.itemId === item.id);
        return <tr key={item.id} className="border-t"><td className="p-2">{item.name}</td><td className="p-2 text-right tabular-nums">{confirmed ? item.accepted : item.quantity}</td>
          <td className="p-2"><input inputMode="decimal" aria-label={`${item.name} unit price`} maxLength={14} value={line?.unitPrice ?? ""} disabled={pending} className={inputClass} onChange={(event) => update(item.id, "unitPrice", event.target.value)}/></td>
          <td className="p-2"><input type="number" inputMode="decimal" min="0" max="100" step="0.0001" required aria-label={`${item.name} tax percent`} value={line?.taxRate ?? ""} disabled={pending} className={inputClass} onChange={(event) => update(item.id, "taxRate", event.target.value)}/></td>
        </tr>;
      })}</tbody>
    </table></div>
    <div aria-live="polite" aria-atomic="true" className="text-sm">
      {preview ? <dl className="ml-auto grid max-w-sm grid-cols-2 gap-x-4 gap-y-2 tabular-nums"><dt>Subtotal</dt><dd className="text-right">PKR {preview.subtotal}</dd><dt>Tax</dt><dd className="text-right">PKR {preview.tax}</dd><dt className="font-semibold">{canFinalize ? "Final payable preview" : "Estimated payable"}</dt><dd className="text-right font-semibold">PKR {preview.total}</dd></dl> : <p>Enter a valid price and explicit tax rate for every line to calculate the payable preview.</p>}
      {preview && !validTotal && <p>Final invoice total must be greater than zero.</p>}
    </div>
    {state.error && <p role="alert" className="text-sm text-red-800">{state.error}</p>}
    {canFinalize && <><label className="flex items-start gap-2 text-sm"><input type="checkbox" required name="complianceAcknowledged" value="yes" disabled={pending} className="mt-1"/><span>I have reviewed whether Pakistan tax rules require an earlier invoice at payment or delivery. No required tax invoice is being deferred or duplicated.</span></label>
      <button type="submit" disabled={pending || !validTotal} className="rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">{pending ? "Creating invoice…" : "Create Final Invoice"}</button></>}
  </form>;
}
