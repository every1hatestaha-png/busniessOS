import Link from "next/link";
import { Factory } from "lucide-react";
import { getIndustryHealth } from "@/lib/server/industry-modules";

export async function ManufacturingOverview({ workspaceId }: { workspaceId: string }) {
  const { manufacturing } = await getIndustryHealth(workspaceId);
  return <section aria-label="Production overview" className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-4">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-2"><Factory className="size-5 text-emerald-700" /><h2 className="font-semibold">Production</h2></div>
      <Link href="/manufacturing" className="text-xs font-semibold text-emerald-800 underline">Open manufacturing</Link>
    </div>
    <div className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
      <p><strong className="block text-xl">{manufacturing.openProductionRuns}</strong>Open production runs</p>
      <p><strong className="block text-xl">{manufacturing.boms}</strong>Active bills of materials</p>
      <p><strong className="block text-xl">{manufacturing.warehouses}</strong>Active warehouses</p>
    </div>
  </section>;
}
