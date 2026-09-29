import { requireVerticalRoute } from "@/lib/server/vertical-access";

export default async function RestaurantLayout({ children }: { children: React.ReactNode }) {
  await requireVerticalRoute("/restaurant");
  return children;
}
