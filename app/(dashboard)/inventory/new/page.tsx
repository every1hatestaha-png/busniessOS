import { ProductForm } from "@/components/inventory/product-form";
import { requirePermission } from "@/lib/server/authorization";
import { PageHeader } from "@/components/business/page-header";

export default async function NewProductPage() {
  await requirePermission("products.write");
  return (
    <main className="mx-auto max-w-4xl space-y-6">
      <PageHeader title="New product" description="Add a product to your inventory catalog." />
      <ProductForm />
    </main>
  );
}
