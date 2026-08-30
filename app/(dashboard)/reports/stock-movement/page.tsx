import { startOfMonth } from "date-fns";

import { EmptyReportRow, FinancialCell, FinancialHead, FinancialHeading, FinancialRow, FinancialTable, Money } from "@/components/reports/financial-table";
import { PeriodFilters, ReportFilterBar, ReportFilterField, reportSelectClassName, SearchFilter } from "@/components/reports/report-filter-bar";
import { ReportFrame } from "@/components/reports/report-frame";
import { requireWorkspace } from "@/lib/server/auth";
import { getCurrentStockReport, getStockMovementReport } from "@/lib/server/reports";
import { dateInputValue, inventoryMovementQuerySchema, parseDate } from "@/lib/validation/reports";

type Query = Promise<Record<string, string | string[] | undefined>>;
const movementTypes = ["OPENING_STOCK", "PURCHASE", "SALE", "RETURN_IN", "RETURN_OUT", "ADJUSTMENT", "SALE_CANCELLATION", "PURCHASE_CANCELLATION", "PURCHASE_RECEIPT"] as const;

export default async function StockMovementPage({ searchParams }: { searchParams: Query }) {
  const { workspaceId, workspace } = await requireWorkspace();
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

  return <ReportFrame workspace={workspace} title="Stock Movement" from={report.from} to={report.to} subtitle="Inventory inflows, outflows, running quantities, and recorded cost" filters={filters}>{report.truncated && <p className="mb-3 rounded border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">Result limited to the first 2,000 movements. Narrow the filters for a complete period view.</p>}<FinancialTable className="min-w-[1000px]"><FinancialHead><tr><FinancialHeading>Date</FinancialHeading><FinancialHeading>SKU</FinancialHeading><FinancialHeading className="w-full">Product</FinancialHeading><FinancialHeading>Movement</FinancialHeading><FinancialHeading>Document</FinancialHeading><FinancialHeading numeric>Quantity in</FinancialHeading><FinancialHeading numeric>Quantity out</FinancialHeading><FinancialHeading numeric>Running qty</FinancialHeading><FinancialHeading numeric>Recorded unit cost</FinancialHeading></tr></FinancialHead><tbody>{report.rows.map((row) => <FinancialRow key={row.id}><FinancialCell>{dateInputValue(row.date)}</FinancialCell><FinancialCell className="font-mono">{row.sku || "-"}</FinancialCell><FinancialCell className="font-medium">{row.productName}</FinancialCell><FinancialCell>{row.type.replaceAll("_", " ")}</FinancialCell><FinancialCell>{row.document}</FinancialCell><FinancialCell numeric>{row.quantityIn || "-"}</FinancialCell><FinancialCell numeric>{row.quantityOut || "-"}</FinancialCell><FinancialCell numeric className="font-semibold">{row.runningQuantity}</FinancialCell><FinancialCell numeric>{row.unitCost === null ? "-" : <Money value={row.unitCost} />}</FinancialCell></FinancialRow>)}{report.rows.length === 0 && <EmptyReportRow colSpan={9} />}</tbody></FinancialTable><p className="mt-4 text-[11px] text-neutral-500"><span className="font-semibold">Cost disclosure:</span> Recorded unit cost is the persisted transaction cost where available. Current stock valuation elsewhere uses the existing current Product.costPrice basis.</p></ReportFrame>;
}
