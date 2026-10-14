"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import {
  issueGatePassAction, dispatchGatePassAction, cancelGatePassAction, receivingGatePassAction,
  returnedGatePassAction, invoiceGatePassAction,
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
  id, status, items, customerReference, recipient, receivingNotes, deferredBillingReady, canIssue, issueDeductsStock, canDispatch, canReceive, canInvoice,
}: {
  id: string;
  status: Status;
  items: Item[];
  customerReference: string | null;
  recipient: string | null;
  receivingNotes: string | null;
  deferredBillingReady: boolean;
  canIssue: boolean;
  issueDeductsStock: boolean;
  canDispatch: boolean;
  canReceive: boolean;
  canInvoice: boolean;
}) {
  const [issueState, issue, issuing] = useActionState(issueGatePassAction, {} as GatePassActionState);
  const [dispatchState, dispatch, dispatching] = useActionState(dispatchGatePassAction, {} as GatePassActionState);
  const [cancelState, cancel, cancelling] = useActionState(cancelGatePassAction, {} as GatePassActionState);
  const [receiveState, receive, receiving] = useActionState(receivingGatePassAction, {} as GatePassActionState);
  const [returnState, physicalReturn, returning] = useActionState(returnedGatePassAction, {} as GatePassActionState);
  const [invoiceState, invoice, invoicing] = useActionState(invoiceGatePassAction, {} as GatePassActionState);
  const [receivingLines, setReceivingLines] = useState(items.map((x) => ({ itemId: x.id, accepted: x.accepted, rejected: x.rejected })));
  const [returnLines, setReturnLines] = useState(items.map((x) => ({ itemId: x.id, returned: x.returned })));
  const [invoiceLines, setInvoiceLines] = useState(items.filter((x) => Number(x.accepted) > 0).map((x) => ({ itemId: x.id, unitPrice: x.price, taxRate: null as number | null })));
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
      <input type="hidden" name="gatePassId" value={id}/>
      <ActionFeedback state={issueState}/><button type="submit" disabled={issuing} className={buttonClass}>Issue Gate Pass</button>
    </form>}
    {status !== "DRAFT" && status !== "CANCELLED" && <Link href={`/gate-passes/${id}/print`} className="inline-flex rounded-md border px-4 py-2 text-sm font-medium">Print gate pass</Link>}
    {canIssue && (status === "DRAFT" || status === "ISSUED") && <form action={cancel} className="space-y-2">
      <input type="hidden" name="gatePassId" value={id}/>
      <ActionFeedback state={cancelState}/>
      <button disabled={cancelling} className="rounded-md border border-red-300 px-4 py-2 text-sm text-red-800">Cancel Undispatched Gate Pass</button>
    </form>}

    {deferredBillingReady && canDispatch && status === "ISSUED" && <form action={dispatch} className="rounded-md border p-4 space-y-3">
      <h2 className="font-semibold">Confirm physical dispatch</h2>
      <p className="text-sm text-muted-foreground">{issueDeductsStock ? "For a V2 Gate Pass, stock was deducted at issue. Confirm only when goods physically leave; dispatch never deducts it again." : "Existing Gate Pass: this moves quantities out of warehouse stock once. Only confirm when goods physically leave."}</p>
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

    {deferredBillingReady && canInvoice && ["ACCEPTED", "PARTIALLY_ACCEPTED"].includes(status) && <form id="generate-invoice" action={invoice} className="scroll-mt-24 space-y-4 rounded-md border p-4">
      <h2 className="font-semibold">Generate invoice for accepted goods</h2>
      <p className="text-sm text-muted-foreground">Verify prices and tax per line. Stock was moved at dispatch and will not be deducted again.</p>
      <input type="hidden" name="gatePassId" value={id}/><input type="hidden" name="linesJson" value={JSON.stringify(invoiceLines)} readOnly/>
      <div className="overflow-x-auto"><table className="w-full min-w-[650px] text-sm"><thead><tr><th className="p-2 text-left">Accepted product</th><th className="p-2 text-right">Quantity</th><th className="p-2">Unit price (PKR)</th><th className="p-2">Tax %</th></tr></thead>
        <tbody>{items.filter((x) => Number(x.accepted) > 0).map((item) => {
          const line = invoiceLines.find((x) => x.itemId === item.id);
          return <tr className="border-t" key={item.id}><td className="p-2">{item.name}</td><td className="p-2 text-right">{item.accepted}</td>
            <td className="p-2"><input inputMode="decimal" aria-label={`${item.name} unit price`} className={inputClass} value={line?.unitPrice ?? "0"} onChange={(e) => setInvoiceLines((old) => old.map((x) => x.itemId === item.id ? {...x, unitPrice: e.target.value}: x))}/></td>
            <td className="p-2"><input type="number" min="0" max="100" step="0.0001" aria-label={`${item.name} tax percent`} className={inputClass} value={line?.taxRate ?? ""} required onChange={(e) => setInvoiceLines((old) => old.map((x) => x.itemId === item.id ? {...x, taxRate: e.target.value === "" ? null : Number(e.target.value)}: x))}/></td>
          </tr>;
        })}</tbody></table></div>
      <label className="flex items-start gap-2 text-sm"><input type="checkbox" required name="complianceAcknowledged" value="yes" className="mt-1"/><span>I have reviewed whether Pakistan tax rules require an earlier invoice at payment or delivery. No required tax invoice is being deferred or duplicated.</span></label>
      <ActionFeedback state={invoiceState}/><button disabled={invoicing} className={buttonClass}>Create Final Invoice</button>
    </form>}
  </section>;
}
