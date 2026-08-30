import { startOfMonth } from "date-fns";

import { EmptyReportRow, FinancialCell, FinancialHead, FinancialHeading, FinancialRow, FinancialTable, Money, SourceDocumentLink } from "@/components/reports/financial-table";
import { PeriodFilters, ReportFilterBar, ReportFilterField, reportSelectClassName, SearchFilter } from "@/components/reports/report-filter-bar";
import { ReportFrame } from "@/components/reports/report-frame";
import { getChartOfAccounts, getGeneralLedger } from "@/lib/server/accounting";
import { requireWorkspace } from "@/lib/server/auth";
import { dateInputValue, parseDate, periodQuerySchema } from "@/lib/validation/reports";

type Query = Promise<Record<string, string | string[] | undefined>>;

function sourceHref(sourceType: string, sourceId: string) {
  if (sourceType === "SALE") return `/sales/${sourceId}`;
  if (sourceType === "PURCHASE") return `/purchases/${sourceId}`;
  if (sourceType === "PURCHASE_RECEIPT") return `/goods-receipts/${sourceId}`;
  return null;
}

export default async function GeneralLedgerPage({ searchParams }: { searchParams: Query }) {
  const { workspaceId, workspace } = await requireWorkspace();
  const raw = await searchParams;
  const parsed = periodQuerySchema.safeParse({ from: typeof raw.from === "string" ? raw.from : undefined, to: typeof raw.to === "string" ? raw.to : undefined, search: typeof raw.search === "string" ? raw.search : undefined });
  const query = parsed.success ? parsed.data : {};
  const now = new Date();
  const from = parseDate(query.from, startOfMonth(now));
  const to = parseDate(query.to, now, true);
  const accounts = await getChartOfAccounts(workspaceId);
  const requestedAccountId = typeof raw.accountId === "string" ? raw.accountId : undefined;
  const accountId = accounts.some((account) => account.id === requestedAccountId) ? requestedAccountId! : accounts[0]?.id;
  const report = accountId ? await getGeneralLedger(workspaceId, { accountId, from, to, search: query.search }) : null;

  const filters = <ReportFilterBar><ReportFilterField label="Account"><select className={reportSelectClassName} name="accountId" defaultValue={accountId}>{accounts.map((account) => <option key={account.id} value={account.id}>{account.code} - {account.name}</option>)}</select></ReportFilterField><PeriodFilters from={dateInputValue(from)} to={dateInputValue(to)} /><SearchFilter value={query.search} /></ReportFilterBar>;
  return (
    <ReportFrame workspace={workspace} title="General Ledger" from={report?.from ?? from} to={report?.to ?? to} subtitle={report ? `${report.account.code} - ${report.account.name} (${report.account.normalBalance.toLowerCase()} normal balance)` : "No ledger account available"} filters={filters}>
      {report ? <><div className="mb-4 grid grid-cols-2 gap-3 text-xs lg:grid-cols-4"><div className="rounded border border-neutral-200 p-3"><p className="text-neutral-500">Opening balance</p><p className="mt-1 text-base font-bold tabular-nums"><Money value={report.openingBalance} /></p></div><div className="rounded border border-neutral-200 p-3"><p className="text-neutral-500">Closing balance</p><p className="mt-1 text-base font-bold tabular-nums"><Money value={report.closingBalance} /></p></div><div className="rounded border border-neutral-200 p-3"><p className="text-neutral-500">Entries</p><p className="mt-1 text-base font-bold tabular-nums">{report.entries.length}</p></div></div><FinancialTable className="min-w-[950px]"><FinancialHead><tr><FinancialHeading>Date</FinancialHeading><FinancialHeading>Document</FinancialHeading><FinancialHeading>Source</FinancialHeading><FinancialHeading className="w-full">Narration</FinancialHeading><FinancialHeading numeric>Debit</FinancialHeading><FinancialHeading numeric>Credit</FinancialHeading><FinancialHeading numeric>Running</FinancialHeading></tr></FinancialHead><tbody><FinancialRow className="bg-neutral-50 font-semibold"><FinancialCell colSpan={6}>Opening balance</FinancialCell><FinancialCell numeric><Money value={report.openingBalance} /></FinancialCell></FinancialRow>{report.entries.map((entry) => <FinancialRow key={entry.id}><FinancialCell>{dateInputValue(entry.date)}</FinancialCell><FinancialCell><SourceDocumentLink href={sourceHref(entry.sourceType, entry.sourceId)}>{entry.documentNo}</SourceDocumentLink></FinancialCell><FinancialCell>{entry.sourceType.replaceAll("_", " ")}</FinancialCell><FinancialCell className="whitespace-normal">{entry.narration}</FinancialCell><FinancialCell numeric><Money value={entry.debit} dashZero /></FinancialCell><FinancialCell numeric><Money value={entry.credit} dashZero /></FinancialCell><FinancialCell numeric className="font-semibold"><Money value={entry.runningBalance} /></FinancialCell></FinancialRow>)}{report.entries.length === 0 && <EmptyReportRow colSpan={7} />}</tbody><tfoot><FinancialRow className="border-t-2 border-neutral-900 font-bold"><FinancialCell colSpan={6}>Closing balance</FinancialCell><FinancialCell numeric><Money value={report.closingBalance} /></FinancialCell></FinancialRow></tfoot></FinancialTable></> : <p className="py-12 text-center text-sm text-neutral-500">No chart of accounts is available.</p>}
    </ReportFrame>
  );
}
