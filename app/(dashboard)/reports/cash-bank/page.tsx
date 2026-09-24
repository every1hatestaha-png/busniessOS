import { startOfMonth } from "date-fns";

import { EmptyReportRow, FinancialCell, FinancialHead, FinancialHeading, FinancialRow, FinancialTable, Money } from "@/components/reports/financial-table";
import { PeriodFilters, ReportFilterBar, ReportFilterField, reportSelectClassName, SearchFilter } from "@/components/reports/report-filter-bar";
import { ReportFrame } from "@/components/reports/report-frame";
import { getCashBankAccountLedger, getCashBankAccounts, getGeneralLedger } from "@/lib/server/accounting";
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
  const selectedAccount = accounts.find((account) => account.cashBankAccountId === accountId);
  const [report, ledgerMeta] = accountId && selectedAccount
    ? await Promise.all([
        getCashBankAccountLedger(workspaceId, accountId, { from, to, search: query.search }),
        getGeneralLedger(workspaceId, { accountId: selectedAccount.id, from, to, search: query.search }),
      ])
    : [null, null];
  const filters = <ReportFilterBar><ReportFilterField label="Cash / bank account"><select className={reportSelectClassName} name="accountId" defaultValue={accountId}>{accounts.map((account) => <option key={account.cashBankAccountId} value={account.cashBankAccountId}>{account.code} - {account.name}</option>)}</select></ReportFilterField><PeriodFilters from={dateInputValue(from)} to={dateInputValue(to)} /><SearchFilter value={query.search} /></ReportFilterBar>;

  const legacyOpening = report && ledgerMeta ? report.openingBalance - ledgerMeta.openingBalance : 0;
  const fullClosingBalance = report && ledgerMeta ? ledgerMeta.closingBalance + legacyOpening : report?.closingBalance ?? 0;
  const reconciliationDifference = report ? report.currentBalance - fullClosingBalance : 0;
  const truncated = Boolean(ledgerMeta?.truncated);

  return (
    <ReportFrame workspace={workspace} title="Cash & Bank Ledger" from={report?.from ?? from} to={report?.to ?? to} subtitle={report ? `${report.code} - ${report.name}${report.bankName ? ` | ${report.bankName}` : ""}` : "No active cash or bank account available"} filters={filters}>
      {report ? <>
        {truncated && <div className="mb-4 rounded border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-950 print:mb-2 print:border-2">PARTIAL REPORT: transaction detail is limited to the first 2,000 matching ledger entries. Opening, ledger closing, current balance and reconciliation difference below use the full selected period. Narrow the date range before relying on or printing the detailed receipt/payment totals.</div>}
        <div className="mb-4 grid grid-cols-2 gap-3 text-xs lg:grid-cols-3 2xl:grid-cols-6 print:grid-cols-3 print:gap-1.5">
          <div className="rounded border p-3 print:p-2"><p className="text-neutral-500">Opening</p><p className="mt-1 font-bold"><Money value={report.openingBalance} /></p></div>
          <div className="rounded border p-3 print:p-2"><p className="text-neutral-500">{truncated ? "Shown receipts" : "Receipts"}</p><p className="mt-1 font-bold"><Money value={report.receipts} /></p></div>
          <div className="rounded border p-3 print:p-2"><p className="text-neutral-500">{truncated ? "Shown payments" : "Payments"}</p><p className="mt-1 font-bold"><Money value={report.payments} /></p></div>
          <div className="rounded border p-3 print:p-2"><p className="text-neutral-500">Ledger closing</p><p className="mt-1 font-bold"><Money value={fullClosingBalance} /></p></div>
          <div className="rounded border p-3 print:p-2"><p className="text-neutral-500">Current balance</p><p className="mt-1 font-bold"><Money value={report.currentBalance} /></p></div>
          <div className="rounded border p-3 print:p-2"><p className="text-neutral-500">Difference</p><p className="mt-1 font-bold"><Money value={reconciliationDifference} /></p></div>
        </div>
        <FinancialTable className="min-w-[900px] print:min-w-0">
          <colgroup>
            <col style={{ width: "11%" }} />
            <col style={{ width: "15%" }} />
            <col style={{ width: "13%" }} />
            <col style={{ width: "25%" }} />
            <col style={{ width: "12%" }} />
            <col style={{ width: "12%" }} />
            <col style={{ width: "12%" }} />
          </colgroup>
          <FinancialHead><tr><FinancialHeading>Date</FinancialHeading><FinancialHeading>Document</FinancialHeading><FinancialHeading>Source</FinancialHeading><FinancialHeading>Narration</FinancialHeading><FinancialHeading numeric>Receipt</FinancialHeading><FinancialHeading numeric>Payment</FinancialHeading><FinancialHeading numeric>Balance</FinancialHeading></tr></FinancialHead>
          <tbody>
            <FinancialRow className="bg-neutral-50 font-semibold"><FinancialCell colSpan={6}>Opening balance</FinancialCell><FinancialCell numeric><Money value={report.openingBalance} /></FinancialCell></FinancialRow>
            {report.entries.map((entry) => <FinancialRow key={entry.id}><FinancialCell>{dateInputValue(entry.date)}</FinancialCell><FinancialCell className="break-all print:break-words">{entry.documentNo}</FinancialCell><FinancialCell className="whitespace-normal">{entry.sourceType.replaceAll("_", " ")}</FinancialCell><FinancialCell className="whitespace-normal">{entry.narration}</FinancialCell><FinancialCell numeric><Money value={entry.debit} dashZero /></FinancialCell><FinancialCell numeric><Money value={entry.credit} dashZero /></FinancialCell><FinancialCell numeric className="font-semibold"><Money value={entry.runningBalance} /></FinancialCell></FinancialRow>)}
            {report.entries.length === 0 && <EmptyReportRow colSpan={7} />}
          </tbody>
          <tfoot><FinancialRow className="border-t-2 border-neutral-900 font-bold"><FinancialCell colSpan={6}>Ledger closing</FinancialCell><FinancialCell numeric><Money value={fullClosingBalance} /></FinancialCell></FinancialRow></tfoot>
        </FinancialTable>
      </> : <p className="py-12 text-center text-sm text-neutral-500">Create an active cash or bank account before running this report.</p>}
    </ReportFrame>
  );
}
