import Link from "next/link";
import { startOfMonth, startOfWeek, startOfYear } from "date-fns";

import { FinancialCell, FinancialRow, FinancialTable, Money } from "@/components/reports/financial-table";
import { PeriodFilters, ReportFilterBar } from "@/components/reports/report-filter-bar";
import { ReportFrame } from "@/components/reports/report-frame";
import { getProfitAndLoss } from "@/lib/server/accounting";
import { requireWorkspace } from "@/lib/server/auth";
import { dateInputValue, parseDate, periodQuerySchema } from "@/lib/validation/reports";

type Query = Promise<Record<string, string | string[] | undefined>>;

export default async function ProfitLossPage({ searchParams }: { searchParams: Query }) {
  const { workspaceId, workspace } = await requireWorkspace();
  const raw = await searchParams;
  const parsed = periodQuerySchema.safeParse({ from: typeof raw.from === "string" ? raw.from : undefined, to: typeof raw.to === "string" ? raw.to : undefined });
  const now = new Date();
  const from = parseDate(parsed.success ? parsed.data.from : undefined, startOfMonth(now));
  const to = parseDate(parsed.success ? parsed.data.to : undefined, now, true);
  const report = await getProfitAndLoss(workspaceId, { from, to });
  const presets = [
    ["Today", now],
    ["This Week", startOfWeek(now, { weekStartsOn: 1 })],
    ["This Month", startOfMonth(now)],
    ["This Year", startOfYear(now)],
  ] as const;

  return (
    <ReportFrame workspace={workspace} title="Profit & Loss" from={report.from} to={report.to} subtitle="Accrual performance from persisted sales, returns, inventory costs, and expenses" filters={<div className="space-y-2 print:hidden"><div className="flex flex-wrap gap-1.5">{presets.map(([label, start]) => <Link key={label} href={`?from=${dateInputValue(start)}&to=${dateInputValue(now)}`} className="rounded border bg-white px-2.5 py-1 text-xs font-medium text-neutral-600 hover:border-neutral-400 hover:text-neutral-950">{label}</Link>)}</div><ReportFilterBar><PeriodFilters from={dateInputValue(from)} to={dateInputValue(to)} /></ReportFilterBar></div>}>
      <div className="mx-auto max-w-3xl text-sm">
        <FinancialTable><tbody>
          <FinancialRow className="border-0"><FinancialCell colSpan={2} className="pb-1 pt-0 text-[10px] font-bold uppercase tracking-wider text-neutral-500">Revenue</FinancialCell></FinancialRow>
          <FinancialRow><FinancialCell>Gross sales</FinancialCell><FinancialCell numeric><Money value={report.grossSales} /></FinancialCell></FinancialRow><FinancialRow><FinancialCell>Less: sales returns</FinancialCell><FinancialCell numeric>({<Money value={report.salesReturns} />})</FinancialCell></FinancialRow><FinancialRow className="font-semibold"><FinancialCell>Net sales</FinancialCell><FinancialCell numeric><Money value={report.salesRevenue} /></FinancialCell></FinancialRow>
          {report.otherIncome > 0 && <FinancialRow><FinancialCell>Other income</FinancialCell><FinancialCell numeric><Money value={report.otherIncome} /></FinancialCell></FinancialRow>}
          <FinancialRow className="border-0"><FinancialCell colSpan={2} className="pb-1 pt-5 text-[10px] font-bold uppercase tracking-wider text-neutral-500">Cost and gross profit</FinancialCell></FinancialRow>
          <FinancialRow><FinancialCell>Cost of goods sold</FinancialCell><FinancialCell numeric>({<Money value={report.costOfGoodsSold} />})</FinancialCell></FinancialRow><FinancialRow className="bg-neutral-100 font-bold"><FinancialCell>Gross profit</FinancialCell><FinancialCell numeric><Money value={report.grossProfit} /></FinancialCell></FinancialRow>
          <FinancialRow className="border-0"><FinancialCell colSpan={2} className="pb-1 pt-5 text-[10px] font-bold uppercase tracking-wider text-neutral-500">Operating expenses</FinancialCell></FinancialRow>
          {report.expenseCategories.map((expense) => <FinancialRow key={expense.id}><FinancialCell><span className="mr-3 font-mono text-[10px] text-neutral-400">{expense.code}</span>{expense.name}</FinancialCell><FinancialCell numeric><Money value={expense.amount} /></FinancialCell></FinancialRow>)}{report.expenseCategories.length === 0 && <FinancialRow><FinancialCell className="text-neutral-500">No operating expenses in this period</FinancialCell><FinancialCell numeric>-</FinancialCell></FinancialRow>}<FinancialRow className="font-semibold"><FinancialCell>Total operating expenses</FinancialCell><FinancialCell numeric><Money value={report.operatingExpenses} /></FinancialCell></FinancialRow>
          <FinancialRow className="border-y-2 border-neutral-900 bg-neutral-950 text-base font-bold text-white"><FinancialCell>Net profit</FinancialCell><FinancialCell numeric><Money value={report.netProfit} /></FinancialCell></FinancialRow>
        </tbody></FinancialTable>
        <p className="mt-5 text-[11px] leading-4 text-neutral-500"><span className="font-semibold text-neutral-700">Cost basis:</span> {report.costingMethod}</p>
      </div>
    </ReportFrame>
  );
}
