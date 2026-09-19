"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requirePermission } from "@/lib/server/authorization";
import { db } from "@/lib/server/db";
import { getFbrCredentialReadiness } from "@/lib/server/fbr-credentials";

const schema = z.object({
  enabled: z.enum(["true", "false"]),
  environment: z.enum(["SANDBOX", "PRODUCTION"]),
  provider: z.string().trim().min(2).max(80),
  integratorName: z.string().trim().max(120).optional().default(""),
  defaultScenarioId: z.string().trim().max(40).optional().default(""),
});

export type FbrSettingsState = {
  status?: "success" | "error";
  message?: string;
};

export async function updateFbrSettingsAction(
  _previous: FbrSettingsState,
  formData: FormData,
): Promise<FbrSettingsState> {
  const context = await requirePermission("workspace.manage");
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { status: "error", message: parsed.error.issues[0]?.message ?? "Check the FBR settings." };
  }

  const enabled = parsed.data.enabled === "true";
  if (enabled && parsed.data.environment === "SANDBOX" && !parsed.data.defaultScenarioId) {
    return { status: "error", message: "Choose a sandbox scenario before enabling FBR Digital Invoicing." };
  }

  const credential = getFbrCredentialReadiness(context.workspaceId);
  if (enabled && !credential.configured) {
    return {
      status: "error",
      message: "Configure the FBR bearer credential securely before enabling Digital Invoicing.",
    };
  }

  await db.$transaction(async (tx) => {
    const config = await tx.fbrIntegrationConfig.upsert({
      where: { workspaceId: context.workspaceId },
      create: {
        workspaceId: context.workspaceId,
        enabled,
        environment: parsed.data.environment,
        provider: parsed.data.provider,
        integratorName: parsed.data.integratorName || null,
        defaultScenarioId: parsed.data.defaultScenarioId || null,
      },
      update: {
        enabled,
        environment: parsed.data.environment,
        provider: parsed.data.provider,
        integratorName: parsed.data.integratorName || null,
        defaultScenarioId: parsed.data.defaultScenarioId || null,
      },
    });

    await tx.auditLog.create({
      data: {
        workspaceId: context.workspaceId,
        actorId: context.user.id,
        action: "fbr.integration_config_updated",
        entityType: "FbrIntegrationConfig",
        entityId: config.id,
        metadata: {
          enabled,
          environment: parsed.data.environment,
          provider: parsed.data.provider,
          integratorName: parsed.data.integratorName || null,
          defaultScenarioId: parsed.data.defaultScenarioId || null,
          credentialConfigured: credential.configured,
          credentialSource: credential.configured ? credential.source : null,
        },
      },
    });
  });

  revalidatePath("/settings");
  return { status: "success", message: "FBR Digital Invoicing settings updated." };
}
