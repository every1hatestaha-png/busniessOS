"use client";

import { RestaurantMutationForm } from "@/app/(dashboard)/restaurant/mutation-form";

import { useActionState } from "react";
import { CheckCircle2, CircleOff } from "lucide-react";

import { initialRestaurantV1ActionState } from "@/app/(dashboard)/restaurant/v1-action-state";
import {
  createMenuCategoryAction,
  createMenuItemAction,
  setMenuItemAvailabilityAction,
} from "@/app/(dashboard)/restaurant/v1-actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

type Category = { id: string; name: string; sortOrder: number; isActive: boolean };
type Item = { id: string; categoryId: string; categoryName: string; productId: string | null; name: string; description: string | null; price: number; sortOrder: number; isActive: boolean; isAvailable: boolean };
type Product = { id: string; name: string; sku: string };

export function RestaurantMenuManager({ workspaceId, categories, items, products, canManage }: { workspaceId: string; categories: Category[]; items: Item[]; products: Product[]; canManage: boolean }) {
  const [categoryState, categoryAction, categoryPending] = useActionState(createMenuCategoryAction, initialRestaurantV1ActionState);
  const [itemState, itemAction, itemPending] = useActionState(createMenuItemAction, initialRestaurantV1ActionState);

  return (
    <div className="space-y-5">
      {canManage ? (
        <div className="grid gap-5 xl:grid-cols-2">
          <Card className="rounded-lg shadow-sm"><CardContent className="p-5"><h2 className="font-semibold">Add category</h2><p className="mt-1 text-xs text-muted-foreground">Create menu groups such as Burgers, Pizza or Drinks.</p>
            <form action={categoryAction} className="mt-4 grid gap-3 sm:grid-cols-[1fr_120px_auto]"><input type="hidden" name="formWorkspaceId" value={workspaceId} />
              <Input name="name" placeholder="Category name" maxLength={80} required />
              <Input name="sortOrder" type="number" min={0} max={10000} defaultValue={0} aria-label="Sort order" />
              <Button type="submit" disabled={categoryPending || categories.length >= 200}>{categoryPending ? "Adding..." : "Add category"}</Button>
              {categoryState.message ? <p className={categoryState.status === "error" ? "text-xs text-destructive sm:col-span-3" : "text-xs text-emerald-700 sm:col-span-3"}>{categoryState.message}</p> : null}
            </form>
          </CardContent></Card>

          <Card className="rounded-lg shadow-sm"><CardContent className="p-5"><h2 className="font-semibold">Add menu item</h2><p className="mt-1 text-xs text-muted-foreground">Selling price is stored here. Linking inventory is optional and tenant-validated.</p>
            <form action={itemAction} className="mt-4 grid gap-3 sm:grid-cols-2"><input type="hidden" name="formWorkspaceId" value={workspaceId} />
              <select name="categoryId" required className="h-9 rounded-md border bg-background px-3 text-sm"><option value="">Choose category</option>{categories.filter((category) => category.isActive).map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select>
              <Input name="name" placeholder="Menu item name" maxLength={120} required />
              <Input name="price" type="number" min={0} step="0.01" placeholder="Price" required />
              <select name="productId" className="h-9 rounded-md border bg-background px-3 text-sm"><option value="">No inventory product link</option>{products.map((product) => <option key={product.id} value={product.id}>{product.name} · {product.sku}</option>)}</select>
              <Input name="description" placeholder="Description (optional)" maxLength={500} />
              <Input name="sortOrder" type="number" min={0} max={10000} defaultValue={0} aria-label="Sort order" />
              <div className="flex items-center justify-between gap-3 sm:col-span-2"><span>{itemState.message ? <span className={itemState.status === "error" ? "text-xs text-destructive" : "text-xs text-emerald-700"}>{itemState.message}</span> : null}</span><Button type="submit" disabled={itemPending || categories.length === 0}>{itemPending ? "Adding..." : "Add menu item"}</Button></div>
            </form>
          </CardContent></Card>
        </div>
      ) : <Card><CardContent className="p-5 text-sm text-muted-foreground">Menu configuration is restricted to owner, admin or manager roles.</CardContent></Card>}

      <Card className="overflow-hidden rounded-lg shadow-sm"><CardContent className="p-0"><div className="border-b px-5 py-4"><h2 className="font-semibold">Menu register</h2><p className="text-xs text-muted-foreground">Availability can be changed instantly without deleting menu history.</p></div>
        {items.length ? <div className="overflow-x-auto"><table className="w-full text-sm"><thead className="bg-muted/40 text-left text-xs text-muted-foreground"><tr><th className="px-4 py-3">Item</th><th className="px-4 py-3">Category</th><th className="px-4 py-3">Price</th><th className="px-4 py-3">Inventory link</th><th className="px-4 py-3">Availability</th></tr></thead><tbody className="divide-y">{items.map((item) => <tr key={item.id}><td className="px-4 py-3"><p className="font-medium">{item.name}</p>{item.description ? <p className="max-w-md truncate text-xs text-muted-foreground">{item.description}</p> : null}</td><td className="px-4 py-3 text-muted-foreground">{item.categoryName}</td><td className="px-4 py-3 font-medium">Rs {item.price.toLocaleString()}</td><td className="px-4 py-3 text-muted-foreground">{item.productId ? "Linked" : "Not linked"}</td><td className="px-4 py-3">{canManage ? <RestaurantMutationForm action={setMenuItemAvailabilityAction} workspaceId={workspaceId}><input type="hidden" name="menuItemId" value={item.id} /><input type="hidden" name="isAvailable" value={String(!item.isAvailable)} /><Button type="submit" variant="outline" size="sm" className={item.isAvailable ? "text-emerald-700" : "text-muted-foreground"}>{item.isAvailable ? <CheckCircle2 className="mr-1 size-3.5" /> : <CircleOff className="mr-1 size-3.5" />}{item.isAvailable ? "Available" : "Unavailable"}</Button></RestaurantMutationForm> : <span className="text-xs">{item.isAvailable ? "Available" : "Unavailable"}</span>}</td></tr>)}</tbody></table></div> : <div className="p-8 text-center text-sm text-muted-foreground">No menu items yet.</div>}
      </CardContent></Card>
    </div>
  );
}
