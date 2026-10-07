import { ChefHat, PackageCheck, UtensilsCrossed } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { requireWorkspace } from "@/lib/server/auth";
import { listProducts } from "@/lib/server/products";
import { listRestaurantMenu } from "@/lib/server/restaurant-workspace";
import { RestaurantMenuManager } from "./restaurant-menu-manager";

export default async function RestaurantMenuPage() {
  const { workspaceId, role, workspace } = await requireWorkspace();
  const [menu, products] = await Promise.all([listRestaurantMenu(workspaceId), listProducts(workspaceId)]);
  const canManage = role === "OWNER" || role === "ADMIN" || role === "MANAGER";
  const availableItems = menu.items.filter((item) => item.isAvailable).length;
  const linkedItems = menu.items.filter((item) => item.productId).length;

  return (
    <div className="mx-auto max-w-[1500px] space-y-5">
      <section className="flex flex-col gap-4 rounded-2xl border bg-white p-4 shadow-none sm:p-5 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-emerald-700">Menu control</p>
          <h1 className="mt-1 text-xl font-semibold tracking-tight">{workspace.name} menu</h1>
          <p className="mt-1 text-sm text-muted-foreground">Manage what staff can sell, what guests can order, and which items consume inventory.</p>
        </div>
        <div className="grid grid-cols-3 gap-2 sm:min-w-[420px]">
          <MiniStat icon={UtensilsCrossed} label="Items" value={menu.items.length} />
          <MiniStat icon={ChefHat} label="Available" value={availableItems} />
          <MiniStat icon={PackageCheck} label="Stock-linked" value={linkedItems} />
        </div>
      </section>

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

function MiniStat({ icon: Icon, label, value }: { icon: typeof ChefHat; label: string; value: number }) {
  return (
    <Card className="rounded-xl border shadow-none">
      <CardContent className="p-3">
        <Icon className="size-4 text-emerald-600" />
        <p className="mt-2 text-lg font-semibold tabular-nums">{value}</p>
        <p className="text-[10px] font-medium text-muted-foreground">{label}</p>
      </CardContent>
    </Card>
  );
}
