import { requirePermission } from "@/lib/server/authorization";

export default async function AccountingLayout({ children }: { children: React.ReactNode }) {
  await requirePermission("financial.manage");
  return children;
}
