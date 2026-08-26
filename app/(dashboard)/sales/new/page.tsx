import { SalesOrderForm } from "@/components/sales/sales-order-form";
import { requirePermission } from "@/lib/server/authorization";
import { listCustomers } from "@/lib/server/customers";
import { listProducts } from "@/lib/server/products";

export default async function NewSalePage() {
  const { workspaceId } = await requirePermission("sales.create");
  const [customers, products] = await Promise.all([
    listCustomers(workspaceId),
    listProducts(),
  ]);

  return <SalesOrderForm customers={customers} products={products} />;
}
