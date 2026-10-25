import Link from "next/link";
import { CheckCircle2, Clock3, CookingPot } from "lucide-react";

import { RestaurantMutationForm } from "@/app/(dashboard)/restaurant/mutation-form";
import { KitchenQueueRefresh } from "@/app/(dashboard)/restaurant/kitchen/kitchen-queue-refresh";
import { transitionKitchenOrderAction } from "@/app/(dashboard)/restaurant/v1-actions";
import { assertRestaurantStation } from "@/lib/server/restaurant-stations";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { requireWorkspace } from "@/lib/server/auth";
import { listRestaurantKitchenOrderLines, listRestaurantOrders } from "@/lib/server/restaurant-workspace";
import { cn } from "@/lib/utils";

const kitchenColumns = [
  { status: "CONFIRMED", label: "New", icon: Clock3, next: "PREPARING", action: "Start preparing", tone: "blue" },
  { status: "PREPARING", label: "Preparing", icon: CookingPot, next: "READY", action: "Mark ready", tone: "amber" },
  { status: "READY", label: "Ready", icon: CheckCircle2, next: null, action: null, tone: "emerald" },
] as const;

export default async function RestaurantKitchenPage() {
  const { workspaceId, workspace, role, user } = await requireWorkspace();
  await assertRestaurantStation({ workspaceId, role, userId: user.id }, "KITCHEN");
  const orders = await listRestaurantOrders(workspaceId, 200, { statuses: ["CONFIRMED", "PREPARING", "READY"], oldestFirst: true });
  const lines = await listRestaurantKitchenOrderLines(workspaceId, orders.map((order) => order.id));
  const linesByOrder = new Map<string, typeof lines>();
  for (const line of lines) {
    const existing = linesByOrder.get(line.orderId) ?? [];
    existing.push(line);
    linesByOrder.set(line.orderId, existing);
  }

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
          <p className="mt-1 text-sm text-muted-foreground">Kitchen tickets update every 12 seconds when this tab is visible, or manually on demand.</p>
        </div>
        <div className="flex flex-col items-start gap-2 sm:items-end">
          <KitchenQueueRefresh />
          <Link href="/restaurant/orders" className="text-xs font-semibold text-emerald-700 hover:underline">Open order board</Link>
        </div>
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
                          <Link href={`/restaurant/orders/${order.id}/print?kind=kot`} className="text-sm font-semibold underline underline-offset-4">{order.orderNumber}</Link>
                          <p className="mt-1 text-[11px] font-medium text-muted-foreground">
                            {order.fulfillmentType.replaceAll("_", " ")}{order.tableName ? ` · ${order.tableName}` : ""}
                          </p>
                        </div>
                        <span className="rounded-lg bg-slate-100 px-2 py-1 text-[11px] font-semibold text-slate-600">
                          {new Intl.DateTimeFormat("en-PK", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Karachi" }).format(order.createdAt)}
                        </span>
                      </div>

                      {linesByOrder.get(order.id)?.length ? (
                        <ul aria-label={`Items for ${order.orderNumber}`} className="divide-y rounded-xl border border-slate-100 bg-slate-50/70 px-3">
                          {linesByOrder.get(order.id)?.map((line, index) => (
                            <li key={index} className="flex items-start justify-between gap-3 py-2.5">
                              <span className="min-w-0 text-sm font-medium text-slate-900">
                                {line.itemName}
                                {line.modifiers.length > 0 && (
                                  <span className="mt-1 block text-xs font-normal text-slate-600">
                                    Options: {line.modifiers.join(" · ")}
                                  </span>
                                )}
                                {line.notes && <span className="mt-0.5 block text-xs font-normal text-amber-800">{line.notes}</span>}
                              </span>
                              <strong className="shrink-0 rounded-lg bg-white px-2 py-1 text-sm tabular-nums text-slate-900">× {line.quantity}</strong>
                            </li>
                          ))}
                        </ul>
                      ) : <p className="text-xs text-amber-800">No item lines found for this ticket.</p>}
                      {order.notes ? <p className="rounded-xl bg-amber-50 p-2.5 text-xs text-amber-900">{order.notes}</p> : null}

                      <div className="flex flex-wrap gap-2">
                        {column.next && (
                          <RestaurantMutationForm action={transitionKitchenOrderAction} workspaceId={workspaceId}>
                            <input type="hidden" name="orderId" value={order.id} />
                            <input type="hidden" name="nextStatus" value={column.next} />
                            <Button type="submit" size="sm" className="rounded-lg bg-emerald-600 hover:bg-emerald-500">{column.action}</Button>
                          </RestaurantMutationForm>
                        )}
                        {column.status === "READY" && <p className="text-xs font-medium text-emerald-800">Ready for cashier to serve or close.</p>}
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
