import { PageHeader } from "@/components/business/page-header";
import { requireWorkspace } from "@/lib/server/auth";
import { listRestaurantTables } from "@/lib/server/industry-modules";
import { listRestaurantMenu } from "@/lib/server/restaurant-workspace";
import { RestaurantPos } from "./restaurant-pos";

export default async function RestaurantPosPage() {
  const { workspaceId, role } = await requireWorkspace();
  const [menu, tables] = await Promise.all([
    listRestaurantMenu(workspaceId),
    listRestaurantTables(workspaceId),
  ]);

  return (
    <div className="mx-auto max-w-[1600px] space-y-6">
      <PageHeader title="Restaurant POS" description="Create dine-in, takeaway and delivery orders. Prices are always validated on the server before an order is accepted." />
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
