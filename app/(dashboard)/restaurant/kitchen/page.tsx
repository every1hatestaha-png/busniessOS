import Link from "next/link";
import { CheckCircle2, Clock3, CookingPot, Flame } from "lucide-react";

import { RestaurantMutationForm } from "@/app/(dashboard)/restaurant/mutation-form";
import { KitchenQueueRefresh } from "@/app/(dashboard)/restaurant/kitchen/kitchen-queue-refresh";
import { transitionKitchenOrderAction } from "@/app/(dashboard)/restaurant/v1-actions";
import { assertRestaurantStation } from "@/lib/server/restaurant-stations";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { requireWorkspace } from "@/lib/server/auth";
import { listRestaurantKitchenOrderLines } from "@/lib/server/restaurant-workspace";
import { listKitchenOrders } from "@/lib/server/restaurant-kitchen-orders";
import { listKitchenInstructionUpdateTimes } from "@/lib/server/restaurant-kitchen-instruction-alerts";
import { isRestaurantManager } from "@/lib/restaurant/station-policy";
import { KITCHEN_TICKET_BATCH_LIMIT, kitchenVisibleCount } from "@/lib/restaurant/kitchen-queue";
import { kitchenDelayedCount, kitchenTicketAge } from "@/lib/restaurant/ticket-age";
import { cn } from "@/lib/utils";

const kitchenColumns = [
  { status: "CONFIRMED", label: "New", icon: Clock3, next: "PREPARING", action: "Start preparing", tone: "blue" },
  { status: "PREPARING", label: "Preparing", icon: CookingPot, next: "READY", action: "Mark ready", tone: "amber" },
  { status: "READY", label: "Ready", icon: CheckCircle2, next: null, action: null, tone: "emerald" },
] as const;

