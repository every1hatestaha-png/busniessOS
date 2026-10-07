"use client";

import { useRestaurantActionState } from "@/app/(dashboard)/restaurant/use-restaurant-action-state";


import {
  closeCashShiftAction,
  createRestaurantTableAction,
  openCashShiftAction,
} from "@/app/(dashboard)/restaurant/actions";
import { initialRestaurantActionState } from "@/app/(dashboard)/restaurant/action-state";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

export function RestaurantControls({
  workspaceId,
  openShiftId,
  canManageTables,
}: {
  workspaceId?: string;
  openShiftId: string | null;
  canManageTables: boolean;
}) {
  const [tableState, tableAction, tablePending, tableSubmit] = useRestaurantActionState(createRestaurantTableAction, initialRestaurantActionState);
  const [openState, openAction, openPending, openSubmit] = useRestaurantActionState(openCashShiftAction, initialRestaurantActionState);
  const [closeState, closeAction, closePending, closeSubmit] = useRestaurantActionState(closeCashShiftAction, initialRestaurantActionState);

  return (
    <div className="grid gap-5 xl:grid-cols-2">
      <Card className="rounded-md border shadow-none ring-0">
        <CardContent className="p-5">
          <h2 className="text-sm font-semibold">Table setup</h2>
          <p className="mt-1 text-xs text-muted-foreground">Add dining tables without changing core sales or inventory data.</p>
          {canManageTables ? (
            <form action={tableAction} onSubmit={tableSubmit} aria-busy={tablePending} className="mt-4 grid gap-3 sm:grid-cols-3">{workspaceId ? <input type="hidden" name="formWorkspaceId" value={workspaceId} /> : null}
              <Field label="Table name"><Input name="name" placeholder="Table 01" maxLength={80} required /></Field>
              <Field label="Capacity"><Input name="capacity" type="number" min={1} max={100} defaultValue={2} required /></Field>
              <Field label="Area"><Input name="area" placeholder="Ground floor" maxLength={80} /></Field>
              <div className="sm:col-span-3 flex items-center justify-between gap-3">
                <ActionMessage state={tableState} />
                <Button type="submit" disabled={tablePending}>{tablePending ? "Adding..." : "Add table"}</Button>
              </div>
            </form>
          ) : (
            <p className="mt-4 text-sm text-muted-foreground">Only an owner, admin, or manager can add restaurant tables.</p>
          )}
        </CardContent>
      </Card>

      <Card className="rounded-md border shadow-none ring-0">
        <CardContent className="p-5">
          <h2 className="text-sm font-semibold">Cash shift</h2>
          <p className="mt-1 text-xs text-muted-foreground">Opening and closing cash is tracked separately from accounting receipts.</p>
          {openShiftId ? (
            <form action={closeAction} onSubmit={closeSubmit} aria-busy={closePending} className="mt-4 grid gap-3 sm:grid-cols-2">{workspaceId ? <input type="hidden" name="formWorkspaceId" value={workspaceId} /> : null}
              <input type="hidden" name="shiftId" value={openShiftId} />
              <Field label="Closing cash"><Input name="closingCash" type="number" min={0} step="0.01" defaultValue={0} required /></Field>
              <Field label="Notes"><Input name="notes" placeholder="Optional closing note" maxLength={500} /></Field>
              <div className="sm:col-span-2 flex items-center justify-between gap-3">
                <ActionMessage state={closeState} />
                <Button type="submit" disabled={closePending}>{closePending ? "Closing..." : "Close shift"}</Button>
              </div>
            </form>
          ) : (
            <form action={openAction} onSubmit={openSubmit} aria-busy={openPending} className="mt-4 grid gap-3 sm:grid-cols-2">{workspaceId ? <input type="hidden" name="formWorkspaceId" value={workspaceId} /> : null}
              <Field label="Opening cash"><Input name="openingCash" type="number" min={0} step="0.01" defaultValue={0} required /></Field>
              <Field label="Notes"><Input name="notes" placeholder="Optional opening note" maxLength={500} /></Field>
              <div className="sm:col-span-2 flex items-center justify-between gap-3">
                <ActionMessage state={openState} />
                <Button type="submit" disabled={openPending}>{openPending ? "Opening..." : "Open shift"}</Button>
              </div>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="space-y-1.5 text-xs font-medium"><span>{label}</span>{children}</label>;
}

function ActionMessage({ state }: { state: { status: "idle" | "success" | "error"; message: string } }) {
  if (!state.message) return <span />;
  return <p className={state.status === "error" ? "text-xs text-destructive" : "text-xs text-emerald-700"}>{state.message}</p>;
}
