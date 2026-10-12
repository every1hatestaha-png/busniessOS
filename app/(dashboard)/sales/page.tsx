import { Plus } from "lucide-react";
import Link from "next/link";
import { outboundGatePassDraftFeatureEnabled } from "@/lib/server/outbound-gate-pass-feature";
import { PageHeader } from "@/components/business/page-header";
import { SalesList } from "@/components/sales/sales-list";
import { requireWorkspace } from "@/lib/server/auth";
import { listSales } from "@/lib/server/sales";

export default async function SalesPage() {
  const { workspaceId } = await requireWorkspace();
  const sales = await listSales(workspaceId);

  return (
    <div className="mx-auto max-w-[1600px] space-y-6">
      <PageHeader title="Sales" description="Sales orders, collections, and customer balances." action={{ label: "New Sale", href: "/sales/new", icon: Plus }} />
      {outboundGatePassDraftFeatureEnabled(workspaceId) && <Link href="/gate-passes" className="inline-flex rounded-md border px-3 py-2 text-sm font-medium hover:bg-muted">Outbound gate pass drafts</Link>}
      <SalesList sales={sales} />
    </div>
  );
}
