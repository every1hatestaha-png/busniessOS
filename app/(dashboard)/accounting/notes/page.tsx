import { randomUUID } from "node:crypto";

import {
  cancelManualCustomerCreditNoteAction,
  cancelManualSupplierDebitNoteAction,
  createManualCustomerCreditNoteAction,
  createManualSupplierDebitNoteAction,
} from "@/app/(dashboard)/accounting/notes/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { requirePermission } from "@/lib/server/authorization";
import { db } from "@/lib/server/db";
import { listManualFinancialNotes } from "@/lib/server/manual-notes";
import { formatDate, formatPKR } from "@/lib/utils";

type Query = Promise<Record<string, string | string[] | undefined>>;

const fieldClass = "h-9 w-full rounded-md border border-input bg-white px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/15";

export default async function ManualFinancialNotesPage({ searchParams }: { searchParams: Query }) {
  const context = await requirePermission("financial.manage");
  const query = await searchParams;
  const success = typeof query.success === "string" ? query.success : "";
  const error = typeof query.error === "string" ? query.error : "";

  const [customers, suppliers, purchaseOrders, notes] = await Promise.all([
    db.customer.findMany({
      where: { workspaceId: context.workspaceId, currentBalance: { gt: 0 } },
      orderBy: [{ companyName: "asc" }, { name: "asc" }],
      select: { id: true, name: true, companyName: true, currentBalance: true },
    }),
    db.supplier.findMany({
      where: { workspaceId: context.workspaceId, currentBalance: { gt: 0 } },
      orderBy: [{ companyName: "asc" }, { name: "asc" }],
      select: { id: true, name: true, companyName: true, currentBalance: true },
    }),
    db.purchaseOrder.findMany({
      where: { workspaceId: context.workspaceId, status: { not: "CANCELLED" }, balanceAmount: { gt: 0 } },
      orderBy: [{ orderDate: "desc" }, { createdAt: "desc" }],
      take: 250,
      select: { id: true, supplierId: true, orderNumber: true, balanceAmount: true },
    }),
    listManualFinancialNotes(context.workspaceId),
  ]);

  return (
    <div className="mx-auto max-w-[1500px] space-y-6">
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-400">Financial adjustments</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">Credit & Debit Notes</h1>
        <p className="mt-1 max-w-3xl text-sm text-neutral-500">Record non-return price adjustments without deleting financial history. Every note posts to party ledgers, general ledger, and audit log.</p>
      </header>

      {success && <div className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">{success}</div>}
      {error && <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">{error}</div>}

      <div className="grid gap-5 xl:grid-cols-2">
        <section className="rounded-xl border bg-white p-5 shadow-sm">
          <h2 className="text-base font-semibold">Customer credit note</h2>
          <p className="mt-1 text-xs text-neutral-500">Use for post-sale discounts, rebates, or corrections that reduce customer receivables without a physical return.</p>
          <form action={createManualCustomerCreditNoteAction} className="mt-5 grid gap-4 sm:grid-cols-2">
            <input type="hidden" name="idempotencyKey" value={randomUUID()} />
            <label className="sm:col-span-2">
              <span className="mb-1 block text-xs font-medium text-neutral-600">Customer</span>
              <select name="customerId" required className={fieldClass}>
                <option value="">Choose customer</option>
                {customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.companyName ?? customer.name} · {formatPKR(Number(customer.currentBalance))} receivable</option>)}
              </select>
            </label>
            <label><span className="mb-1 block text-xs font-medium text-neutral-600">Amount</span><Input name="amount" type="number" min="0.01" step="0.01" required /></label>
            <label><span className="mb-1 block text-xs font-medium text-neutral-600">Reference</span><Input name="reference" maxLength={100} placeholder="Optional external ref" /></label>
            <label className="sm:col-span-2"><span className="mb-1 block text-xs font-medium text-neutral-600">Reason</span><Input name="reason" minLength={3} maxLength={160} required placeholder="e.g. Post-sale volume discount" /></label>
            <label className="sm:col-span-2"><span className="mb-1 block text-xs font-medium text-neutral-600">Notes</span><textarea name="notes" maxLength={500} rows={3} className={fieldClass + " h-auto py-2"} /></label>
            <Button type="submit" className="sm:col-span-2">Create customer credit note</Button>
          </form>
        </section>

        <section className="rounded-xl border bg-white p-5 shadow-sm">
          <h2 className="text-base font-semibold">Supplier debit note</h2>
          <p className="mt-1 text-xs text-neutral-500">Use for supplier rebates or price corrections that reduce payables. Link a PO when the adjustment belongs to a specific outstanding purchase.</p>
          <form action={createManualSupplierDebitNoteAction} className="mt-5 grid gap-4 sm:grid-cols-2">
            <input type="hidden" name="idempotencyKey" value={randomUUID()} />
            <label className="sm:col-span-2">
              <span className="mb-1 block text-xs font-medium text-neutral-600">Supplier</span>
              <select name="supplierId" required className={fieldClass}>
                <option value="">Choose supplier</option>
                {suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.companyName ?? supplier.name} · {formatPKR(Number(supplier.currentBalance))} payable</option>)}
              </select>
            </label>
            <label className="sm:col-span-2">
              <span className="mb-1 block text-xs font-medium text-neutral-600">Purchase order</span>
              <select name="purchaseOrderId" className={fieldClass}>
                <option value="">No specific PO / previous balance adjustment</option>
                {purchaseOrders.map((order) => <option key={order.id} value={order.id}>{order.orderNumber} · {formatPKR(Number(order.balanceAmount))} outstanding</option>)}
              </select>
            </label>
            <label><span className="mb-1 block text-xs font-medium text-neutral-600">Amount</span><Input name="amount" type="number" min="0.01" step="0.01" required /></label>
            <label><span className="mb-1 block text-xs font-medium text-neutral-600">Reference</span><Input name="reference" maxLength={100} placeholder="Optional external ref" /></label>
            <label className="sm:col-span-2"><span className="mb-1 block text-xs font-medium text-neutral-600">Reason</span><Input name="reason" minLength={3} maxLength={160} required placeholder="e.g. Supplier rebate / rate correction" /></label>
            <label className="sm:col-span-2"><span className="mb-1 block text-xs font-medium text-neutral-600">Notes</span><textarea name="notes" maxLength={500} rows={3} className={fieldClass + " h-auto py-2"} /></label>
            <Button type="submit" className="sm:col-span-2">Create supplier debit note</Button>
          </form>
        </section>
      </div>

      <section className="rounded-xl border bg-white shadow-sm">
        <div className="border-b px-5 py-4"><h2 className="font-semibold">Manual note history</h2><p className="mt-0.5 text-xs text-neutral-500">Cancellation preserves the original note and posts explicit ledger reversals.</p></div>
        <div className="grid gap-0 xl:grid-cols-2">
          <div className="border-b p-5 xl:border-b-0 xl:border-r">
            <h3 className="mb-3 text-sm font-semibold">Customer credits</h3>
            <div className="space-y-3">
              {notes.customerCredits.map((note) => <article key={note.id} className="rounded-lg border p-3 text-sm">
                <div className="flex items-start justify-between gap-3"><div><p className="font-semibold">{note.number} · {note.party}</p><p className="mt-0.5 text-xs text-neutral-500">{formatDate(note.date)} · {note.reason}</p></div><div className="text-right"><p className="font-semibold tabular-nums">{formatPKR(note.amount)}</p><p className="text-[10px] font-semibold uppercase tracking-wide text-neutral-500">{note.status}</p></div></div>
                {note.status !== "CANCELLED" && <form action={cancelManualCustomerCreditNoteAction.bind(null, note.id)} className="mt-3 flex gap-2"><Input name="reason" minLength={3} required placeholder="Cancellation reason" className="h-8 text-xs" /><Button type="submit" size="sm" variant="outline">Cancel & reverse</Button></form>}
              </article>)}
              {!notes.customerCredits.length && <p className="py-8 text-center text-sm text-neutral-400">No manual customer credit notes yet.</p>}
            </div>
          </div>
          <div className="p-5">
            <h3 className="mb-3 text-sm font-semibold">Supplier debits</h3>
            <div className="space-y-3">
              {notes.supplierDebits.map((note) => <article key={note.id} className="rounded-lg border p-3 text-sm">
                <div className="flex items-start justify-between gap-3"><div><p className="font-semibold">{note.number} · {note.party}</p><p className="mt-0.5 text-xs text-neutral-500">{formatDate(note.date)}{note.purchaseOrder ? ` · ${note.purchaseOrder}` : ""} · {note.reason}</p></div><div className="text-right"><p className="font-semibold tabular-nums">{formatPKR(note.amount)}</p><p className="text-[10px] font-semibold uppercase tracking-wide text-neutral-500">{note.status}</p></div></div>
                {note.status !== "CANCELLED" && <form action={cancelManualSupplierDebitNoteAction.bind(null, note.id)} className="mt-3 flex gap-2"><Input name="reason" minLength={3} required placeholder="Cancellation reason" className="h-8 text-xs" /><Button type="submit" size="sm" variant="outline">Cancel & reverse</Button></form>}
              </article>)}
              {!notes.supplierDebits.length && <p className="py-8 text-center text-sm text-neutral-400">No manual supplier debit notes yet.</p>}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
