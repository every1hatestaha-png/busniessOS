import { startOfMonth } from "date-fns";
import Link from "next/link";

import { FinancialCell, FinancialHead, FinancialHeading, FinancialRow, FinancialTable, Money } from "@/components/reports/financial-table";
import { PeriodFilters, ReportFilterBar, ReportFilterField, reportSelectClassName, SearchFilter } from "@/components/reports/report-filter-bar";
import { ReportFrame } from "@/components/reports/report-frame";
import { requirePermission } from "@/lib/server/authorization";
import { db } from "@/lib/server/db";
import { getPurchasePriceHistory } from "@/lib/server/purchase-price-history";
import { dateInputValue, parseDate, periodQuerySchema } from "@/lib/validation/reports";

type Query = Promise<Record<string, string | string[] | undefined>>;

export default async function PurchasePriceHistoryPage({ searchParams }: { searchParams: Query }) {
  const { workspaceId, workspace } = await requirePermission("financial.manage");
  const raw = await searchParams;
  const parsed = periodQuerySchema.safeParse({
    from: typeof raw.from === "string" ? raw.from : undefined,
    to: typeof raw.to === "string" ? raw.to : undefined,
    search: typeof raw.search === "string" ? raw.search : undefined,
  });
  const query = parsed.success ? parsed.data : {};
  const now = new Date();
  const from = parseDate(query.from, startOfMonth(now));
  const to = parseDate(query.to, now, true);
  const productId = typeof raw.productId === "string" ? raw.productId : undefined;
  const supplierId = typeof raw.supplierId === "string" ? raw.supplierId : undefined;

  const [products, suppliers, report] = await Promise.all([
    db.product.findMany({
      where: { workspaceId, status: { not: "ARCHIVED" } },
      orderBy: [{ name: "asc" }, { id: "asc" }],
      select: { id: true, name: true, sku: true },
    }),
    db.supplier.findMany({
      where: { workspaceId },
      orderBy: [{ companyName: "asc" }, { name: "asc" }],
      select: { id: true, name: true, companyName: true },
    }),
    getPurchasePriceHistory(workspaceId, {
      from,
      to,
      productId,
      supplierId,
      search: query.search,
    }),
  ]);

  const filters = (
    <ReportFilterBar>
      <ReportFilterField label="Product">
        <select name="productId" defaultValue={productId ?? ""} className={reportSelectClassName}>
          <option value="">All products</option>
          {products.map((product) => <option key={product.id} value={product.id}>{product.name}{product.sku ? ` · ${product.sku}` : ""}</option>)}
        </select>
      </ReportFilterField>
      <ReportFilterField label="Supplier">
        <select name="supplierId" defaultValue={supplierId ?? ""} className={reportSelectClassName}>
          <option value="">All suppliers</option>
          {suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.companyName ?? supplier.name}</option>)}
        </select>
      </ReportFilterField>
      <PeriodFilters from={dateInputValue(from)} to={dateInputValue(to)} />
      <SearchFilter value={query.search} placeholder="Product, SKU, or supplier" />
    </ReportFilterBar>
  );

  return (
    <ReportFrame
      workspace={workspace}
      title="Purchase Price History"
      from={from}
      to={to}
      subtitle="Accepted GRN costs by supplier and product, with chronological price deltas."
      filters={filters}
    >
      {report.truncated && <div className="mb-4 rounded border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-950 print:border-2">PARTIAL REPORT: only the latest 2,000 matching accepted GRN lines are shown. Narrow the filters before relying on or printing the transaction history.</div>}
      <FinancialTable className="min-w-[1100px] print:min-w-0 print:text-[6.8pt]">
        <colgroup>
          <col style={{ width: "10%" }} />
          <col style={{ width: "18%" }} />
          <col style={{ width: "17%" }} />
          <col style={{ width: "12%" }} />
          <col style={{ width: "9%" }} />
          <col style={{ width: "10%" }} />
          <col style={{ width: "10%" }} />
          <col style={{ width: "7%" }} />
          <col style={{ width: "7%" }} />
        </colgroup>
        <FinancialHead><tr>
          <FinancialHeading>Date</FinancialHeading>
          <FinancialHeading>Product</FinancialHeading>
          <FinancialHeading>Supplier</FinancialHeading>
          <FinancialHeading>GRN / PO</FinancialHeading>
          <FinancialHeading numeric>Qty</FinancialHeading>
          <FinancialHeading numeric>Unit Cost</FinancialHeading>
          <FinancialHeading numeric>Previous</FinancialHeading>
          <FinancialHeading numeric>Change</FinancialHeading>
          <FinancialHeading numeric>Rate/kg</FinancialHeading>
        </tr></FinancialHead>
        <tbody>
          {report.rows.map((row) => <FinancialRow key={row.id}>
            <FinancialCell>{dateInputValue(row.receiptDate)}</FinancialCell>
            <FinancialCell className="whitespace-normal"><div className="font-medium">{row.productName}</div><div className="text-[10px] text-neutral-500 print:text-[6pt]">{row.sku || "No SKU"} · {row.unit.toLowerCase()}</div></FinancialCell>
            <FinancialCell className="whitespace-normal">{row.supplierName}</FinancialCell>
            <FinancialCell className="break-all print:break-words"><Link href={`/goods-receipts/${row.grnId}`} className="font-medium hover:underline print:no-underline">{row.grnNumber}</Link><div className="text-[10px] text-neutral-500 print:text-[6pt]">{row.purchaseOrderNumber}</div></FinancialCell>
            <FinancialCell numeric>{row.acceptedQuantity.toLocaleString("en-PK", { maximumFractionDigits: 4 })}</FinancialCell>
            <FinancialCell numeric><Money value={row.unitCost} /></FinancialCell>
            <FinancialCell numeric>{row.previousUnitCost === null ? "-" : <Money value={row.previousUnitCost} />}</FinancialCell>
            <FinancialCell numeric>{row.changeFromPrevious === null ? "-" : <span className={row.changeFromPrevious > 0 ? "font-semibold text-red-700" : row.changeFromPrevious < 0 ? "font-semibold text-emerald-700" : ""}>{row.changeFromPrevious > 0 ? "+" : ""}{row.changePercent?.toFixed(1)}%</span>}</FinancialCell>
            <FinancialCell numeric>{row.ratePerKg === null ? "-" : <><Money value={row.ratePerKg} /><span className="text-[10px] text-neutral-500 print:text-[6pt]">/kg</span></>}</FinancialCell>
          </FinancialRow>)}
          {report.rows.length === 0 && <FinancialRow><FinancialCell colSpan={9} className="h-28 text-center text-neutral-500">No accepted purchase-price history matches these filters.</FinancialCell></FinancialRow>}
        </tbody>
      </FinancialTable>
    </ReportFrame>
  );
}
