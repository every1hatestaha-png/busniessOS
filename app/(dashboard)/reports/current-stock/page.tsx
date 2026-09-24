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
      <div className={`mb-4 grid grid-cols-2 gap-3 print:grid-cols-3 print:gap-1.5 ${report.warehouseMode === "MANAGED" ? "lg:grid-cols-5" : "lg:grid-cols-4"}`}>
        <div className="print:p-1"><p className="text-xs text-neutral-500">Total quantity</p><p className="text-xl font-bold tabular-nums print:text-sm">{report.totalQuantity.toLocaleString("en-PK")}</p></div>
        <div className="text-right print:text-left"><p className="text-xs text-neutral-500">Current-cost value</p><p className="text-xl font-bold tabular-nums print:text-sm"><Money value={report.totalValue} /></p></div>
        <div className="text-right print:text-left"><p className="text-xs text-neutral-500">Inventory GL</p><p className="text-xl font-bold tabular-nums print:text-sm">{report.inventoryGlBalance === null ? "Filtered" : <Money value={report.inventoryGlBalance} />}</p></div>
        <div className="text-right print:text-left"><p className="text-xs text-neutral-500">Valuation variance</p><p className="text-xl font-bold tabular-nums print:text-sm">{report.reconciliationDifference === null ? "Filtered" : <Money value={report.reconciliationDifference} />}</p></div>
        {report.warehouseMode === "MANAGED" && <div className="text-right print:text-left"><p className="text-xs text-neutral-500">Warehouse mismatches</p><p className="text-xl font-bold tabular-nums print:text-sm">{report.warehouseMismatchCount}</p></div>}
      </div>
      <FinancialTable className="min-w-[1100px] print:min-w-0 print:text-[6.5pt]">
        {report.warehouseMode === "MANAGED" ? (
          <colgroup>
            <col style={{ width: "8%" }} />
            <col style={{ width: "17%" }} />
            <col style={{ width: "9%" }} />
            <col style={{ width: "6%" }} />
            <col style={{ width: "8%" }} />
            <col style={{ width: "15%" }} />
            <col style={{ width: "8%" }} />
            <col style={{ width: "7%" }} />
            <col style={{ width: "8%" }} />
            <col style={{ width: "9%" }} />
            <col style={{ width: "5%" }} />
          </colgroup>
        ) : (
          <colgroup>
            <col style={{ width: "10%" }} />
            <col style={{ width: "21%" }} />
            <col style={{ width: "12%" }} />
            <col style={{ width: "8%" }} />
            <col style={{ width: "10%" }} />
            <col style={{ width: "9%" }} />
            <col style={{ width: "11%" }} />
            <col style={{ width: "12%" }} />
            <col style={{ width: "7%" }} />
          </colgroup>
        )}
        <FinancialHead><tr><FinancialHeading>SKU</FinancialHeading><FinancialHeading>Product</FinancialHeading><FinancialHeading>Category</FinancialHeading><FinancialHeading>Unit</FinancialHeading><FinancialHeading numeric>On hand</FinancialHeading>{report.warehouseMode === "MANAGED" && <FinancialHeading>Warehouse split</FinancialHeading>}{report.warehouseMode === "MANAGED" && <FinancialHeading>Warehouse sync</FinancialHeading>}<FinancialHeading numeric>Reorder</FinancialHeading><FinancialHeading numeric>Unit cost</FinancialHeading><FinancialHeading numeric>Stock value</FinancialHeading><FinancialHeading>Status</FinancialHeading></tr></FinancialHead>
        <tbody>{report.rows.map((row) => <FinancialRow key={row.id}><FinancialCell className="font-mono break-all print:break-words">{row.sku || "-"}</FinancialCell><FinancialCell className="font-medium whitespace-normal">{row.name}</FinancialCell><FinancialCell className="whitespace-normal">{row.category}</FinancialCell><FinancialCell>{row.unit.replaceAll("_", " ")}</FinancialCell><FinancialCell numeric>{row.stockQuantity.toLocaleString("en-PK")}</FinancialCell>{report.warehouseMode === "MANAGED" && <FinancialCell className="whitespace-normal">{row.warehouses.length ? row.warehouses.map((warehouse) => `${warehouse.warehouseCode || warehouse.warehouseName}: ${warehouse.quantity.toLocaleString("en-PK")}`).join(", ") : "No location balance"}</FinancialCell>}{report.warehouseMode === "MANAGED" && <FinancialCell className="whitespace-normal">{row.warehouseInSync ? "Synced" : `Mismatch ${row.warehouseDifference && row.warehouseDifference > 0 ? "+" : ""}${row.warehouseDifference?.toLocaleString("en-PK") ?? 0}`}</FinancialCell>}<FinancialCell numeric>{row.reorderLevel.toLocaleString("en-PK")}</FinancialCell><FinancialCell numeric><Money value={row.unitCost} /></FinancialCell><FinancialCell numeric className="font-semibold"><Money value={row.stockValue} /></FinancialCell><FinancialCell className="whitespace-normal">{row.stockStatus}</FinancialCell></FinancialRow>)}{report.rows.length === 0 && <EmptyReportRow colSpan={report.warehouseMode === "MANAGED" ? 11 : 9} />}</tbody>
      </FinancialTable>
      <p className="mt-4 text-[11px] text-neutral-500 print:text-[7pt]"><span className="font-semibold">Valuation basis:</span> {report.valuationBasis}. The variance is shown explicitly because current-cost valuation and historical Inventory GL may legitimately differ. {report.warehouseMode === "MANAGED" ? "Warehouse sync compares core on-hand stock with the sum of all managed warehouse balances." : ""}</p>
    </ReportFrame>
  );
}
