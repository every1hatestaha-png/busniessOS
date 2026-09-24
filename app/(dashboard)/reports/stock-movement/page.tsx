import { startOfMonth } from "date-fns";

import { EmptyReportRow, FinancialCell, FinancialHead, FinancialHeading, FinancialRow, FinancialTable, Money } from "@/components/reports/financial-table";
import { PeriodFilters, ReportFilterBar, ReportFilterField, reportSelectClassName, SearchFilter } from "@/components/reports/report-filter-bar";
import { ReportFrame } from "@/components/reports/report-frame";
import { requirePermission } from "@/lib/server/authorization";
import { getCurrentStockReport, getStockMovementReport } from "@/lib/server/reports";
import { dateInputValue, inventoryMovementQuerySchema, parseDate } from "@/lib/validation/reports";

type Query = Promise<Record<string, string | string[] | undefined>>;
const movementTypes = ["OPENING_STOCK", "PURCHASE", "SALE", "RETURN_IN", "RETURN_OUT", "ADJUSTMENT", "SALE_CANCELLATION", "PURCHASE_CANCELLATION", "PURCHASE_RECEIPT"] as const;

export default async function StockMovementPage({ searchParams }: { searchParams: Query }) {
  const { workspaceId, workspace } = await requirePermission("financial.manage");
  const raw = await searchParams;
  const parsed = inventoryMovementQuerySchema.safeParse({ from: typeof raw.from === "string" ? raw.from : undefined, to: typeof raw.to === "string" ? raw.to : undefined, search: typeof raw.search === "string" ? raw.search : undefined, productId: typeof raw.productId === "string" ? raw.productId : undefined, type: typeof raw.type === "string" ? raw.type : undefined });
  const query = parsed.success ? parsed.data : {};
  const now = new Date();
  const from = parseDate(query.from, startOfMonth(now));
  const to = parseDate(query.to, now, true);
  const inventory = await getCurrentStockReport(workspaceId);
  const productId = inventory.rows.some((row) => row.id === query.productId) ? query.productId : undefined;
  const type = movementTypes.includes(query.type as typeof movementTypes[number]) ? query.type : undefined;
  const report = await getStockMovementReport(workspaceId, { from, to, productId, type, search: query.search });
  const filters = <ReportFilterBar><ReportFilterField label="Product"><select className={reportSelectClassName} name="productId" defaultValue={productId ?? ""}><option value="">All products</option>{inventory.rows.map((product) => <option key={product.id} value={product.id}>{product.sku ? `${product.sku} - ` : ""}{product.name}</option>)}</select></ReportFilterField><ReportFilterField label="Movement"><select className={reportSelectClassName} name="type" defaultValue={type ?? ""}><option value="">All movement types</option>{movementTypes.map((movement) => <option key={movement} value={movement}>{movement.replaceAll("_", " ")}</option>)}</select></ReportFilterField><PeriodFilters from={dateInputValue(from)} to={dateInputValue(to)} /><SearchFilter value={query.search} placeholder="Product name or SKU" /></ReportFilterBar>;

  return <ReportFrame workspace={workspace} title="Stock Movement" from={report.from} to={report.to} subtitle="Inventory inflows, outflows, running quantities, recorded cost, and warehouse transfers" filters={filters}>
    {report.truncated && <p className="mb-3 rounded border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-900 print:border-2">PARTIAL REPORT: result is limited to the first 2,000 movements. Narrow the filters for a complete period view before relying on or printing transaction detail.</p>}
    <FinancialTable className="min-w-[1000px] print:min-w-0 print:text-[6.8pt]">
      <colgroup>
        <col style={{ width: "10%" }} />
        <col style={{ width: "8%" }} />
        <col style={{ width: "18%" }} />
        <col style={{ width: "12%" }} />
        <col style={{ width: "12%" }} />
        <col style={{ width: "9%" }} />
        <col style={{ width: "9%" }} />
        <col style={{ width: "9%" }} />
        <col style={{ width: "13%" }} />
      </colgroup>
      <FinancialHead><tr><FinancialHeading>Date</FinancialHeading><FinancialHeading>SKU</FinancialHeading><FinancialHeading>Product</FinancialHeading><FinancialHeading>Movement</FinancialHeading><FinancialHeading>Document</FinancialHeading><FinancialHeading numeric>Qty in</FinancialHeading><FinancialHeading numeric>Qty out</FinancialHeading><FinancialHeading numeric>Running qty</FinancialHeading><FinancialHeading numeric>Unit cost</FinancialHeading></tr></FinancialHead>
      <tbody>{report.rows.map((row) => <FinancialRow key={row.id}><FinancialCell>{dateInputValue(row.date)}</FinancialCell><FinancialCell className="font-mono break-all print:break-words">{row.sku || "-"}</FinancialCell><FinancialCell className="font-medium whitespace-normal">{row.productName}</FinancialCell><FinancialCell className="whitespace-normal">{row.type.replaceAll("_", " ")}</FinancialCell><FinancialCell className="break-all print:break-words">{row.document}</FinancialCell><FinancialCell numeric>{row.quantityIn || "-"}</FinancialCell><FinancialCell numeric>{row.quantityOut || "-"}</FinancialCell><FinancialCell numeric className="font-semibold">{row.runningQuantity}</FinancialCell><FinancialCell numeric>{row.unitCost === null ? "-" : <Money value={row.unitCost} />}</FinancialCell></FinancialRow>)}{report.rows.length === 0 && <EmptyReportRow colSpan={9} />}</tbody>
    </FinancialTable>
    {report.transfersTruncated && <p className="mt-4 rounded border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-900 print:border-2">PARTIAL REPORT: warehouse transfer history is limited to the first 1,000 records. Narrow the filters for a complete period view.</p>}
    <div className="mt-6 print:mt-4"><h2 className="mb-2 text-sm font-semibold">Warehouse transfers</h2><FinancialTable className="min-w-[800px] print:min-w-0 print:text-[7pt]">
      <colgroup>
        <col style={{ width: "12%" }} />
        <col style={{ width: "10%" }} />
        <col style={{ width: "25%" }} />
        <col style={{ width: "20%" }} />
        <col style={{ width: "20%" }} />
        <col style={{ width: "13%" }} />
      </colgroup>
      <FinancialHead><tr><FinancialHeading>Date</FinancialHeading><FinancialHeading>SKU</FinancialHeading><FinancialHeading>Product</FinancialHeading><FinancialHeading>From</FinancialHeading><FinancialHeading>To</FinancialHeading><FinancialHeading numeric>Quantity</FinancialHeading></tr></FinancialHead><tbody>{report.transfers.map((transfer) => <FinancialRow key={transfer.id}><FinancialCell>{dateInputValue(transfer.date)}</FinancialCell><FinancialCell className="font-mono break-all print:break-words">{transfer.sku || "-"}</FinancialCell><FinancialCell className="font-medium whitespace-normal">{transfer.productName}</FinancialCell><FinancialCell className="whitespace-normal">{transfer.fromWarehouse.code ? `${transfer.fromWarehouse.code} - ${transfer.fromWarehouse.name}` : transfer.fromWarehouse.name}</FinancialCell><FinancialCell className="whitespace-normal">{transfer.toWarehouse.code ? `${transfer.toWarehouse.code} - ${transfer.toWarehouse.name}` : transfer.toWarehouse.name}</FinancialCell><FinancialCell numeric className="font-semibold">{transfer.quantity.toLocaleString("en-PK")}</FinancialCell></FinancialRow>)}{report.transfers.length === 0 && <EmptyReportRow colSpan={6} message="No warehouse transfers in this period." />}</tbody>
    </FinancialTable></div>
    <p className="mt-4 text-[11px] text-neutral-500 print:text-[7pt]"><span className="font-semibold">Cost disclosure:</span> Recorded unit cost is the persisted transaction cost where available. Warehouse transfers are shown separately because they move stock between locations without changing total on-hand quantity.</p>
  </ReportFrame>;
}
