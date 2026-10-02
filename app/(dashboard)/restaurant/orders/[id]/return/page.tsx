import { RestaurantMutationForm } from "@/app/(dashboard)/restaurant/mutation-form";
import { randomUUID } from "node:crypto";
import Link from "next/link";
import { ArrowLeft, RotateCcw, Undo2 } from "lucide-react";

import { reverseRestaurantReturnAction } from "@/app/(dashboard)/restaurant/orders/[id]/return/reversal-actions";
import { createRestaurantItemReturnAction } from "@/app/(dashboard)/restaurant/v1-actions";
import { PageHeader } from "@/components/business/page-header";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { requireWorkspace } from "@/lib/server/auth";
import { listRestaurantReturnReversalState } from "@/lib/server/restaurant-return-reversal-ui";
import { getRestaurantReturnUiState } from "@/lib/server/restaurant-return-ui";
import { cn } from "@/lib/utils";

export default async function RestaurantOrderReturnPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { workspaceId, role } = await requireWorkspace();
  const canReturn = role === "OWNER" || role === "ADMIN" || role === "MANAGER";
  const [state, reversalState] = await Promise.all([
    getRestaurantReturnUiState(workspaceId, id),
    listRestaurantReturnReversalState(workspaceId, id),
  ]);
  const reversalById = new Map(reversalState.map((row) => [row.id, row]));

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <Link href="/restaurant/orders" className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
          <ArrowLeft className="mr-1 size-4" />Back to orders
        </Link>
      </div>

      <PageHeader
        title={`Return ${state.order.orderNumber}`}
        description="Return completed-order items through the original posted payments. Refund amount, tax, discount, cash account, inventory and COGS are recalculated and verified on the server."
      />

      <Card className="rounded-lg shadow-sm">
        <CardContent className="grid gap-3 p-5 sm:grid-cols-4">
          <div><p className="text-xs text-muted-foreground">Status</p><p className="font-semibold">{state.order.status}</p></div>
          <div><p className="text-xs text-muted-foreground">Subtotal</p><p className="font-semibold">Rs {state.order.subtotal.toLocaleString()}</p></div>
          <div><p className="text-xs text-muted-foreground">Discount / Tax</p><p className="font-semibold">Rs {state.order.discountAmount.toLocaleString()} / Rs {state.order.taxAmount.toLocaleString()}</p></div>
          <div><p className="text-xs text-muted-foreground">Original total</p><p className="font-semibold">Rs {state.order.total.toLocaleString()}</p></div>
        </CardContent>
      </Card>

      {!canReturn ? (
        <Card className="rounded-lg border-amber-200 shadow-sm"><CardContent className="p-5 text-sm">Manager access is required to create restaurant returns.</CardContent></Card>
      ) : state.order.status !== "COMPLETED" ? (
        <Card className="rounded-lg border-amber-200 shadow-sm"><CardContent className="p-5 text-sm">Only completed restaurant orders can be returned.</CardContent></Card>
      ) : (
        <section className="space-y-3">
          <div><h2 className="font-semibold">Returnable items</h2><p className="text-xs text-muted-foreground">Submit one item line at a time. Prepared food should normally remain unchecked for restocking. Restock only when the physical stock can genuinely be put back.</p></div>
          {state.items.map((item) => (
            <Card key={item.id} className="rounded-lg shadow-sm">
              <CardContent className="p-5">
                <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                  <div><p className="font-semibold">{item.itemName}</p><p className="text-xs text-muted-foreground">Original {item.quantity.toLocaleString()} · Already returned {item.returnedQuantity.toLocaleString()} · Remaining {item.remainingQuantity.toLocaleString()}</p></div>
                  <p className="font-semibold">Rs {item.lineTotal.toLocaleString()}</p>
                </div>
                {item.remainingQuantity > 0 ? (
                  <RestaurantMutationForm action={createRestaurantItemReturnAction} workspaceId={workspaceId} className="grid gap-3 md:grid-cols-[160px_1fr_auto] md:items-end">
                    <input type="hidden" name="orderId" value={state.order.id} />
                    <input type="hidden" name="orderItemId" value={item.id} />
                    <input type="hidden" name="returnRequestId" value={`rr:${randomUUID()}`} />
                    <label className="grid gap-1 text-xs font-medium">Quantity
                      <input name="returnQuantity" type="number" min="0.0001" max={item.remainingQuantity} step="0.0001" defaultValue={item.remainingQuantity} required className="h-9 rounded-md border bg-background px-3 text-sm" />
                    </label>
                    <label className="grid gap-1 text-xs font-medium">Reason
                      <input name="reason" minLength={3} maxLength={500} required placeholder="Customer return reason" className="h-9 rounded-md border bg-background px-3 text-sm" />
                    </label>
                    <Button type="submit"><RotateCcw className="mr-1 size-4" />Create return</Button>
                    <label className="flex items-center gap-2 text-xs text-muted-foreground md:col-span-3">
                      <input type="checkbox" name="restock" value="true" />Restock physical inventory and reverse COGS using the historical consumption snapshot
                    </label>
                  </RestaurantMutationForm>
                ) : <p className="text-sm text-muted-foreground">This item has been fully returned.</p>}
              </CardContent>
            </Card>
          ))}
        </section>
      )}

      <Card className="rounded-lg shadow-sm">
        <CardContent className="p-0">
          <div className="border-b px-5 py-4"><h2 className="font-semibold">Return history</h2><p className="text-xs text-muted-foreground">Original returns remain immutable. Reversals are posted as separate compensating documents.</p></div>
          {state.returns.length ? <div className="divide-y">{state.returns.map((entry) => {
            const metadata = reversalById.get(entry.id);
            const isReversal = metadata?.isReversal === true;
            const hasReversal = metadata?.hasReversal === true;
            return <div key={entry.id} className="grid gap-3 px-5 py-4 sm:grid-cols-[1fr_auto]"><div><div className="flex flex-wrap items-center gap-2"><p className="font-medium">{entry.returnNumber}</p>{isReversal ? <span className="rounded bg-muted px-2 py-0.5 text-[11px] font-semibold">REVERSAL</span> : hasReversal ? <span className="rounded bg-muted px-2 py-0.5 text-[11px] font-semibold">REVERSED</span> : null}</div><p className="text-xs text-muted-foreground">{entry.reason}</p><p className="text-xs text-muted-foreground">{new Intl.DateTimeFormat("en-PK", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Karachi" }).format(entry.createdAt)}</p>{metadata?.reversalReason ? <p className="mt-1 text-xs text-muted-foreground">Reversal reason: {metadata.reversalReason}</p> : null}</div><div className="space-y-2 text-right"><div><p className="font-semibold">Rs {entry.total.toLocaleString()}</p><p className="text-xs text-muted-foreground">Inventory effect Rs {entry.inventoryCost.toLocaleString()}</p></div>{canReturn && !isReversal && !hasReversal ? <RestaurantMutationForm action={reverseRestaurantReturnAction} workspaceId={workspaceId} className="flex flex-wrap justify-end gap-2"><input type="hidden" name="orderId" value={state.order.id} /><input type="hidden" name="returnId" value={entry.id} /><input name="reason" minLength={3} maxLength={500} required placeholder="Reversal reason" className="h-8 w-44 rounded-md border bg-background px-2 text-xs" /><Button type="submit" size="sm" variant="outline"><Undo2 className="mr-1 size-3.5" />Reverse return</Button></RestaurantMutationForm> : null}</div></div>;
          })}</div> : <div className="p-5 text-sm text-muted-foreground">No item returns posted yet.</div>}
        </CardContent>
      </Card>
    </div>
  );
}
