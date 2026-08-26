"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { FileText, Package, Receipt, Search, UserRound } from "lucide-react";
import { DEMO_CUSTOMERS, DEMO_INVOICES, DEMO_PRODUCTS, DEMO_SALES } from "@/lib/demo-data";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";

type SearchResult = {
  id: string;
  type: "Customer" | "Product" | "Order" | "Invoice";
  title: string;
  detail: string;
  href: string;
};

const results: SearchResult[] = [
  ...DEMO_CUSTOMERS.map((customer) => ({ id: customer.id, type: "Customer" as const, title: customer.companyName, detail: `${customer.name} · ${customer.phone}`, href: `/customers?customer=${customer.id}` })),
  ...DEMO_PRODUCTS.map((product) => ({ id: product.id, type: "Product" as const, title: product.name, detail: `${product.sku} · ${product.stockQuantity} in stock`, href: `/inventory?product=${product.id}` })),
  ...DEMO_SALES.map((sale) => ({ id: sale.id, type: "Order" as const, title: sale.orderNumber, detail: `${sale.customerName} · Rs ${sale.total.toLocaleString("en-PK")}`, href: `/sales?order=${sale.id}` })),
  ...DEMO_INVOICES.map((invoice) => ({ id: invoice.id, type: "Invoice" as const, title: invoice.invoiceNumber, detail: `${invoice.customerName} · Rs ${invoice.total.toLocaleString("en-PK")}`, href: `/invoices?invoice=${invoice.id}` })),
];

const icons = { Customer: UserRound, Product: Package, Order: Receipt, Invoice: FileText };

export function GlobalSearch({ className, autoFocus = false, onNavigate }: { className?: string; autoFocus?: boolean; onNavigate?: () => void }) {
  const router = useRouter();
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const matches = query.trim().length < 2
    ? []
    : results.filter((result) => `${result.title} ${result.detail} ${result.type}`.toLowerCase().includes(query.toLowerCase())).slice(0, 8);

  useEffect(() => {
    function close(event: MouseEvent) {
      if (!wrapperRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  function navigate(result: SearchResult) {
    setOpen(false);
    setQuery("");
    router.push(result.href);
    onNavigate?.();
  }

  return (
    <div ref={wrapperRef} className={cn("relative w-full", className)}>
      <Search className="pointer-events-none absolute left-3 top-1/2 z-10 size-4 -translate-y-1/2 text-neutral-400" />
      <Input
        type="search"
        value={query}
        autoFocus={autoFocus}
        onChange={(event) => { setQuery(event.target.value); setOpen(true); setActiveIndex(0); }}
        onFocus={() => setOpen(true)}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown") { event.preventDefault(); setActiveIndex((index) => Math.min(index + 1, matches.length - 1)); }
          if (event.key === "ArrowUp") { event.preventDefault(); setActiveIndex((index) => Math.max(index - 1, 0)); }
          if (event.key === "Enter" && matches[activeIndex]) { event.preventDefault(); navigate(matches[activeIndex]); }
          if (event.key === "Escape") setOpen(false);
        }}
        placeholder="Search customers, products, orders, invoices..."
        className="h-10 bg-neutral-50 pl-9 pr-3"
        aria-label="Global search"
        aria-expanded={open && query.length >= 2}
      />
      {open && query.trim().length >= 2 && (
        <div className="absolute left-0 right-0 top-[calc(100%+0.5rem)] z-50 max-h-[min(420px,60vh)] overflow-y-auto rounded-xl border bg-white p-1.5 shadow-xl shadow-neutral-900/10">
          {matches.length ? matches.map((result, index) => {
            const Icon = icons[result.type];
            return (
              <button
                key={`${result.type}-${result.id}`}
                type="button"
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => navigate(result)}
                className={cn("flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left", activeIndex === index ? "bg-neutral-100" : "hover:bg-neutral-50")}
              >
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg border bg-white text-neutral-500"><Icon className="size-4" /></span>
                <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium text-neutral-900">{result.title}</span><span className="block truncate text-xs text-neutral-500">{result.detail}</span></span>
                <span className="text-[10px] font-semibold uppercase tracking-wide text-neutral-400">{result.type}</span>
              </button>
            );
          }) : <p className="px-3 py-6 text-center text-sm text-neutral-500">No demo records found for “{query}”.</p>}
        </div>
      )}
    </div>
  );
}
