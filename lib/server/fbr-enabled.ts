import "server-only";
import { db } from "@/lib/server/db";
import { assertFbrExpectedEnvironment } from "@/lib/fbr/digital-invoicing";

/** Missing configuration is disabled. Check before claims, audits or remote I/O. */
export async function assertFbrEnabled(workspaceId: string) {
  const config = await db.fbrIntegrationConfig.findUnique({
    where: { workspaceId }, select: { enabled: true, environment: true },
  });
  if (config?.enabled !== true) throw new Error("FBR integration is disabled for this workspace.");
  assertFbrExpectedEnvironment(config.environment);
  return config;
}