export default async function RestaurantKitchenPage() {
  const { workspaceId, workspace, role, user } = await requireWorkspace();
  await assertRestaurantStation({ workspaceId, role, userId: user.id }, "KITCHEN");
  // Dedicated price-free Kitchen read model. Each status has an independent
  // bounded FIFO slice so old READY work cannot hide new tickets.
  const [newOrders, preparingOrders, readyOrders] = await Promise.all([
    listKitchenOrders(workspaceId, "CONFIRMED", KITCHEN_TICKET_BATCH_LIMIT),
    listKitchenOrders(workspaceId, "PREPARING", KITCHEN_TICKET_BATCH_LIMIT),
    listKitchenOrders(workspaceId, "READY", KITCHEN_TICKET_BATCH_LIMIT),
  ]);
  const orders = [...newOrders, ...preparingOrders, ...readyOrders];
  const [lines, updatedInstructionTimes] = await Promise.all([
    listRestaurantKitchenOrderLines(workspaceId, orders.map((order) => order.id)),
    listKitchenInstructionUpdateTimes(workspaceId, orders.map((order) => order.id)),
  ]);
  const linesByOrder = new Map<string, typeof lines>();
  for (const line of lines) {
    const existing = linesByOrder.get(line.orderId) ?? [];
    existing.push(line);
    linesByOrder.set(line.orderId, existing);
  }

  const counts = {
    CONFIRMED: kitchenVisibleCount(newOrders.length),
    PREPARING: kitchenVisibleCount(preparingOrders.length),
    READY: kitchenVisibleCount(readyOrders.length),
  };
  const restaurantTimezone = workspace.timezone || "Asia/Karachi";
  const queueCheckedAt = new Date();
  const delayedCount = kitchenDelayedCount([...newOrders, ...preparingOrders], queueCheckedAt);

  return (
    <div className="mx-auto max-w-[1560px] space-y-5">
      <section className="flex flex-col gap-4 rounded-[28px] border border-slate-200 bg-white p-5 shadow-[0_16px_50px_-40px_rgba(15,23,42,0.3)] sm:flex-row sm:items-center sm:justify-between sm:p-7">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-emerald-700">Kitchen display</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-[-0.04em]">{workspace.name} Kitchen</h1>
          <p className="mt-2 text-sm text-muted-foreground">Live preparation queue. Tickets refresh every 5 seconds while visible. No payment or sales information.</p>
        </div>
        <div className="flex flex-col items-start gap-2 sm:items-end">
          <KitchenQueueRefresh />
          {isRestaurantManager(role) && <Link href="/restaurant" className="text-xs font-semibold text-emerald-700 hover:underline">Switch station</Link>}
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KitchenMetric label="New" value={counts.CONFIRMED} tone="blue" />
        <KitchenMetric label="Preparing" value={counts.PREPARING} tone="amber" />
        <KitchenMetric label="Ready" value={counts.READY} tone="emerald" />
        <div className="rounded-[22px] border border-amber-200 bg-amber-50 p-4" role="status">
          <p className="text-xs font-medium text-amber-900">20+ min old, still in progress</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-amber-950">{delayedCount}</p>
          <p className="mt-2 text-[11px] leading-5 text-amber-800">Within the displayed queue only. Age starts when the order was placed.</p>
        </div>
      </section>

      {[["New", newOrders.length], ["Preparing", preparingOrders.length], ["Ready", readyOrders.length]]
        .filter(([, count]) => count === KITCHEN_TICKET_BATCH_LIMIT)
        .map(([label]) => (
          <p key={label} className="text-sm text-amber-700">
            {label} queue has at least {KITCHEN_TICKET_BATCH_LIMIT} tickets. Showing the oldest first; move tickets through the workflow to reveal the remaining backlog.
          </p>
        ))}

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
            <section key={column.status} className="min-w-0 rounded-[26px] border border-slate-200 bg-slate-50/80 p-3 sm:p-4">
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
                  <Card key={order.id} className={cn("rounded-[22px] border bg-white shadow-[0_9px_25px_-20px_rgba(15,23,42,0.32)]", column.status === "READY" && "border-emerald-300", order.notes?.trim().toUpperCase().startsWith("RUSH:") && "border-l-4 border-l-amber-500")}>
                    <CardContent className="space-y-3 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <Link href={`/restaurant/orders/${order.id}/print?kind=kot`} className="text-base font-semibold tracking-tight text-slate-950 underline decoration-slate-300 underline-offset-4 hover:decoration-emerald-600">{order.orderNumber}</Link>
                          {order.notes?.trim().toUpperCase().startsWith("RUSH:") && <span className="mt-2 flex w-fit items-center gap-1 rounded-lg bg-amber-100 px-2 py-1 text-[11px] font-bold text-amber-900"><Flame className="size-3" /> Rush requested</span>}
                          <p className="mt-1 text-[11px] font-medium text-muted-foreground">
                            {order.fulfillmentType.replaceAll("_", " ")}{order.tableName ? ` · ${order.tableName}` : ""}
                          </p>
                        </div>
                        <div className="flex shrink-0 flex-col items-end gap-2">
                          <span className="rounded-lg bg-slate-100 px-2 py-1 text-[11px] font-semibold text-slate-600">
                            {new Intl.DateTimeFormat("en-PK", { hour: "numeric", minute: "2-digit", timeZone: restaurantTimezone }).format(order.createdAt)}
                          </span>
                          {(() => {
                            const age = kitchenTicketAge(order.createdAt, queueCheckedAt);
                            return <span aria-label={age.label} className={cn(
                              "rounded-full px-2.5 py-1 text-[11px] font-semibold tabular-nums",
                              age.tone === "delayed" ? "bg-red-100 text-red-900" : age.tone === "watch" ? "bg-amber-100 text-amber-900" : "bg-emerald-50 text-emerald-800",
                            )}>{age.label}</span>;
                          })()}
                        </div>
                      </div>

                      {linesByOrder.get(order.id)?.length ? (
                        <ul aria-label={`Items for ${order.orderNumber}`} className="divide-y rounded-xl border border-slate-100 bg-slate-50/70 px-3">
                          {linesByOrder.get(order.id)?.map((line, index) => (
                            <li key={index} className="flex items-start justify-between gap-3 py-2.5">
                              <span className="min-w-0 text-sm font-medium text-slate-900">
                                {line.itemName}
                                {line.categoryName ? <span className="mt-1 block w-fit rounded-md bg-slate-200 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-700">{line.categoryName}</span> : null}
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
                      {updatedInstructionTimes.has(order.id) ? (
                        <div role="status" className="rounded-xl border-2 border-amber-400 bg-amber-50 px-3 py-2.5">
                          <p className="text-xs font-bold uppercase tracking-wide text-amber-950">Kitchen instructions updated</p>
                          <p className="mt-1 text-xs text-amber-900">
                            Manager correction at {new Intl.DateTimeFormat("en-PK", {
                              hour: "numeric", minute: "2-digit", timeZone: restaurantTimezone,
                            }).format(updatedInstructionTimes.get(order.id)!)}.
                            Check the current instructions before continuing.
                          </p>
                        </div>
                      ) : null}
                      {order.notes ? <p className="rounded-xl bg-amber-50 p-2.5 text-xs font-medium text-amber-900">{order.notes}</p> : null}

                      <div className="flex flex-wrap gap-2">
                        {column.next && (
                          <RestaurantMutationForm action={transitionKitchenOrderAction} workspaceId={workspaceId}>
                            <input type="hidden" name="orderId" value={order.id} />
                            <input type="hidden" name="nextStatus" value={column.next} />
                            <Button type="submit" size="sm" className="min-h-11 w-full rounded-xl bg-emerald-600 font-semibold hover:bg-emerald-500 sm:w-auto">{column.action}</Button>
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

function KitchenMetric({ label, value, tone }: { label: string; value: string; tone: "blue" | "amber" | "emerald" }) {
  const toneClass = tone === "amber" ? "bg-amber-100 text-amber-800" : tone === "blue" ? "bg-blue-100 text-blue-800" : "bg-emerald-100 text-emerald-800";
  return (
    <Card className="rounded-[22px] border border-slate-200 bg-white shadow-sm">
      <CardContent className="flex items-center justify-between p-4">
        <div><p className="text-xs font-medium text-muted-foreground">{label}</p><p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p></div>
        <span className={cn("rounded-xl px-3 py-2 text-xs font-semibold", toneClass)}>Live</span>
      </CardContent>
    </Card>
  );
}
