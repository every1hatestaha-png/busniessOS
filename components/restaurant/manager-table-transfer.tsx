"use client";

import { ArrowRightLeft, ClipboardCheck } from "lucide-react";
import { transferRestaurantTableAction } from "@/app/(dashboard)/restaurant/actions";
import { initialRestaurantActionState } from "@/app/(dashboard)/restaurant/action-state";
import { useRestaurantActionState } from "@/app/(dashboard)/restaurant/use-restaurant-action-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type ActiveTableOrder = {
  id: string;
  orderNumber: string;
  status: string;
  tableName: string;
};
type AvailableTable = {
  id: string;
  name: string;
  area: string | null;
};
export function RestaurantTableTransfer({
  workspaceId, activeOrders, availableTables, truncated,
}: {
  workspaceId: string;
  activeOrders: ActiveTableOrder[];
  availableTables: AvailableTable[];
  truncated: boolean;
}) {
  const [state, action, pending, onSubmit] = useRestaurantActionState(
    transferRestaurantTableAction, initialRestaurantActionState,
  );

  return (
    <section className="rounded-[26px] border border-slate-200 bg-white p-5 shadow-sm sm:p-6" aria-labelledby="table-transfer-title">
      <div className="flex items-start gap-3">
        <div className="grid size-11 shrink-0 place-items-center rounded-2xl bg-emerald-50 text-emerald-700">
          <ArrowRightLeft className="size-5" aria-hidden="true" />
        </div>
        <div>
          <h2 id="table-transfer-title" className="text-lg font-semibold tracking-tight text-slate-950">Transfer an active table</h2>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-600">
            Move one dine-in order to an available table. Kitchen and Order Taking see the new table.
            No payment, stock or order total changes.
          </p>
        </div>
      </div>
      <form action={action} onSubmit={onSubmit} aria-busy={pending}
        className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <input type="hidden" name="formWorkspaceId" value={workspaceId} />
        <label className="block space-y-2 text-sm font-medium text-slate-800">
          <span>Active dine-in order</span>
          <select name="orderId" required disabled={pending || !activeOrders.length}
            defaultValue="" className="min-h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600">
            <option value="">Choose an order</option>
            {activeOrders.map(order => (
              <option key={order.id} value={order.id}>{order.orderNumber} · {order.tableName} · {order.status.toLowerCase()}</option>
            ))}
          </select>
        </label>
        <label className="block space-y-2 text-sm font-medium text-slate-800">
          <span>Destination table</span>
          <select name="destinationTableId" required disabled={pending || !availableTables.length}
            defaultValue="" className="min-h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600">
            <option value="">Choose an available table</option>
            {availableTables.map(table => (
              <option key={table.id} value={table.id}>{table.name}{table.area ? ` · ${table.area}` : ""}</option>
            ))}
          </select>
        </label>
        <label className="block space-y-2 text-sm font-medium text-slate-800 lg:col-span-2">
          <span>Reason, required for the audit</span>
          <Input name="reason" placeholder="Customer requested a different table"
            required minLength={5} maxLength={250} disabled={pending}
            className="min-h-12 rounded-2xl border-slate-200" />
        </label>
        <div className="flex flex-wrap items-center justify-between gap-3 lg:col-span-2">
          <div aria-live="polite" className="text-xs leading-5">
            {state.message ? (
              <p className={state.status === "error" ? "text-red-700" : "text-emerald-800"}>
                {state.status === "success" ? <ClipboardCheck className="mr-1 inline size-4" aria-hidden="true" /> : null}
                {state.message}
              </p>
            ) : (
              <p className="text-slate-500">Only Managers may transfer. Current availability is rechecked during submission.</p>
            )}
            {!activeOrders.length ? <p className="mt-1 text-amber-800">No active dine-in orders available.</p> : null}
            {!availableTables.length ? <p className="mt-1 text-amber-800">No available destination tables.</p> : null}
            {truncated ? <p className="mt-1 text-amber-800">Showing 100 recent orders. Older orders are not listed in this form.</p> : null}
          </div>
          <Button type="submit" disabled={pending || !activeOrders.length || !availableTables.length}
            className="min-h-12 rounded-2xl bg-emerald-700 px-6 font-semibold text-white hover:bg-emerald-800 active:scale-[0.98] motion-reduce:transform-none">
            {pending ? "Moving table..." : "Transfer table"}
          </Button>
        </div>
      </form>
    </section>
  );
}
