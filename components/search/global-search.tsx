"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { FileText, Loader2, Package, Receipt, Search, UserRound } from "lucide-react";
import type { SearchResult } from "@/lib/search";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";

const icons = { Customer: UserRound, Product: Package, Order: Receipt, Invoice: FileText };

export function GlobalSearch({ className, autoFocus = false, onNavigate }: { className?: string; autoFocus?: boolean; onNavigate?: () => void }) {
  const router = useRouter();
  const wrapperRef = useRef<HTMLDivElement>(null);
  const requestRef = useRef<AbortController | null>(null);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [matches, setMatches] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    function close(event: MouseEvent) {
      if (!wrapperRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  useEffect(() => {
    const term = query.trim();
    if (term.length < 2) return;
    const timer = window.setTimeout(async () => {
      requestRef.current?.abort();
      const controller = new AbortController();
      requestRef.current = controller;
      setLoading(true);
      try {
        const response = await fetch(`/api/search?q=${encodeURIComponent(term)}`, { signal: controller.signal, cache: "no-store" });
        if (!response.ok) throw new Error("Search failed");
        const data = await response.json() as { results?: SearchResult[] };
        setMatches(data.results ?? []);
        setActiveIndex(0);
      } catch (error) {
        if (!(error instanceof DOMException && error.name === "AbortError")) setMatches([]);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 180);
    return () => window.clearTimeout(timer);
  }, [query]);

  function navigate(result: SearchResult) {
    requestRef.current?.abort();
    setOpen(false);
    setQuery("");
    setMatches([]);
    router.push(result.href);
    onNavigate?.();
  }

  return (
    <div ref={wrapperRef} className={cn("relative w-full", className)}>
      {loading ? <Loader2 className="pointer-events-none absolute left-2.5 top-1/2 z-10 size-3.5 -translate-y-1/2 animate-spin text-slate-400" /> : <Search className="pointer-events-none absolute left-2.5 top-1/2 z-10 size-3.5 -translate-y-1/2 text-slate-400" />}
      <Input
        type="search"
        value={query}
        autoFocus={autoFocus}
        onChange={(event) => {
          const value = event.target.value;
          setQuery(value);
          setOpen(true);
          setActiveIndex(0);
          if (value.trim().length < 2) {
            requestRef.current?.abort();
            setMatches([]);
            setLoading(false);
          }
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown") { event.preventDefault(); setActiveIndex((index) => Math.min(index + 1, Math.max(0, matches.length - 1))); }
          if (event.key === "ArrowUp") { event.preventDefault(); setActiveIndex((index) => Math.max(index - 1, 0)); }
          if (event.key === "Enter" && matches[activeIndex]) { event.preventDefault(); navigate(matches[activeIndex]); }
          if (event.key === "Escape") setOpen(false);
        }}
        placeholder="Search customers, products, orders, invoices..."
        className="h-8 rounded-md border-slate-200 bg-slate-50/80 pl-8 pr-3 text-xs shadow-none focus-visible:bg-white"
        aria-label="Global search"
        aria-expanded={open && query.trim().length >= 2}
      />
      {open && query.trim().length >= 2 && (
        <div className="absolute left-0 right-0 top-[calc(100%+0.375rem)] z-50 max-h-[min(420px,60vh)] overflow-y-auto rounded-md border bg-white p-1 shadow-sm">
          {loading && matches.length === 0 ? <p className="px-3 py-5 text-center text-sm text-neutral-500">Searching…</p> : matches.length ? matches.map((result, index) => {
            const Icon = icons[result.type];
            return <button key={`${result.type}-${result.id}`} type="button" onMouseEnter={() => setActiveIndex(index)} onClick={() => navigate(result)} className={cn("flex min-h-10 w-full items-center gap-2.5 rounded px-2 py-1.5 text-left", activeIndex === index ? "bg-slate-100" : "hover:bg-slate-50")}><span className="flex size-7 shrink-0 items-center justify-center rounded border bg-white text-slate-500"><Icon className="size-3.5" /></span><span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium text-neutral-900">{result.title}</span><span className="block truncate text-xs text-neutral-500">{result.detail}</span></span><span className="text-[10px] font-semibold uppercase tracking-wide text-neutral-400">{result.type}</span></button>;
          }) : <p className="px-3 py-6 text-center text-sm text-neutral-500">No records found for “{query}”.</p>}
        </div>
      )}
    </div>
  );
}
