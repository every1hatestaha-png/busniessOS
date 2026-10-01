"use client";

import { useActionState, useMemo, useState } from "react";
import { Minus, Plus, ShoppingCart, Trash2 } from "lucide-react";

import { initialRestaurantV1ActionState } from "@/app/(dashboard)/restaurant/v1-action-state";
import { createPosOrderAction } from "@/app/(dashboard)/restaurant/v1-actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

type Category = { id: string; name: string; sortOrder: number; isActive: boolean };
type MenuItem = { id: string; categoryId: string; categoryName: string; name: string; description: string | null; price: number; isAvailable: boolean };
type Table = { id: string; name: string; status: string };
type CartLine = { menuItemId: string; name: string; price: number; quantity: number };

export function RestaurantPos({ categories, items, tables, canFinancialOverride }: { categories: Category[]; items: MenuItem[]; tables: Table[]; canFinancialOverride: boolean }) {
  const [state, action, pending] = useActionState(createPosOrderAction, initialRestaurantV1ActionState);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [activeCategory, setActiveCategory] = useState(categories[0]?.id ?? "all");
  const [fulfillmentType, setFulfillmentType] = useState("TAKEAWAY");
  const visibleItems = items.filter((item) => item.categoryId === activeCategory || activeCategory === "all");
  const subtotal = useMemo(() => cart.reduce((sum, line) => sum + line.price * line.quantity, 0), [cart]);

  function add(item: MenuItem) {
    if (!item.isAvailable) return;
    setCart((current) => {
      const found = current.find((line) => line.menuItemId === item.id);
      return found
        ? current.map((line) => line.menuItemId === item.id ? { ...line, quantity: line.quantity + 1 } : line)
        : [...current, { menuItemId: item.id, name: item.name, price: item.price, quantity: 1 }];
    });
  }

  function change(menuItemId: string, delta: number) {
    setCart((current) => current
      .map((line) => line.menuItemId === menuItemId ? { ...line, quantity: Math.max(0, line.quantity + delta) } : line)
      .filter((line) => line.quantity > 0));
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
      <div className="space-y-4">
        <div className="flex gap-2 overflow-x-auto pb-1">
          <Button type="button" variant={activeCategory === "all" ? "default" : "outline"} size="sm" onClick={() => setActiveCategory("all")}>All</Button>
          {categories.map((category) => <Button key={category.id} type="button" variant={activeCategory === category.id ? "default" : "outline"} size="sm" onClick={() => setActiveCategory(category.id)}>{category.name}</Button>)}
        </div>
        {visibleItems.length ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
            {visibleItems.map((item) => (
              <button key={item.id} type="button" disabled={!item.isAvailable} onClick={() => add(item)} className="rounded-lg border bg-card p-4 text-left shadow-sm transition hover:border-emerald-300 hover:bg-emerald-50/30 disabled:cursor-not-allowed disabled:opacity-50 dark:hover:bg-emerald-950/10">
                <div className="flex items-start justify-between gap-3"><p className="font-semibold">{item.name}</p><span className="whitespace-nowrap text-sm font-semibold text-emerald-700">Rs {item.price.toLocaleString()}</span></div>
                <p className="mt-1 line-clamp-2 min-h-8 text-xs text-muted-foreground">{item.description || item.categoryName}</p>
                {!item.isAvailable ? <p className="mt-3 text-xs font-semibold text-destructive">Unavailable</p> : <p className="mt-3 text-xs font-medium text-emerald-700">Tap to add</p>}
              </button>
            ))}
          </div>
        ) : <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">No active menu items in this category. Add items from Restaurant → Menu.</CardContent></Card>}
      </div>

      <Card className="h-fit rounded-lg shadow-sm xl:sticky xl:top-5">
        <CardContent className="space-y-4 p-5">
          <div className="flex items-center gap-2"><ShoppingCart className="size-4 text-emerald-600" /><h2 className="font-semibold">Current order</h2></div>
          <div className="space-y-2">
            {cart.length ? cart.map((line) => (
              <div key={line.menuItemId} className="flex items-center gap-2 rounded-md border p-2.5">
                <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{line.name}</p><p className="text-xs text-muted-foreground">Rs {(line.price * line.quantity).toLocaleString()}</p></div>
                <Button type="button" variant="outline" size="icon" className="size-7" onClick={() => change(line.menuItemId, -1)}><Minus className="size-3" /></Button>
                <span className="w-6 text-center text-sm font-semibold">{line.quantity}</span>
                <Button type="button" variant="outline" size="icon" className="size-7" onClick={() => change(line.menuItemId, 1)}><Plus className="size-3" /></Button>
                <Button type="button" variant="ghost" size="icon" className="size-7 text-destructive" onClick={() => setCart((current) => current.filter((item) => item.menuItemId !== line.menuItemId))}><Trash2 className="size-3.5" /></Button>
              </div>
            )) : <p className="rounded-md border border-dashed p-5 text-center text-sm text-muted-foreground">Select menu items to start an order.</p>}
          </div>

          <form action={action} className="space-y-3">
            <input type="hidden" name="itemsJson" value={JSON.stringify(cart.map(({ menuItemId, quantity }) => ({ menuItemId, quantity })))} />
            <label className="block space-y-1.5 text-xs font-medium">Order type
              <select name="fulfillmentType" value={fulfillmentType} onChange={(event) => setFulfillmentType(event.target.value)} className="h-9 w-full rounded-md border bg-background px-3 text-sm">
                <option value="DINE_IN">Dine-in</option><option value="TAKEAWAY">Takeaway</option><option value="DELIVERY">Delivery</option>
              </select>
            </label>
            {fulfillmentType === "DINE_IN" ? <label className="block space-y-1.5 text-xs font-medium">Table
              <select name="restaurantTableId" required className="h-9 w-full rounded-md border bg-background px-3 text-sm"><option value="">Choose table</option>{tables.map((table) => <option key={table.id} value={table.id}>{table.name} · {table.status}</option>)}</select>
            </label> : null}
            <div className="grid grid-cols-2 gap-2"><Input name="customerName" placeholder="Customer name" maxLength={120} /><Input name="customerPhone" placeholder="Phone" maxLength={40} /></div>
            {fulfillmentType === "DELIVERY" ? <Input name="deliveryAddress" placeholder="Delivery address" maxLength={500} required /> : null}
            <Input name="notes" placeholder="Order notes" maxLength={500} />
            {canFinancialOverride ? <div className="grid grid-cols-2 gap-2">
              <label className="space-y-1 text-xs font-medium">Discount<Input name="discountAmount" type="number" min={0} step="0.01" defaultValue={0} /></label>
              <label className="space-y-1 text-xs font-medium">Tax<Input name="taxAmount" type="number" min={0} step="0.01" defaultValue={0} /></label>
            </div> : null}
            <div className="border-t pt-3"><div className="flex items-center justify-between text-sm"><span className="text-muted-foreground">Displayed subtotal</span><span className="font-semibold">Rs {subtotal.toLocaleString()}</span></div><p className="mt-1 text-[11px] text-muted-foreground">Final prices and totals are recalculated securely by the server.</p></div>
            {state.message ? <p className={state.status === "error" ? "text-xs text-destructive" : "text-xs font-medium text-emerald-700"}>{state.message}</p> : null}
            <Button type="submit" className="w-full" disabled={pending || cart.length === 0}>{pending ? "Creating order..." : "Confirm & send to kitchen"}</Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
