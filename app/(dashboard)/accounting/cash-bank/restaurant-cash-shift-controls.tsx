"use client";

import {
  closeCashShiftAction,
  openCashShiftAction,
} from "@/app/(dashboard)/restaurant/actions";
import { initialRestaurantActionState } from "@/app/(dashboard)/restaurant/action-state";
import { useRestaurantActionState } from "@/app/(dashboard)/restaurant/use-restaurant-action-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function RestaurantCashShiftControls({
  workspaceId,
  openShiftId,
}: {
  workspaceId: string;
  openShiftId: string | null;
}) {
  const [openState, openAction, openPending, openSubmit] = useRestaurantActionState(openCashShiftAction, initialRestaurantActionState);
  const [closeState, closeAction, closePending, closeSubmit] = useRestaurantActionState(closeCashShiftAction, initialRestaurantActionState);

  if (openShiftId) {
    return (
      <form action={closeAction} onSubmit={closeSubmit} aria-busy={closePending} className="space-y-3">
        <input type="hidden" name="formWorkspaceId" value={workspaceId} />
        <input type="hidden" name="shiftId" value={openShiftId} />
        <label className="block space-y-1.5 text-xs font-medium">
          Closing cash
          <Input name="closingCash" type="number" min={0} step="0.01" defaultValue={0} required className="rounded-xl" />
        </label>
        <label className="block space-y-1.5 text-xs font-medium">
          Closing note
          <Input name="notes" placeholder="Optional variance or handover note" maxLength={500} className="rounded-xl" />
        </label>
        {closeState.message ? <p className={closeState.status === "error" ? "text-xs text-destructive" : "text-xs text-emerald-700"}>{closeState.message}</p> : null}
        <Button type="submit" className="w-full rounded-xl bg-emerald-600 hover:bg-emerald-500" disabled={closePending}>{closePending ? "Closing shift..." : "Close shift"}</Button>
      </form>
    );
  }

  return (
    <form action={openAction} onSubmit={openSubmit} aria-busy={openPending} className="space-y-3">
      <input type="hidden" name="formWorkspaceId" value={workspaceId} />
      <label className="block space-y-1.5 text-xs font-medium">
        Opening cash
        <Input name="openingCash" type="number" min={0} step="0.01" defaultValue={0} required className="rounded-xl" />
      </label>
      <label className="block space-y-1.5 text-xs font-medium">
        Opening note
        <Input name="notes" placeholder="Optional opening or handover note" maxLength={500} className="rounded-xl" />
      </label>
      {openState.message ? <p className={openState.status === "error" ? "text-xs text-destructive" : "text-xs text-emerald-700"}>{openState.message}</p> : null}
      <Button type="submit" className="w-full rounded-xl bg-emerald-600 hover:bg-emerald-500" disabled={openPending}>{openPending ? "Opening shift..." : "Open cash shift"}</Button>
    </form>
  );
}
