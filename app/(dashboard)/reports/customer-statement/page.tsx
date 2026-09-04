import { startOfMonth } from "date-fns";

import { PeriodFilters, ReportFilterBar, ReportFilterField, reportSelectClassName, SearchFilter } from "@/components/reports/report-filter-bar";
import { ReportFrame } from "@/components/reports/report-frame";
import { StatementTable } from "@/components/reports/statement-table";
import { listCustomers } from "@/lib/server/customers";
import { requirePermission } from "@/lib/server/authorization";
import { getCustomerStatement } from "@/lib/server/reports";
import { dateInputValue, parseDate, statementQuerySchema } from "@/lib/validation/reports";

type Query = Promise<Record<string, string | string[] | undefined>>;

export default async function CustomerStatementPage({ searchParams }: { searchParams: Query }) {
  const { workspaceId, workspace } = await requirePermission("financial.manage");
  const raw = await searchParams;
  const parsed = statementQuerySchema.safeParse({ from: typeof raw.from === "string" ? raw.from : undefined, to: typeof raw.to === "string" ? raw.to : undefined, search: typeof raw.search === "string" ? raw.search : undefined, partyId: typeof raw.partyId === "string" ? raw.partyId : undefined });
  const query = parsed.success ? parsed.data : {};
  const now = new Date();
  const from = parseDate(query.from, startOfMonth(now));
  const to = parseDate(query.to, now, true);
  const customers = await listCustomers(workspaceId);
  const partyId = customers.some((customer) => customer.id === query.partyId) ? query.partyId : undefined;
  const statement = partyId ? await getCustomerStatement(workspaceId, partyId, { from, to, search: query.search }) : null;
  const filters = <ReportFilterBar><ReportFilterField label="Customer"><select className={reportSelectClassName} name="partyId" defaultValue={partyId ?? ""}><option value="">Select a customer</option>{customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.companyName}{customer.companyName !== customer.name ? ` - ${customer.name}` : ""}</option>)}</select></ReportFilterField><PeriodFilters from={dateInputValue(from)} to={dateInputValue(to)} /><SearchFilter value={query.search} /></ReportFilterBar>;

  return <ReportFrame workspace={workspace} title="Customer Statement" from={statement?.from ?? from} to={statement?.to ?? to} subtitle={statement ? `${statement.party.displayName}${statement.party.phone ? ` | ${statement.party.phone}` : ""}` : "Select a customer to generate a statement"} filters={filters}>{statement ? <StatementTable statement={statement} balanceLabel="Amount receivable" /> : <div className="py-14 text-center"><p className="font-semibold">No customer selected</p><p className="mt-1 text-sm text-neutral-500">Choose a customer above to view persisted statement activity.</p></div>}</ReportFrame>;
}
