import Link from "next/link";
import { redirect } from "next/navigation";

import { assignRestaurantStaffStationAction } from "./actions";
import { RestaurantMutationForm } from "@/app/(dashboard)/restaurant/mutation-form";
import { Button } from "@/components/ui/button";
import { requireWorkspace } from "@/lib/server/auth";
import { listWorkspaceModules } from "@/lib/server/industry-modules";
import { listRestaurantStationStaff } from "@/lib/server/restaurant-stations";
import { isRestaurantManager } from "@/lib/restaurant/station-policy";

export default async function RestaurantStaffStationsPage() {
  const { workspaceId, role } = await requireWorkspace();
  if (!isRestaurantManager(role)) redirect("/restaurant");
  const modules = await listWorkspaceModules(workspaceId);
  if (!modules.some((m) => m.moduleKey === "restaurant" && m.enabled)) redirect("/restaurant");
  const staff = await listRestaurantStationStaff(workspaceId);
  return (
    <main className="mx-auto max-w-3xl space-y-6">
      <header>
        <Link href="/restaurant/manager" className="text-sm font-semibold text-emerald-700 hover:underline">Back to manager</Link>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight">Staff stations</h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          Use three accounts in this one restaurant: your owner or manager account, an Order Taking account, and a Kitchen account.
          Invite the two workers with the STAFF role in Settings. Once they accept, assign their station below.
          An unassigned staff account cannot operate either station.
        </p>
      </header>
      <section aria-label="Restaurant staff assignments" className="space-y-3">
        {!staff.length && (
          <p className="rounded-2xl border bg-white p-5 text-sm text-slate-600">
            No staff members yet. <Link href="/settings" className="font-semibold text-emerald-700 underline underline-offset-4">Invite two STAFF accounts in Settings</Link>, one for Order Taking and one for Kitchen. Have them accept their invitations, then return here to assign station access.
          </p>
        )}
        {staff.map((person) => (
          <div key={person.userId} className="rounded-2xl border bg-white p-5 shadow-sm">
            <p className="mb-3 break-all text-sm font-semibold text-slate-900">{person.email}</p>
            <RestaurantMutationForm action={assignRestaurantStaffStationAction} workspaceId={workspaceId}
              className="flex flex-wrap items-end gap-3">
              <input type="hidden" name="userId" value={person.userId}/>
              <label className="flex min-w-[170px] flex-1 flex-col gap-1.5 text-xs font-medium text-slate-700">
                Station access
                <select name="station" defaultValue={person.station ?? "NONE"}
                  className="min-h-11 rounded-xl border border-slate-300 bg-white px-3 text-sm">
                  <option value="NONE">No access</option>
                  <option value="CASHIER">Order Taking — orders and billing</option>
                  <option value="KITCHEN">Kitchen — preparation only</option>
                </select>
              </label>
              <Button type="submit" className="min-h-11 rounded-xl">Save permission</Button>
            </RestaurantMutationForm>
          </div>
        ))}
      </section>
    </main>
  );
}
