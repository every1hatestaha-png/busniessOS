import Link from "next/link";
import { Banknote, ChefHat, Clock3, LayoutGrid, MessageCircleMore, ShoppingCart, ClipboardList, UtensilsCrossed } from "lucide-react";

import { MetricCard } from "@/components/business/metric-card";
import { PageHeader } from "@/components/business/page-header";
import { RestaurantControls } from "@/app/(dashboard)/restaurant/restaurant-controls";
import { RestaurantLifecycleControls } from "@/app/(dashboard)/restaurant/restaurant-lifecycle-controls";
import { Card, CardContent } from "@/components/ui/card";
import { requireWorkspace } from "@/lib/server/auth";
import { listProducts } from "@/lib/server/products";
import { listSales } from "@/lib/server/sales";
import {
  getIndustryHealth,
  listCashShifts,
  listKitchenTickets,
  listRestaurantRecipes,
  listRestaurantTables,
  listWorkspaceModules,
} from "@/lib/server/industry-modules";
import { getRestaurantWorkspaceMetrics } from "@/lib/server/restaurant-workspace";

export default async function RestaurantPage() {
  const { workspaceId, role } = await requireWorkspace();
  const modules = await listWorkspaceModules(workspaceId);
  if (!modules.some((module) => module.moduleKey === "restaurant" && module.enabled)) {
    return <ModuleDisabled />;
  }

  const [health, tables, recipes, tickets, shifts, products, sales, restaurantMetrics] = await Promise.all([
    getIndustryHealth(workspaceId),
    listRestaurantTables(workspaceId),
    listRestaurantRecipes(workspaceId),
    listKitchenTickets(workspaceId),
    listCashShifts(workspaceId),
    listProducts(workspaceId),
    listSales(workspaceId),
    getRestaurantWorkspaceMetrics(workspaceId),
  ]);
  const openShift = shifts.find((shift) => shift.status === "OPEN");
  const canManageTables = role === "OWNER" || role === "ADMIN" || role === "MANAGER";

  return (
    <div className="mx-auto max-w-[1600px] space-y-6">
      <PageHeader title="Restaurant Workspace" description="POS, kitchen flow, tables, recipes, stock and cash operations in one tenant-isolated workspace." />

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <MetricCard label="Today's sales" value={`Rs ${restaurantMetrics.todaySales.toLocaleString()}`} detail={`${restaurantMetrics.todayOrders} restaurant orders today`} icon={Banknote} />
        <MetricCard label="Live orders" value={String(restaurantMetrics.liveOrders)} detail="Confirmed, preparing or ready" icon={ClipboardList} />
        <MetricCard label="Saved WhatsApp reviews" value={String(restaurantMetrics.pendingWhatsapp)} detail="Saved orders waiting for staff confirmation" icon={MessageCircleMore} />
        <MetricCard label="Ready" value={String(restaurantMetrics.readyOrders)} detail="Orders ready to hand over" icon={ChefHat} />
        <MetricCard label="Cash shift" value={openShift ? "Open" : "Closed"} detail={openShift ? `Rs ${openShift.openingCash.toLocaleString()} opening cash` : "No open cash shift"} icon={Banknote} />
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <QuickLink href="/restaurant/pos" title="POS" description="Create dine-in, takeaway or delivery order" icon={ShoppingCart} />
        <QuickLink href="/restaurant/orders" title="Orders" description="Review and move live orders" icon={ClipboardList} />
        <QuickLink href="/restaurant/kitchen" title="Kitchen" description="Preparation board and ready queue" icon={ChefHat} />
        <QuickLink href="/restaurant/menu" title="Menu" description="Items, prices and availability" icon={UtensilsCrossed} />
        <QuickLink href="/restaurant/whatsapp" title="Saved WhatsApp reviews" description="Saved messages and pending reviews" icon={MessageCircleMore} />
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Tables" value={String(health.restaurant.tables)} detail="Configured dining tables" icon={LayoutGrid} />
        <MetricCard label="Active recipes" value={String(health.restaurant.recipes)} detail="Recipes connected to inventory" icon={ChefHat} />
        <MetricCard label="Legacy KOT queue" value={String(health.restaurant.openKitchenTickets)} detail="Existing sales-linked kitchen tickets" icon={Clock3} />
        <MetricCard label="Menu & order layer" value="V1" detail="Restaurant-native ordering foundation" icon={UtensilsCrossed} />
      </section>

      <RestaurantControls workspaceId={workspaceId} openShiftId={openShift?.id ?? null} canManageTables={canManageTables} />

      <RestaurantLifecycleControls
        workspaceId={workspaceId}
        products={products.filter((product) => product.status === "ACTIVE").map((product) => ({ id: product.id, name: product.name, sku: product.sku }))}
        tables={tables.map((table) => ({ id: table.id, name: table.name, status: table.status }))}
        sales={sales.slice(0, 100).map((sale) => ({ id: sale.id, orderNumber: sale.orderNumber, customerName: sale.customerName, status: sale.status }))}
        tickets={tickets.map((ticket) => ({ id: ticket.id, ticketNumber: ticket.ticketNumber, status: ticket.status, tableName: ticket.tableName, salesOrderId: ticket.salesOrderId }))}
        canManageRecipes={canManageTables}
      />

      <div className="grid gap-5 xl:grid-cols-2">
        <DataCard title="Table register" description="Current dining-floor state." action={{ label: "Open POS", href: "/restaurant/pos" }}>
          {tables.length ? <Table headers={["Table", "Area", "Capacity", "Status"]} rows={tables.map((row) => [row.name, row.area || "—", String(row.capacity), row.status])} /> : <Empty text="No restaurant tables configured yet." />}
        </DataCard>
        <DataCard title="Recipes" description="Finished products connected to ingredient consumption." action={{ label: "Inventory", href: "/inventory" }}>
          {recipes.length ? <Table headers={["Product", "Yield", "Ingredients", "State"]} rows={recipes.map((row) => [row.productName || "Unknown product", String(row.yieldQuantity), String(row.ingredientCount), row.isActive ? "ACTIVE" : "INACTIVE"])} /> : <Empty text="No recipes configured yet." />}
        </DataCard>
        <DataCard title="Legacy kitchen tickets" description="Sales-order kitchen tickets from the existing restaurant module." action={{ label: "Kitchen board", href: "/restaurant/kitchen" }}>
          {tickets.length ? <Table headers={["Ticket", "Table", "Status", "Created"]} rows={tickets.map((row) => [row.ticketNumber, row.tableName || "—", row.status, formatDate(row.createdAt)])} /> : <Empty text="No legacy kitchen tickets yet." />}
        </DataCard>
        <DataCard title="Cash shifts" description="Latest opening/closing records and cash variance.">
          {shifts.length ? <Table headers={["Opened", "Status", "Opening", "Variance"]} rows={shifts.map((row) => [formatDate(row.openedAt), row.status, `Rs ${row.openingCash.toLocaleString()}`, row.variance === null ? "—" : `Rs ${row.variance.toLocaleString()}`])} /> : <Empty text="No cash shifts recorded yet." />}
        </DataCard>
      </div>
    </div>
  );
}

