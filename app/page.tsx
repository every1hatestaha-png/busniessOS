import { redirect } from "next/navigation";

import { getCurrentWorkspace } from "@/lib/server/auth";

export default async function Home() {
  const context = await getCurrentWorkspace();
  redirect(context ? "/dashboard" : "/onboarding");
}
