import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ProductForm } from "@/components/inventory/product-form";
import { buttonVariants } from "@/components/ui/button";
import { getProduct } from "@/lib/server/products";
import { requirePermission } from "@/lib/server/authorization";
import { cn } from "@/lib/utils";

export default async function EditProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requirePermission("products.write");
  const product = await getProduct(id);
  if (!product) notFound();

  return (
    <main className="mx-auto max-w-4xl space-y-6 p-4 md:p-6 lg:p-8">
      <div><Link href={`/inventory/${id}`} className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "-ml-2 mb-3")}><ArrowLeft className="h-4 w-4" />Product details</Link><h1 className="text-2xl font-bold tracking-tight md:text-3xl">Edit product</h1><p className="mt-1 text-sm text-neutral-500">Update catalog details without changing stock on hand.</p></div>
      <ProductForm product={product} />
    </main>
  );
}
