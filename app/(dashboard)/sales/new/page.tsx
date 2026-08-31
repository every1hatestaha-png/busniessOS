import { SalesOrderForm } from "@/components/sales/sales-order-form";
import { canPerformAction, requirePermission } from "@/lib/server/authorization";
import { getCashBankAccounts } from "@/lib/server/accounting";
import { listCustomers } from "@/lib/server/customers";
import { listProducts } from "@/lib/server/products";

export default async function NewSalePage() {
  const { workspaceId, role } = await requirePermission("sales.create");
  const canRecordPayments = canPerformAction(role, "payments.record");
  const [customers, products, cashBankAccounts] = await Promise.all([
    listCustomers(workspaceId),
    listProducts(),
    canRecordPayments ? getCashBankAccounts(workspaceId) : Promise.resolve([]),
  ]);

  return <SalesOrderForm customers={customers} products={products} cashBankAccounts={cashBankAccounts} canRecordPayments={canRecordPayments} />;
}
