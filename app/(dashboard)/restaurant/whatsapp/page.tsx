import { MessageCircleMore, ShieldCheck } from "lucide-react";

import { PageHeader } from "@/components/business/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { requireWorkspace } from "@/lib/server/auth";
import { listRestaurantOrders, listWhatsappRestaurantMessages } from "@/lib/server/restaurant-workspace";

export default async function RestaurantWhatsappPage() {
  const { workspaceId } = await requireWorkspace();
  const [messages, orders] = await Promise.all([
    listWhatsappRestaurantMessages(workspaceId, 100),
    listRestaurantOrders(workspaceId, 200, { statuses: ["PENDING_REVIEW"], source: "WHATSAPP", oldestFirst: true }),
  ]);
  const pending = orders.filter((order) => order.source === "WHATSAPP" && order.status === "PENDING_REVIEW");

  return (
    <div className="mx-auto max-w-[1600px] space-y-6">
      <PageHeader title="WhatsApp Orders" description="Incoming WhatsApp orders are staged for staff review before they can enter the kitchen workflow." />
      <Card className="border-emerald-200 bg-emerald-50/50 shadow-none dark:border-emerald-900 dark:bg-emerald-950/20"><CardContent className="flex gap-3 p-4"><ShieldCheck className="mt-0.5 size-5 shrink-0 text-emerald-700" /><div><p className="text-sm font-semibold">Safe intake boundary is ready</p><p className="mt-1 text-xs text-muted-foreground">MunshiOS stores provider messages idempotently and creates only a Pending Review order. No WhatsApp message can finalize a sale, post accounting, or enter kitchen preparation without authenticated staff confirmation.</p><p className="mt-2 text-xs font-medium text-amber-700 dark:text-amber-300">Official WhatsApp Business credentials/webhook connection is not configured by this workspace build and must be connected separately before live intake.</p></div></CardContent></Card>

      <div className="grid gap-5 xl:grid-cols-[1fr_1fr]">
        <Card className="rounded-lg shadow-sm"><CardContent className="p-0"><div className="border-b px-5 py-4"><div className="flex items-center gap-2"><MessageCircleMore className="size-4 text-emerald-600" /><h2 className="font-semibold">Pending WhatsApp orders</h2></div><p className="mt-1 text-xs text-muted-foreground">Review and confirm these from the Restaurant Orders board.</p></div>{pending.length ? <div className="divide-y">{pending.map((order) => <div key={order.id} className="flex items-start justify-between gap-4 p-4"><div><p className="font-medium">{order.orderNumber}</p><p className="text-xs text-muted-foreground">{order.customerName || order.customerPhone || "WhatsApp customer"} · {order.fulfillmentType.replaceAll("_", " ")}</p><p className="mt-1 text-xs text-muted-foreground">{new Intl.DateTimeFormat("en-PK", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Karachi" }).format(order.createdAt)}</p></div><p className="font-semibold">Rs {order.total.toLocaleString()}</p></div>)}</div> : <div className="p-8 text-center text-sm text-muted-foreground">No pending WhatsApp orders.</div>}</CardContent></Card>

        <Card className="rounded-lg shadow-sm"><CardContent className="p-0"><div className="border-b px-5 py-4"><h2 className="font-semibold">Recent inbound messages</h2><p className="mt-1 text-xs text-muted-foreground">Provider message IDs are stored per workspace to prevent duplicate order intake.</p></div>{messages.length ? <div className="max-h-[640px] divide-y overflow-y-auto">{messages.map((message) => <div key={message.id} className="p-4"><div className="flex items-center justify-between gap-3"><p className="text-sm font-medium">{message.customerName || message.customerPhone}</p><span className="text-[11px] text-muted-foreground">{new Intl.DateTimeFormat("en-PK", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Karachi" }).format(message.receivedAt)}</span></div><p className="mt-2 whitespace-pre-wrap rounded-md bg-muted/50 p-3 text-sm">{message.body}</p>{message.restaurantOrderId ? <p className="mt-2 text-xs font-medium text-emerald-700">Order draft created</p> : null}</div>)}</div> : <div className="p-8 text-center text-sm text-muted-foreground">No provider messages received yet.</div>}</CardContent></Card>
      </div>
    </div>
  );
}
