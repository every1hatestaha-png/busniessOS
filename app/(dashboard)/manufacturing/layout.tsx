import { requireVerticalRoute } from "@/lib/server/vertical-access";

export default async function ManufacturingLayout({ children }: { children: React.ReactNode }) {
  await requireVerticalRoute("/manufacturing");
  return children;
}
