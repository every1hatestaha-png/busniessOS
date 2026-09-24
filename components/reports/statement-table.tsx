import { EmptyReportRow, FinancialCell, FinancialHead, FinancialHeading, FinancialRow, FinancialTable, Money, SourceDocumentLink } from "@/components/reports/financial-table";
import { dateInputValue } from "@/lib/validation/reports";

type Statement = {
  openingBalance: number;
  closingBalance: number;
  entries: Array<{ id: string; date: string; documentNo: string; description: string; debit: number; credit: number; runningBalance: number; href: string | null }>;
};

export function StatementTable({ statement, balanceLabel, filtered = false }: { statement: Statement; balanceLabel: string; filtered?: boolean }) {
  const debit = statement.entries.reduce((sum, entry) => sum + entry.debit, 0);
  const credit = statement.entries.reduce((sum, entry) => sum + entry.credit, 0);
  return (
    <>
      {filtered && <div className="mb-3 rounded border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-950 print:border-2">FILTERED VIEW: the rows and shown debit/credit totals match your search, while opening, running, and closing balances retain all account activity in the selected period.</div>}
      <div className="mb-4 grid max-w-3xl grid-cols-1 gap-3 text-xs sm:grid-cols-2 lg:grid-cols-4 print:max-w-none print:grid-cols-4 print:gap-1.5">
        <div className="rounded border p-3 print:p-2"><p className="text-neutral-500">Opening balance</p><p className="mt-1 font-bold"><Money value={statement.openingBalance} /></p></div>
        <div className="rounded border p-3 print:p-2"><p className="text-neutral-500">{filtered ? "Shown debit" : "Period debit"}</p><p className="mt-1 font-bold"><Money value={debit} /></p></div>
        <div className="rounded border p-3 print:p-2"><p className="text-neutral-500">{filtered ? "Shown credit" : "Period credit"}</p><p className="mt-1 font-bold"><Money value={credit} /></p></div>
        <div className="rounded border border-neutral-900 bg-neutral-950 p-3 text-white print:p-2"><p className="text-neutral-300">{balanceLabel}</p><p className="mt-1 font-bold"><Money value={statement.closingBalance} /></p></div>
      </div>
      <FinancialTable className="min-w-[850px] print:min-w-0">
        <colgroup>
          <col style={{ width: "11%" }} />
          <col style={{ width: "16%" }} />
          <col style={{ width: "31%" }} />
          <col style={{ width: "14%" }} />
          <col style={{ width: "14%" }} />
          <col style={{ width: "14%" }} />
        </colgroup>
        <FinancialHead><tr><FinancialHeading>Date</FinancialHeading><FinancialHeading>Document</FinancialHeading><FinancialHeading>Description</FinancialHeading><FinancialHeading numeric>Debit</FinancialHeading><FinancialHeading numeric>Credit</FinancialHeading><FinancialHeading numeric>Balance</FinancialHeading></tr></FinancialHead>
        <tbody>
          <FinancialRow className="bg-neutral-50 font-semibold"><FinancialCell colSpan={5}>Opening balance</FinancialCell><FinancialCell numeric><Money value={statement.openingBalance} /></FinancialCell></FinancialRow>
          {statement.entries.map((entry) => <FinancialRow key={entry.id}><FinancialCell>{dateInputValue(entry.date)}</FinancialCell><FinancialCell className="break-all print:break-words"><SourceDocumentLink href={entry.href}>{entry.documentNo}</SourceDocumentLink></FinancialCell><FinancialCell className="whitespace-normal">{entry.description}</FinancialCell><FinancialCell numeric><Money value={entry.debit} dashZero /></FinancialCell><FinancialCell numeric><Money value={entry.credit} dashZero /></FinancialCell><FinancialCell numeric className="font-semibold"><Money value={entry.runningBalance} /></FinancialCell></FinancialRow>)}
          {statement.entries.length === 0 && <EmptyReportRow colSpan={6} />}
        </tbody>
        <tfoot><FinancialRow className="border-t-2 border-neutral-900 font-bold"><FinancialCell colSpan={5}>{balanceLabel}</FinancialCell><FinancialCell numeric><Money value={statement.closingBalance} /></FinancialCell></FinancialRow></tfoot>
      </FinancialTable>
    </>
  );
}
