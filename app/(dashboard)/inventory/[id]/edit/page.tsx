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
    <main className="mx-auto max-w-4xl space-y-6">
      <div><Link href={`/inventory/${id}`} className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "-ml-2 mb-2")}><ArrowLeft className="h-3.5 w-3.5" />Product details</Link><h1 className="text-xl font-semibold tracking-tight">Edit product</h1><p className="mt-0.5 text-xs text-neutral-500">Update catalog details without changing stock on hand.</p></div>
      <ProductForm product={product} />
    </main>
  );
}
