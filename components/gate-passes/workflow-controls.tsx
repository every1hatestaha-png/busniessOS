"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { GatePassInvoicePreparation } from "@/components/gate-passes/invoice-preparation";
import {
  issueGatePassAction, dispatchGatePassAction, cancelGatePassAction, receivingGatePassAction,
  returnedGatePassAction,
  type GatePassActionState,
} from "@/app/(dashboard)/gate-passes/lifecycle-actions";

type Item = {
  id: string;
  name: string;
  quantity: string;
  accepted: string;
  rejected: string;
  returned: string;
  price: string;
};
type Status = "DRAFT" | "ISSUED" | "IN_TRANSIT" | "RECEIVING_PENDING" | "ACCEPTED" | "PARTIALLY_ACCEPTED" | "REJECTED" | "INVOICED" | "CANCELLED";

function ActionFeedback({ state }: { state: GatePassActionState }) {
  return <>{state.error && <p role="alert" className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-800">{state.error}</p>}
    {state.ok && <p role="status" className="rounded border border-green-200 bg-green-50 p-3 text-sm text-green-900">{state.ok}</p>}</>;
}

export function GatePassWorkflowControls({
  id, status, items, customerReference, recipient, receivingNotes, deferredBillingReady, canIssue, canCancel, issueDeductsStock, stockAlreadyDeducted, canDispatch, canReceive, canInvoice,
}: {
  id: string;
  status: Status;
  items: Item[];
  customerReference: string | null;
  recipient: string | null;
  receivingNotes: string | null;
  deferredBillingReady: boolean;
  canIssue: boolean;
  canCancel: boolean;
  issueDeductsStock: boolean;
  stockAlreadyDeducted: boolean;
  canDispatch: boolean;
  canReceive: boolean;
  canInvoice: boolean;
}) {
  const [issueState, issue, issuing] = useActionState(issueGatePassAction, {} as GatePassActionState);
  const [dispatchState, dispatch, dispatching] = useActionState(dispatchGatePassAction, {} as GatePassActionState);
  const [cancelState, cancel, cancelling] = useActionState(cancelGatePassAction, {} as GatePassActionState);
  const [receiveState, receive, receiving] = useActionState(receivingGatePassAction, {} as GatePassActionState);
  const [returnState, physicalReturn, returning] = useActionState(returnedGatePassAction, {} as GatePassActionState);
  const [receivingLines, setReceivingLines] = useState(items.map((x) => ({ itemId: x.id, accepted: x.accepted, rejected: x.rejected })));
  const [returnLines, setReturnLines] = useState(items.map((x) => ({ itemId: x.id, returned: x.returned })));
  const inputClass = "w-full rounded-md border bg-background px-3 py-2 text-sm";
  const buttonClass = "rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-50";
  const canWriteReceiving = status === "IN_TRANSIT" || status === "RECEIVING_PENDING";
  const returnable = ["REJECTED", "PARTIALLY_ACCEPTED", "INVOICED"].includes(status) && items.some((x) => Number(x.returned) < Number(x.rejected));

  return <section className="space-y-5">
    {!deferredBillingReady && !["DRAFT", "CANCELLED", "INVOICED"].includes(status) && <div role="status" className="rounded-md border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
      <p className="font-semibold">Dispatch and deferred invoicing are not yet authorized.</p>
      <p className="mt-1">You can print this gate pass, but do not dispatch under the acceptance-billing workflow until documented transaction-specific tax approval is configured. For supplies requiring an invoice at delivery, use the <Link href="/sales/new" className="underline font-medium">standard Sales workflow</Link> and its normal return/credit-note process.</p>
    </div>}
    {canIssue && status === "DRAFT" && <form action={issue} className="rounded-md border p-4 space-y-3">
      <h2 className="font-semibold">Issue gate pass</h2>
      <p className="text-sm text-muted-foreground">{issueDeductsStock ? "Issuing deducts available stock once and freezes the product and BOM valuation. Cancel before dispatch to restore stock." : "Freeze document details before printing and dispatch."}</p>
      {issueDeductsStock && !deferredBillingReady && <p role="status" className="text-sm text-amber-950">V2 issuance is blocked until billing and dispatch prerequisites are approved. No stock will be reserved.</p>}
      <input type="hidden" name="gatePassId" value={id}/>
      <ActionFeedback state={issueState}/><button type="submit" disabled={issuing || (issueDeductsStock && !deferredBillingReady)} className={buttonClass}>{issuing ? "Issuing…" : "Issue Gate Pass"}</button>
    </form>}
    {status !== "DRAFT" && status !== "CANCELLED" && <Link href={`/gate-passes/${id}/print`} className="inline-flex rounded-md border px-4 py-2 text-sm font-medium">Print gate pass</Link>}
    {canCancel && (status === "DRAFT" || status === "ISSUED") && <form action={cancel} className="space-y-2">
      <input type="hidden" name="gatePassId" value={id}/>
      <ActionFeedback state={cancelState}/>
      <button disabled={cancelling} className="rounded-md border border-red-300 px-4 py-2 text-sm text-red-800">Cancel Undispatched Gate Pass</button>
    </form>}

    {deferredBillingReady && canDispatch && status === "ISSUED" && <form action={dispatch} className="rounded-md border p-4 space-y-3">
      <h2 className="font-semibold">Confirm physical dispatch</h2>
      <p className="text-sm text-muted-foreground">{stockAlreadyDeducted ? "Available stock was already deducted at issue. This confirmation records physical dispatch only, with no second deduction." : "Legacy Gate Pass: available stock will be deducted once now. Only confirm when goods physically leave."}</p>
      <input type="hidden" name="gatePassId" value={id}/>
      <ActionFeedback state={dispatchState}/><button type="submit" disabled={dispatching} className={buttonClass}>Confirm Dispatch</button>
    </form>}

    {canReceive && canWriteReceiving && <form action={receive} className="space-y-4 rounded-md border p-4">
      <h2 className="font-semibold">Customer receiving</h2>
      <p className="text-sm text-muted-foreground">Enter cumulative accepted and rejected quantities from the signed receiving.</p>
      <input type="hidden" name="gatePassId" value={id}/>
      <input type="hidden" name="linesJson" value={JSON.stringify(receivingLines)} readOnly/>
      <div className="grid gap-3 md:grid-cols-2">
        <label className="text-sm space-y-1"><span>Customer receiving reference</span><input name="reference" required maxLength={120} defaultValue={customerReference ?? ""} className={inputClass}/></label>
        <label className="text-sm space-y-1"><span>Recipient name</span><input name="recipient" required maxLength={120} defaultValue={recipient ?? ""} className={inputClass}/></label>
      </div>
      <div className="overflow-x-auto"><table className="w-full min-w-[600px] text-sm"><thead><tr><th className="text-left p-2">Product</th><th className="p-2 text-right">Sent</th><th className="p-2 text-right">Accepted</th><th className="p-2 text-right">Rejected</th></tr></thead>
        <tbody>{items.map((item, i) => <tr className="border-t" key={item.id}><td className="p-2">{item.name}</td><td className="p-2 text-right">{item.quantity}</td>
          <td className="p-2"><input aria-label={`${item.name} accepted`} inputMode="decimal" className={inputClass} value={receivingLines[i]?.accepted ?? "0"} onChange={(e) => setReceivingLines((old) => old.map((x) => x.itemId === item.id ? {...x, accepted: e.target.value}: x))}/></td>
          <td className="p-2"><input aria-label={`${item.name} rejected`} inputMode="decimal" className={inputClass} value={receivingLines[i]?.rejected ?? "0"} onChange={(e) => setReceivingLines((old) => old.map((x) => x.itemId === item.id ? {...x, rejected: e.target.value}: x))}/></td>
        </tr>)}</tbody></table></div>
      <label className="block text-sm space-y-1"><span>Receiving notes</span><textarea name="notes" maxLength={500} defaultValue={receivingNotes ?? ""} className={inputClass}/></label>
      <ActionFeedback state={receiveState}/><button disabled={receiving} className={buttonClass}>Record Receiving</button>
    </form>}

    {canReceive && returnable && <form action={physicalReturn} className="space-y-4 rounded-md border p-4">
      <h2 className="font-semibold">Physically returned rejected goods</h2>
      <p className="text-sm text-muted-foreground">Only record returned quantities that physically arrived back. Quantities are cumulative.</p>
      <input type="hidden" name="gatePassId" value={id}/>
      <input type="hidden" name="linesJson" value={JSON.stringify(returnLines)} readOnly/>
      <div className="overflow-x-auto"><table className="w-full min-w-[550px] text-sm"><thead><tr><th className="text-left p-2">Product</th><th className="p-2 text-right">Rejected</th><th className="p-2 text-right">Returned to stock</th></tr></thead>
        <tbody>{items.map((item) => <tr className="border-t" key={item.id}><td className="p-2">{item.name}</td><td className="p-2 text-right">{item.rejected}</td>
          <td className="p-2"><input aria-label={`${item.name} returned`} inputMode="decimal" value={returnLines.find((x) => x.itemId === item.id)?.returned ?? "0"} className={inputClass} onChange={(e) => setReturnLines((old) => old.map((x) => x.itemId === item.id ? {...x, returned: e.target.value}: x))}/></td>
        </tr>)}</tbody></table></div>
      <ActionFeedback state={returnState}/><button disabled={returning} className={buttonClass}>Confirm Physical Return</button>
    </form>}

    {canInvoice && <GatePassInvoicePreparation id={id} status={status} items={items} deferredBillingReady={deferredBillingReady}/>}
  </section>;
}
