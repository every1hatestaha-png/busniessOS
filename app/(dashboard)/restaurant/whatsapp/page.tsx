import Link from "next/link";
import { Clock3, MessageCircleMore, ShieldCheck, ShoppingBag, Sparkles } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { requireWorkspace } from "@/lib/server/auth";
import { listRestaurantOrders, listWhatsappRestaurantMessages } from "@/lib/server/restaurant-workspace";

export default async function RestaurantWhatsappPage() {
  const { workspaceId, workspace } = await requireWorkspace();
  const [messages, orders] = await Promise.all([
    listWhatsappRestaurantMessages(workspaceId, 100),
    listRestaurantOrders(workspaceId, 200, { statuses: ["PENDING_REVIEW"], source: "WHATSAPP", oldestFirst: true }),
  ]);
  const pending = orders.filter((order) => order.source === "WHATSAPP" && order.status === "PENDING_REVIEW");

  return (
    <div className="mx-auto max-w-[1600px] space-y-5">
      <section className="flex flex-col gap-4 rounded-2xl border bg-white p-4 shadow-none sm:p-5 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-emerald-700">WhatsApp review inbox</p>
          <h1 className="mt-1 text-xl font-semibold tracking-tight">{workspace.name} saved messages</h1>
          <p className="mt-1 text-sm text-muted-foreground">Review saved customer messages and convert approved requests into the live order workflow.</p>
        </div>
        <div className="flex gap-2">
          <MiniStat icon={ShoppingBag} label="Awaiting review" value={pending.length} />
          <MiniStat icon={MessageCircleMore} label="Saved messages" value={messages.length} />
        </div>
      </section>

      <Card className="rounded-2xl border-emerald-200 bg-emerald-50/60 shadow-none">
        <CardContent className="flex gap-3 p-4">
          <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-emerald-100 text-emerald-700"><ShieldCheck className="size-4" /></span>
          <div>
            <p className="text-sm font-semibold text-emerald-950">Automatic WhatsApp intake is not enabled yet</p>
            <p className="mt-1 max-w-3xl text-xs leading-5 text-emerald-900/70">This release safely displays previously saved messages and staff-review orders. It does not claim to receive new WhatsApp messages automatically.</p>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-5 xl:grid-cols-[.9fr_1.1fr]">
        <Card className="overflow-hidden rounded-2xl border shadow-none">
          <CardContent className="p-0">
            <div className="border-b px-4 py-4 sm:px-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2"><ShoppingBag className="size-4 text-emerald-600" /><h2 className="font-semibold">Orders awaiting review</h2></div>
                  <p className="mt-1 text-xs text-muted-foreground">Confirm these from the Restaurant Orders board.</p>
                </div>
                <Link href="/restaurant/orders" className="text-xs font-semibold text-emerald-700 hover:underline">Open orders</Link>
              </div>
            </div>

            {pending.length ? (
              <div className="divide-y">
                {pending.map((order) => (
                  <div key={order.id} className="p-4 sm:p-5">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2"><span className="size-2 rounded-full bg-amber-500" /><p className="font-semibold">{order.orderNumber}</p></div>
                        <p className="mt-1 truncate text-xs text-muted-foreground">{order.customerName || order.customerPhone || "WhatsApp customer"} · {order.fulfillmentType.replaceAll("_", " ")}</p>
                        <div className="mt-2 flex items-center gap-1.5 text-[11px] text-muted-foreground"><Clock3 className="size-3" />{new Intl.DateTimeFormat("en-PK", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Karachi" }).format(order.createdAt)}</div>
                      </div>
                      <div className="text-right"><p className="font-semibold">Rs {order.total.toLocaleString()}</p><span className="mt-1 inline-block rounded-full bg-amber-50 px-2 py-1 text-[10px] font-semibold text-amber-700">Needs review</span></div>
                    </div>
                  </div>
                ))}
              </div>
            ) : <div className="p-10 text-center"><Sparkles className="mx-auto size-5 text-emerald-500" /><p className="mt-2 text-sm font-medium">Review queue clear</p><p className="mt-1 text-xs text-muted-foreground">No saved WhatsApp orders need staff attention.</p></div>}
          </CardContent>
        </Card>

        <Card className="overflow-hidden rounded-2xl border shadow-none">
          <CardContent className="p-0">
            <div className="border-b px-4 py-4 sm:px-5"><h2 className="font-semibold">Saved conversations</h2><p className="mt-1 text-xs text-muted-foreground">Most recent saved customer messages in this workspace.</p></div>
            {messages.length ? (
              <div className="max-h-[680px] divide-y overflow-y-auto">
                {messages.map((message) => (
                  <div key={message.id} className="p-4 sm:p-5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-3">
                        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-emerald-100 text-emerald-700"><MessageCircleMore className="size-4" /></span>
                        <div className="min-w-0"><p className="truncate text-sm font-semibold">{message.customerName || message.customerPhone}</p><p className="truncate text-[11px] text-muted-foreground">{message.customerPhone}</p></div>
                      </div>
                      <span className="shrink-0 text-[10px] text-muted-foreground">{new Intl.DateTimeFormat("en-PK", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "Asia/Karachi" }).format(message.receivedAt)}</span>
                    </div>
                    <div className="ml-12 mt-2 max-w-[88%] rounded-2xl rounded-tl-md bg-slate-100 px-3.5 py-3 text-sm leading-5 text-slate-700">{message.body}</div>
                    {message.restaurantOrderId ? <div className="ml-12 mt-2"><span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-semibold text-emerald-700">Order draft created</span></div> : null}
                  </div>
                ))}
              </div>
            ) : <div className="p-10 text-center text-sm text-muted-foreground">No saved messages.</div>}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function MiniStat({ icon: Icon, label, value }: { icon: typeof MessageCircleMore; label: string; value: number }) {
  return <div className="min-w-[130px] rounded-xl border bg-slate-50 px-3 py-2.5"><Icon className="size-4 text-emerald-600" /><p className="mt-2 text-lg font-semibold tabular-nums">{value}</p><p className="text-[10px] font-medium text-muted-foreground">{label}</p></div>;
}
