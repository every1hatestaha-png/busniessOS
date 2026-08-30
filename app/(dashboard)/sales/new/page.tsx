import { SalesOrderForm } from "@/components/sales/sales-order-form";
import { requirePermission } from "@/lib/server/authorization";
import { getCashBankAccounts } from "@/lib/server/accounting";
import { listCustomers } from "@/lib/server/customers";
import { listProducts } from "@/lib/server/products";

export default async function NewSalePage() {
  const { workspaceId } = await requirePermission("sales.create");
  const [customers, products, cashBankAccounts] = await Promise.all([
    listCustomers(workspaceId),
    listProducts(),
    getCashBankAccounts(workspaceId),
  ]);

  return <SalesOrderForm customers={customers} products={products} cashBankAccounts={cashBankAccounts} />;
}
