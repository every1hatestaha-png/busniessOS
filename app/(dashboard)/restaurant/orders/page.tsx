import { randomUUID } from "node:crypto";
import Link from "next/link";
import { MessageCircleMore, Plus, RotateCcw, ShoppingBag } from "lucide-react";

import {
  confirmRestaurantOrderAction,
  recordRestaurantPaymentAction,
  transitionRestaurantOrderAction,
  voidRestaurantPaymentAction,
} from "@/app/(dashboard)/restaurant/v1-actions";
import { PageHeader } from "@/components/business/page-header";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { getCashBankAccounts } from "@/lib/server/accounting";
import { requireWorkspace } from "@/lib/server/auth";
import { listRestaurantPayments, type RestaurantPaymentRecord } from "@/lib/server/restaurant-integrity";
import { listRestaurantNetPaymentSummaries } from "@/lib/server/restaurant-payment-summary";
import { listRestaurantOrders, type RestaurantOrderStatus } from "@/lib/server/restaurant-workspace";
import { cn } from "@/lib/utils";

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

type PaymentSummary = Awaited<ReturnType<typeof listRestaurantNetPaymentSummaries>>[number];

export default async function RestaurantOrdersPage() {
  const { workspaceId, role } = await requireWorkspace();
  const orders = await listRestaurantOrders(workspaceId, 200);
  const visibleOrderIds = orders.map((order) => order.id);
  const [cashAccounts, payments, paymentSummaries] = await Promise.all([
    getCashBankAccounts(workspaceId),
    listRestaurantPayments(workspaceId, visibleOrderIds),
    listRestaurantNetPaymentSummaries(workspaceId, visibleOrderIds),
  ]);
  const active = orders.filter((order) => !["COMPLETED", "CANCELLED"].includes(order.status));
  const recentClosed = orders.filter((order) => ["COMPLETED", "CANCELLED"].includes(order.status)).slice(0, 30);
  const canManageFinancialActions = role === "OWNER" || role === "ADMIN" || role === "MANAGER";
  const paymentsByOrder = new Map<string, RestaurantPaymentRecord[]>();
  for (const payment of payments) {
    const group = paymentsByOrder.get(payment.restaurantOrderId) ?? [];
    group.push(payment);
    paymentsByOrder.set(payment.restaurantOrderId, group);
  }
  const paymentSummaryByOrder = new Map(paymentSummaries.map((summary) => [summary.restaurantOrderId, summary]));
  const completedOutstanding = recentClosed.filter((order) => order.status === "COMPLETED" && (paymentSummaryByOrder.get(order.id)?.outstanding ?? order.total) > 0);

  return (
    <div className="mx-auto max-w-[1800px] space-y-6">
      <PageHeader title="Restaurant Orders" description="One operational queue for POS and WhatsApp orders. Payments are recorded against real cash or bank accounts and completion posts stock and accounting atomically." />
      <div className="flex flex-wrap gap-2">
        <Link href="/restaurant/pos" className={cn(buttonVariants())}><Plus className="mr-1 size-4" />New POS order</Link>
        <Link href="/restaurant/whatsapp" className={cn(buttonVariants({ variant: "outline" }))}><MessageCircleMore className="mr-1 size-4" />WhatsApp inbox</Link>
      </div>

      <div className="grid gap-4 xl:grid-cols-4">
        {columns.map((column) => {
          const matching = active.filter((order) => order.status === column.status);
          return <section key={column.status} className="min-w-0"><div className="mb-2 flex items-center justify-between"><h2 className="text-sm font-semibold">{column.label}</h2><span className="rounded-full bg-muted px-2 py-0.5 text-xs font-semibold">{matching.length}</span></div><div className="space-y-3">{matching.length ? matching.map((order) => <OrderCard key={order.id} order={order} cashAccounts={cashAccounts} payments={paymentsByOrder.get(order.id) ?? []} paymentSummary={paymentSummaryByOrder.get(order.id)} canVoidPayments={canManageFinancialActions} />) : <div className="rounded-lg border border-dashed p-5 text-center text-xs text-muted-foreground">No orders</div>}</div></section>;
        })}
      </div>

      {completedOutstanding.length ? <Card className="rounded-lg border-amber-200 shadow-sm"><CardContent className="space-y-4 p-5"><div><h2 className="font-semibold">Completed orders awaiting payment</h2><p className="text-xs text-muted-foreground">Net due already reflects posted item returns.</p></div><div className="grid gap-3 lg:grid-cols-2">{completedOutstanding.map((order) => <div key={order.id} className="rounded-lg border p-4"><div className="mb-3 flex justify-between gap-3"><div><p className="font-semibold">{order.orderNumber}</p><p className="text-xs text-muted-foreground">{order.customerName || order.customerPhone || "Walk-in customer"}</p></div><p className="font-semibold">Net Rs {(paymentSummaryByOrder.get(order.id)?.adjustedDue ?? order.total).toLocaleString()}</p></div><PaymentPanel orderId={order.id} paymentStatus={order.paymentStatus} cashAccounts={cashAccounts} payments={paymentsByOrder.get(order.id) ?? []} paymentSummary={paymentSummaryByOrder.get(order.id)} canVoidPayments={canManageFinancialActions} /></div>)}</div></CardContent></Card> : null}

      <Card className="rounded-lg shadow-sm"><CardContent className="p-0"><div className="border-b px-5 py-4"><h2 className="font-semibold">Recent completed & cancelled</h2><p className="text-xs text-muted-foreground">Latest terminal orders kept for operational and financial history.</p></div>{recentClosed.length ? <div className="overflow-x-auto"><table className="w-full text-sm"><thead className="bg-muted/40 text-left text-xs text-muted-foreground"><tr><th className="px-4 py-3">Order</th><th className="px-4 py-3">Source</th><th className="px-4 py-3">Type</th><th className="px-4 py-3">Customer</th><th className="px-4 py-3">Net total</th><th className="px-4 py-3">Payment</th><th className="px-4 py-3">Status</th>{canManageFinancialActions ? <th className="px-4 py-3">Action</th> : null}</tr></thead><tbody className="divide-y">{recentClosed.map((order) => <tr key={order.id}><td className="px-4 py-3 font-medium">{order.orderNumber}</td><td className="px-4 py-3">{order.source}</td><td className="px-4 py-3 text-muted-foreground">{order.fulfillmentType.replaceAll("_", " ")}</td><td className="px-4 py-3 text-muted-foreground">{order.customerName || order.customerPhone || "Walk-in"}</td><td className="px-4 py-3 font-medium">Rs {(paymentSummaryByOrder.get(order.id)?.adjustedDue ?? order.total).toLocaleString()}</td><td className="px-4 py-3">{order.paymentStatus}</td><td className="px-4 py-3">{order.status}</td>{canManageFinancialActions ? <td className="px-4 py-3">{order.status === "COMPLETED" ? <Link href={`/restaurant/orders/${order.id}/return`} className={cn(buttonVariants({ variant: "outline", size: "sm" }))}><RotateCcw className="mr-1 size-3.5" />Return items</Link> : null}</td> : null}</tr>)}</tbody></table></div> : <div className="p-6 text-sm text-muted-foreground">No completed or cancelled restaurant orders yet.</div>}</CardContent></Card>
    </div>
  );
}

