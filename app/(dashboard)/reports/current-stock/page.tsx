import { EmptyReportRow, FinancialCell, FinancialHead, FinancialHeading, FinancialRow, FinancialTable, Money } from "@/components/reports/financial-table";
import { ReportFilterBar, ReportFilterField, SearchFilter } from "@/components/reports/report-filter-bar";
import { ReportFrame } from "@/components/reports/report-frame";
import { requirePermission } from "@/lib/server/authorization";
import { getCurrentStockReport } from "@/lib/server/reports";
import { periodQuerySchema } from "@/lib/validation/reports";

type Query = Promise<Record<string, string | string[] | undefined>>;

export default async function CurrentStockPage({ searchParams }: { searchParams: Query }) {
  const { workspaceId, workspace } = await requirePermission("financial.manage");
  const raw = await searchParams;
  const parsed = periodQuerySchema.safeParse({ search: typeof raw.search === "string" ? raw.search : undefined });
  const search = parsed.success ? parsed.data.search : undefined;
  const lowStockOnly = raw.lowStock === "true";
  const report = await getCurrentStockReport(workspaceId, search, lowStockOnly);
  const filters = <ReportFilterBar><SearchFilter value={search} placeholder="Product, SKU, or category" /><ReportFilterField label="Scope"><select className="h-8 rounded-lg border border-neutral-200 bg-white px-2.5 text-sm" name="lowStock" defaultValue={String(lowStockOnly)}><option value="false">All stock</option><option value="true">Low / out of stock</option></select></ReportFilterField></ReportFilterBar>;

  return (
    <ReportFrame workspace={workspace} title="Current Stock" subtitle="On-hand inventory valued on the existing current-cost basis" filters={filters}>
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div><p className="text-xs text-neutral-500">Total quantity</p><p className="text-xl font-bold tabular-nums">{report.totalQuantity.toLocaleString("en-PK")}</p></div>
        <div className="text-right"><p className="text-xs text-neutral-500">Current-cost value</p><p className="text-xl font-bold tabular-nums"><Money value={report.totalValue} /></p></div>
        <div className="text-right"><p className="text-xs text-neutral-500">Inventory GL</p><p className="text-xl font-bold tabular-nums">{report.inventoryGlBalance === null ? "Filtered" : <Money value={report.inventoryGlBalance} />}</p></div>
        <div className="text-right"><p className="text-xs text-neutral-500">Valuation variance</p><p className="text-xl font-bold tabular-nums">{report.reconciliationDifference === null ? "Filtered" : <Money value={report.reconciliationDifference} />}</p></div>
      </div>
      <FinancialTable className="min-w-[900px]"><FinancialHead><tr><FinancialHeading>SKU</FinancialHeading><FinancialHeading className="w-full">Product</FinancialHeading><FinancialHeading>Category</FinancialHeading><FinancialHeading>Unit</FinancialHeading><FinancialHeading numeric>On hand</FinancialHeading><FinancialHeading numeric>Reorder</FinancialHeading><FinancialHeading numeric>Current unit cost</FinancialHeading><FinancialHeading numeric>Stock value</FinancialHeading><FinancialHeading>Status</FinancialHeading></tr></FinancialHead><tbody>{report.rows.map((row) => <FinancialRow key={row.id}><FinancialCell className="font-mono">{row.sku || "-"}</FinancialCell><FinancialCell className="font-medium">{row.name}</FinancialCell><FinancialCell>{row.category}</FinancialCell><FinancialCell>{row.unit.replaceAll("_", " ")}</FinancialCell><FinancialCell numeric>{row.stockQuantity.toLocaleString("en-PK")}</FinancialCell><FinancialCell numeric>{row.reorderLevel.toLocaleString("en-PK")}</FinancialCell><FinancialCell numeric><Money value={row.unitCost} /></FinancialCell><FinancialCell numeric className="font-semibold"><Money value={row.stockValue} /></FinancialCell><FinancialCell>{row.stockStatus}</FinancialCell></FinancialRow>)}{report.rows.length === 0 && <EmptyReportRow colSpan={9} />}</tbody></FinancialTable>
      <p className="mt-4 text-[11px] text-neutral-500"><span className="font-semibold">Valuation basis:</span> {report.valuationBasis}. The variance is shown explicitly because current-cost valuation and historical Inventory GL may legitimately differ.</p>
    </ReportFrame>
  );
}
