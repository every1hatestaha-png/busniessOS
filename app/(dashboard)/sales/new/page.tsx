import { SalesOrderForm } from "@/components/sales/sales-order-form";
import { DEMO_CUSTOMERS, DEMO_PRODUCTS } from "@/lib/demo-data";

export default function NewSalePage() {
  return <SalesOrderForm customers={DEMO_CUSTOMERS} products={DEMO_PRODUCTS} />;
}
