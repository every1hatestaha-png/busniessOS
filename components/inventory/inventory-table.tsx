"use client";

import Link from "next/link";
import { useDeferredValue, useState } from "react";
import { ArrowUpRight, PackagePlus, Search } from "lucide-react";
import { StatusBadge } from "@/components/business/status-badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { ProductDTO } from "@/lib/server/products";
import { cn, formatPKR, getStockStatus } from "@/lib/utils";

export function InventoryTable({ products, canCreate = false }: { products: ProductDTO[]; canCreate?: boolean }) {
  const [query, setQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("ALL");
  const deferredQuery = useDeferredValue(query.trim().toLowerCase());
  const categories = Array.from(new Set(products.map((product) => product.category)));
  const visibleProducts = products.filter((product) => {
    const matchesQuery = `${product.name} ${product.sku} ${product.category}`.toLowerCase().includes(deferredQuery);
    return matchesQuery && (categoryFilter === "ALL" || product.category === categoryFilter);
  });

  if (products.length === 0) {
    return (
      <Card className="items-center py-10 text-center shadow-none">
        <CardContent className="flex max-w-md flex-col items-center">
          <span className="mb-4 flex size-12 items-center justify-center rounded-xl bg-neutral-100 text-neutral-600"><PackagePlus className="size-5" /></span>
          <h2 className="font-semibold">Add your first product</h2>
          <p className="mt-1 text-sm text-neutral-500">Create a product to start tracking stock levels and movements.</p>
          {canCreate && <Link href="/inventory/new" className={cn(buttonVariants(), "mt-5")}>New product</Link>}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="gap-0 py-0 shadow-none">
        <CardHeader className="gap-3 border-b px-4 py-3 md:flex md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="font-semibold">Product catalog</h2>
          <p className="text-xs text-neutral-500">{visibleProducts.length} of {products.length} products</p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <label className="relative min-w-0 sm:w-72">
            <Search className="pointer-events-none absolute left-2.5 top-2 h-4 w-4 text-neutral-400" />
            <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search product, SKU, category..." className="pl-8" />
            <span className="sr-only">Search inventory</span>
          </label>
          <select
            aria-label="Filter by category"
            value={categoryFilter}
            onChange={(event) => setCategoryFilter(event.target.value)}
            className="h-8 rounded-lg border border-input bg-background px-2.5 text-sm outline-none focus:border-ring focus:ring-3 focus:ring-ring/50"
          >
            <option value="ALL">All categories</option>
            {categories.map((category) => <option key={category}>{category}</option>)}
          </select>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto"><Table className="min-w-[860px]">
          <TableHeader className="bg-neutral-50/80">
            <TableRow>
              <TableHead className="pl-4">Product</TableHead>
              <TableHead>Category</TableHead>
              <TableHead className="text-right">Stock</TableHead>
              <TableHead className="text-right">Cost</TableHead>
              <TableHead className="text-right">Selling</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-12"><span className="sr-only">Open</span></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visibleProducts.map((product) => {
              const stockStatus = getStockStatus(product.stockQuantity, product.reorderLevel);
              return (
                <TableRow key={product.id}>
                  <TableCell className="pl-4">
                    <Link href={`/inventory/${product.id}`} className="font-medium text-neutral-950 hover:underline">{product.name}</Link>
                    <p className="mt-0.5 font-mono text-xs text-neutral-500">{product.sku}</p>
                  </TableCell>
                   <TableCell className="text-neutral-600">{product.category}</TableCell>
                  <TableCell className="text-right">
                    <span className="font-semibold tabular-nums">{product.stockQuantity}</span>
                    <span className="ml-1 text-xs text-neutral-500">{product.unit.toLowerCase()}</span>
                   </TableCell>
                   <TableCell className="text-right tabular-nums text-neutral-600">{formatPKR(product.costPrice)}</TableCell>
                   <TableCell className="text-right font-medium tabular-nums">{formatPKR(product.sellingPrice)}</TableCell>
                   <TableCell><div className="flex flex-wrap gap-1"><StatusBadge status={product.status} /><StatusBadge status={stockStatus} /></div></TableCell>
                  <TableCell className="pr-3 text-right">
                    <Link href={`/inventory/${product.id}`} aria-label={`View ${product.name}`} className={cn(buttonVariants({ variant: "ghost", size: "icon-sm" }), "inline-flex")}><ArrowUpRight className="h-4 w-4" /></Link>
                  </TableCell>
                </TableRow>
              );
            })}
            {visibleProducts.length === 0 && (
              <TableRow><TableCell colSpan={7} className="h-28 text-center text-neutral-500">No products match the current filters.</TableCell></TableRow>
            )}
          </TableBody>
        </Table></div>
      </CardContent>
    </Card>
  );
}
