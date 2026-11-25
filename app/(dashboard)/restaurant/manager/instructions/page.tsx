import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import { RestaurantInstructionsForm } from "@/components/restaurant/manager-instructions-form";
import { requireWorkspace } from "@/lib/server/auth";
import { listWorkspaceModules } from "@/lib/server/industry-modules";
import { listRestaurantOrders } from "@/lib/server/restaurant-workspace";
import { isRestaurantManager } from "@/lib/restaurant/station-policy";

export default async function ManagerKitchenInstructionsPage() {
  const { workspaceId, role, workspace } = await requireWorkspace();
  if (!isRestaurantManager(role)) redirect("/restaurant");
  const modules = await listWorkspaceModules(workspaceId);
  if (!modules.some(m => m.moduleKey === "restaurant" && m.enabled)) redirect("/restaurant");
  const orders = await listRestaurantOrders(workspaceId, 100, {
    statuses: ["CONFIRMED", "PREPARING"], oldestFirst: true,
  });
  return (
    <main className="mx-auto max-w-4xl space-y-6">
      <header className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <Link href="/restaurant/manager" className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-emerald-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500">
          <ArrowLeft className="size-4" /> Manager
        </Link>
        <p className="mt-6 text-xs font-semibold uppercase tracking-[0.14em] text-emerald-700">Private service controls</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-slate-950">Kitchen instruction corrections</h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">
          Amend order-wide preparation notes only while the ticket is Confirmed or Preparing.
          The Kitchen sees updated instructions on its next visible refresh. Every change requires an audited reason.
        </p>
      </header>
      <RestaurantInstructionsForm workspaceId={workspaceId}
        orders={orders.map(order => ({ id: order.id, orderNumber: order.orderNumber,
          status: order.status, notes: order.notes ?? "" }))} truncated={orders.length===100} />
      <p className="flex items-start gap-2 rounded-2xl bg-amber-50 p-4 text-xs leading-5 text-amber-950">
        <ShieldCheck className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        These corrections do not re-fire KOT items, change quantities or calculate refunds.
        For food allergies, notify the kitchen team directly as well as recording the instruction.
      </p>
    </main>
  );
}
