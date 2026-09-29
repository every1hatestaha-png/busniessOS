import Link from "next/link";
import { MessageCircleMore, Plus, ShoppingBag } from "lucide-react";

import {
  confirmRestaurantOrderAction,
  setRestaurantOrderPaymentStatusAction,
  transitionRestaurantOrderAction,
} from "@/app/(dashboard)/restaurant/v1-actions";
import { PageHeader } from "@/components/business/page-header";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { requireWorkspace } from "@/lib/server/auth";
import { cn } from "@/lib/utils";
import { listRestaurantOrders, type RestaurantOrderStatus } from "@/lib/server/restaurant-workspace";

const columns: Array<{ status: RestaurantOrderStatus; label: string }> = [
  { status: "PENDING_REVIEW", label: "Pending review" },
  { status: "CONFIRMED", label: "Confirmed" },
  { status: "PREPARING", label: "Preparing" },
  { status: "READY", label: "Ready" },
];

function primaryNext(status: RestaurantOrderStatus): { label: string; next: RestaurantOrderStatus } | null {
  if (status === "CONFIRMED") return { label: "Start preparing", next: "PREPARING" };
  if (status === "PREPARING") return { label: "Mark ready", next: "READY" };
  if (status === "READY") return { label: "Complete order", next: "COMPLETED" };
  return null;
}

export default async function RestaurantOrdersPage() {
  const { workspaceId } = await requireWorkspace();
  const orders = await listRestaurantOrders(workspaceId, 200);
  const active = orders.filter((order) => !["COMPLETED", "CANCELLED"].includes(order.status));
  const recentClosed = orders.filter((order) => ["COMPLETED", "CANCELLED"].includes(order.status)).slice(0, 30);

  return (
    <div className="mx-auto max-w-[1800px] space-y-6">
      <PageHeader title="Restaurant Orders" description="One operational queue for POS and WhatsApp orders. WhatsApp orders stay pending until staff explicitly confirms them." />
      <div className="flex flex-wrap gap-2">
        <Link href="/restaurant/pos" className={cn(buttonVariants())}><Plus className="mr-1 size-4" />New POS order</Link>
        <Link href="/restaurant/whatsapp" className={cn(buttonVariants({ variant: "outline" }))}><MessageCircleMore className="mr-1 size-4" />WhatsApp inbox</Link>
      </div>

      <div className="grid gap-4 xl:grid-cols-4">
        {columns.map((column) => {
          const matching = active.filter((order) => order.status === column.status);
          return <section key={column.status} className="min-w-0"><div className="mb-2 flex items-center justify-between"><h2 className="text-sm font-semibold">{column.label}</h2><span className="rounded-full bg-muted px-2 py-0.5 text-xs font-semibold">{matching.length}</span></div><div className="space-y-3">{matching.length ? matching.map((order) => <OrderCard key={order.id} order={order} />) : <div className="rounded-lg border border-dashed p-5 text-center text-xs text-muted-foreground">No orders</div>}</div></section>;
        })}
      </div>

      <Card className="rounded-lg shadow-sm"><CardContent className="p-0"><div className="border-b px-5 py-4"><h2 className="font-semibold">Recent completed & cancelled</h2><p className="text-xs text-muted-foreground">Latest terminal orders kept for operational history.</p></div>{recentClosed.length ? <div className="overflow-x-auto"><table className="w-full text-sm"><thead className="bg-muted/40 text-left text-xs text-muted-foreground"><tr><th className="px-4 py-3">Order</th><th className="px-4 py-3">Source</th><th className="px-4 py-3">Type</th><th className="px-4 py-3">Customer</th><th className="px-4 py-3">Total</th><th className="px-4 py-3">Payment</th><th className="px-4 py-3">Status</th></tr></thead><tbody className="divide-y">{recentClosed.map((order) => <tr key={order.id}><td className="px-4 py-3 font-medium">{order.orderNumber}</td><td className="px-4 py-3">{order.source}</td><td className="px-4 py-3 text-muted-foreground">{order.fulfillmentType.replaceAll("_", " ")}</td><td className="px-4 py-3 text-muted-foreground">{order.customerName || order.customerPhone || "Walk-in"}</td><td className="px-4 py-3 font-medium">Rs {order.total.toLocaleString()}</td><td className="px-4 py-3">{order.paymentStatus}</td><td className="px-4 py-3">{order.status}</td></tr>)}</tbody></table></div> : <div className="p-6 text-sm text-muted-foreground">No completed or cancelled restaurant orders yet.</div>}</CardContent></Card>
    </div>
  );
}

function OrderCard({ order }: { order: Awaited<ReturnType<typeof listRestaurantOrders>>[number] }) {
  const next = primaryNext(order.status);
  return <Card className={order.source === "WHATSAPP" ? "rounded-lg border-emerald-300 shadow-sm" : "rounded-lg shadow-sm"}><CardContent className="space-y-3 p-4"><div className="flex items-start justify-between gap-2"><div><div className="flex items-center gap-1.5">{order.source === "WHATSAPP" ? <MessageCircleMore className="size-4 text-emerald-600" /> : <ShoppingBag className="size-4 text-muted-foreground" />}<p className="font-semibold">{order.orderNumber}</p></div><p className="mt-1 text-xs text-muted-foreground">{order.source} · {order.fulfillmentType.replaceAll("_", " ")}{order.tableName ? ` · ${order.tableName}` : ""}</p></div><p className="font-semibold">Rs {order.total.toLocaleString()}</p></div><div className="text-xs text-muted-foreground"><p>{order.customerName || "Walk-in customer"}{order.customerPhone ? ` · ${order.customerPhone}` : ""}</p><p>{new Intl.DateTimeFormat("en-PK", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Karachi" }).format(order.createdAt)}</p>{order.notes ? <p className="mt-1 rounded bg-muted/50 p-2">{order.notes}</p> : null}</div>
    <div className="flex flex-wrap gap-2">
      {order.status === "PENDING_REVIEW" ? <form action={confirmRestaurantOrderAction}><input type="hidden" name="orderId" value={order.id} /><Button size="sm" type="submit">Confirm order</Button></form> : null}
      {next ? <form action={transitionRestaurantOrderAction}><input type="hidden" name="orderId" value={order.id} /><input type="hidden" name="nextStatus" value={next.next} /><Button size="sm" type="submit">{next.label}</Button></form> : null}
      {!["COMPLETED", "CANCELLED"].includes(order.status) ? <form action={transitionRestaurantOrderAction}><input type="hidden" name="orderId" value={order.id} /><input type="hidden" name="nextStatus" value="CANCELLED" /><Button size="sm" variant="outline" type="submit">Cancel</Button></form> : null}
    </div>
    <form action={setRestaurantOrderPaymentStatusAction} className="flex items-center gap-2 border-t pt-3"><span className="text-xs text-muted-foreground">Payment</span><input type="hidden" name="orderId" value={order.id} /><select name="paymentStatus" defaultValue={order.paymentStatus} className="h-8 min-w-0 flex-1 rounded-md border bg-background px-2 text-xs"><option value="UNPAID">Unpaid</option><option value="PARTIALLY_PAID">Partially paid</option><option value="PAID">Paid</option></select><Button type="submit" size="sm" variant="outline">Save</Button></form>
  </CardContent></Card>;
}
