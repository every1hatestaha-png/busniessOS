"use client";

import { useState } from "react";

import { StatusBadge } from "@/components/business/status-badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { CustomerDetail } from "@/lib/server/customers";
import { calculateLedgerRunningBalance, formatDate, formatPKR } from "@/lib/utils";

const tabs = ["Khata", "Invoices", "Payments", "Orders", "Overview"] as const;
type Tab = (typeof tabs)[number];

function EmptySection({ children }: { children: string }) {
  return <div className="flex min-h-40 items-center justify-center px-4 text-center text-sm text-neutral-500">{children}</div>;
}

export function CustomerDetailsTabs({ customer }: { customer: CustomerDetail }) {
  const [activeTab, setActiveTab] = useState<Tab>("Khata");
  const { orders, payments, invoices } = customer;
  const ledger = calculateLedgerRunningBalance(customer.ledgerEntries);

  return (
    <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white">
      <div className="overflow-x-auto border-b border-neutral-200 px-2 sm:px-4">
        <div className="flex min-w-max" role="tablist" aria-label="Customer information">
          {tabs.map((tab) => { const count = tab === "Khata" ? ledger.length : tab === "Invoices" ? invoices.length : tab === "Payments" ? payments.length : tab === "Orders" ? orders.length : null; return <button key={tab} type="button" role="tab" aria-selected={activeTab === tab} onClick={() => setActiveTab(tab)} className={`border-b-2 px-3 py-2.5 text-xs font-medium transition-colors sm:px-4 ${activeTab === tab ? "border-neutral-950 text-neutral-950" : "border-transparent text-neutral-500 hover:text-neutral-900"}`}>{tab}{count !== null && <span className="ml-1.5 rounded bg-neutral-100 px-1.5 py-0.5 text-[10px] tabular-nums">{count}</span>}</button>; })}
        </div>
      </div>
      <div role="tabpanel">
        {activeTab === "Overview" && (
          <div className="grid gap-6 p-4 sm:p-6 lg:grid-cols-2">
            <section><h2 className="mb-4 font-semibold">Contact information</h2><dl className="space-y-3 text-sm"><div><dt className="text-neutral-500">Contact person</dt><dd className="font-medium">{customer.name}</dd></div><div><dt className="text-neutral-500">Phone</dt><dd className="font-medium">{customer.phone}</dd></div><div><dt className="text-neutral-500">Email</dt><dd className="break-all font-medium">{customer.email}</dd></div><div><dt className="text-neutral-500">Address</dt><dd className="font-medium">{customer.address}</dd></div></dl></section>
            <section><h2 className="mb-4 font-semibold">Account details</h2><dl className="space-y-3 text-sm"><div><dt className="text-neutral-500">Status</dt><dd className="mt-1"><StatusBadge status={customer.status} /></dd></div><div><dt className="text-neutral-500">Credit limit</dt><dd className="font-medium">{customer.creditLimit > 0 ? formatPKR(customer.creditLimit) : "Not configured"}</dd></div><div><dt className="text-neutral-500">Available credit</dt><dd className="font-medium">{customer.creditLimit > 0 ? formatPKR(Math.max(0, customer.creditLimit - customer.currentBalance)) : "Not configured"}</dd></div><div><dt className="text-neutral-500">Notes</dt><dd className="font-medium">{customer.notes || "No account notes"}</dd></div></dl></section>
          </div>
        )}
        {activeTab === "Khata" && (ledger.length ? <Table className="min-w-[720px]"><TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Reference</TableHead><TableHead>Description</TableHead><TableHead className="text-right">Debit</TableHead><TableHead className="text-right">Credit</TableHead><TableHead className="text-right">Balance</TableHead></TableRow></TableHeader><TableBody>{ledger.map((entry) => <TableRow key={entry.id}><TableCell>{formatDate(entry.date)}</TableCell><TableCell className="font-mono text-xs">{entry.reference}</TableCell><TableCell>{entry.description}</TableCell><TableCell className="text-right tabular-nums">{entry.debit ? formatPKR(entry.debit) : "-"}</TableCell><TableCell className="text-right tabular-nums text-emerald-700">{entry.credit ? formatPKR(entry.credit) : "-"}</TableCell><TableCell className="text-right font-semibold tabular-nums">{formatPKR(entry.balance)}</TableCell></TableRow>)}</TableBody></Table> : <EmptySection>No khata entries are available for this customer.</EmptySection>)}
        {activeTab === "Orders" && (orders.length ? <Table className="min-w-[680px]"><TableHeader><TableRow><TableHead>Order</TableHead><TableHead>Date</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Total</TableHead><TableHead className="text-right">Balance</TableHead></TableRow></TableHeader><TableBody>{orders.map((order) => <TableRow key={order.id}><TableCell className="font-medium">{order.orderNumber}</TableCell><TableCell>{formatDate(order.date)}</TableCell><TableCell><StatusBadge status={order.status} /></TableCell><TableCell className="text-right">{formatPKR(order.total)}</TableCell><TableCell className="text-right font-medium">{formatPKR(order.balanceAmount)}</TableCell></TableRow>)}</TableBody></Table> : <EmptySection>No orders are available for this customer.</EmptySection>)}
        {activeTab === "Payments" && (payments.length ? <Table className="min-w-[620px]"><TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Reference</TableHead><TableHead>Method</TableHead><TableHead className="text-right">Amount</TableHead></TableRow></TableHeader><TableBody>{payments.map((payment) => <TableRow key={payment.id}><TableCell>{formatDate(payment.date)}</TableCell><TableCell className="font-medium">{payment.reference}</TableCell><TableCell>{payment.method}</TableCell><TableCell className="text-right font-medium text-emerald-700">{formatPKR(payment.amount)}</TableCell></TableRow>)}</TableBody></Table> : <EmptySection>No payments are available for this customer.</EmptySection>)}
        {activeTab === "Invoices" && (invoices.length ? <Table className="min-w-[720px]"><TableHeader><TableRow><TableHead>Invoice</TableHead><TableHead>Issued</TableHead><TableHead>Due</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Total</TableHead><TableHead className="text-right">Balance</TableHead></TableRow></TableHeader><TableBody>{invoices.map((invoice) => <TableRow key={invoice.id}><TableCell className="font-medium">{invoice.invoiceNumber}</TableCell><TableCell>{formatDate(invoice.date)}</TableCell><TableCell>{invoice.dueDate ? formatDate(invoice.dueDate) : "-"}</TableCell><TableCell><StatusBadge status={invoice.status} /></TableCell><TableCell className="text-right">{formatPKR(invoice.total)}</TableCell><TableCell className="text-right font-medium">{formatPKR(invoice.balance)}</TableCell></TableRow>)}</TableBody></Table> : <EmptySection>No invoices are available for this customer.</EmptySection>)}
      </div>
    </div>
  );
}
