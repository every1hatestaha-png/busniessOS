import { Plus } from "lucide-react";
import { PageHeader } from "@/components/business/page-header";
import { SalesList } from "@/components/sales/sales-list";
import { DEMO_SALES } from "@/lib/demo-data";

export default function SalesPage() {
  return (
    <div className="mx-auto max-w-[1500px] space-y-6">
      <PageHeader title="Sales orders" description="Track orders, collections, and customer balances." action={{ label: "New order", href: "/sales/new", icon: Plus }} />
      <SalesList sales={DEMO_SALES} />
    </div>
  );
}
