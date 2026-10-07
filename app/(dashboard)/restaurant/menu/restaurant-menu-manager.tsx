"use client";

import { CheckCircle2, CircleOff, PackageCheck, Plus, Tags, UtensilsCrossed } from "lucide-react";

import { RestaurantMutationForm } from "@/app/(dashboard)/restaurant/mutation-form";
import { useRestaurantActionState } from "@/app/(dashboard)/restaurant/use-restaurant-action-state";
import { initialRestaurantV1ActionState } from "@/app/(dashboard)/restaurant/v1-action-state";
import {
  createMenuCategoryAction,
  createMenuItemAction,
  setMenuItemAvailabilityAction,
} from "@/app/(dashboard)/restaurant/v1-actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type Category = { id: string; name: string; sortOrder: number; isActive: boolean };
type Item = { id: string; categoryId: string; categoryName: string; productId: string | null; name: string; description: string | null; price: number; sortOrder: number; isActive: boolean; isAvailable: boolean };
type Product = { id: string; name: string; sku: string };

export function RestaurantMenuManager({ workspaceId, categories, items, products, canManage }: { workspaceId: string; categories: Category[]; items: Item[]; products: Product[]; canManage: boolean }) {
  const [categoryState, categoryAction, categoryPending, categorySubmit] = useRestaurantActionState(createMenuCategoryAction, initialRestaurantV1ActionState);
  const [itemState, itemAction, itemPending, itemSubmit] = useRestaurantActionState(createMenuItemAction, initialRestaurantV1ActionState);

  const itemsByCategory = new Map<string, Item[]>();
  for (const item of items) {
    const group = itemsByCategory.get(item.categoryName) ?? [];
    group.push(item);
    itemsByCategory.set(item.categoryName, group);
  }

  return (
    <div className="space-y-5">
      {canManage ? (
        <div className="grid gap-4 xl:grid-cols-[.8fr_1.2fr]">
          <Card className="rounded-2xl border shadow-none">
            <CardContent className="p-4 sm:p-5">
              <div className="flex items-center gap-2">
                <span className="grid size-9 place-items-center rounded-xl bg-emerald-50 text-emerald-700"><Tags className="size-4" /></span>
                <div><h2 className="font-semibold">Add category</h2><p className="text-xs text-muted-foreground">Burgers, Pizza, Drinks, Desserts…</p></div>
              </div>
              <form action={categoryAction} onSubmit={categorySubmit} aria-busy={categoryPending} className="mt-4 grid gap-2.5 sm:grid-cols-[1fr_100px]">
                <input type="hidden" name="formWorkspaceId" value={workspaceId} />
                <Input name="name" placeholder="Category name" maxLength={80} required className="rounded-xl" />
                <Input name="sortOrder" type="number" min={0} max={10000} defaultValue={0} aria-label="Sort order" className="rounded-xl" />
                <Button type="submit" className="rounded-xl sm:col-span-2" disabled={categoryPending || categories.length >= 200}><Plus className="size-4" />{categoryPending ? "Adding..." : "Add category"}</Button>
                {categoryState.message ? <p className={cn("text-xs sm:col-span-2", categoryState.status === "error" ? "text-destructive" : "text-emerald-700")}>{categoryState.message}</p> : null}
              </form>
            </CardContent>
          </Card>

          <Card className="rounded-2xl border shadow-none">
            <CardContent className="p-4 sm:p-5">
              <div className="flex items-center gap-2">
                <span className="grid size-9 place-items-center rounded-xl bg-emerald-50 text-emerald-700"><UtensilsCrossed className="size-4" /></span>
                <div><h2 className="font-semibold">Add menu item</h2><p className="text-xs text-muted-foreground">Create the sellable item and optionally connect stock.</p></div>
              </div>
              <form action={itemAction} onSubmit={itemSubmit} aria-busy={itemPending} className="mt-4 grid gap-2.5 sm:grid-cols-2">
                <input type="hidden" name="formWorkspaceId" value={workspaceId} />
                <select name="categoryId" required className="h-10 rounded-xl border bg-background px-3 text-sm"><option value="">Choose category</option>{categories.filter((category) => category.isActive).map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select>
                <Input name="name" placeholder="Menu item name" maxLength={120} required className="rounded-xl" />
                <Input name="price" type="number" min={0} step="0.01" placeholder="Selling price" required className="rounded-xl" />
                <select name="productId" className="h-10 rounded-xl border bg-background px-3 text-sm"><option value="">No inventory link</option>{products.map((product) => <option key={product.id} value={product.id}>{product.name} · {product.sku}</option>)}</select>
                <Input name="description" placeholder="Description (optional)" maxLength={500} className="rounded-xl" />
                <Input name="sortOrder" type="number" min={0} max={10000} defaultValue={0} aria-label="Sort order" className="rounded-xl" />
                <div className="flex items-center justify-between gap-3 sm:col-span-2">
                  <span>{itemState.message ? <span className={cn("text-xs", itemState.status === "error" ? "text-destructive" : "text-emerald-700")}>{itemState.message}</span> : null}</span>
                  <Button type="submit" className="rounded-xl" disabled={itemPending || categories.length === 0}><Plus className="size-4" />{itemPending ? "Adding..." : "Add menu item"}</Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      ) : (
        <Card className="rounded-2xl"><CardContent className="p-5 text-sm text-muted-foreground">Menu configuration is restricted to owner, admin or manager roles.</CardContent></Card>
      )}

      <Card className="overflow-hidden rounded-2xl border shadow-none">
        <CardContent className="p-0">
          <div className="flex flex-col gap-3 border-b px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
            <div>
              <h2 className="font-semibold">Live menu</h2>
              <p className="text-xs text-muted-foreground">Availability changes instantly without deleting order history.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {categories.filter((category) => category.isActive).slice(0, 8).map((category) => (
                <span key={category.id} className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-medium text-slate-600">{category.name}</span>
              ))}
            </div>
          </div>

          {items.length ? (
            <div className="space-y-5 p-4 sm:p-5">
              {[...itemsByCategory.entries()].map(([categoryName, categoryItems]) => (
                <section key={categoryName}>
                  <div className="mb-2 flex items-center justify-between"><h3 className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">{categoryName}</h3><span className="text-[11px] text-muted-foreground">{categoryItems.length} item{categoryItems.length === 1 ? "" : "s"}</span></div>
                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                    {categoryItems.map((item) => (
                      <div key={item.id} className={cn("rounded-2xl border bg-white p-3.5", !item.isAvailable && "bg-slate-50 opacity-70")}>
                        <div className="grid h-14 place-items-center rounded-xl bg-[linear-gradient(135deg,#eef7f2,#f7faf8)] text-emerald-700"><UtensilsCrossed className="size-5" /></div>
                        <div className="mt-3 flex items-start justify-between gap-3">
                          <div className="min-w-0"><p className="truncate text-sm font-semibold">{item.name}</p><p className="mt-0.5 truncate text-[11px] text-muted-foreground">{item.description || categoryName}</p></div>
                          <p className="shrink-0 text-sm font-bold text-emerald-700">Rs {item.price.toLocaleString()}</p>
                        </div>
                        <div className="mt-3 flex items-center justify-between gap-2">
                          <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-semibold", item.productId ? "bg-blue-50 text-blue-700" : "bg-slate-100 text-slate-500")}>
                            <PackageCheck className="size-3" />{item.productId ? "Stock linked" : "No stock link"}
                          </span>
                          {canManage ? (
                            <RestaurantMutationForm action={setMenuItemAvailabilityAction} workspaceId={workspaceId}>
                              <input type="hidden" name="menuItemId" value={item.id} />
                              <input type="hidden" name="isAvailable" value={String(!item.isAvailable)} />
                              <Button type="submit" variant="outline" size="sm" className={cn("h-8 rounded-lg text-xs", item.isAvailable ? "text-emerald-700" : "text-muted-foreground")}>
                                {item.isAvailable ? <CheckCircle2 className="size-3.5" /> : <CircleOff className="size-3.5" />}
                                {item.isAvailable ? "Available" : "Unavailable"}
                              </Button>
                            </RestaurantMutationForm>
                          ) : <span className="text-xs">{item.isAvailable ? "Available" : "Unavailable"}</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          ) : <div className="p-10 text-center text-sm text-muted-foreground">No menu items yet. Add your first category and item above.</div>}
        </CardContent>
      </Card>
    </div>
  );
}
