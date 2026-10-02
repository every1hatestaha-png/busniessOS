import Link from "next/link";
import { RestaurantMutationForm } from "@/app/(dashboard)/restaurant/mutation-form";
import { Clock3, CookingPot, CheckCircle2 } from "lucide-react";

import { transitionRestaurantOrderAction } from "@/app/(dashboard)/restaurant/v1-actions";
import { PageHeader } from "@/components/business/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { requireWorkspace } from "@/lib/server/auth";
import { listRestaurantOrders } from "@/lib/server/restaurant-workspace";

const kitchenColumns = [
  { status: "CONFIRMED", label: "New", icon: Clock3, next: "PREPARING", action: "Start preparing" },
  { status: "PREPARING", label: "Preparing", icon: CookingPot, next: "READY", action: "Mark ready" },
  { status: "READY", label: "Ready", icon: CheckCircle2, next: "COMPLETED", action: "Complete" },
] as const;

export default async function RestaurantKitchenPage() {
  const { workspaceId } = await requireWorkspace();
  const orders = await listRestaurantOrders(workspaceId, 200);
  return (
    <div className="mx-auto max-w-[1800px] space-y-6">
      <PageHeader title="Kitchen Board" description="Live preparation queue for confirmed restaurant orders. Status changes are tenant-scoped and audited." />
      <div className="grid gap-4 lg:grid-cols-3">
        {kitchenColumns.map((column) => {
          const matching = orders.filter((order) => order.status === column.status);
          const Icon = column.icon;
          return <section key={column.status}><div className="mb-3 flex items-center justify-between"><div className="flex items-center gap-2"><Icon className="size-4 text-emerald-600" /><h2 className="font-semibold">{column.label}</h2></div><span className="rounded-full bg-muted px-2 py-0.5 text-xs font-semibold">{matching.length}</span></div><div className="space-y-3">{matching.length ? matching.map((order) => <Card key={order.id} className="rounded-lg shadow-sm"><CardContent className="space-y-3 p-4"><div className="flex justify-between gap-3"><div><Link href={`/restaurant/orders/${order.id}/print?kind=kot`} className="font-semibold underline">{order.orderNumber}</Link><p className="text-xs text-muted-foreground">{order.source} · {order.fulfillmentType.replaceAll("_", " ")}{order.tableName ? ` · ${order.tableName}` : ""}</p></div><span className="text-xs text-muted-foreground">{new Intl.DateTimeFormat("en-PK", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Karachi" }).format(order.createdAt)}</span></div>{order.notes ? <p className="rounded-md bg-amber-50 p-2 text-xs text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">{order.notes}</p> : null}<div className="flex gap-2"><RestaurantMutationForm action={transitionRestaurantOrderAction} workspaceId={workspaceId}><input type="hidden" name="orderId" value={order.id} /><input type="hidden" name="nextStatus" value={column.next} /><Button type="submit" size="sm">{column.action}</Button></RestaurantMutationForm><RestaurantMutationForm action={transitionRestaurantOrderAction} workspaceId={workspaceId}><input type="hidden" name="orderId" value={order.id} /><input type="hidden" name="nextStatus" value="CANCELLED" /><Button type="submit" size="sm" variant="outline">Cancel</Button></RestaurantMutationForm></div></CardContent></Card>) : <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">Queue clear</div>}</div></section>;
        })}
      </div>
    </div>
  );
}
