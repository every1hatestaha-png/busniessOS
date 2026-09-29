import { requireVerticalRoute } from "@/lib/server/vertical-access";

export default async function ServicesLayout({ children }: { children: React.ReactNode }) {
  await requireVerticalRoute("/services");
  return children;
}
