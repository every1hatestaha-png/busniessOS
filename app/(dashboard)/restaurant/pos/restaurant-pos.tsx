"use client";

import { useMemo, useRef, useState } from "react";
import { Minus, Plus, Search, ShoppingCart, Trash2, UtensilsCrossed } from "lucide-react";

import { useRestaurantActionState } from "@/app/(dashboard)/restaurant/use-restaurant-action-state";
import { initialRestaurantV1ActionState } from "@/app/(dashboard)/restaurant/v1-action-state";
import { createPosOrderAction } from "@/app/(dashboard)/restaurant/v1-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type Category = { id: string; name: string; sortOrder: number; isActive: boolean };
type MenuItem = { id: string; categoryId: string; categoryName: string; name: string; description: string | null; price: number; isAvailable: boolean };
type Table = { id: string; name: string; status: string };
type CartLine = { menuItemId: string; name: string; price: number; quantity: number };

export function RestaurantPos({
  workspaceId,
  categories,
  items,
  tables,
  canFinancialOverride,
}: {
  workspaceId?: string;
  categories: Category[];
  items: MenuItem[];
  tables: Table[];
  canFinancialOverride: boolean;
}) {
  const [cart, setCart] = useState<CartLine[]>([]);
  const [query, setQuery] = useState("");
  const requestId = useRef<string | null>(null);
  const requestField = useRef<HTMLInputElement>(null);
  const [state, action, pending, onSubmit] = useRestaurantActionState(async (previous, form) => {
    const result = await createPosOrderAction(previous, form);
    if (result.status === "success") {
      setCart([]);
      requestId.current = null;
      if (requestField.current) requestField.current.value = "";
    }
    return result;
  }, initialRestaurantV1ActionState);

  const [activeCategory, setActiveCategory] = useState(categories[0]?.id ?? "all");
  const [fulfillmentType, setFulfillmentType] = useState("TAKEAWAY");

  const visibleItems = items.filter((item) => {
    const categoryMatch = activeCategory === "all" || item.categoryId === activeCategory;
    const queryMatch = !query.trim() || item.name.toLowerCase().includes(query.trim().toLowerCase());
    return categoryMatch && queryMatch;
  });

  const subtotal = useMemo(() => cart.reduce((sum, line) => sum + line.price * line.quantity, 0), [cart]);
  const itemCount = useMemo(() => cart.reduce((sum, line) => sum + line.quantity, 0), [cart]);

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
    <div className="grid min-h-[calc(100dvh-9rem)] gap-4 xl:grid-cols-[minmax(0,1fr)_390px]">
      <section className="min-w-0 space-y-4 rounded-2xl border bg-white p-4 shadow-none sm:p-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-emerald-700">Menu</p>
            <h2 className="mt-1 text-lg font-semibold tracking-tight">Add items fast</h2>
          </div>
          <div className="relative w-full lg:max-w-sm">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
            <Input value={query} onChange={(event) => setQuery(event.target.value)} className="h-10 rounded-xl bg-slate-50 pl-9" placeholder="Search menu items…" />
          </div>
        </div>

        <div className="flex gap-2 overflow-x-auto pb-1">
          <button
            type="button"
            onClick={() => setActiveCategory("all")}
            className={cn(
              "shrink-0 rounded-full border px-3 py-1.5 text-xs font-semibold transition",
              activeCategory === "all" ? "border-emerald-600 bg-emerald-600 text-white" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50",
            )}
          >
            All
          </button>
          {categories.map((category) => (
            <button
              key={category.id}
              type="button"
              onClick={() => setActiveCategory(category.id)}
              className={cn(
                "shrink-0 rounded-full border px-3 py-1.5 text-xs font-semibold transition",
                activeCategory === category.id ? "border-emerald-600 bg-emerald-600 text-white" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50",
              )}
            >
              {category.name}
            </button>
          ))}
        </div>

        {visibleItems.length ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
            {visibleItems.map((item) => (
              <button
                key={item.id}
                type="button"
                disabled={pending || !item.isAvailable}
                onClick={() => add(item)}
                className="group min-h-36 rounded-2xl border bg-white p-3 text-left transition hover:-translate-y-0.5 hover:border-emerald-300 hover:shadow-sm disabled:cursor-not-allowed disabled:opacity-50"
              >
                <div className="grid h-16 place-items-center rounded-xl bg-[linear-gradient(135deg,#eef7f2,#f7faf8)] text-emerald-700">
                  <UtensilsCrossed className="size-5" />
                </div>
                <div className="mt-3 flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-900">{item.name}</p>
                    <p className="mt-0.5 truncate text-[11px] text-slate-500">{item.description || item.categoryName}</p>
                  </div>
                  <span className="shrink-0 text-sm font-bold text-emerald-700">Rs {item.price.toLocaleString()}</span>
                </div>
                <p className={cn("mt-3 text-[11px] font-semibold", item.isAvailable ? "text-emerald-700" : "text-red-600")}>
                  {item.isAvailable ? "Tap to add" : "Unavailable"}
                </p>
              </button>
            ))}
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed p-10 text-center text-sm text-muted-foreground">No menu items match this view.</div>
        )}
      </section>

      <aside className="h-fit rounded-2xl border bg-white p-4 shadow-sm xl:sticky xl:top-5 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2"><ShoppingCart className="size-4 text-emerald-600" /><h2 className="font-semibold">Current order</h2></div>
            <p className="mt-1 text-xs text-muted-foreground">{itemCount ? `${itemCount} item${itemCount === 1 ? "" : "s"}` : "Start by selecting menu items"}</p>
          </div>
          {cart.length ? <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700">Rs {subtotal.toLocaleString()}</span> : null}
        </div>

        <div className="mt-4 flex rounded-xl bg-slate-100 p-1">
          {[
            ["DINE_IN", "Dine-in"],
            ["TAKEAWAY", "Takeaway"],
            ["DELIVERY", "Delivery"],
          ].map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setFulfillmentType(value)}
              className={cn(
                "flex-1 rounded-lg px-2 py-2 text-xs font-semibold transition",
                fulfillmentType === value ? "bg-white text-slate-900 shadow-sm" : "text-slate-500",
              )}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="mt-4 max-h-[350px] space-y-2 overflow-y-auto pr-1">
          {cart.length ? cart.map((line) => (
            <div key={line.menuItemId} className="rounded-xl border bg-slate-50/60 p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{line.name}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">Rs {(line.price * line.quantity).toLocaleString()}</p>
                </div>
                <Button type="button" variant="ghost" size="icon" className="size-7 text-destructive" disabled={pending} onClick={() => setCart((current) => current.filter((item) => item.menuItemId !== line.menuItemId))}>
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
              <div className="mt-2 flex items-center gap-2">
                <Button type="button" variant="outline" size="icon" className="size-7 rounded-lg" disabled={pending} onClick={() => change(line.menuItemId, -1)}><Minus className="size-3" /></Button>
                <span className="w-6 text-center text-sm font-semibold">{line.quantity}</span>
                <Button type="button" variant="outline" size="icon" className="size-7 rounded-lg" disabled={pending} onClick={() => change(line.menuItemId, 1)}><Plus className="size-3" /></Button>
              </div>
            </div>
          )) : (
            <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">Your order is empty.</div>
          )}
        </div>

        <form
          action={action}
          onSubmit={(event) => {
            onSubmit(event);
            if (!event.defaultPrevented) {
              requestId.current ??= crypto.randomUUID();
              if (requestField.current) requestField.current.value = requestId.current;
            }
          }}
          aria-busy={pending}
          className="mt-4 space-y-3 border-t pt-4"
        >
          <input ref={requestField} type="hidden" name="orderRequestId" />
          {workspaceId ? <input type="hidden" name="formWorkspaceId" value={workspaceId} /> : null}
          <fieldset disabled={pending} className="contents">
            <input type="hidden" name="itemsJson" value={JSON.stringify(cart.map(({ menuItemId, quantity }) => ({ menuItemId, quantity })))} />
            <input type="hidden" name="fulfillmentType" value={fulfillmentType} />

            {fulfillmentType === "DINE_IN" ? (
              <label className="block space-y-1.5 text-xs font-medium">
                Table
                <select name="restaurantTableId" required className="h-10 w-full rounded-xl border bg-background px-3 text-sm">
                  <option value="">Choose table</option>
                  {tables.map((table) => <option key={table.id} value={table.id}>{table.name} · {table.status}</option>)}
                </select>
              </label>
            ) : null}

            <div className="grid grid-cols-2 gap-2">
              <Input name="customerName" placeholder="Customer name" maxLength={120} className="rounded-xl" />
              <Input name="customerPhone" placeholder="Phone" maxLength={40} className="rounded-xl" />
            </div>

            {fulfillmentType === "DELIVERY" ? <Input name="deliveryAddress" placeholder="Delivery address" maxLength={500} required className="rounded-xl" /> : null}
            <Input name="notes" placeholder="Kitchen / order note" maxLength={500} className="rounded-xl" />

            {canFinancialOverride ? (
              <div className="grid grid-cols-2 gap-2">
                <label className="space-y-1 text-xs font-medium">Discount<Input name="discountAmount" type="number" min={0} step="0.01" defaultValue={0} className="rounded-xl" /></label>
                <label className="space-y-1 text-xs font-medium">Tax<Input name="taxAmount" type="number" min={0} step="0.01" defaultValue={0} className="rounded-xl" /></label>
              </div>
            ) : null}

            <div className="rounded-xl bg-slate-50 p-3">
              <div className="flex items-center justify-between text-sm"><span className="text-muted-foreground">Subtotal</span><span className="font-semibold">Rs {subtotal.toLocaleString()}</span></div>
              <p className="mt-1 text-[10px] text-muted-foreground">Server validates final prices and totals before creating the order.</p>
            </div>

            {state.message ? <p role={state.status === "error" ? "alert" : "status"} className={state.status === "error" ? "text-xs text-destructive" : "text-xs font-medium text-emerald-700"}>{state.message}</p> : null}

            <Button type="submit" className="h-11 w-full rounded-xl bg-emerald-600 text-sm font-semibold hover:bg-emerald-500" disabled={pending || cart.length === 0}>
              {pending ? "Creating order..." : fulfillmentType === "DINE_IN" ? "Send to kitchen" : "Confirm order"}
            </Button>
          </fieldset>
        </form>
      </aside>
    </div>
  );
}
