import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Role } from "@prisma/client";
import {
  AlertTriangle,
  Boxes,
  Building2,
  FileText,
  Landmark,
  Package,
  ReceiptText,
  Settings,
  ShoppingCart,
  Users,
  Wrench,
} from "lucide-react";

import { DailyActionCenter } from "@/components/dashboard/daily-action-center";
import { Sidebar } from "@/components/layout/sidebar";
import { getWorkspaceBranding } from "@/lib/workspace-branding";
import { formatPKR } from "@/lib/utils";

export const dynamic = "force-dynamic";

const workspaceName = "Arshad Sons and Engineering Solution";
const branding = getWorkspaceBranding(workspaceName);

const views = [
  ["dashboard", "Dashboard"],
  ["sales", "Sales"],
  ["purchases", "Purchases"],
  ["inventory", "Inventory"],
  ["customers", "Customers"],
  ["suppliers", "Suppliers"],
  ["manufacturing", "Manufacturing"],
  ["finance", "Finance"],
  ["reports", "Reports"],
  ["print", "Print / Cheque"],
  ["settings", "Settings"],
] as const;

type ViewKey = (typeof views)[number][0];

const dashboardData = {
  actionCount: 3,
  todaySales: 486250,
  todayReceipts: 215000,
  collectionAmount: 372500,
  promiseDueAmount: 95000,
  promiseMissedAmount: 0,
  lowStockCount: 2,
  supplierReviewAmount: 182000,
  items: [
    {
      id: "collections",
      tone: "warning" as const,
      title: "4 customers need collection follow-up",
      detail: "Two invoices are due today. Review before sending any reminder.",
      amount: 372500,
      href: "/qa-preview?view=finance",
      actionLabel: "Review collections",
    },
    {
      id: "stock-summary",
      tone: "danger" as const,
      title: "2 products need restocking",
      detail: "Front Hub Full Floating and Bearing 30210 are below configured reorder levels.",
      href: "/qa-preview?view=inventory",
      actionLabel: "Review stock",
    },
    {
      id: "supplier-review",
      tone: "info" as const,
      title: "Supplier payment review",
      detail: "One approved supplier balance is due for review this week.",
      amount: 182000,
      href: "/qa-preview?view=finance",
      actionLabel: "Review payables",
    },
  ],
};

const salesRows = [
  ["SO-1048", "Pak Auto Traders", "Main Warehouse", "24 Sep 2026", "PKR 186,500", "Posted"],
  ["SO-1047", "Al-Rehman Motors", "Main Warehouse", "24 Sep 2026", "PKR 92,750", "Partial"],
  ["SO-1046", "Khan Auto Parts", "Warehouse B", "23 Sep 2026", "PKR 207,000", "Posted"],
];

const purchaseRows = [
  ["PO-0521", "National Bearing House", "Main Warehouse", "23 Sep 2026", "PKR 322,000", "Approved"],
  ["PO-0520", "Steel Source Lahore", "Warehouse B", "22 Sep 2026", "PKR 418,500", "Partial GRN"],
  ["PO-0519", "Pak Seals & Rubber", "Main Warehouse", "21 Sep 2026", "PKR 96,300", "Received"],
];

const inventoryRows = [
  ["FHFF", "Front Hub Full Floating", "18", "8", "Main Warehouse", "Healthy"],
  ["BR-30210", "Bearing 30210", "4", "10", "Main Warehouse", "Restock"],
  ["SEAL-FF", "Front Hub Seal", "7", "12", "Main Warehouse", "Restock"],
  ["BOX-FH", "Hub Box", "42.5", "15", "Warehouse B", "Healthy"],
];

const customerRows = [
  ["Pak Auto Traders", "Lahore", "30 days", "PKR 242,500", "Active"],
  ["Al-Rehman Motors", "Gujranwala", "15 days", "PKR 95,000", "Active"],
  ["Khan Auto Parts", "Faisalabad", "Cash", "PKR 0", "Active"],
];

