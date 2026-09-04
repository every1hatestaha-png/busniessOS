import { startOfMonth } from "date-fns";

import { EmptyReportRow, FinancialCell, FinancialHead, FinancialHeading, FinancialRow, FinancialTable, Money } from "@/components/reports/financial-table";
import { PeriodFilters, ReportFilterBar, ReportFilterField, reportSelectClassName, SearchFilter } from "@/components/reports/report-filter-bar";
import { ReportFrame } from "@/components/reports/report-frame";
import { getCashBankAccountLedger, getCashBankAccounts } from "@/lib/server/accounting";
import { requirePermission } from "@/lib/server/authorization";
import { dateInputValue, parseDate, periodQuerySchema } from "@/lib/validation/reports";

type Query = Promise<Record<string, string | string[] | undefined>>;

export default async function CashBankReportPage({ searchParams }: { searchParams: Query }) {
  const { workspaceId, workspace } = await requirePermission("financial.manage");
  const raw = await searchParams;
  const parsed = periodQuerySchema.safeParse({ from: typeof raw.from === "string" ? raw.from : undefined, to: typeof raw.to === "string" ? raw.to : undefined, search: typeof raw.search === "string" ? raw.search : undefined });
  const query = parsed.success ? parsed.data : {};
  const now = new Date();
  const from = parseDate(query.from, startOfMonth(now));
  const to = parseDate(query.to, now, true);
  const accounts = await getCashBankAccounts(workspaceId);
  const requestedId = typeof raw.accountId === "string" ? raw.accountId : undefined;
  const accountId = accounts.some((account) => account.cashBankAccountId === requestedId) ? requestedId! : accounts[0]?.cashBankAccountId;
  const report = accountId ? await getCashBankAccountLedger(workspaceId, accountId, { from, to, search: query.search }) : null;
  const filters = <ReportFilterBar><ReportFilterField label="Cash / bank account"><select className={reportSelectClassName} name="accountId" defaultValue={accountId}>{accounts.map((account) => <option key={account.cashBankAccountId} value={account.cashBankAccountId}>{account.code} - {account.name}</option>)}</select></ReportFilterField><PeriodFilters from={dateInputValue(from)} to={dateInputValue(to)} /><SearchFilter value={query.search} /></ReportFilterBar>;

  return (
    <ReportFrame workspace={workspace} title="Cash & Bank Ledger" from={report?.from ?? from} to={report?.to ?? to} subtitle={report ? `${report.code} - ${report.name}${report.bankName ? ` | ${report.bankName}` : ""}` : "No active cash or bank account available"} filters={filters}>
      {report ? <><div className="mb-4 grid grid-cols-5 gap-3 text-xs"><div className="rounded border p-3"><p className="text-neutral-500">Opening</p><p className="mt-1 font-bold"><Money value={report.openingBalance} /></p></div><div className="rounded border p-3"><p className="text-neutral-500">Receipts</p><p className="mt-1 font-bold"><Money value={report.receipts} /></p></div><div className="rounded border p-3"><p className="text-neutral-500">Payments</p><p className="mt-1 font-bold"><Money value={report.payments} /></p></div><div className="rounded border p-3"><p className="text-neutral-500">Ledger closing</p><p className="mt-1 font-bold"><Money value={report.closingBalance} /></p></div><div className="rounded border p-3"><p className="text-neutral-500">Current / difference</p><p className="mt-1 font-bold"><Money value={report.currentBalance} /> / <Money value={report.reconciliationDifference} /></p></div></div><FinancialTable className="min-w-[900px]"><FinancialHead><tr><FinancialHeading>Date</FinancialHeading><FinancialHeading>Document</FinancialHeading><FinancialHeading>Source</FinancialHeading><FinancialHeading className="w-full">Narration</FinancialHeading><FinancialHeading numeric>Receipt</FinancialHeading><FinancialHeading numeric>Payment</FinancialHeading><FinancialHeading numeric>Balance</FinancialHeading></tr></FinancialHead><tbody><FinancialRow className="bg-neutral-50 font-semibold"><FinancialCell colSpan={6}>Opening balance</FinancialCell><FinancialCell numeric><Money value={report.openingBalance} /></FinancialCell></FinancialRow>{report.entries.map((entry) => <FinancialRow key={entry.id}><FinancialCell>{dateInputValue(entry.date)}</FinancialCell><FinancialCell>{entry.documentNo}</FinancialCell><FinancialCell>{entry.sourceType.replaceAll("_", " ")}</FinancialCell><FinancialCell className="whitespace-normal">{entry.narration}</FinancialCell><FinancialCell numeric><Money value={entry.debit} dashZero /></FinancialCell><FinancialCell numeric><Money value={entry.credit} dashZero /></FinancialCell><FinancialCell numeric className="font-semibold"><Money value={entry.runningBalance} /></FinancialCell></FinancialRow>)}{report.entries.length === 0 && <EmptyReportRow colSpan={7} />}</tbody></FinancialTable></> : <p className="py-12 text-center text-sm text-neutral-500">Create an active cash or bank account before running this report.</p>}
    </ReportFrame>
  );
}