function QuickLink({ href, title, description, icon: Icon }: { href: string; title: string; description: string; icon: React.ComponentType<{ className?: string }> }) {
  return <Link href={href} className="group rounded-lg border bg-card p-4 shadow-sm transition hover:border-emerald-300 hover:bg-emerald-50/30 dark:hover:bg-emerald-950/10"><div className="flex items-center gap-2"><Icon className="size-4 text-emerald-600" /><p className="font-semibold">{title}</p></div><p className="mt-1 text-xs text-muted-foreground">{description}</p></Link>;
}

function DataCard({ title, description, action, children }: { title: string; description: string; action?: { label: string; href: string }; children: React.ReactNode }) {
  return <Card className="gap-0 rounded-md border py-0 shadow-none ring-0"><CardContent className="p-0"><div className="flex items-center justify-between gap-3 border-b px-4 py-3"><div><p className="text-sm font-medium">{title}</p><p className="text-xs text-muted-foreground">{description}</p></div>{action ? <Link href={action.href} className="text-sm font-semibold text-emerald-700 hover:underline">{action.label}</Link> : null}</div>{children}</CardContent></Card>;
}

function Table({ headers, rows }: { headers: string[]; rows: string[][] }) {
  return <div className="overflow-x-auto"><table className="w-full text-sm"><thead className="bg-muted/40 text-left text-xs text-muted-foreground"><tr>{headers.map((header) => <th key={header} className="px-4 py-2.5">{header}</th>)}</tr></thead><tbody className="divide-y">{rows.map((row, index) => <tr key={index}>{row.map((cell, cellIndex) => <td key={cellIndex} className={cellIndex === 0 ? "px-4 py-3 font-medium" : "px-4 py-3 text-muted-foreground"}>{cell}</td>)}</tr>)}</tbody></table></div>;
}

function Empty({ text }: { text: string }) { return <div className="p-5 text-sm text-muted-foreground">{text}</div>; }
function formatDate(value: Date) { return new Intl.DateTimeFormat("en-PK", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Karachi" }).format(value); }
function ModuleDisabled() { return <div className="mx-auto max-w-3xl py-12"><Card><CardContent className="space-y-3 p-6"><h1 className="text-xl font-semibold">Restaurant module unavailable</h1><p className="text-sm text-muted-foreground">Restaurant workflows are not enabled for this workspace.</p><Link href="/subscription" className="text-sm font-semibold text-emerald-700 hover:underline">View workspace access</Link></CardContent></Card></div>; }
