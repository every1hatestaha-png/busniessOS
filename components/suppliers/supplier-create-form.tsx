"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function SupplierCreateForm() {
  const router = useRouter(); const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); setBusy(true); setError(""); const form = new FormData(event.currentTarget); const response = await fetch("/api/v1/suppliers", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(Object.fromEntries(form)) }); const body = await response.json(); if (!response.ok) setError(body.error?.message ?? "Could not create supplier."); else { event.currentTarget.reset(); router.refresh(); } setBusy(false); }
  return <form onSubmit={submit} className="grid gap-3 border p-4 sm:grid-cols-2 lg:grid-cols-4"><Input required name="name" placeholder="Contact name" /><Input name="companyName" placeholder="Company" /><Input name="phone" placeholder="Phone" /><Input name="city" placeholder="City" /><div className="flex items-center gap-3 sm:col-span-2 lg:col-span-4"><Button disabled={busy} type="submit">{busy ? "Adding..." : "Add supplier"}</Button>{error && <p className="text-sm text-red-700">{error}</p>}</div></form>;
}
