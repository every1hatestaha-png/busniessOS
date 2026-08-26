import { requirePermission } from "@/lib/server/authorization";

export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  await requirePermission("workspace.manage");
  return children;
}
