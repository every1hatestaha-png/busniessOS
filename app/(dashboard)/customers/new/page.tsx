import Link from "next/link";
import { ChevronLeft } from "lucide-react";

import { CustomerForm } from "@/components/customers/customer-form";

export default function NewCustomerPage() {
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div><Link href="/customers" className="mb-3 inline-flex items-center gap-1 text-sm text-neutral-500 hover:text-neutral-900"><ChevronLeft className="h-4 w-4" />Customers</Link><h1 className="text-2xl font-bold tracking-tight md:text-3xl">Add customer</h1><p className="mt-1 text-sm text-neutral-500">Create a customer profile and opening credit position.</p></div>
      <CustomerForm />
    </div>
  );
}