function OrderCard({
  order,
  cashAccounts,
  payments,
  paymentSummary,
  canVoidPayments,
}: {
  order: Awaited<ReturnType<typeof listRestaurantOrders>>[number];
  cashAccounts: Awaited<ReturnType<typeof getCashBankAccounts>>;
  payments: RestaurantPaymentRecord[];
  paymentSummary?: PaymentSummary;
  canVoidPayments: boolean;
}) {
  const next = primaryNext(order.status);
  return <Card className={order.source === "WHATSAPP" ? "rounded-lg border-emerald-300 shadow-sm" : "rounded-lg shadow-sm"}><CardContent className="space-y-3 p-4"><div className="flex items-start justify-between gap-2"><div><div className="flex items-center gap-1.5">{order.source === "WHATSAPP" ? <MessageCircleMore className="size-4 text-emerald-600" /> : <ShoppingBag className="size-4 text-muted-foreground" />}<p className="font-semibold">{order.orderNumber}</p></div><p className="mt-1 text-xs text-muted-foreground">{order.source} · {order.fulfillmentType.replaceAll("_", " ")}{order.tableName ? ` · ${order.tableName}` : ""}</p></div><p className="font-semibold">Rs {(paymentSummary?.adjustedDue ?? order.total).toLocaleString()}</p></div><div className="text-xs text-muted-foreground"><p>{order.customerName || "Walk-in customer"}{order.customerPhone ? ` · ${order.customerPhone}` : ""}</p><p>{new Intl.DateTimeFormat("en-PK", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Karachi" }).format(order.createdAt)}</p>{order.notes ? <p className="mt-1 rounded bg-muted/50 p-2">{order.notes}</p> : null}</div>
    <div className="flex flex-wrap gap-2">
      {order.status === "PENDING_REVIEW" ? <form action={confirmRestaurantOrderAction}><input type="hidden" name="orderId" value={order.id} /><Button size="sm" type="submit">Confirm order</Button></form> : null}
      {next ? <form action={transitionRestaurantOrderAction}><input type="hidden" name="orderId" value={order.id} /><input type="hidden" name="nextStatus" value={next.next} /><Button size="sm" type="submit">{next.label}</Button></form> : null}
      {!["COMPLETED", "CANCELLED"].includes(order.status) ? <form action={transitionRestaurantOrderAction}><input type="hidden" name="orderId" value={order.id} /><input type="hidden" name="nextStatus" value="CANCELLED" /><Button size="sm" variant="outline" type="submit">Cancel</Button></form> : null}
    </div>
    <PaymentPanel orderId={order.id} paymentStatus={order.paymentStatus} cashAccounts={cashAccounts} payments={payments} paymentSummary={paymentSummary} canVoidPayments={canVoidPayments} />
  </CardContent></Card>;
}

function PaymentPanel({
  orderId,
  paymentStatus,
  cashAccounts,
  payments,
  paymentSummary,
  canVoidPayments,
}: {
  orderId: string;
  paymentStatus: string;
  cashAccounts: Awaited<ReturnType<typeof getCashBankAccounts>>;
  payments: RestaurantPaymentRecord[];
  paymentSummary?: PaymentSummary;
  canVoidPayments: boolean;
}) {
  const retainedPaid = paymentSummary?.retainedPaid ?? payments.filter((payment) => !payment.voidedAt).reduce((sum, payment) => sum + payment.amount, 0);
  const outstanding = paymentSummary?.outstanding ?? 0;
  return <div className="space-y-3 border-t pt-3"><div className="flex items-center justify-between text-xs"><span className="text-muted-foreground">Payment: {paymentStatus}</span><span className="font-medium">Retained Rs {retainedPaid.toLocaleString()} · Due Rs {outstanding.toLocaleString()}</span></div>
    {outstanding > 0 ? cashAccounts.length ? <form action={recordRestaurantPaymentAction} className="grid gap-2 sm:grid-cols-2"><input type="hidden" name="orderId" value={orderId} /><input type="hidden" name="paymentRequestId" value={`rp:${randomUUID()}`} /><select name="cashBankAccountId" required className="h-8 rounded-md border bg-background px-2 text-xs">{cashAccounts.map((account) => <option key={account.cashBankAccountId} value={account.cashBankAccountId}>{account.name}</option>)}</select><select name="method" defaultValue="CASH" className="h-8 rounded-md border bg-background px-2 text-xs"><option value="CASH">Cash</option><option value="CREDIT_CARD">Card</option><option value="BANK_TRANSFER">Bank transfer</option><option value="JAZZCASH">JazzCash</option><option value="EASYPAISA">Easypaisa</option><option value="MOBILE_WALLET">Mobile wallet</option><option value="CHEQUE">Cheque</option><option value="OTHER">Other</option></select><input name="amount" type="number" min="0.01" max={outstanding} step="0.01" defaultValue={outstanding} required className="h-8 rounded-md border bg-background px-2 text-xs" /><input name="reference" maxLength={120} placeholder="Reference (optional)" className="h-8 rounded-md border bg-background px-2 text-xs" /><div className="sm:col-span-2 flex justify-end"><Button size="sm" type="submit">Record payment</Button></div></form> : <p className="text-xs text-amber-700">Create an active cash or bank account before recording restaurant payments. <Link href="/accounting/cash-bank" className="font-semibold underline">Open Cash & Bank</Link></p> : null}
    {payments.length ? <div className="space-y-1.5">{payments.slice(0, 5).map((payment) => <div key={payment.id} className={payment.voidedAt ? "flex items-center justify-between rounded bg-muted/40 px-2 py-1.5 text-xs text-muted-foreground line-through" : "flex items-center justify-between rounded bg-muted/40 px-2 py-1.5 text-xs"}><span>{payment.method.replaceAll("_", " ")} · {payment.cashBankAccountName} · Rs {payment.amount.toLocaleString()}</span>{canVoidPayments && !payment.voidedAt ? <form action={voidRestaurantPaymentAction} className="flex items-center gap-1"><input type="hidden" name="paymentId" value={payment.id} /><input name="reason" required minLength={3} maxLength={500} placeholder="Void reason" className="h-7 w-28 rounded border bg-background px-1.5 text-[11px]" /><Button type="submit" size="xs" variant="outline">Void</Button></form> : payment.voidedAt ? <span>VOID</span> : null}</div>)}</div> : null}
  </div>;
}
