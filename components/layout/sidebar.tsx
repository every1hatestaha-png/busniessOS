"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Role } from "@prisma/client";
import type { LucideIcon } from "lucide-react";
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
  MessageCircleMore,
  UtensilsCrossed,
  Factory,
  BriefcaseBusiness,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { getWorkspaceBranding } from "@/lib/workspace-branding";

type SidebarRoute = {
  href: string;
  label: string;
  icon: LucideIcon;
  financial?: boolean;
  module?: "restaurant" | "manufacturing" | "services";
};

type SidebarSection = {
  label: string;
  routes: SidebarRoute[];
};

const sections: SidebarSection[] = [
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
  { label: "Industry", routes: [
    { href: "/restaurant", label: "Restaurant", icon: UtensilsCrossed, module: "restaurant" },
    { href: "/manufacturing", label: "Manufacturing", icon: Factory, module: "manufacturing" },
    { href: "/services", label: "Services", icon: BriefcaseBusiness, module: "services" },
  ] },
  { label: "Finance", routes: [
    { href: "/khata", label: "Khata", icon: BookOpen },
    { href: "/invoices", label: "Invoices", icon: Receipt },
    { href: "/collections", label: "Smart Collections", icon: MessageCircleMore, financial: true },
    { href: "/receivables", label: "Receivables", icon: HandCoins, financial: true },
    { href: "/accounting/cash-bank", label: "Cash & Bank", icon: Landmark, financial: true },
    { href: "/accounting/expenses", label: "Expenses", icon: CircleDollarSign, financial: true },
    { href: "/accounting/notes", label: "Credit & Debit Notes", icon: FileText, financial: true },
    { href: "/payables", label: "Payables", icon: Landmark, financial: true },
    { href: "/reports", label: "Reports", icon: ChartNoAxesCombined, financial: true },
  ] },
  { label: "Workspace", routes: [
    { href: "/ai", label: "AI Assistant", icon: Sparkles },
    { href: "/settings", label: "Settings", icon: Settings },
  ] },
];

export function Sidebar({
  workspaceName,
  role,
  enabledModules,
}: {
  workspaceName: string;
  role: Role;
  enabledModules: string[];
}) {
  const pathname = usePathname();
  const enabled = new Set(enabledModules);
  const branding = getWorkspaceBranding(workspaceName);

  return (
    <aside className="flex h-full w-[260px] flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground">
      <div className="flex h-[72px] shrink-0 items-center gap-3 border-b border-sidebar-border px-4">
        {branding ? (
          <div className="relative h-12 w-14 shrink-0 overflow-hidden rounded-xl border border-white/15 bg-black shadow-sm" aria-label={branding.logoAlt}>
            <Image
              src={branding.logoPath}
              alt={branding.logoAlt}
              width={108}
              height={72}
              unoptimized
              priority
              className="absolute left-1/2 top-0 h-[72px] w-[108px] max-w-none -translate-x-1/2 object-cover"
            />
          </div>
        ) : (
          <div className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-white/10 bg-white/[0.04] p-1.5 shadow-sm">
            <Image
              src="/brand/munshios-mark.svg"
              alt="MunshiOS"
              width={40}
              height={40}
              priority
              className="size-full object-contain"
            />
          </div>
        )}
        <div className="min-w-0 leading-tight">
          <p className="text-base font-semibold tracking-[-0.02em] text-white">MunshiOS</p>
          <p className="mt-0.5 truncate text-[11px] text-slate-400" title={workspaceName}>{workspaceName}</p>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto px-2.5 py-3">
        <nav aria-label="Primary navigation" className="space-y-4">
          {sections.map((section) => {
            const visibleRoutes = section.routes.filter((route) => {
              if (role === "STAFF" && route.financial) return false;
              if (route.module && !enabled.has(route.module)) return false;
              return true;
            });
            if (!visibleRoutes.length) return null;
            return <div key={section.label}>
              <p className="mb-1 px-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">{section.label}</p>
              <div className="space-y-1">
                {visibleRoutes.map((route) => {
                  const isActive = pathname === route.href || pathname?.startsWith(`${route.href}/`);
                  return (
                    <Link
                      key={route.href}
                      href={route.href}
                      aria-current={isActive ? "page" : undefined}
                      className={cn(
                        "flex h-9 items-center gap-2.5 rounded-md border border-transparent px-2.5 text-[13px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring",
                        isActive
                          ? "border-white/10 bg-sidebar-accent text-white"
                          : "text-slate-400 hover:bg-white/5 hover:text-slate-100"
                      )}
                    >
                      <route.icon className={cn("size-4", isActive ? "text-emerald-400" : "text-slate-500")} />
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
