import Link from "next/link";
import { CheckCircle2, Clock3, CookingPot } from "lucide-react";

import { RestaurantMutationForm } from "@/app/(dashboard)/restaurant/mutation-form";
import { transitionRestaurantOrderAction } from "@/app/(dashboard)/restaurant/v1-actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { requireWorkspace } from "@/lib/server/auth";
import { listRestaurantKitchenItems, listRestaurantOrders } from "@/lib/server/restaurant-workspace";
import { cn } from "@/lib/utils";

const kitchenColumns = [
  { status: "CONFIRMED", label: "New", icon: Clock3, next: "PREPARING", action: "Start preparing", tone: "blue" },
  { status: "PREPARING", label: "Preparing", icon: CookingPot, next: "READY", action: "Mark ready", tone: "amber" },
  { status: "READY", label: "Ready", icon: CheckCircle2, next: "COMPLETED", action: "Serve order", tone: "emerald" },
] as const;

export default async function RestaurantKitchenPage() {
  const { workspaceId, workspace } = await requireWorkspace();
  const orders = await listRestaurantOrders(workspaceId, 200, { statuses: ["CONFIRMED", "PREPARING", "READY"], oldestFirst: true });
  const kitchenItems = await listRestaurantKitchenItems(workspaceId, orders.map((order) => order.id));

  const counts = {
    CONFIRMED: orders.filter((order) => order.status === "CONFIRMED").length,
    PREPARING: orders.filter((order) => order.status === "PREPARING").length,
    READY: orders.filter((order) => order.status === "READY").length,
  };

  return (
    <div className="mx-auto max-w-[1560px] space-y-4">
      <section className="flex flex-col gap-3 rounded-2xl border bg-white p-4 shadow-none sm:flex-row sm:items-center sm:justify-between sm:p-5">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-emerald-700">Kitchen display</p>
          <h1 className="mt-1 text-xl font-semibold tracking-tight">{workspace.name} kitchen</h1>
          <p className="mt-1 text-sm text-muted-foreground">Prepare the dishes shown on each ticket. Quantities and kitchen notes are displayed below.</p>
        </div>
        <Link href="/restaurant/orders" className="text-sm font-semibold text-emerald-700 hover:underline">Open order board</Link>
      </section>

      <section className="grid gap-3 sm:grid-cols-3">
        <KitchenMetric label="New" value={counts.CONFIRMED} tone="blue" />
        <KitchenMetric label="Preparing" value={counts.PREPARING} tone="amber" />
        <KitchenMetric label="Ready" value={counts.READY} tone="emerald" />
      </section>

      {orders.length === 200 ? <p className="text-sm text-amber-700">Showing the oldest 200 kitchen orders. Finish these to advance the queue.</p> : null}

      <div className="grid gap-4 xl:grid-cols-3">
        {kitchenColumns.map((column) => {
          const matching = orders.filter((order) => order.status === column.status);
          const Icon = column.icon;
          const headTone = column.tone === "amber"
            ? "bg-amber-50 text-amber-800"
            : column.tone === "blue"
              ? "bg-blue-50 text-blue-800"
              : "bg-emerald-50 text-emerald-800";

          return (
            <section key={column.status} className="min-w-0 rounded-2xl border bg-slate-50/70 p-3 sm:p-4">
              <div className="mb-3 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className={cn("grid size-8 place-items-center rounded-xl", headTone)}><Icon className="size-4" /></span>
                  <div>
                    <h2 className="text-sm font-semibold">{column.label}</h2>
                    <p className="text-[11px] text-muted-foreground">{matching.length} order{matching.length === 1 ? "" : "s"}</p>
                  </div>
                </div>
                <span className={cn("rounded-full px-2.5 py-1 text-xs font-semibold", headTone)}>{matching.length}</span>
              </div>

              <div className="space-y-3">
                {matching.length ? matching.map((order) => (
                  <Card key={order.id} className={cn("rounded-2xl border bg-white shadow-none", column.status === "READY" && "border-emerald-300")}>
                    <CardContent className="space-y-3 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-xs font-semibold text-slate-500">Ticket {order.orderNumber}</p>
                          <p className="mt-1 text-[11px] font-medium text-muted-foreground">
                            {order.fulfillmentType.replaceAll("_", " ")}{order.tableName ? ` · ${order.tableName}` : ""}
                          </p>
                        </div>
                        <span className="rounded-lg bg-slate-100 px-2 py-1 text-[11px] font-semibold text-slate-600">
                          {new Intl.DateTimeFormat("en-PK", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Karachi" }).format(order.createdAt)}
                        </span>
                      </div>

                      <div className="space-y-2 border-y py-3" aria-label={`Dishes for ${order.orderNumber}`}>
                        {(kitchenItems.get(order.id) ?? []).length ? (kitchenItems.get(order.id) ?? []).map((item, index) => (
                          <div key={index} className="flex items-start gap-3">
                            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-lg font-bold tabular-nums text-emerald-800">{item.quantity}×</span>
                            <div className="min-w-0">
                              <p className="text-base font-semibold leading-6 text-slate-950">{item.itemName}</p>
                              {item.modifiers.length ? <p className="text-xs text-slate-600">{item.modifiers.join(", ")}</p> : null}
                              {item.notes ? <p className="mt-1 rounded-lg bg-amber-50 px-2 py-1 text-sm font-medium text-amber-900">{item.notes}</p> : null}
                            </div>
                          </div>
                        )) : <p className="text-sm font-medium text-amber-800">No dish lines found. Check the printed kitchen ticket.</p>}
                      </div>
                      {order.notes ? <p className="rounded-xl bg-amber-50 p-2.5 text-sm font-medium text-amber-900">Kitchen note: {order.notes}</p> : null}
                      <Link href={`/restaurant/orders/${order.id}/print?kind=kot`} className="inline-flex text-xs font-semibold text-emerald-700 underline underline-offset-4">Print kitchen ticket</Link>

                      <div className="flex flex-wrap gap-2">
                        <RestaurantMutationForm action={transitionRestaurantOrderAction} workspaceId={workspaceId}>
                          <input type="hidden" name="orderId" value={order.id} />
                          <input type="hidden" name="nextStatus" value={column.next} />
                          <Button type="submit" size="sm" className="rounded-lg bg-emerald-600 hover:bg-emerald-500">{column.action}</Button>
                        </RestaurantMutationForm>
                        <RestaurantMutationForm action={transitionRestaurantOrderAction} workspaceId={workspaceId}>
                          <input type="hidden" name="orderId" value={order.id} />
                          <input type="hidden" name="nextStatus" value="CANCELLED" />
                          <Button type="submit" size="sm" variant="outline" className="rounded-lg">Cancel</Button>
                        </RestaurantMutationForm>
                      </div>
                    </CardContent>
                  </Card>
                )) : <div className="rounded-2xl border border-dashed bg-white p-10 text-center text-sm text-muted-foreground">Queue clear</div>}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}

function KitchenMetric({ label, value, tone }: { label: string; value: number; tone: "blue" | "amber" | "emerald" }) {
  const toneClass = tone === "amber" ? "bg-amber-100 text-amber-800" : tone === "blue" ? "bg-blue-100 text-blue-800" : "bg-emerald-100 text-emerald-800";
  return (
    <Card className="rounded-2xl border shadow-none">
      <CardContent className="flex items-center justify-between p-4">
        <div><p className="text-xs font-medium text-muted-foreground">{label}</p><p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p></div>
        <span className={cn("rounded-xl px-3 py-2 text-xs font-semibold", toneClass)}>Live</span>
      </CardContent>
    </Card>
  );
}
