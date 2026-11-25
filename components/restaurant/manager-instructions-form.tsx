"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ClipboardEdit } from "lucide-react";
import { correctRestaurantInstructionsAction } from "@/app/(dashboard)/restaurant/actions";
import { initialRestaurantActionState } from "@/app/(dashboard)/restaurant/action-state";
import { useRestaurantActionState } from "@/app/(dashboard)/restaurant/use-restaurant-action-state";
import { Button } from "@/components/ui/button";

type Order = { id: string; orderNumber: string; status: string; notes: string };

export function RestaurantInstructionsForm({
  workspaceId, orders, truncated,
}: { workspaceId: string; orders: Order[]; truncated: boolean }) {
  const router = useRouter();
  const [selectedId, setSelectedId] = useState(orders[0]?.id ?? "");
  const selected = orders.find(order => order.id === selectedId) ?? orders[0];
  const [notes, setNotes] = useState(selected?.notes ?? "");
  const [state, action, pending, onSubmit] = useRestaurantActionState(
    async (previous, form) => {
      const result = await correctRestaurantInstructionsAction(previous, form);
      if (result.status === "success") router.refresh();
      return result;
    }, initialRestaurantActionState,
  );
  if (!selected) {
    return <section className="rounded-[24px] border border-dashed border-slate-300 bg-white p-8 text-sm text-slate-600">
      No confirmed or preparing orders require kitchen instruction changes.
    </section>;
  }
  return (
    <section className="rounded-[26px] border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
      <div className="flex items-center gap-3">
        <span className="grid size-11 place-items-center rounded-2xl bg-emerald-50 text-emerald-700">
          <ClipboardEdit className="size-5" aria-hidden="true" />
        </span>
        <div>
          <h2 className="text-lg font-semibold text-slate-950">Correct preparation notes</h2>
          <p className="mt-1 text-xs text-slate-600">Manager-only. The current saved note is checked before writing.</p>
        </div>
      </div>
      <form action={action} onSubmit={onSubmit} aria-busy={pending} className="mt-6 space-y-5">
        <input type="hidden" name="formWorkspaceId" value={workspaceId} />
        <input type="hidden" name="expectedNotes" value={selected.notes} />
        <label className="block space-y-2 text-sm font-medium text-slate-800">
          <span>Active order</span>
          <select name="orderId" value={selected.id} disabled={pending}
            onChange={event => {
              const order = orders.find(item => item.id === event.target.value);
              if (!order) return;
              setSelectedId(order.id); setNotes(order.notes);
            }}
            className="min-h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500">
            {orders.map(order => <option key={order.id} value={order.id}>
              {order.orderNumber} · {order.status.toLowerCase()}
            </option>)}
          </select>
        </label>
        <label className="block space-y-2 text-sm font-medium text-slate-800">
          <span>Replacement kitchen instructions</span>
          <textarea name="newNotes" value={notes} disabled={pending}
            onChange={event => setNotes(event.target.value)} maxLength={500} rows={4}
            placeholder="No onions. Customer has a food allergy."
            className="min-h-28 w-full resize-y rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500" />
          <span className="block text-right text-xs text-slate-500">{notes.length}/500</span>
        </label>
        <label className="block space-y-2 text-sm font-medium text-slate-800">
          <span>Reason for correction</span>
          <input name="reason" required minLength={5} maxLength={250} disabled={pending}
            placeholder="Customer requested the change before preparation finished"
            className="min-h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500" />
        </label>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p aria-live="polite" className={state.status === "error" ? "text-sm text-red-700" : "text-sm text-emerald-800"}>
            {state.message || "Ready and completed orders cannot be edited here."}
          </p>
          <Button type="submit" disabled={pending} className="min-h-12 rounded-2xl bg-emerald-700 px-6 font-semibold hover:bg-emerald-800">
            {pending ? "Saving correction..." : "Save audited correction"}
          </Button>
        </div>
      </form>
      {truncated ? <p className="mt-4 text-xs text-amber-800">Only the oldest 100 confirmed/preparing orders appear. Clear the queue to see later orders.</p> : null}
    </section>
  );
}
