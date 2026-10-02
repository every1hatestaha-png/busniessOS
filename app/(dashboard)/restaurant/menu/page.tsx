import { PageHeader } from "@/components/business/page-header";
import { requireWorkspace } from "@/lib/server/auth";
import { listProducts } from "@/lib/server/products";
import { listRestaurantMenu } from "@/lib/server/restaurant-workspace";
import { RestaurantMenuManager } from "./restaurant-menu-manager";

export default async function RestaurantMenuPage() {
  const { workspaceId, role } = await requireWorkspace();
  const [menu, products] = await Promise.all([listRestaurantMenu(workspaceId), listProducts(workspaceId)]);
  const canManage = role === "OWNER" || role === "ADMIN" || role === "MANAGER";

  return (
    <div className="mx-auto max-w-[1500px] space-y-6">
      <PageHeader title="Restaurant Menu" description="Manage categories, selling prices, availability and optional links to core inventory products." />
      <RestaurantMenuManager
        workspaceId={workspaceId}
        categories={menu.categories}
        items={menu.items}
        products={products.filter((product) => product.status === "ACTIVE").map((product) => ({ id: product.id, name: product.name, sku: product.sku }))}
        canManage={canManage}
      />
    </div>
  );
}