const supplierRows = [
  ["National Bearing House", "Lahore", "30 days", "PKR 182,000", "Active"],
  ["Steel Source Lahore", "Lahore", "15 days", "PKR 418,500", "Active"],
  ["Pak Seals & Rubber", "Karachi", "30 days", "PKR 72,800", "Active"],
];

function Status({ children, tone = "neutral" }: { children: React.ReactNode; tone?: "neutral" | "success" | "warning" | "danger" }) {
  const cls = {
    neutral: "bg-slate-100 text-slate-700",
    success: "bg-emerald-50 text-emerald-700",
    warning: "bg-amber-50 text-amber-700",
    danger: "bg-red-50 text-red-700",
  }[tone];
  return <span className={`inline-flex rounded-full px-2 py-1 text-[11px] font-semibold ${cls}`}>{children}</span>;
}

function Metric({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">{label}</p>
      <p className="mt-2 text-xl font-semibold tracking-tight text-slate-950">{value}</p>
      <p className="mt-1 text-xs text-slate-500">{hint}</p>
    </div>
  );
}

function TableCard({ title, columns, rows }: { title: string; columns: string[]; rows: string[][] }) {
  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b px-5 py-4">
        <div>
          <h2 className="text-sm font-semibold text-slate-950">{title}</h2>
          <p className="mt-1 text-xs text-slate-500">Synthetic preview data. No production records are loaded.</p>
        </div>
        <button disabled className="rounded-lg border bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-500">New</button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-left text-xs">
          <thead className="bg-slate-50 text-[10px] uppercase tracking-wider text-slate-500">
            <tr>{columns.map((column) => <th key={column} className="px-4 py-3 font-semibold">{column}</th>)}</tr>
          </thead>
          <tbody className="divide-y">
            {rows.map((row, index) => (
              <tr key={index} className="hover:bg-slate-50/60">
                {row.map((cell, cellIndex) => (
                  <td key={`${index}-${cellIndex}`} className="whitespace-nowrap px-4 py-3 text-slate-700">
                    {cellIndex === row.length - 1 ? <Status tone={cell.includes("Restock") ? "danger" : cell.includes("Partial") ? "warning" : "success"}>{cell}</Status> : cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function DashboardView() {
  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Today sales" value={formatPKR(486250)} hint="3 posted orders" />
        <Metric label="Receivables" value={formatPKR(724500)} hint="9 open invoices" />
        <Metric label="Inventory value" value={formatPKR(4850000)} hint="128 active SKUs" />
        <Metric label="Cash + bank" value={formatPKR(2265000)} hint="Reconciled preview" />
      </div>
      <div className="[&_a]:pointer-events-none">
        <DailyActionCenter data={dashboardData} canViewFinancials />
      </div>
      <TableCard title="Recent business activity" columns={["Document", "Party", "Type", "Amount", "Status"]} rows={[
        ["SO-1048", "Pak Auto Traders", "Sale", "PKR 186,500", "Posted"],
        ["GRN-0312", "National Bearing House", "GRN", "PKR 322,000", "Posted"],
        ["RCPT-0189", "Al-Rehman Motors", "Receipt", "PKR 75,000", "Posted"],
      ]} />
    </div>
  );
}

function ManufacturingView() {
  const components = [
    ["Raw Hub", "1.0000"],
    ["Bearing 30210", "2.0000"],
    ["Front Hub Seal", "1.0000"],
    ["Stud", "5.0000"],
    ["Nut", "5.0000"],
    ["Lock", "1.0000"],
    ["Hub Box", "0.5000"],
  ];
  return (
    <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
      <section className="rounded-2xl border bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.15em] text-emerald-700">Customer-specific BOM</p>
            <h2 className="mt-1 text-xl font-semibold">Front Hub Full Floating</h2>
            <p className="mt-1 text-xs text-slate-500">Sales code FHFF · Sale-time backflush · Main commercial line stays customer-facing.</p>
          </div>
          <Status tone="success">Active</Status>
        </div>
        <div className="mt-5 overflow-hidden rounded-xl border">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-[10px] uppercase tracking-wider text-slate-500"><tr><th className="px-4 py-3">Component</th><th className="px-4 py-3 text-right">Qty per hub</th></tr></thead>
            <tbody className="divide-y">{components.map(([name, qty]) => <tr key={name}><td className="px-4 py-3">{name}</td><td className="px-4 py-3 text-right font-mono text-xs">{qty}</td></tr>)}</tbody>
          </table>
        </div>
      </section>
      <section className="rounded-2xl border bg-white p-5 shadow-sm">
        <h3 className="text-sm font-semibold">Consumption preview</h3>
        <p className="mt-1 text-xs text-slate-500">Selling 4 hubs consumes the following quantities atomically.</p>
        <div className="mt-4 space-y-2">{components.map(([name, qty]) => {
          const total = Number(qty) * 4;
          return <div key={name} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-xs"><span>{name}</span><span className="font-semibold tabular-nums">{total.toFixed(4)}</span></div>;
        })}</div>
        <div className="mt-4 rounded-xl border border-emerald-100 bg-emerald-50/50 p-3 text-xs text-emerald-900">Returned assembled hubs remain finished inventory unless an explicit disassembly/recovery workflow is used.</div>
      </section>
    </div>
  );
}

function FinanceView() {
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Accounts receivable" value="PKR 724,500" hint="9 open invoices" />
        <Metric label="Accounts payable" value="PKR 673,300" hint="6 supplier balances" />
        <Metric label="Cash" value="PKR 265,000" hint="Cash account" />
        <Metric label="Bank" value="PKR 2,000,000" hint="Primary bank" />
      </div>
      <TableCard title="Ledger preview" columns={["Date", "Reference", "Account", "Debit", "Credit", "Balance"]} rows={[
        ["24 Sep", "RCPT-0189", "Accounts Receivable", "PKR 0", "PKR 75,000", "PKR 724,500"],
        ["24 Sep", "SO-1048", "Sales Revenue", "PKR 0", "PKR 186,500", "PKR 486,250"],
        ["23 Sep", "PV-0092", "Accounts Payable", "PKR 182,000", "PKR 0", "PKR 673,300"],
      ]} />
    </div>
  );
}

function ReportsView() {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {["Customer Statement", "Supplier Statement", "General Ledger", "Cash & Bank Ledger", "Receivables", "Payables", "Profit & Loss", "Stock Movement", "Purchase Price History"].map((name) => (
        <div key={name} className="rounded-2xl border bg-white p-5 shadow-sm">
          <FileText className="size-5 text-emerald-600" />
          <h3 className="mt-3 text-sm font-semibold">{name}</h3>
          <p className="mt-1 text-xs leading-5 text-slate-500">Portrait A4 preview · tenant identity · date filters · export/print surface.</p>
          <button disabled className="mt-4 rounded-lg border px-3 py-2 text-xs font-semibold text-slate-500">Open preview</button>
        </div>
      ))}
    </div>
  );
}

function PrintView() {
  return (
    <div className="grid gap-5 xl:grid-cols-2">
      <section className="rounded-2xl border bg-slate-100 p-4">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500">A4 invoice preview</p>
        <div className="mx-auto min-h-[760px] max-w-[560px] bg-white p-8 shadow-lg">
          <div className="flex items-start justify-between border-b pb-5">
            <div>
              {branding && <Image src={branding.logoPath} alt={branding.logoAlt} width={180} height={120} className="h-auto w-36 object-contain" />}
              <p className="mt-2 text-xs font-semibold text-slate-900">Arshad Sons and Engineering Solution</p>
              <p className="text-[10px] text-slate-500">Lahore, Pakistan</p>
            </div>
            <div className="text-right"><h2 className="text-xl font-bold tracking-tight">SALES INVOICE</h2><p className="mt-2 text-xs">INV-1048</p><p className="text-xs text-slate-500">24 Sep 2026</p></div>
          </div>
          <div className="mt-6 grid grid-cols-2 gap-6 text-xs"><div><p className="text-[10px] uppercase text-slate-400">Bill to</p><p className="mt-1 font-semibold">Pak Auto Traders</p><p className="text-slate-500">Lahore</p></div><div className="text-right"><p className="text-[10px] uppercase text-slate-400">Warehouse</p><p className="mt-1 font-semibold">Main Warehouse</p></div></div>
          <table className="mt-6 w-full text-xs"><thead className="border-y bg-slate-50"><tr><th className="py-2 text-left">Item</th><th className="text-right">Qty</th><th className="text-right">Rate</th><th className="text-right">Amount</th></tr></thead><tbody><tr className="border-b"><td className="py-3">Front Hub Full Floating</td><td className="text-right">4</td><td className="text-right">46,625</td><td className="text-right">186,500</td></tr></tbody></table>
          <div className="ml-auto mt-5 w-56 text-xs"><div className="flex justify-between py-1"><span>Subtotal</span><span>186,500</span></div><div className="flex justify-between border-t py-2 text-sm font-bold"><span>Total</span><span>PKR 186,500</span></div></div>
        </div>
      </section>
      <section className="space-y-4">
        <div className="rounded-2xl border bg-white p-5 shadow-sm"><p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Physical cheque preview</p><div className="mt-4 aspect-[2.4/1] rounded-xl border-2 border-dashed border-slate-300 bg-[#fcfbf5] p-5"><div className="flex justify-between text-[10px] text-slate-500"><span>ACCOUNT PAYEE ONLY</span><span>24 / 09 / 2026</span></div><p className="mt-5 text-sm"><span className="text-slate-400">Pay</span> <strong>National Bearing House</strong></p><p className="mt-3 text-xs"><span className="text-slate-400">Rupees</span> One Hundred Eighty Two Thousand Only</p><p className="mt-4 text-right text-sm font-bold">PKR 182,000.00</p></div><p className="mt-3 text-xs text-slate-500">Software layout only. Final bank stationery alignment still requires a physical test print.</p></div>
        <div className="rounded-2xl border bg-white p-5 shadow-sm"><h3 className="text-sm font-semibold">Print policy</h3><ul className="mt-3 space-y-2 text-xs text-slate-600"><li>• Normal business documents: A4 portrait.</li><li>• Thermal layouts: narrow printer-specific size.</li><li>• No app chrome in print output.</li><li>• Tenant branding remains workspace-scoped.</li></ul></div>
      </section>
    </div>
  );
}

function SettingsView() {
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <section className="rounded-2xl border bg-white p-5 shadow-sm">
        <div className="flex items-center gap-3">{branding && <Image src={branding.markPath} alt={branding.logoAlt} width={64} height={64} className="size-14 rounded-xl object-contain" />}<div><p className="text-xs uppercase tracking-wider text-slate-400">Workspace branding</p><h2 className="font-semibold">{workspaceName}</h2></div></div>
        <div className="mt-5 grid gap-3 sm:grid-cols-2">{[["Business name", workspaceName], ["Email", "qa@example.invalid"], ["City", "Lahore"], ["Country", "Pakistan"]].map(([label, value]) => <label key={label} className="text-xs text-slate-500">{label}<input readOnly value={value} className="mt-1 w-full rounded-lg border bg-slate-50 px-3 py-2 text-sm text-slate-800" /></label>)}</div>
      </section>
      <section className="rounded-2xl border bg-white p-5 shadow-sm"><div className="flex items-center gap-2"><Settings className="size-4" /><h3 className="text-sm font-semibold">Workspace controls</h3></div><div className="mt-4 space-y-3">{["FBR integration", "Warehouse tracking", "Customer-specific BOM", "Subscription access"].map((label, index) => <div key={label} className="flex items-center justify-between rounded-xl border px-4 py-3 text-sm"><span>{label}</span><Status tone={index === 0 ? "neutral" : "success"}>{index === 0 ? "Not linked" : "Enabled"}</Status></div>)}</div></section>
    </div>
  );
}

function View({ view }: { view: ViewKey }) {
  if (view === "dashboard") return <DashboardView />;
  if (view === "sales") return <TableCard title="Sales orders" columns={["Order", "Customer", "Warehouse", "Date", "Total", "Status"]} rows={salesRows} />;
  if (view === "purchases") return <TableCard title="Purchase orders" columns={["PO", "Supplier", "Warehouse", "Date", "Total", "Status"]} rows={purchaseRows} />;
  if (view === "inventory") return <TableCard title="Inventory" columns={["SKU", "Product", "Stock", "Reorder", "Warehouse", "Status"]} rows={inventoryRows} />;
  if (view === "customers") return <TableCard title="Customers" columns={["Customer", "City", "Credit terms", "Outstanding", "Status"]} rows={customerRows} />;
  if (view === "suppliers") return <TableCard title="Suppliers" columns={["Supplier", "City", "Credit terms", "Payable", "Status"]} rows={supplierRows} />;
  if (view === "manufacturing") return <ManufacturingView />;
  if (view === "finance") return <FinanceView />;
  if (view === "reports") return <ReportsView />;
  if (view === "print") return <PrintView />;
  return <SettingsView />;
}

export default async function QaPreviewPage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  if (process.env.VERCEL_ENV === "production") notFound();

  const params = await searchParams;
  const requested = params.view ?? "dashboard";
  const view = (views.some(([key]) => key === requested) ? requested : "dashboard") as ViewKey;

  return (
    <div className="min-h-screen bg-[#f7f8f9] text-slate-900">
      <div className="flex min-h-screen">
        <div className="hidden shrink-0 lg:block [&_a]:pointer-events-none">
          <Sidebar workspaceName={workspaceName} role={Role.OWNER} enabledModules={["restaurant", "manufacturing", "services"]} />
        </div>
        <div className="min-w-0 flex-1">
          <header className="sticky top-0 z-30 border-b bg-white/95 backdrop-blur">
            <div className="flex min-h-16 items-center gap-3 px-4 sm:px-6">
              {branding && <Image src={branding.markPath} alt={branding.logoAlt} width={48} height={48} className="size-9 rounded-lg object-contain lg:hidden" />}
              <div className="min-w-0"><p className="truncate text-sm font-semibold lg:text-base">{workspaceName}</p><p className="text-[10px] font-bold uppercase tracking-[0.14em] text-amber-600">Preview-only QA · synthetic data</p></div>
              <Status tone="warning">No production data</Status>
            </div>
            <nav className="overflow-x-auto border-t px-4 sm:px-6" aria-label="QA preview views">
              <div className="flex min-w-max gap-1 py-2">{views.map(([key, label]) => <Link key={key} href={`/qa-preview?view=${key}`} className={`rounded-lg px-3 py-2 text-xs font-semibold ${view === key ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100"}`}>{label}</Link>)}</div>
            </nav>
          </header>
          <main className="mx-auto max-w-[1500px] p-4 sm:p-6">
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
              <div><p className="text-[11px] font-bold uppercase tracking-[0.15em] text-emerald-700">Visual regression harness</p><h1 className="mt-1 text-2xl font-semibold tracking-tight">{views.find(([key]) => key === view)?.[1]}</h1></div>
              <div className="flex items-center gap-2 text-xs text-slate-500"><Building2 className="size-4" /> Arshad Sons tenant branding test</div>
            </div>
            <View view={view} />
            <footer className="mt-8 grid gap-3 border-t pt-5 text-xs text-slate-500 sm:grid-cols-2 xl:grid-cols-5">
              <span className="flex items-center gap-2"><ShoppingCart className="size-4" /> Sales</span><span className="flex items-center gap-2"><Package className="size-4" /> Inventory</span><span className="flex items-center gap-2"><Users className="size-4" /> Parties</span><span className="flex items-center gap-2"><Landmark className="size-4" /> Finance</span><span className="flex items-center gap-2"><Wrench className="size-4" /> Manufacturing</span>
            </footer>
          </main>
        </div>
      </div>
    </div>
  );
}
