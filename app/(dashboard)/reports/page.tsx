import { ArrowUpRight, BookOpen, Boxes, FileText, HandCoins, Landmark, PackageSearch, ReceiptText, ShoppingCart, Truck, UsersRound } from "lucide-react";
import Link from "next/link";
import { requirePermission } from "@/lib/server/authorization";

const sections = [
  { title: "Financial", reports: [
    { href: "/reports/profit-loss", title: "Profit & Loss", description: "Revenue, historical COGS, expenses, and net profit.", icon: ReceiptText },
    { href: "/reports/general-ledger", title: "General Ledger", description: "Account activity with opening, running, and closing balances.", icon: BookOpen },
    { href: "/reports/cash-bank", title: "Cash & Bank Ledger", description: "Receipts, payments, and GL-backed account balances.", icon: Landmark },
    { href: "/payables", title: "Payables Aging", description: "Accepted supplier liabilities by aging bucket.", icon: Truck },
    { href: "/receivables", title: "Receivables Aging", description: "Outstanding customer invoices by aging bucket.", icon: HandCoins },
  ] },
  { title: "Sales & Purchasing", reports: [
    { href: "/sales", title: "Sales Register", description: "Persisted customer sales orders and settlement status.", icon: ShoppingCart },
    { href: "/invoices", title: "Invoice Register", description: "Persisted invoices, balances, and payment status.", icon: FileText },
    { href: "/purchases", title: "Purchase Order Register", description: "Purchase commitments and goods-receipt progress.", icon: Truck },
  ] },
  { title: "Accounts", reports: [
    { href: "/reports/customer-statement", title: "Customer Statement", description: "Customer Khata transactions and running balance.", icon: UsersRound },
    { href: "/reports/supplier-statement", title: "Supplier Statement", description: "Supplier Khata transactions and running balance.", icon: UsersRound },
  ] },
  { title: "Inventory", reports: [
    { href: "/reports/current-stock", title: "Current Stock & Valuation", description: "On-hand quantities and value using the existing current-cost basis.", icon: Boxes },
    { href: "/reports/stock-movement", title: "Stock Movement", description: "Dated inventory inflows, outflows, costs, and running quantity.", icon: PackageSearch },
  ] },
] as const;

export default async function ReportsPage() {
  await requirePermission("financial.manage");
  return (
    <div className="mx-auto max-w-7xl space-y-7">
      <header className="border-b border-neutral-200 pb-5"><p className="text-xs font-semibold uppercase tracking-[0.2em] text-neutral-400">Financial control</p><h1 className="mt-1 text-3xl font-bold tracking-tight">Reports Center</h1><p className="mt-1 text-sm text-neutral-500">Filter, review, and print reports generated from posted workspace records.</p></header>
      {sections.map((section) => <section key={section.title} className="space-y-3"><h2 className="text-xs font-bold uppercase tracking-[0.16em] text-neutral-500">{section.title}</h2><div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-3">{section.reports.map(({ href, title, description, icon: Icon }) => (
        <Link key={href} href={href} className="group min-h-32 border border-neutral-200 bg-white p-4 transition hover:border-neutral-500 hover:bg-neutral-50">
          <div className="flex items-start justify-between"><span className="bg-neutral-950 p-2 text-white"><Icon className="h-4 w-4" /></span><ArrowUpRight className="h-4 w-4 text-neutral-300 transition group-hover:text-neutral-900" /></div>
          <h3 className="mt-4 font-semibold text-neutral-950">{title}</h3><p className="mt-1 text-sm leading-5 text-neutral-500">{description}</p>
        </Link>
      ))}</div></section>)}
    </div>
  );
}
