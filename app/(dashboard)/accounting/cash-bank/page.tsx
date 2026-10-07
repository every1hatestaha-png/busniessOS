import Link from "next/link";
import { Banknote, Building2, Clock3, Landmark, LockKeyhole, ShoppingCart } from "lucide-react";

import { RestaurantCashShiftControls } from "@/app/(dashboard)/accounting/cash-bank/restaurant-cash-shift-controls";
import { CashBankAccountForm } from "@/components/accounting/cash-bank-account-form";
import { MetricCard } from "@/components/business/metric-card";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getCashBankAccounts } from "@/lib/server/accounting";
import { requirePermission } from "@/lib/server/authorization";
import { listCashShifts } from "@/lib/server/industry-modules";
import { cn, formatPKR } from "@/lib/utils";

export default async function CashBankPage() {
  const { workspaceId, workspace } = await requirePermission("financial.manage");
  const restaurantMode = workspace.vertical === "RESTAURANT";

  const [accounts, shifts] = await Promise.all([
    getCashBankAccounts(workspaceId),
    restaurantMode ? listCashShifts(workspaceId) : Promise.resolve([]),
  ]);

  const cashTotal = accounts.filter((account) => !account.isBank).reduce((sum, account) => sum + account.currentBalance, 0);
  const bankTotal = accounts.filter((account) => account.isBank).reduce((sum, account) => sum + account.currentBalance, 0);
  const openShift = restaurantMode ? shifts.find((shift) => shift.status === "OPEN") ?? null : null;

  return (
    <div className="mx-auto max-w-[1600px] space-y-5">
      {restaurantMode ? (
        <section className="flex flex-col gap-4 rounded-2xl border bg-white p-4 shadow-none sm:p-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-emerald-700">Cash & closing</p>
            <h1 className="mt-1 text-xl font-semibold tracking-tight">{workspace.name} cash control</h1>
            <p className="mt-1 text-sm text-muted-foreground">Open and close the service shift, then reconcile restaurant cash against the accounting accounts below.</p>
          </div>
          <Link href="/restaurant/pos" className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 text-sm font-semibold text-white transition hover:bg-emerald-500">
            <ShoppingCart className="size-4" /> Open POS
          </Link>
        </section>
      ) : (
        <section>
          <h1 className="text-2xl font-semibold tracking-tight">Cash & Bank</h1>
          <p className="mt-1 text-sm text-muted-foreground">Active payment accounts and available ledger balances.</p>
        </section>
      )}

      <section className="grid gap-3 sm:grid-cols-3">
        <MetricCard label="Total available" value={formatPKR(cashTotal + bankTotal)} detail="Across active payment accounts" icon={Banknote} />
        <MetricCard label="Cash balance" value={formatPKR(cashTotal)} detail={`${accounts.filter((account) => !account.isBank).length} active cash accounts`} icon={Building2} />
        <MetricCard label="Bank balance" value={formatPKR(bankTotal)} detail={`${accounts.filter((account) => account.isBank).length} active bank accounts`} icon={Landmark} />
      </section>

      {restaurantMode ? (
        <section className="grid gap-4 xl:grid-cols-[.9fr_1.1fr]">
          <Card className="rounded-2xl border shadow-none">
            <CardContent className="p-4 sm:p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Current shift</p>
                  <h2 className="mt-1 text-lg font-semibold">{openShift ? "Service shift open" : "No open cash shift"}</h2>
                </div>
                <span className={cn(
                  "rounded-full px-2.5 py-1 text-[11px] font-semibold",
                  openShift ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-600",
                )}>
                  {openShift ? "OPEN" : "CLOSED"}
                </span>
              </div>

              {openShift ? (
                <div className="mt-4 grid gap-3 sm:grid-cols-3">
                  <ShiftStat label="Opening cash" value={formatPKR(openShift.openingCash)} icon={Banknote} />
                  <ShiftStat label="Opened" value={new Intl.DateTimeFormat("en-PK", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Karachi" }).format(openShift.openedAt)} icon={Clock3} />
                  <ShiftStat label="Expected cash" value={openShift.expectedCash === null ? "Live" : formatPKR(openShift.expectedCash)} icon={LockKeyhole} />
                </div>
              ) : (
                <p className="mt-4 rounded-xl border border-dashed bg-slate-50 p-5 text-sm text-muted-foreground">Open a shift before recording restaurant cash service. This does not replace your accounting cash account.</p>
              )}

              {shifts.length ? (
                <div className="mt-5 border-t pt-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">Recent closings</p>
                  <div className="mt-2 space-y-2">
                    {shifts.filter((shift) => shift.status !== "OPEN").slice(0, 5).map((shift) => (
                      <div key={shift.id} className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 px-3 py-2.5 text-xs">
                        <div><p className="font-medium text-slate-800">{new Intl.DateTimeFormat("en-PK", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "Asia/Karachi" }).format(shift.openedAt)}</p><p className="text-muted-foreground">Opening {formatPKR(shift.openingCash)}</p></div>
                        <div className="text-right"><p className="font-semibold">{shift.closingCash === null ? "—" : formatPKR(shift.closingCash)}</p><p className={cn("text-[10px]", (shift.variance ?? 0) === 0 ? "text-emerald-700" : "text-amber-700")}>Variance {shift.variance === null ? "—" : formatPKR(shift.variance)}</p></div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </CardContent>
          </Card>

          <Card className="rounded-2xl border shadow-none">
            <CardHeader className="border-b px-4 py-4 sm:px-5">
              <h2 className="font-semibold">{openShift ? "Close shift" : "Open service shift"}</h2>
              <p className="text-xs text-neutral-500">{openShift ? "Enter the counted drawer cash to calculate closing variance." : "Record the starting drawer amount before cash service begins."}</p>
            </CardHeader>
            <CardContent className="p-4 sm:p-5">
              <RestaurantCashShiftControls workspaceId={workspaceId} openShiftId={openShift?.id ?? null} />
            </CardContent>
          </Card>
        </section>
      ) : null}

      <div className="grid items-start gap-4 2xl:grid-cols-[minmax(0,1fr)_380px]">
        <Card className="overflow-hidden rounded-2xl border py-0 shadow-none">
          <CardHeader className="border-b px-4 py-4">
            <h2 className="font-semibold">{restaurantMode ? "Payment accounts" : "Active account register"}</h2>
            <p className="text-xs text-neutral-500">Balances update from posted receipts, supplier payments, expenses and restaurant payments.</p>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table className="min-w-[760px]">
                <TableHeader className="bg-neutral-50/80">
                  <TableRow>
                    <TableHead className="pl-4">Account</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Bank detail</TableHead>
                    <TableHead className="text-right">Opening</TableHead>
                    <TableHead className="pr-4 text-right">Current</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {accounts.map((account) => (
                    <TableRow key={account.cashBankAccountId}>
                      <TableCell className="pl-4"><Link href={`/accounting/cash-bank/${account.cashBankAccountId}`} className="font-medium hover:underline">{account.name}</Link><p className="font-mono text-xs text-neutral-500">{account.code}</p></TableCell>
                      <TableCell>{account.isBank ? "Bank" : "Cash"}</TableCell>
                      <TableCell><p>{account.bankName || "-"}</p><p className="text-xs text-neutral-500">{account.accountNumber || account.accountTitle || ""}</p></TableCell>
                      <TableCell className="text-right tabular-nums text-neutral-600">{formatPKR(account.openingBalance)}</TableCell>
                      <TableCell className="pr-4 text-right font-semibold tabular-nums">{formatPKR(account.currentBalance)}</TableCell>
                    </TableRow>
                  ))}
                  {accounts.length === 0 && <TableRow><TableCell colSpan={5} className="h-28 text-center text-neutral-500">No active cash or bank accounts yet.</TableCell></TableRow>}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
        <CashBankAccountForm />
      </div>
    </div>
  );
}

function ShiftStat({ label, value, icon: Icon }: { label: string; value: string; icon: typeof Banknote }) {
  return <div className="rounded-xl border bg-slate-50 p-3"><Icon className="size-4 text-emerald-600" /><p className="mt-2 text-sm font-semibold">{value}</p><p className="text-[10px] font-medium text-muted-foreground">{label}</p></div>;
}
