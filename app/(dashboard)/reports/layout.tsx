import { requirePermission } from "@/lib/server/authorization";

export default async function ReportsLayout({ children }: { children: React.ReactNode }) {
  await requirePermission("financial.manage");
  return children;
}
