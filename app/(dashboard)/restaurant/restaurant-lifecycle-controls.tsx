"use client";

import { useActionState, useMemo, useState } from "react";
import { CheckCircle2, ChefHat, CircleX, Flame, Plus, Trash2, Utensils } from "lucide-react";

import {
  createKitchenTicketAction,
  createRecipeAction,
  initialRestaurantActionState,
  updateKitchenTicketStatusAction,
} from "@/app/(dashboard)/restaurant/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

type ProductOption = { id: string; name: string; sku: string };
type TableOption = { id: string; name: string; status: string };
type SaleOption = { id: string; orderNumber: string; customerName: string; status: string };
type Ticket = { id: string; ticketNumber: string; status: string; tableName: string | null; salesOrderId: string | null };

type IngredientRow = { ingredientProductId: string; quantity: string; wastagePercent: string };

export function RestaurantLifecycleControls({
  products,
  tables,
  sales,
  tickets,
  canManageRecipes,
}: {
  products: ProductOption[];
  tables: TableOption[];
  sales: SaleOption[];
  tickets: Ticket[];
  canManageRecipes: boolean;
}) {
  const [recipeState, recipeAction, recipePending] = useActionState(createRecipeAction, initialRestaurantActionState);
  const [ticketState, ticketAction, ticketPending] = useActionState(createKitchenTicketAction, initialRestaurantActionState);
  const [ingredients, setIngredients] = useState<IngredientRow[]>([{ ingredientProductId: "", quantity: "1", wastagePercent: "0" }]);

  const itemsJson = useMemo(
    () => JSON.stringify(ingredients.map((row) => ({
      ingredientProductId: row.ingredientProductId,
      quantity: Number(row.quantity),
      wastagePercent: Number(row.wastagePercent),
    }))),
    [ingredients],
  );

  function updateIngredient(index: number, patch: Partial<IngredientRow>) {
    setIngredients((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, ...patch } : row));
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-5 xl:grid-cols-2">
        <Card className="rounded-md border shadow-none ring-0">
          <CardContent className="p-5">
            <div className="flex items-center gap-2"><ChefHat className="size-4 text-emerald-700" /><h2 className="text-sm font-semibold">Recipe builder</h2></div>
            <p className="mt-1 text-xs text-muted-foreground">Serving a linked kitchen ticket consumes these ingredients from inventory exactly once.</p>
            {canManageRecipes ? (
              <form action={recipeAction} className="mt-4 space-y-4">
                <input type="hidden" name="itemsJson" value={itemsJson} />
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Finished product">
                    <select name="finishedProductId" required defaultValue="" className={selectClass}>
                      <option value="" disabled>Select menu product</option>
                      {products.map((product) => <option key={product.id} value={product.id}>{product.name}{product.sku ? ` · ${product.sku}` : ""}</option>)}
                    </select>
                  </Field>
                  <Field label="Recipe yield"><Input name="yieldQuantity" type="number" min="0.0001" step="0.0001" defaultValue={1} required /></Field>
                  <div className="sm:col-span-2"><Field label="Notes"><Input name="notes" maxLength={500} placeholder="Optional preparation notes" /></Field></div>
                </div>

                <div className="rounded-lg border">
                  <div className="flex items-center justify-between border-b px-3 py-2.5">
                    <p className="text-xs font-semibold">Ingredients</p>
                    <Button type="button" variant="outline" size="sm" disabled={ingredients.length >= 100} onClick={() => setIngredients((rows) => [...rows, { ingredientProductId: "", quantity: "1", wastagePercent: "0" }])}><Plus />Add ingredient</Button>
                  </div>
                  <div className="divide-y">
                    {ingredients.map((row, index) => (
                      <div key={index} className="grid gap-2 p-3 sm:grid-cols-[minmax(0,1fr)_110px_120px_36px]">
                        <select required value={row.ingredientProductId} onChange={(event) => updateIngredient(index, { ingredientProductId: event.target.value })} className={selectClass}>
                          <option value="" disabled>Select ingredient</option>
                          {products.map((product) => <option key={product.id} value={product.id}>{product.name}{product.sku ? ` · ${product.sku}` : ""}</option>)}
                        </select>
                        <Input aria-label="Ingredient quantity" type="number" min="0.0001" step="0.0001" value={row.quantity} onChange={(event) => updateIngredient(index, { quantity: event.target.value })} required />
                        <Input aria-label="Ingredient wastage percent" type="number" min={0} max={100} step="0.01" value={row.wastagePercent} onChange={(event) => updateIngredient(index, { wastagePercent: event.target.value })} />
                        <Button type="button" variant="ghost" size="icon" disabled={ingredients.length === 1} onClick={() => setIngredients((rows) => rows.filter((_, rowIndex) => rowIndex !== index))}><Trash2 /></Button>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="flex items-center justify-between gap-3"><ActionMessage state={recipeState} /><Button type="submit" disabled={recipePending || products.length < 2}>{recipePending ? "Saving..." : "Save recipe"}</Button></div>
              </form>
            ) : <p className="mt-4 text-sm text-muted-foreground">Only an owner, admin, or manager can configure recipes.</p>}
          </CardContent>
        </Card>

        <Card className="rounded-md border shadow-none ring-0">
          <CardContent className="p-5">
            <div className="flex items-center gap-2"><Utensils className="size-4 text-emerald-700" /><h2 className="text-sm font-semibold">Queue kitchen ticket</h2></div>
            <p className="mt-1 text-xs text-muted-foreground">Linking a sale enables automatic recipe consumption when the ticket is served.</p>
            <form action={ticketAction} className="mt-4 grid gap-3 sm:grid-cols-2">
              <Field label="Ticket number"><Input name="ticketNumber" placeholder="KT-0001" maxLength={80} required /></Field>
              <Field label="Table">
                <select name="restaurantTableId" defaultValue="" className={selectClass}>
                  <option value="">No table</option>
                  {tables.filter((table) => table.status !== "INACTIVE").map((table) => <option key={table.id} value={table.id}>{table.name} · {table.status}</option>)}
                </select>
              </Field>
              <Field label="Sales order">
                <select name="salesOrderId" defaultValue="" className={selectClass}>
                  <option value="">No linked sale</option>
                  {sales.filter((sale) => sale.status !== "CANCELLED").map((sale) => <option key={sale.id} value={sale.id}>{sale.orderNumber} · {sale.customerName}</option>)}
                </select>
              </Field>
              <Field label="Notes"><Input name="notes" placeholder="Kitchen note" maxLength={500} /></Field>
              <div className="sm:col-span-2 flex items-center justify-between gap-3"><ActionMessage state={ticketState} /><Button type="submit" disabled={ticketPending}>{ticketPending ? "Queuing..." : "Queue ticket"}</Button></div>
            </form>
          </CardContent>
        </Card>
      </div>

      <Card className="gap-0 rounded-md border py-0 shadow-none ring-0">
        <CardContent className="p-0">
          <div className="border-b px-4 py-3"><p className="text-sm font-semibold">Kitchen board</p><p className="text-xs text-muted-foreground">Advance tickets only through valid kitchen states. Served and cancelled tickets are terminal.</p></div>
          {tickets.length ? <div className="divide-y">{tickets.map((ticket) => <KitchenTicketRow key={ticket.id} ticket={ticket} />)}</div> : <div className="p-5 text-sm text-muted-foreground">No kitchen tickets yet.</div>}
        </CardContent>
      </Card>
    </div>
  );
}

function KitchenTicketRow({ ticket }: { ticket: Ticket }) {
  const [state, action, pending] = useActionState(updateKitchenTicketStatusAction, initialRestaurantActionState);
  const next = ticket.status === "QUEUED" ? "PREPARING" : ticket.status === "PREPARING" ? "READY" : ticket.status === "READY" ? "SERVED" : null;
  const label = next === "PREPARING" ? "Start preparing" : next === "READY" ? "Mark ready" : next === "SERVED" ? "Serve" : null;

  return (
    <div className="flex flex-col gap-3 px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
      <div>
        <div className="flex items-center gap-2"><span className="font-medium">{ticket.ticketNumber}</span><span className="rounded-full border px-2 py-0.5 text-[11px]">{ticket.status}</span></div>
        <p className="mt-1 text-xs text-muted-foreground">{ticket.tableName || "No table"}{ticket.salesOrderId ? " · linked to sale" : " · manual ticket"}</p>
        <ActionMessage state={state} />
      </div>
      {!["SERVED", "CANCELLED"].includes(ticket.status) ? (
        <div className="flex flex-wrap gap-2">
          {next && label ? <form action={action}><input type="hidden" name="ticketId" value={ticket.id} /><input type="hidden" name="status" value={next} /><Button type="submit" size="sm" disabled={pending}>{next === "PREPARING" ? <Flame /> : <CheckCircle2 />}{pending ? "Updating..." : label}</Button></form> : null}
          <form action={action}><input type="hidden" name="ticketId" value={ticket.id} /><input type="hidden" name="status" value="CANCELLED" /><Button type="submit" size="sm" variant="outline" disabled={pending}><CircleX />Cancel</Button></form>
        </div>
      ) : null}
    </div>
  );
}

const selectClass = "h-8 w-full rounded-lg border border-input bg-background px-2.5 text-sm outline-none focus:border-ring focus:ring-3 focus:ring-ring/50";
function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="space-y-1.5 text-xs font-medium"><span>{label}</span>{children}</label>; }
function ActionMessage({ state }: { state: { status: "idle" | "success" | "error"; message: string } }) { if (!state.message) return <span />; return <p className={state.status === "error" ? "mt-1 text-xs text-destructive" : "mt-1 text-xs text-emerald-700"}>{state.message}</p>; }
