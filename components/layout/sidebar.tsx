"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Role } from "@prisma/client";
import type { LucideIcon } from "lucide-react";
import {
  BookOpen,
  BriefcaseBusiness,
  ChartNoAxesCombined,
  ChefHat,
  CircleDollarSign,
  ClipboardList,
  Factory,
  FileText,
  HandCoins,
  Landmark,
  LayoutDashboard,
  MessageCircleMore,
  Package,
  PackageCheck,
  Receipt,
  Settings,
  ShoppingCart,
  Sparkles,
  Truck,
  Users,
  UtensilsCrossed,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { getWorkspaceBranding } from "@/lib/workspace-branding";
import type { WorkspaceVertical } from "@/lib/verticals/registry";
import { getVerticalNavigation } from "@/lib/verticals/experience";

type SidebarRoute = {
  href: string;
  label: string;
  icon: LucideIcon;
  financial?: boolean;
  module?: "restaurant" | "manufacturing" | "services";
};

const routes: SidebarRoute[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/sales", label: "Sales", icon: ShoppingCart },
  { href: "/purchases", label: "Purchases", icon: FileText },
  { href: "/goods-receipts", label: "Goods Receipts", icon: PackageCheck },
  { href: "/inventory", label: "Inventory", icon: Package },
  { href: "/customers", label: "Customers", icon: Users },
  { href: "/suppliers", label: "Suppliers", icon: Truck },
  { href: "/supplier-returns", label: "Supplier Returns", icon: Truck, financial: true },
  { href: "/restaurant", label: "Overview", icon: UtensilsCrossed, module: "restaurant" },
  { href: "/restaurant/pos", label: "POS", icon: ShoppingCart, module: "restaurant" },
  { href: "/restaurant/orders", label: "Orders", icon: ClipboardList, module: "restaurant" },
  { href: "/restaurant/kitchen", label: "Kitchen", icon: ChefHat, module: "restaurant" },
  { href: "/restaurant/menu", label: "Menu", icon: BookOpen, module: "restaurant" },
  { href: "/restaurant/whatsapp", label: "WhatsApp", icon: MessageCircleMore, module: "restaurant" },
  { href: "/manufacturing", label: "Manufacturing", icon: Factory, module: "manufacturing" },
  { href: "/services", label: "Services", icon: BriefcaseBusiness, module: "services" },
  { href: "/khata", label: "Khata", icon: BookOpen },
  { href: "/invoices", label: "Invoices", icon: Receipt },
  { href: "/collections", label: "Smart Collections", icon: MessageCircleMore, financial: true },
  { href: "/receivables", label: "Receivables", icon: HandCoins, financial: true },
  { href: "/accounting/cash-bank", label: "Cash & Bank", icon: Landmark, financial: true },
  { href: "/accounting/expenses", label: "Expenses", icon: CircleDollarSign, financial: true },
  { href: "/accounting/notes", label: "Credit & Debit Notes", icon: FileText, financial: true },
  { href: "/payables", label: "Payables", icon: Landmark, financial: true },
  { href: "/reports", label: "Reports", icon: ChartNoAxesCombined, financial: true },
  { href: "/ai", label: "AI Assistant", icon: Sparkles },
  { href: "/settings", label: "Settings", icon: Settings },
];

const routeByHref = new Map(routes.map((route) => [route.href, route]));

export function Sidebar({
  workspaceName,
  role,
  enabledModules,
  vertical,
}: {
  workspaceName: string;
  role: Role;
  enabledModules: string[];
  vertical: WorkspaceVertical;
}) {
  const pathname = usePathname();
  const enabled = new Set(enabledModules);
  const branding = getWorkspaceBranding(workspaceName);
  const restaurantMode = vertical === "RESTAURANT";

  return (
    <aside className={cn(
      "flex h-full flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground",
      restaurantMode ? "w-[248px]" : "w-[260px]",
    )}>
      <div className={cn(
        "flex shrink-0 items-center gap-3 border-b border-sidebar-border",
        restaurantMode ? "h-[76px] px-[18px]" : "h-[72px] px-4",
      )}>
        {branding ? (
          <div className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-white/15 bg-black shadow-sm" aria-label={branding.logoAlt}>
            <Image src={branding.markPath} alt={branding.logoAlt} width={48} height={48} unoptimized priority className="size-full object-contain" />
          </div>
        ) : (
          <div className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-white/10 bg-white/[0.04] p-1.5 shadow-sm">
            <Image src="/brand/munshios-mark.svg" alt="MunshiOS" width={40} height={40} priority className="size-full object-contain" />
          </div>
        )}
        <div className="min-w-0 leading-tight">
          <p className="text-base font-semibold tracking-[-0.02em] text-white">MunshiOS</p>
          <p className="mt-0.5 truncate text-[11px] text-slate-400" title={workspaceName}>{workspaceName}</p>
          {restaurantMode ? <p className="mt-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-emerald-400">Restaurant workspace</p> : null}
        </div>
      </div>

      <div className={cn("flex-1 overflow-y-auto", restaurantMode ? "px-[18px] py-3" : "px-2.5 py-3")}>
        <nav aria-label="Primary navigation" className={restaurantMode ? "space-y-3" : "space-y-4"}>
          {getVerticalNavigation(vertical).map((section) => {
            const visibleRoutes = section.routes
              .map((href) => routeByHref.get(href))
              .filter((route): route is SidebarRoute => Boolean(route))
              .filter((route) => {
                if (role === "STAFF" && route.financial) return false;
                if (route.module && !enabled.has(route.module)) return false;
                return true;
              });

            if (!visibleRoutes.length) return null;

            return (
              <div key={section.label}>
                <p className={cn(
                  "mb-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500",
                  restaurantMode ? "px-0" : "px-2",
                )}>
                  {section.label}
                </p>
                <div className="space-y-1">
                  {visibleRoutes.map((route) => {
                    const isRootRestaurant = route.href === "/restaurant";
                    const isActive = isRootRestaurant
                      ? pathname === route.href
                      : pathname === route.href || pathname?.startsWith(`${route.href}/`);
                    const displayLabel = restaurantMode && route.href === "/accounting/cash-bank"
                      ? "Cash & Closing"
                      : route.label;

                    return (
                      <Link
                        key={route.href}
                        href={route.href}
                        prefetch={false}
                        aria-current={isActive ? "page" : undefined}
                        className={cn(
                          restaurantMode
                            ? "flex h-[42px] items-center gap-2.5 rounded-[10px] border border-transparent px-3 text-[13px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring"
                            : "flex h-9 items-center gap-2.5 rounded-md border border-transparent px-2.5 text-[13px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring",
                          isActive
                            ? restaurantMode
                              ? "border-emerald-400/15 bg-emerald-400/10 text-emerald-100"
                              : "border-white/10 bg-sidebar-accent text-white"
                            : "text-slate-400 hover:bg-white/5 hover:text-slate-100",
                        )}
                      >
                        <route.icon className={cn("size-4", isActive ? "text-emerald-400" : "text-slate-500")} />
                        <span className="truncate">{displayLabel}</span>
                      </Link>
                    );
                  })}
                </div>
              </div>
            );
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
