import Link from "next/link";
import { Banknote, ChefHat, Clock3, LayoutGrid } from "lucide-react";

import { MetricCard } from "@/components/business/metric-card";
import { PageHeader } from "@/components/business/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { requireWorkspace } from "@/lib/server/auth";
import {
  getIndustryHealth,
  listCashShifts,
  listKitchenTickets,
  listRestaurantRecipes,
  listRestaurantTables,
  listWorkspaceModules,
} from "@/lib/server/industry-modules";

export default async function RestaurantPage() {
  const { workspaceId } = await requireWorkspace();
  const modules = await listWorkspaceModules(workspaceId);
  if (!modules.some((module) => module.moduleKey === "restaurant" && module.enabled)) {
    return <ModuleDisabled />;
  }

  const [health, tables, recipes, tickets, shifts] = await Promise.all([
    getIndustryHealth(workspaceId),
    listRestaurantTables(workspaceId),
    listRestaurantRecipes(workspaceId),
    listKitchenTickets(workspaceId),
    listCashShifts(workspaceId),
  ]);
  const openShift = shifts.find((shift) => shift.status === "OPEN");

  return (
    <div className="mx-auto max-w-[1600px] space-y-6">
      <PageHeader title="Restaurant" description="Tables, kitchen flow, recipes, ingredient stock, and cash closing in one workspace." />
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Tables" value={String(health.restaurant.tables)} detail="Configured dining tables" icon={LayoutGrid} />
        <MetricCard label="Active recipes" value={String(health.restaurant.recipes)} detail="Recipes connected to inventory" icon={ChefHat} />
        <MetricCard label="Kitchen queue" value={String(health.restaurant.openKitchenTickets)} detail="Queued, preparing, or ready" icon={Clock3} />
        <MetricCard label="Cash shift" value={openShift ? "Open" : "Closed"} detail={openShift ? `Opened with Rs ${openShift.openingCash.toLocaleString()}` : "No open cash shift"} icon={Banknote} />
      </section>

      <div className="grid gap-5 xl:grid-cols-2">
        <DataCard title="Table register" description="Current dining-floor state." action={{ label: "New sale", href: "/sales/new" }}>
          {tables.length ? <Table headers={["Table", "Area", "Capacity", "Status"]} rows={tables.map((row) => [row.name, row.area || "—", String(row.capacity), row.status])} /> : <Empty text="No restaurant tables configured yet." />}
        </DataCard>
        <DataCard title="Recipes" description="Finished products connected to ingredient consumption." action={{ label: "Inventory", href: "/inventory" }}>
          {recipes.length ? <Table headers={["Product", "Yield", "Ingredients", "State"]} rows={recipes.map((row) => [row.productName || "Unknown product", String(row.yieldQuantity), String(row.ingredientCount), row.isActive ? "ACTIVE" : "INACTIVE"])} /> : <Empty text="No recipes configured yet." />}
        </DataCard>
        <DataCard title="Kitchen tickets" description="Latest 50 kitchen tickets and preparation states.">
          {tickets.length ? <Table headers={["Ticket", "Table", "Status", "Created"]} rows={tickets.map((row) => [row.ticketNumber, row.tableName || "—", row.status, formatDate(row.createdAt)])} /> : <Empty text="No kitchen tickets yet." />}
        </DataCard>
        <DataCard title="Cash shifts" description="Latest opening/closing records and cash variance.">
          {shifts.length ? <Table headers={["Opened", "Status", "Opening", "Variance"]} rows={shifts.map((row) => [formatDate(row.openedAt), row.status, `Rs ${row.openingCash.toLocaleString()}`, row.variance === null ? "—" : `Rs ${row.variance.toLocaleString()}`])} /> : <Empty text="No cash shifts recorded yet." />}
        </DataCard>
      </div>
    </div>
  );
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
