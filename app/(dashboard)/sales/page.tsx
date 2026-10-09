import { Plus } from "lucide-react";
import { PageHeader } from "@/components/business/page-header";
import { SalesList } from "@/components/sales/sales-list";
import { requireWorkspace } from "@/lib/server/auth";
import Link from "next/link";
import { listSalesPage } from "@/lib/server/sales";
import { salesPageOptions, SalesCursorError } from "@/lib/sales-pagination";
import { ZodError } from "zod";

export default async function SalesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { workspaceId } = await requireWorkspace();
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(await searchParams)) if (typeof value === "string") params.set(key, value);
  let page;
  try {
    page = await listSalesPage(workspaceId, salesPageOptions(params));
  } catch (error) {
    if (!(error instanceof ZodError || error instanceof SalesCursorError)) throw error;
    return <div role="alert">Invalid sales page or filters. <Link href="/sales">Restart sales list</Link></div>;
  }
  params.delete("cursor");
  const firstPage = `/sales?${params}`;
  if (page.pagination.nextCursor) params.set("cursor", page.pagination.nextCursor);

  return (
    <div className="mx-auto max-w-[1600px] space-y-6">
      <PageHeader title="Sales" description="Sales orders, collections, and customer balances." action={{ label: "New Sale", href: "/sales/new", icon: Plus }} />
      <SalesList sales={page.data} query={params.get("q") ?? ""} status={params.get("status") ?? "ALL"} />
      <nav aria-label="Sales pages" className="flex items-center gap-4 text-sm">
        <Link href={firstPage} prefetch={false}>First page</Link>
        {page.pagination.hasMore && <Link href={`/sales?${params}`} prefetch={false}>Next page</Link>}
        <span>Showing up to {page.pagination.limit} orders per page. Totals reflect this page.</span>
      </nav>
    </div>
  );
}
