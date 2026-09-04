"use client";

import Link from "next/link";
import { Search, SlidersHorizontal } from "lucide-react";
import { useDeferredValue, useState } from "react";

import { StatusBadge } from "@/components/business/status-badge";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { CustomerListItem } from "@/lib/server/customers";
import { formatPKR, getCreditStatus } from "@/lib/utils";

const selectClassName = "h-8 rounded-lg border border-neutral-200 bg-white px-3 text-sm outline-none focus:border-neutral-400 focus:ring-2 focus:ring-neutral-200";

export function CustomerTable({ customers }: { customers: CustomerListItem[] }) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("ALL");
  const [city, setCity] = useState("ALL");
  const deferredQuery = useDeferredValue(query.trim().toLowerCase());
  const cities = [...new Set(customers.map((customer) => customer.city))].sort();
  const filtered = customers.filter((customer) => {
    const searchable = [customer.name, customer.companyName, customer.phone, customer.email, customer.city].join(" ").toLowerCase();
    return searchable.includes(deferredQuery) && (status === "ALL" || customer.status === status) && (city === "ALL" || customer.city === city);
  });

  return (
    <div>
      <div className="flex flex-col gap-3 p-4 lg:flex-row lg:items-center">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
          <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search name, company, phone, email, or city" className="pl-9" aria-label="Search customers" />
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <span className="hidden items-center text-neutral-400 lg:flex"><SlidersHorizontal className="h-4 w-4" /></span>
          <select className={selectClassName} value={status} onChange={(event) => setStatus(event.target.value)} aria-label="Filter by status">
            <option value="ALL">All statuses</option>
            <option value="ACTIVE">Active</option>
            <option value="INACTIVE">Inactive</option>
            <option value="BLACKLISTED">Blacklisted</option>
          </select>
          <select className={selectClassName} value={city} onChange={(event) => setCity(event.target.value)} aria-label="Filter by city">
            <option value="ALL">All cities</option>
            {cities.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
        </div>
      </div>
      <div className="border-t border-neutral-200">
        <Table className="min-w-[860px]">
          <TableHeader><TableRow><TableHead>Customer</TableHead><TableHead>Contact</TableHead><TableHead>City</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Balance</TableHead><TableHead className="text-right">Credit limit</TableHead></TableRow></TableHeader>
          <TableBody>
            {filtered.map((customer) => (
              <TableRow key={customer.id}>
                <TableCell><Link href={`/customers/${customer.id}`} className="font-medium text-neutral-950 hover:underline">{customer.companyName}</Link><p className="text-xs text-neutral-500">{customer.name}</p></TableCell>
                <TableCell><p>{customer.phone}</p><p className="text-xs text-neutral-500">{customer.email}</p></TableCell>
                <TableCell>{customer.city}</TableCell>
                <TableCell><StatusBadge status={customer.status} /></TableCell>
                <TableCell className="text-right"><p className="font-medium">{formatPKR(customer.currentBalance)}</p><StatusBadge status={getCreditStatus(customer.currentBalance, customer.creditLimit)} /></TableCell>
                <TableCell className="text-right">{customer.creditLimit > 0 ? formatPKR(customer.creditLimit) : "Not configured"}</TableCell>
              </TableRow>
            ))}
            {filtered.length === 0 && <TableRow><TableCell colSpan={6} className="h-28 text-center text-neutral-500">No customers match these filters.</TableCell></TableRow>}
          </TableBody>
        </Table>
      </div>
      <p className="border-t border-neutral-200 px-4 py-3 text-xs text-neutral-500">Showing {filtered.length} of {customers.length} customers</p>
    </div>
  );
}
