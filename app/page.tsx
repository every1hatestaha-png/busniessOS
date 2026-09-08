import { redirect } from "next/navigation";

import { getCurrentWorkspace } from "@/lib/server/auth";

export default async function Home() {
  console.info("[D4][root] root page entered");
  console.info("[D4][root] before workspace lookup");
  const context = await getCurrentWorkspace();
  console.info(`[D4][root] after workspace lookup found=${context ? "YES" : "NO"}`);
  const destination = context ? "/dashboard" : "/onboarding";
  console.info(`[D4][root] redirecting to ${destination}`);
  redirect(destination);
}
