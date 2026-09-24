import { EmptyReportRow, FinancialCell, FinancialHead, FinancialHeading, FinancialRow, FinancialTable, Money, SourceDocumentLink } from "@/components/reports/financial-table";
import { dateInputValue } from "@/lib/validation/reports";

type Statement = {
  openingBalance: number;
  closingBalance: number;
  entries: Array<{ id: string; date: string; documentNo: string; description: string; debit: number; credit: number; runningBalance: number; href: string | null }>;
};

export function StatementTable({ statement, balanceLabel }: { statement: Statement; balanceLabel: string }) {
  const debit = statement.entries.reduce((sum, entry) => sum + entry.debit, 0);
  const credit = statement.entries.reduce((sum, entry) => sum + entry.credit, 0);

  return (
    <section data-statement-print className="min-w-0">
      <div className="mb-4 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4 print:mb-3 print:grid-cols-4 print:gap-1.5 print:text-[8pt]">
        <div className="rounded-md border border-neutral-200 bg-white p-3 print:rounded-none print:p-2">
          <p className="text-neutral-500">Opening balance</p>
          <p className="mt-1 font-bold tabular-nums text-neutral-950"><Money value={statement.openingBalance} /></p>
        </div>
        <div className="rounded-md border border-neutral-200 bg-white p-3 print:rounded-none print:p-2">
          <p className="text-neutral-500">Period debit</p>
          <p className="mt-1 font-bold tabular-nums text-neutral-950"><Money value={debit} /></p>
        </div>
        <div className="rounded-md border border-neutral-200 bg-white p-3 print:rounded-none print:p-2">
          <p className="text-neutral-500">Period credit</p>
          <p className="mt-1 font-bold tabular-nums text-neutral-950"><Money value={credit} /></p>
        </div>
        <div className="rounded-md border border-neutral-900 bg-neutral-950 p-3 text-white print:rounded-none print:border-neutral-900 print:bg-white print:p-2 print:text-black">
          <p className="text-neutral-300 print:text-neutral-600">{balanceLabel}</p>
          <p className="mt-1 font-bold tabular-nums"><Money value={statement.closingBalance} /></p>
        </div>
      </div>

      <FinancialTable className="min-w-[760px] print:min-w-0">
        <colgroup>
          <col className="w-[11%]" />
          <col className="w-[15%]" />
          <col className="w-[32%]" />
          <col className="w-[14%]" />
          <col className="w-[14%]" />
          <col className="w-[14%]" />
        </colgroup>
        <FinancialHead>
          <tr>
            <FinancialHeading>Date</FinancialHeading>
            <FinancialHeading>Document</FinancialHeading>
            <FinancialHeading>Description</FinancialHeading>
            <FinancialHeading numeric>Debit</FinancialHeading>
            <FinancialHeading numeric>Credit</FinancialHeading>
            <FinancialHeading numeric>Balance</FinancialHeading>
          </tr>
        </FinancialHead>
        <tbody>
          <FinancialRow className="bg-neutral-50 font-semibold print:bg-neutral-50">
            <FinancialCell colSpan={5}>Opening balance</FinancialCell>
            <FinancialCell numeric><Money value={statement.openingBalance} /></FinancialCell>
          </FinancialRow>
          {statement.entries.map((entry) => (
            <FinancialRow key={entry.id}>
              <FinancialCell className="whitespace-nowrap print:whitespace-nowrap">{dateInputValue(entry.date)}</FinancialCell>
              <FinancialCell className="break-all print:break-words"><SourceDocumentLink href={entry.href}>{entry.documentNo}</SourceDocumentLink></FinancialCell>
              <FinancialCell className="whitespace-normal break-words">{entry.description}</FinancialCell>
              <FinancialCell numeric><Money value={entry.debit} dashZero /></FinancialCell>
              <FinancialCell numeric><Money value={entry.credit} dashZero /></FinancialCell>
              <FinancialCell numeric className="font-semibold"><Money value={entry.runningBalance} /></FinancialCell>
            </FinancialRow>
          ))}
          {statement.entries.length === 0 && <EmptyReportRow colSpan={6} />}
        </tbody>
        <tfoot>
          <FinancialRow className="border-t-2 border-neutral-900 font-bold">
            <FinancialCell colSpan={5}>{balanceLabel}</FinancialCell>
            <FinancialCell numeric><Money value={statement.closingBalance} /></FinancialCell>
          </FinancialRow>
        </tfoot>
      </FinancialTable>
    </section>
  );
}
