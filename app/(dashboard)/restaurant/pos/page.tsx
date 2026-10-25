import Link from "next/link";
import { PageHeader } from "@/components/business/page-header";
import { requireWorkspace } from "@/lib/server/auth";
import { assertRestaurantStation } from "@/lib/server/restaurant-stations";
import { listRestaurantTables } from "@/lib/server/industry-modules";
import { listRestaurantMenu } from "@/lib/server/restaurant-workspace";
import { RestaurantPos } from "./restaurant-pos";

export default async function RestaurantPosPage() {
  const { workspaceId, role, user } = await requireWorkspace();
  await assertRestaurantStation({ workspaceId, role, userId: user.id }, "CASHIER");
  const [menu, tables] = await Promise.all([
    listRestaurantMenu(workspaceId),
    listRestaurantTables(workspaceId),
  ]);

  return (
    <div className="mx-auto max-w-[1600px] space-y-6">
      <PageHeader title="Restaurant POS" description="Create dine-in, takeaway and delivery orders. Prices are always validated on the server before an order is accepted." />
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3">
        <p className="text-sm font-medium text-emerald-950">Orders are confirmed and sent to the kitchen automatically.</p>
        <Link href="/restaurant/orders" className="inline-flex min-h-10 items-center rounded-xl bg-emerald-700 px-4 text-sm font-semibold text-white hover:bg-emerald-800">View cashier orders</Link>
      </div>
      <RestaurantPos
        workspaceId={workspaceId}
        categories={menu.categories.filter((category) => category.isActive)}
        items={menu.items.filter((item) => item.isActive)}
        tables={tables.filter((table) => table.status !== "INACTIVE").map((table) => ({ id: table.id, name: table.name, status: table.status }))}
        canFinancialOverride={role === "OWNER" || role === "ADMIN" || role === "MANAGER"}
      />
    </div>
  );
}
