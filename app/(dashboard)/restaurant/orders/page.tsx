import { RestaurantMutationForm } from "@/app/(dashboard)/restaurant/mutation-form";
import { randomUUID } from "node:crypto";
import Link from "next/link";
import { CheckCircle2, ChefHat, Clock3, MessageCircleMore, Plus, RotateCcw, ShoppingBag, Sparkles } from "lucide-react";

import {
  confirmRestaurantOrderAction,
  recordRestaurantPaymentAction,
  transitionRestaurantOrderAction,
  voidRestaurantPaymentAction,
} from "@/app/(dashboard)/restaurant/v1-actions";
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
  const { workspaceId, role, workspace } = await requireWorkspace();
  const [active, recentClosed, completedOutstanding, cashAccounts] = await Promise.all([
    listRestaurantOrders(workspaceId, 200, { statuses: ["PENDING_REVIEW", "CONFIRMED", "PREPARING", "READY"], oldestFirst: true }),
    listRestaurantOrders(workspaceId, 30, { statuses: ["COMPLETED", "CANCELLED"] }),
    listRestaurantOrders(workspaceId, 200, { statuses: ["COMPLETED"], oldestFirst: true, outstandingOnly: true }),
    getCashBankAccounts(workspaceId),
  ]);
  const visibleOrderIds = [...new Set([...active, ...recentClosed, ...completedOutstanding].map(order => order.id))];
  const [payments, paymentSummaries] = await Promise.all([
    listRestaurantPayments(workspaceId, visibleOrderIds),
    listRestaurantNetPaymentSummaries(workspaceId, visibleOrderIds),
  ]);
  const canManageFinancialActions = role === "OWNER" || role === "ADMIN" || role === "MANAGER";
  const paymentsByOrder = new Map<string, RestaurantPaymentRecord[]>();
  for (const payment of payments) {
    const group = paymentsByOrder.get(payment.restaurantOrderId) ?? [];
    group.push(payment);
    paymentsByOrder.set(payment.restaurantOrderId, group);
  }
  const paymentSummaryByOrder = new Map(paymentSummaries.map((summary) => [summary.restaurantOrderId, summary]));

  return (
    <div className="mx-auto max-w-[1800px] space-y-6">
      <section className="flex flex-col gap-4 rounded-2xl border bg-white p-4 shadow-none sm:p-5 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-emerald-700">Service control</p>
          <h1 className="mt-1 text-xl font-semibold tracking-tight">{workspace.name} orders</h1>
          <p className="mt-1 text-sm text-muted-foreground">Move orders from review to preparation, ready and completed without leaving the service board.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/restaurant/pos" className={cn(buttonVariants(), "rounded-xl bg-emerald-600 hover:bg-emerald-500")}><Plus className="size-4" />New POS order</Link>
          <Link href="/restaurant/kitchen" className={cn(buttonVariants({ variant: "outline" }), "rounded-xl")}><ChefHat className="size-4" />Kitchen</Link>
          <Link href="/restaurant/whatsapp" className={cn(buttonVariants({ variant: "outline" }), "rounded-xl")}><MessageCircleMore className="size-4" />WhatsApp</Link>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-4">
        <StatusMetric label="Needs review" value={active.filter((order) => order.status === "PENDING_REVIEW").length} icon={MessageCircleMore} tone="amber" />
        <StatusMetric label="Confirmed" value={active.filter((order) => order.status === "CONFIRMED").length} icon={Clock3} tone="blue" />
        <StatusMetric label="Preparing" value={active.filter((order) => order.status === "PREPARING").length} icon={ChefHat} tone="amber" />
        <StatusMetric label="Ready" value={active.filter((order) => order.status === "READY").length} icon={CheckCircle2} tone="emerald" />
      </section>

      {payments.length === 500 ? <p className="text-sm text-amber-700">Showing the latest 500 payments for these orders. Open an order receipt for its complete payment history.</p> : null}
      {active.length === 200 ? <p className="text-sm text-amber-700">Showing the oldest 200 active orders. Finish these to advance the queue.</p> : null}
      <div className="grid gap-4 xl:grid-cols-4">
        {columns.map((column) => {
          const matching = active.filter((order) => order.status === column.status);
          return <section key={column.status} className="min-w-0 rounded-2xl border bg-slate-50/70 p-3"><div className="mb-3 flex items-center justify-between"><h2 className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">{column.label}</h2><span className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold shadow-sm">{matching.length}</span></div><div className="space-y-3">{matching.length ? matching.map((order) => <OrderCard workspaceId={workspaceId} key={order.id} order={order} cashAccounts={cashAccounts} payments={paymentsByOrder.get(order.id) ?? []} paymentSummary={paymentSummaryByOrder.get(order.id)} canVoidPayments={canManageFinancialActions} />) : <div className="rounded-2xl border border-dashed bg-white p-8 text-center"><Sparkles className="mx-auto size-4 text-emerald-500" /><p className="mt-2 text-xs text-muted-foreground">Queue clear</p></div>}</div></section>;
        })}
      </div>

      {completedOutstanding.length === 200 ? <p className="text-sm text-amber-700">Showing the oldest 200 completed orders awaiting payment. Collect these to advance the queue.</p> : null}
      {completedOutstanding.length ? <Card className="rounded-lg border-amber-200 shadow-sm"><CardContent className="space-y-4 p-5"><div><h2 className="font-semibold">Completed orders awaiting payment</h2><p className="text-xs text-muted-foreground">Net due already reflects posted item returns.</p></div><div className="grid gap-3 lg:grid-cols-2">{completedOutstanding.map((order) => <div key={order.id} className="rounded-lg border p-4"><div className="mb-3 flex justify-between gap-3"><div><Link href={`/restaurant/orders/${order.id}/print`} className="font-semibold underline">{order.orderNumber}</Link><p className="text-xs text-muted-foreground">{order.customerName || order.customerPhone || "Walk-in customer"}</p></div><p className="font-semibold">Net Rs {(paymentSummaryByOrder.get(order.id)?.adjustedDue ?? order.total).toLocaleString()}</p></div><PaymentPanel workspaceId={workspaceId} orderId={order.id} paymentStatus={order.paymentStatus} cashAccounts={cashAccounts} payments={paymentsByOrder.get(order.id) ?? []} paymentSummary={paymentSummaryByOrder.get(order.id)} canVoidPayments={canManageFinancialActions} /></div>)}</div></CardContent></Card> : null}

      <Card className="rounded-lg shadow-sm"><CardContent className="p-0"><div className="border-b px-5 py-4"><h2 className="font-semibold">Recent completed & cancelled</h2><p className="text-xs text-muted-foreground">Latest terminal orders kept for operational and financial history.</p></div>{recentClosed.length ? <div className="overflow-x-auto"><table className="w-full text-sm"><thead className="bg-muted/40 text-left text-xs text-muted-foreground"><tr><th className="px-4 py-3">Order</th><th className="px-4 py-3">Source</th><th className="px-4 py-3">Type</th><th className="px-4 py-3">Customer</th><th className="px-4 py-3">Net total</th><th className="px-4 py-3">Payment</th><th className="px-4 py-3">Status</th>{canManageFinancialActions ? <th className="px-4 py-3">Action</th> : null}</tr></thead><tbody className="divide-y">{recentClosed.map((order) => <tr key={order.id}><td className="px-4 py-3 font-medium"><Link href={`/restaurant/orders/${order.id}/print?copy=1`} className="underline">{order.orderNumber}</Link></td><td className="px-4 py-3">{order.source}</td><td className="px-4 py-3 text-muted-foreground">{order.fulfillmentType.replaceAll("_", " ")}</td><td className="px-4 py-3 text-muted-foreground">{order.customerName || order.customerPhone || "Walk-in"}</td><td className="px-4 py-3 font-medium">Rs {(paymentSummaryByOrder.get(order.id)?.adjustedDue ?? order.total).toLocaleString()}</td><td className="px-4 py-3">{order.paymentStatus}</td><td className="px-4 py-3">{order.status}</td>{canManageFinancialActions ? <td className="px-4 py-3">{order.status === "COMPLETED" ? <Link href={`/restaurant/orders/${order.id}/return`} className={cn(buttonVariants({ variant: "outline", size: "sm" }))}><RotateCcw className="mr-1 size-3.5" />Return items</Link> : null}</td> : null}</tr>)}</tbody></table></div> : <div className="p-6 text-sm text-muted-foreground">No completed or cancelled restaurant orders yet.</div>}</CardContent></Card>
    </div>
  );
}

