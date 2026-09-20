import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, Trash2 } from "lucide-react";

import { deleteCustomerPriceRuleAction, saveCustomerPriceRuleAction } from "@/app/(dashboard)/customers/[id]/pricing/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { requirePermission } from "@/lib/server/authorization";
import { listCustomerPriceRules } from "@/lib/server/customer-pricing";
import { db } from "@/lib/server/db";
import { formatPKR } from "@/lib/utils";

type Query = Promise<Record<string, string | string[] | undefined>>;
const selectClass = "h-9 w-full rounded-md border border-input bg-white px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/15";

export default async function CustomerPricingPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Query }) {
  const { id } = await params;
  const context = await requirePermission("customers.write");
  const query = await searchParams;
  const [customer, products, rules] = await Promise.all([
    db.customer.findFirst({ where: { id, workspaceId: context.workspaceId }, select: { id: true, name: true, companyName: true } }),
    db.product.findMany({
      where: { workspaceId: context.workspaceId, status: "ACTIVE" },
      orderBy: [{ name: "asc" }, { id: "asc" }],
      select: { id: true, name: true, sku: true, sellingPrice: true, unit: true },
    }),
    listCustomerPriceRules(context.workspaceId, id),
  ]);
  if (!customer) notFound();

  return (
    <div className="mx-auto max-w-[1200px] space-y-6">
      <header>
        <Link href={`/customers/${id}`} className="mb-2 inline-flex items-center gap-1 text-xs text-neutral-500 hover:text-neutral-900"><ChevronLeft className="h-3.5 w-3.5" />Customer</Link>
        <h1 className="text-2xl font-semibold tracking-tight">Customer Pricing</h1>
        <p className="mt-1 text-sm text-neutral-500">{customer.companyName ?? customer.name} · quantity-based unit-price tiers. Highest matching minimum quantity wins.</p>
      </header>

      {typeof query.success === "string" && <div className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">{query.success}</div>}
      {typeof query.error === "string" && <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">{query.error}</div>}

      <section className="rounded-xl border bg-white p-5 shadow-sm">
        <h2 className="font-semibold">Add or update a tier</h2>
        <p className="mt-1 text-xs text-neutral-500">Saving the same product + minimum quantity updates that tier. Weight-priced lines continue using their kg pricing workflow.</p>
        <form action={saveCustomerPriceRuleAction.bind(null, id)} className="mt-4 grid gap-4 md:grid-cols-4">
          <label className="md:col-span-2"><span className="mb-1 block text-xs font-medium">Product</span><select name="productId" className={selectClass} required><option value="">Choose product</option>{products.map((product) => <option key={product.id} value={product.id}>{product.name}{product.sku ? ` · ${product.sku}` : ""} · default {formatPKR(Number(product.sellingPrice))}/{product.unit.toLowerCase()}</option>)}</select></label>
          <label><span className="mb-1 block text-xs font-medium">Minimum quantity</span><Input name="minQuantity" type="number" min="0.0001" step="0.0001" defaultValue="1" required /></label>
          <label><span className="mb-1 block text-xs font-medium">Unit price</span><Input name="unitPrice" type="number" min="0" step="0.01" required /></label>
          <label><span className="mb-1 block text-xs font-medium">Discount / unit</span><Input name="discountPerUnit" type="number" min="0" step="0.01" defaultValue="0" /></label>
          <div className="md:col-span-3 flex items-end"><p className="text-xs text-neutral-500">Example: min qty 10, unit price Rs 950. Add another tier at 50 units for Rs 900.</p></div>
          <Button type="submit">Save tier</Button>
        </form>
      </section>

      <section className="overflow-hidden rounded-xl border bg-white shadow-sm">
        <div className="border-b px-5 py-4"><h2 className="font-semibold">Active price tiers</h2><p className="mt-0.5 text-xs text-neutral-500">{rules.length} configured tier{rules.length === 1 ? "" : "s"}.</p></div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="bg-neutral-50 text-left text-xs text-neutral-500"><tr><th className="px-4 py-3">Product</th><th className="px-4 py-3 text-right">Min qty</th><th className="px-4 py-3 text-right">Default</th><th className="px-4 py-3 text-right">Tier price</th><th className="px-4 py-3 text-right">Disc/unit</th><th className="px-4 py-3 text-right">Net/unit</th><th className="px-4 py-3" /></tr></thead>
            <tbody>
              {rules.map((rule) => <tr key={rule.id} className="border-t"><td className="px-4 py-3"><p className="font-medium">{rule.productName}</p><p className="text-[10px] text-neutral-500">{rule.sku || "No SKU"}</p></td><td className="px-4 py-3 text-right tabular-nums">{rule.minQuantity.toLocaleString("en-PK", { maximumFractionDigits: 4 })}</td><td className="px-4 py-3 text-right tabular-nums">{formatPKR(rule.defaultSellingPrice)}</td><td className="px-4 py-3 text-right font-semibold tabular-nums">{formatPKR(rule.unitPrice)}</td><td className="px-4 py-3 text-right tabular-nums">{formatPKR(rule.discountPerUnit)}</td><td className="px-4 py-3 text-right font-semibold tabular-nums">{formatPKR(Math.max(0, rule.unitPrice - rule.discountPerUnit))}</td><td className="px-4 py-3 text-right"><form action={deleteCustomerPriceRuleAction.bind(null, id, rule.id)}><Button type="submit" size="sm" variant="ghost" aria-label={`Delete ${rule.productName} tier`}><Trash2 className="h-4 w-4 text-red-600" /></Button></form></td></tr>)}
              {!rules.length && <tr><td colSpan={7} className="h-28 text-center text-neutral-500">No customer-specific price tiers yet. Standard product selling prices will be used.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
