import "server-only";

import { IndustryDomainError } from "@/lib/server/industry-modules";
import { getWorkspaceAccess } from "@/lib/server/subscriptions";

// Server actions can be submitted from an already-open tab. Recheck access
// for each mutation; the dashboard's read-only notice is not an authorization gate.
export async function assertRestaurantMutationAccess(workspaceId: string) {
  const access = await getWorkspaceAccess(workspaceId);
  if (!access.allowed) {
    throw new IndustryDomainError("PERMISSION_DENIED", access.reason === "suspended"
      ? "This workspace is suspended. Contact MunshiOS support to restore access."
      : "Your MunshiOS trial or subscription has expired. Renew to continue making changes.");
  }
}
