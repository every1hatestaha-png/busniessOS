import Link from "next/link";
import { Boxes, Factory, PackageCheck, Warehouse } from "lucide-react";

import { ManufacturingControls } from "@/app/(dashboard)/manufacturing/manufacturing-controls";
import { ProductionLifecycleControls } from "@/app/(dashboard)/manufacturing/production-lifecycle-controls";
import { MetricCard } from "@/components/business/metric-card";
import { PageHeader } from "@/components/business/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { requireWorkspace } from "@/lib/server/auth";
import { listProducts } from "@/lib/server/products";
import {
  getIndustryHealth,
  listBoms,
  listProductionRuns,
  listWarehouses,
  listWorkspaceModules,
} from "@/lib/server/industry-modules";

export default async function ManufacturingPage() {
  const { workspaceId, role } = await requireWorkspace();
  const modules = await listWorkspaceModules(workspaceId);
  if (!modules.some((module) => module.moduleKey === "manufacturing" && module.enabled)) return <ModuleDisabled />;

  const [health, warehouses, boms, runs, products] = await Promise.all([
    getIndustryHealth(workspaceId),
    listWarehouses(workspaceId),
    listBoms(workspaceId),
    listProductionRuns(workspaceId),
    listProducts(workspaceId),
  ]);
  const canManage = role === "OWNER" || role === "ADMIN" || role === "MANAGER";

  return (
    <div className="mx-auto max-w-[1600px] space-y-6">
      <PageHeader title="Manufacturing" description="Warehouses, BOMs, production runs, raw-material consumption, and finished goods." />
      <section className="grid gap-3 sm:grid-cols-3">
        <MetricCard label="Warehouses" value={String(health.manufacturing.warehouses)} detail="Active warehouse locations" icon={Warehouse} />
        <MetricCard label="Active BOMs" value={String(health.manufacturing.boms)} detail="Production recipes and material plans" icon={Boxes} />
        <MetricCard label="Open production" value={String(health.manufacturing.openProductionRuns)} detail="Draft or approved runs" icon={Factory} />
      </section>

      <ManufacturingControls
        products={products.filter((product) => product.status === "ACTIVE").map((product) => ({ id: product.id, name: product.name, sku: product.sku }))}
        boms={boms.filter((bom) => bom.isActive).map((bom) => ({ id: bom.id, name: bom.name, version: bom.version }))}
        canManage={canManage}
      />

      <ProductionLifecycleControls
        runs={runs.map((run) => ({ id: run.id, runNumber: run.runNumber, status: run.status, plannedOutput: run.plannedOutput, actualOutput: run.actualOutput, wastageQuantity: run.wastageQuantity }))}
        canManage={canManage}
      />

      <div className="grid gap-5 xl:grid-cols-2">
        <DataCard title="Warehouses" description="Inventory locations used by manufacturing.">
          {warehouses.length ? <Table headers={["Warehouse", "Code", "Default", "State"]} rows={warehouses.map((row) => [row.name, row.code, row.isDefault ? "YES" : "—", row.isActive ? "ACTIVE" : "INACTIVE"])} /> : <Empty text="No warehouses configured yet." />}
        </DataCard>
        <DataCard title="Bills of material" description="Versioned finished-good recipes and material counts.">
          {boms.length ? <Table headers={["BOM", "Product", "Version", "Materials"]} rows={boms.map((row) => [row.name, row.finishedProductName || "Unknown product", `v${row.version}`, String(row.itemCount)])} /> : <Empty text="No BOMs configured yet." />}
        </DataCard>
      </div>

      <DataCard title="Production runs" description="Latest 50 runs with approval/posting lifecycle and full traceability.">
        {runs.length ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-4 py-2.5">Run</th>
                  <th className="px-4 py-2.5">BOM</th>
                  <th className="px-4 py-2.5">Status</th>
                  <th className="px-4 py-2.5 text-right">Planned</th>
                  <th className="px-4 py-2.5 text-right">Actual</th>
                  <th className="px-4 py-2.5 text-right">Wastage</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {runs.map((row) => (
                  <tr key={row.id}>
                    <td className="px-4 py-3 font-medium">
                      <Link href={"/manufacturing/runs/" + row.id} className="text-emerald-700 hover:underline">
                        {row.runNumber}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{row.bomName}</td>
                    <td className="px-4 py-3"><span className="rounded-full border px-2 py-1 text-xs">{row.status}</span></td>
                    <td className="px-4 py-3 text-right text-muted-foreground">{row.plannedOutput}</td>
                    <td className="px-4 py-3 text-right">{row.actualOutput === null ? "—" : row.actualOutput}</td>
                    <td className="px-4 py-3 text-right text-muted-foreground">{row.wastageQuantity}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <Empty text="No production runs yet." />}
      </DataCard>

      <Card className="rounded-md border shadow-none ring-0"><CardContent className="grid gap-4 p-5 md:grid-cols-3">
        <WorkflowCard title="1. Raw material" description="Purchase and receive material through PO → GRN so stock remains authoritative." href="/purchases" label="Open purchases" />
        <WorkflowCard title="2. Inventory" description="Production posting checks raw stock and records traceable inventory transactions." href="/inventory" label="Review inventory" />
        <WorkflowCard title="3. Finished goods" description="Posted output updates finished stock and weighted cost atomically." href="/reports/current-stock" label="Current stock" />
      </CardContent></Card>
      <div className="flex items-center gap-2 text-sm text-muted-foreground"><PackageCheck className="size-4" />Production records use the same inventory ledger as the rest of MunshiOS.</div>
    </div>
  );
}

function DataCard({ title, description, children }: { title: string; description: string; children: React.ReactNode }) { return <Card className="gap-0 rounded-md border py-0 shadow-none ring-0"><CardContent className="p-0"><div className="border-b px-4 py-3"><p className="text-sm font-medium">{title}</p><p className="text-xs text-muted-foreground">{description}</p></div>{children}</CardContent></Card>; }
function Table({ headers, rows }: { headers: string[]; rows: string[][] }) { return <div className="overflow-x-auto"><table className="w-full text-sm"><thead className="bg-muted/40 text-left text-xs text-muted-foreground"><tr>{headers.map((header) => <th key={header} className="px-4 py-2.5">{header}</th>)}</tr></thead><tbody className="divide-y">{rows.map((row, index) => <tr key={index}>{row.map((cell, cellIndex) => <td key={cellIndex} className={cellIndex === 0 ? "px-4 py-3 font-medium" : "px-4 py-3 text-muted-foreground"}>{cell}</td>)}</tr>)}</tbody></table></div>; }
function Empty({ text }: { text: string }) { return <div className="p-5 text-sm text-muted-foreground">{text}</div>; }
function WorkflowCard({ title, description, href, label }: { title: string; description: string; href: string; label: string }) { return <div className="rounded-lg border bg-muted/20 p-4"><p className="font-semibold">{title}</p><p className="mt-2 text-sm leading-6 text-muted-foreground">{description}</p><Link href={href} className="mt-3 inline-block text-sm font-semibold text-emerald-700 hover:underline">{label}</Link></div>; }
function ModuleDisabled() { return <div className="mx-auto max-w-3xl py-12"><Card><CardContent className="space-y-3 p-6"><h1 className="text-xl font-semibold">Manufacturing module unavailable</h1><p className="text-sm text-muted-foreground">Manufacturing workflows are not enabled for this workspace.</p><Link href="/subscription" className="text-sm font-semibold text-emerald-700 hover:underline">View workspace access</Link></CardContent></Card></div>; }
