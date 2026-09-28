import { notFound } from "next/navigation";
import { canPerformAction } from "@/lib/server/authorization";
import { requireWorkspace } from "@/lib/server/auth";

export default async function PurchasesLayout({ children }: { children: React.ReactNode }) {
  const { role } = await requireWorkspace();
  if (!canPerformAction(role, "purchases.create")) notFound();
  return children;
}