function OrderCard({
  workspaceId,
  order,
  cashAccounts,
  payments,
  paymentSummary,
  canVoidPayments,
}: {
  workspaceId: string;
  order: Awaited<ReturnType<typeof listRestaurantOrders>>[number];
  cashAccounts: Awaited<ReturnType<typeof getCashBankAccounts>>;
  payments: RestaurantPaymentRecord[];
  paymentSummary?: PaymentSummary;
  canVoidPayments: boolean;
}) {
  const next = primaryNext(order.status);
  return <Card className={order.source === "WHATSAPP" ? "rounded-2xl border-emerald-300 bg-white shadow-none" : "rounded-2xl bg-white shadow-none"}><CardContent className="space-y-3 p-4"><div className="flex items-start justify-between gap-2"><div><div className="flex items-center gap-1.5">{order.source === "WHATSAPP" ? <MessageCircleMore className="size-4 text-emerald-600" /> : <ShoppingBag className="size-4 text-muted-foreground" />}<Link href={`/restaurant/orders/${order.id}/print`} className="font-semibold underline">{order.orderNumber}</Link></div><p className="mt-1 text-xs text-muted-foreground">{order.source} · {order.fulfillmentType.replaceAll("_", " ")}{order.tableName ? ` · ${order.tableName}` : ""}</p></div><p className="font-semibold">Rs {(paymentSummary?.adjustedDue ?? order.total).toLocaleString()}</p></div><div className="text-xs text-muted-foreground"><p>{order.customerName || "Walk-in customer"}{order.customerPhone ? ` · ${order.customerPhone}` : ""}</p><p>{new Intl.DateTimeFormat("en-PK", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Karachi" }).format(order.createdAt)}</p>{order.notes ? <p className="mt-1 rounded bg-muted/50 p-2">{order.notes}</p> : null}</div>
    <div className="flex flex-wrap gap-2">
      {order.status === "PENDING_REVIEW" ? <RestaurantMutationForm action={confirmRestaurantOrderAction} workspaceId={workspaceId}><input type="hidden" name="orderId" value={order.id} /><Button size="sm" className="rounded-lg bg-emerald-600 hover:bg-emerald-500" type="submit">Confirm order</Button></RestaurantMutationForm> : null}
      {next ? <RestaurantMutationForm action={transitionRestaurantOrderAction} workspaceId={workspaceId}><input type="hidden" name="orderId" value={order.id} /><input type="hidden" name="nextStatus" value={next.next} /><Button size="sm" className="rounded-lg bg-emerald-600 hover:bg-emerald-500" type="submit">{next.label}</Button></RestaurantMutationForm> : null}
      {!["COMPLETED", "CANCELLED"].includes(order.status) ? <RestaurantMutationForm action={transitionRestaurantOrderAction} workspaceId={workspaceId}><input type="hidden" name="orderId" value={order.id} /><input type="hidden" name="nextStatus" value="CANCELLED" /><Button size="sm" className="rounded-lg" variant="outline" type="submit">Cancel</Button></RestaurantMutationForm> : null}
    </div>
    <PaymentPanel workspaceId={workspaceId} orderId={order.id} paymentStatus={order.paymentStatus} cashAccounts={cashAccounts} payments={payments} paymentSummary={paymentSummary} canVoidPayments={canVoidPayments} />
  </CardContent></Card>;
}

function PaymentPanel({
  workspaceId,
  orderId,
  paymentStatus,
  cashAccounts,
  payments,
  paymentSummary,
  canVoidPayments,
}: {
  workspaceId: string;
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
    {outstanding > 0 ? cashAccounts.length ? <RestaurantMutationForm action={recordRestaurantPaymentAction} workspaceId={workspaceId} className="grid gap-2 sm:grid-cols-2"><input type="hidden" name="orderId" value={orderId} /><input type="hidden" name="paymentRequestId" value={`rp:${randomUUID()}`} /><select name="cashBankAccountId" required className="h-8 rounded-md border bg-background px-2 text-xs">{cashAccounts.map((account) => <option key={account.cashBankAccountId} value={account.cashBankAccountId}>{account.name}</option>)}</select><select name="method" defaultValue="CASH" className="h-8 rounded-md border bg-background px-2 text-xs"><option value="CASH">Cash</option><option value="CREDIT_CARD">Card</option><option value="BANK_TRANSFER">Bank transfer</option><option value="JAZZCASH">JazzCash</option><option value="EASYPAISA">Easypaisa</option><option value="MOBILE_WALLET">Mobile wallet</option><option value="CHEQUE">Cheque</option><option value="OTHER">Other</option></select><input name="amount" type="number" min="0.01" max={outstanding} step="0.01" defaultValue={outstanding} required className="h-8 rounded-md border bg-background px-2 text-xs" /><input name="reference" maxLength={120} placeholder="Reference (optional)" className="h-8 rounded-md border bg-background px-2 text-xs" /><div className="sm:col-span-2 flex justify-end"><Button size="sm" type="submit">Record payment</Button></div></RestaurantMutationForm> : <p className="text-xs text-amber-700">Create an active cash or bank account before recording restaurant payments. <Link href="/accounting/cash-bank" className="font-semibold underline">Open Cash & Bank</Link></p> : null}
    {payments.length ? <div className="space-y-1.5">{payments.slice(0, 5).map((payment) => <div key={payment.id} className={payment.voidedAt ? "flex items-center justify-between rounded bg-muted/40 px-2 py-1.5 text-xs text-muted-foreground line-through" : "flex items-center justify-between rounded bg-muted/40 px-2 py-1.5 text-xs"}><span>{payment.method.replaceAll("_", " ")} · {payment.cashBankAccountName} · Rs {payment.amount.toLocaleString()}</span>{canVoidPayments && !payment.voidedAt ? <RestaurantMutationForm action={voidRestaurantPaymentAction} workspaceId={workspaceId} className="flex items-center gap-1"><input type="hidden" name="paymentId" value={payment.id} /><input name="reason" required minLength={3} maxLength={500} placeholder="Void reason" className="h-7 w-28 rounded border bg-background px-1.5 text-[11px]" /><Button type="submit" size="xs" variant="outline">Void</Button></RestaurantMutationForm> : payment.voidedAt ? <span>VOID</span> : null}</div>)}</div> : null}
  </div>;
}


function StatusMetric({ label, value, icon: Icon, tone }: { label: string; value: number; icon: typeof ChefHat; tone: "emerald" | "amber" | "blue" }) {
  const toneClass = tone === "emerald"
    ? "bg-emerald-100 text-emerald-700"
    : tone === "blue"
      ? "bg-blue-100 text-blue-700"
      : "bg-amber-100 text-amber-700";
  return (
    <Card className="rounded-2xl border shadow-none">
      <CardContent className="flex items-center justify-between p-4">
        <div><p className="text-xs font-medium text-muted-foreground">{label}</p><p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p></div>
        <span className={cn("grid size-10 place-items-center rounded-xl", toneClass)}><Icon className="size-4" /></span>
      </CardContent>
    </Card>
  );
}
