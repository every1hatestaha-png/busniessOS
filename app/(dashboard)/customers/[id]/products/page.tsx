import Link from "next/link";
import { ChevronLeft, Pencil, Trash2 } from "lucide-react";
import { notFound } from "next/navigation";

import { deleteCustomerSalesBomAction } from "@/app/(dashboard)/customers/[id]/products/actions";
import { CustomerSalesBomForm } from "@/components/customers/customer-sales-bom-form";
import { Button } from "@/components/ui/button";
import { requirePermission } from "@/lib/server/authorization";
import { listCustomerSalesBoms } from "@/lib/server/customer-sales-bom";
import { db } from "@/lib/server/db";

type Query = Promise<Record<string, string | string[] | undefined>>;

export default async function CustomerProductsPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Query }) {
  const { id } = await params;
  const context = await requirePermission("customers.write");
  const query = await searchParams;
  const [customer, products, configurations] = await Promise.all([
    db.customer.findFirst({ where: { id, workspaceId: context.workspaceId }, select: { id: true, name: true, companyName: true } }),
    db.product.findMany({
      where: { workspaceId: context.workspaceId, status: "ACTIVE" },
      orderBy: [{ name: "asc" }, { id: "asc" }],
      select: { id: true, name: true, sku: true, unit: true },
    }),
    listCustomerSalesBoms(context.workspaceId, id),
  ]);
  if (!customer) notFound();

  const selectedProductId = typeof query.productId === "string" ? query.productId : "";
  const selected = configurations.find((configuration) => configuration.productId === selectedProductId) ?? null;

  return (
    <div className="mx-auto max-w-[1100px] space-y-6">
      <header>
        <Link href={`/customers/${id}/edit`} className="mb-2 inline-flex items-center gap-1 text-xs text-neutral-500 hover:text-neutral-900"><ChevronLeft className="h-3.5 w-3.5" />Edit customer</Link>
        <h1 className="text-2xl font-semibold tracking-tight">Customer products & components</h1>
        <p className="mt-1 text-sm text-neutral-500">{customer.companyName ?? customer.name}. Configure the accessories that must leave inventory automatically when each product is sold.</p>
      </header>

      {typeof query.success === "string" && <div className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">{query.success}</div>}
      {typeof query.error === "string" && <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">{query.error}</div>}

      <section className="rounded-xl border bg-white p-5 shadow-sm">
        <div className="mb-4">
          <h2 className="font-semibold">{selected ? `Edit ${selected.productName}` : "Add a customer product"}</h2>
          <p className="mt-1 text-xs text-neutral-500">When this customer buys the selected product, MunshiOS will consume these components in the background. The printed invoice keeps only the main sale product.</p>
        </div>
        <CustomerSalesBomForm
          key={selected?.id ?? "new"}
          customerId={id}
          products={products}
          initialConfig={selected ? {
            productId: selected.productId,
            productCode: selected.productCode,
            components: selected.components.map((component) => ({ componentProductId: component.componentProductId, quantityPerUnit: component.quantityPerUnit })),
          } : null}
        />
      </section>

      <section className="overflow-hidden rounded-xl border bg-white shadow-sm">
        <div className="border-b px-5 py-4">
          <h2 className="font-semibold">Configured customer products</h2>
          <p className="mt-0.5 text-xs text-neutral-500">{configurations.length} product configuration{configurations.length === 1 ? "" : "s"}. Component quantities are per one sold unit.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="bg-neutral-50 text-left text-xs text-neutral-500"><tr><th className="px-4 py-3">Product</th><th className="px-4 py-3">Code</th><th className="px-4 py-3">Components</th><th className="px-4 py-3 text-right">Actions</th></tr></thead>
            <tbody>
              {configurations.map((configuration) => (
                <tr key={configuration.id} className="border-t align-top">
                  <td className="px-4 py-3"><p className="font-medium">{configuration.productName}</p><p className="text-[11px] text-neutral-500">{configuration.productSku || "No SKU"}</p></td>
                  <td className="px-4 py-3 font-mono text-xs">{configuration.productCode}</td>
                  <td className="px-4 py-3"><div className="flex max-w-xl flex-wrap gap-1.5">{configuration.components.map((component) => <span key={component.componentProductId} className="rounded-full border bg-neutral-50 px-2 py-1 text-xs">{component.componentName} × {component.quantityPerUnit}</span>)}</div></td>
                  <td className="px-4 py-3"><div className="flex justify-end gap-1"><Button asChild size="sm" variant="ghost"><Link href={`/customers/${id}/products?productId=${configuration.productId}`}><Pencil className="mr-1 h-4 w-4" />Edit</Link></Button><form action={deleteCustomerSalesBomAction.bind(null, id, configuration.id)}><Button type="submit" size="sm" variant="ghost" aria-label={`Archive ${configuration.productName} components`}><Trash2 className="h-4 w-4 text-red-600" /></Button></form></div></td>
                </tr>
              ))}
              {!configurations.length && <tr><td colSpan={4} className="h-28 text-center text-neutral-500">No customer-specific component rules yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
