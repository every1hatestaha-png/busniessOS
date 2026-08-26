import { CircleDollarSign, FileText, TriangleAlert } from "lucide-react";

import { MetricCard } from "@/components/business/metric-card";
import { PageHeader } from "@/components/business/page-header";
import { InvoiceList } from "@/components/invoices/invoice-list";
import { requireWorkspace } from "@/lib/server/auth";
import { listInvoices } from "@/lib/server/invoices";
import { formatPKR } from "@/lib/utils";

export default async function InvoicesPage() {
  const { workspaceId } = await requireWorkspace();
  const invoices = await listInvoices(workspaceId);
  const billed = invoices.reduce((sum, invoice) => sum + invoice.total, 0);
  const outstanding = invoices.reduce((sum, invoice) => sum + invoice.balance, 0);
  const overdue = invoices.filter((invoice) => invoice.status === "OVERDUE").length;

  return (
    <div className="space-y-6">
      <PageHeader title="Invoices" description="Review customer billing, collections, and due dates." />
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <MetricCard label="Total billed" value={formatPKR(billed)} detail={`${invoices.length} issued invoice${invoices.length === 1 ? "" : "s"}`} icon={FileText} />
        <MetricCard label="Outstanding" value={formatPKR(outstanding)} detail={billed > 0 ? `${Math.round((outstanding / billed) * 100)}% of billed amount` : "No outstanding invoices"} icon={CircleDollarSign} />
        <MetricCard label="Overdue" value={String(overdue)} detail="Invoices requiring collection follow-up" icon={TriangleAlert} />
      </section>
      <InvoiceList invoices={invoices} />
    </div>
  );
}
