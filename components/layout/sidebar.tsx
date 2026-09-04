"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Role } from "@prisma/client";
import {
  LayoutDashboard,
  ShoppingCart,
  Users,
  Package,
  FileText,
  Truck,
  BookOpen,
  Receipt,
  Landmark,
  Settings,
  Sparkles,
  ChartNoAxesCombined,
  HandCoins,
  CircleDollarSign,
  PackageCheck,
} from "lucide-react";
import { cn } from "@/lib/utils";

const sections = [
  { label: "Overview", routes: [
    { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  ] },
  { label: "Operations", routes: [
    { href: "/sales", label: "Sales", icon: ShoppingCart },
    { href: "/purchases", label: "Purchases", icon: FileText },
    { href: "/goods-receipts", label: "Goods Receipts", icon: PackageCheck },
    { href: "/inventory", label: "Inventory", icon: Package },
    { href: "/customers", label: "Customers", icon: Users },
    { href: "/suppliers", label: "Suppliers", icon: Truck },
    { href: "/supplier-returns", label: "Supplier Returns", icon: Truck, financial: true },
  ] },
  { label: "Finance", routes: [
    { href: "/khata", label: "Khata", icon: BookOpen },
    { href: "/invoices", label: "Invoices", icon: Receipt },
    { href: "/receivables", label: "Receivables", icon: HandCoins, financial: true },
    { href: "/accounting/cash-bank", label: "Cash & Bank", icon: Landmark, financial: true },
    { href: "/accounting/expenses", label: "Expenses", icon: CircleDollarSign, financial: true },
    { href: "/payables", label: "Payables", icon: Landmark, financial: true },
    { href: "/reports", label: "Reports", icon: ChartNoAxesCombined, financial: true },
  ] },
  { label: "Workspace", routes: [
    { href: "/ai", label: "AI Assistant", icon: Sparkles },
    { href: "/settings", label: "Settings", icon: Settings },
  ] },
];

export function Sidebar({ workspaceName, role }: { workspaceName: string; role: Role }) {
  const pathname = usePathname();

  return (
    <aside className="flex h-full w-[236px] flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground">
      <div className="flex h-16 shrink-0 items-center gap-3 border-b border-sidebar-border px-4">
        <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-sidebar-primary text-sm font-bold text-sidebar-primary-foreground">B</div>
        <div className="min-w-0 leading-tight">
          <p className="text-sm font-semibold tracking-tight text-white">BusinessOS</p>
          <p className="mt-0.5 truncate text-[11px] text-slate-400" title={workspaceName}>{workspaceName}</p>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto px-2.5 py-3 [scrollbar-width:thin]">
        <nav aria-label="Primary navigation" className="space-y-4">
          {sections.map((section) => {
            const visibleRoutes = section.routes.filter((route) => role !== "STAFF" || !route.financial);
            if (!visibleRoutes.length) return null;
            return <div key={section.label}>
              <p className="mb-1 px-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">{section.label}</p>
              <div className="space-y-0.5">
                {visibleRoutes.map((route) => {
                  const isActive = pathname === route.href || pathname?.startsWith(`${route.href}/`);
                  return (
                    <Link
                      key={route.href}
                      href={route.href}
                      aria-current={isActive ? "page" : undefined}
                      className={cn(
                        "flex h-8 items-center gap-2.5 rounded-md border border-transparent px-2 text-[13px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring",
                        isActive
                          ? "border-white/10 bg-sidebar-accent text-white"
                          : "text-slate-400 hover:bg-white/5 hover:text-slate-100"
                      )}
                    >
                      <route.icon className={cn("size-4", isActive ? "text-blue-400" : "text-slate-500")} />
                      <span className="truncate">{route.label}</span>
                    </Link>
                  );
                })}
              </div>
            </div>;
          })}
        </nav>
      </div>
      <div className="border-t border-sidebar-border px-4 py-3">
        <p className="text-[10px] uppercase tracking-[0.14em] text-slate-500">Signed in as</p>
        <p className="mt-1 text-xs font-medium text-slate-300">{role.toLowerCase()}</p>
      </div>
    </aside>
  );
}
