import "server-only";
import { db } from "@/lib/server/db";

/** Missing configuration is disabled. Check before claims, audits or remote I/O. */
export async function assertFbrEnabled(workspaceId: string) {
  const config = await db.fbrIntegrationConfig.findUnique({
    where: { workspaceId }, select: { enabled: true },
  });
  if (config?.enabled !== true) throw new Error("FBR integration is disabled for this workspace.");
}
