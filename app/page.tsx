import { redirect } from "next/navigation";

import { getCurrentWorkspace } from "@/lib/server/auth";

export default async function Home() {
  const context = await getCurrentWorkspace();
  const destination = context ? "/dashboard" : "/onboarding";
  redirect(destination);
}
