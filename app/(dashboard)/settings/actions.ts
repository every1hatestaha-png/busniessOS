"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requirePermission } from "@/lib/server/authorization";
import { db } from "@/lib/server/db";

const workspaceProfileSchema = z.object({
  name: z.string().trim().min(2, "Business name is required.").max(120),
  phone: z.string().trim().max(30).optional().default(""),
  email: z.string().trim().email("Enter a valid business email.").max(160).or(z.literal("")),
  address: z.string().trim().max(300).optional().default(""),
  city: z.string().trim().min(2, "City is required.").max(80),
  country: z.string().trim().min(2, "Country is required.").max(80),
  businessType: z.enum(["WHOLESALER", "DISTRIBUTOR", "MANUFACTURER", "RETAILER", "OTHER"]),
  ntn: z.string().trim().max(40).optional().default(""),
  strn: z.string().trim().max(40).optional().default(""),
  province: z.string().trim().max(80).optional().default(""),
});

export type WorkspaceProfileState = { status?: "success" | "error"; message?: string };

export async function updateWorkspaceProfileAction(
  _previousState: WorkspaceProfileState,
  formData: FormData,
): Promise<WorkspaceProfileState> {
  const context = await requirePermission("workspace.manage");
  const parsed = workspaceProfileSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { status: "error", message: parsed.error.issues[0]?.message ?? "Check the business details and try again." };
  }

  await db.workspace.update({
    where: { id: context.workspaceId },
    data: {
      name: parsed.data.name,
      phone: parsed.data.phone || null,
      email: parsed.data.email || null,
      address: parsed.data.address || null,
      city: parsed.data.city,
      country: parsed.data.country,
      businessType: parsed.data.businessType,
      ntn: parsed.data.ntn || null,
      strn: parsed.data.strn || null,
      province: parsed.data.province || null,
    },
  });

  await db.auditLog.create({
    data: {
      workspaceId: context.workspaceId,
      actorId: context.user.id,
      action: "workspace.profile_updated",
      entityType: "Workspace",
      entityId: context.workspaceId,
      metadata: {
        name: parsed.data.name,
        city: parsed.data.city,
        country: parsed.data.country,
        businessType: parsed.data.businessType,
        ntn: parsed.data.ntn || null,
        strn: parsed.data.strn || null,
        province: parsed.data.province || null,
      },
    },
  });

  revalidatePath("/settings");
  revalidatePath("/dashboard");
  return { status: "success", message: "Business profile updated." };
}


const fbrSandboxConfigSchema = z.object({
  defaultScenarioId: z.string().trim().toUpperCase().max(12).refine(
    (value) => value === "" || /^SN\d{3}$/.test(value),
    "Use an FBR sandbox scenario such as SN001.",
  ),
});

export type FbrSandboxConfigState = { status?: "success" | "error"; message?: string };

export async function updateFbrSandboxConfigAction(
  _previousState: FbrSandboxConfigState,
  formData: FormData,
): Promise<FbrSandboxConfigState> {
  const context = await requirePermission("workspace.manage");
  const existing = await db.fbrIntegrationConfig.findUnique({
    where: { workspaceId: context.workspaceId },
    select: { environment: true },
  });
  if (existing?.environment === "PRODUCTION") {
    return {
      status: "error",
      message: "Production FBR configuration cannot be changed from the sandbox settings form.",
    };
  }

  const parsed = fbrSandboxConfigSchema.safeParse({
    defaultScenarioId: String(formData.get("defaultScenarioId") ?? ""),
  });
  if (!parsed.success) {
    return { status: "error", message: parsed.error.issues[0]?.message ?? "Check the FBR sandbox setup." };
  }

  const enabled = formData.get("enabled") === "on";
  if (enabled && !parsed.data.defaultScenarioId) {
    return { status: "error", message: "Choose an FBR sandbox scenario before enabling Digital Invoicing." };
  }

  let config;
  if (existing) {
    const updated = await db.fbrIntegrationConfig.updateMany({
      where: { workspaceId: context.workspaceId, environment: "SANDBOX" },
      data: {
        enabled,
        defaultScenarioId: parsed.data.defaultScenarioId || null,
      },
    });
    if (updated.count !== 1) {
      return {
        status: "error",
        message: "FBR configuration changed while you were editing. Refresh settings before trying again.",
      };
    }
    config = await db.fbrIntegrationConfig.findUniqueOrThrow({
      where: { workspaceId: context.workspaceId },
    });
  } else {
    try {
      config = await db.fbrIntegrationConfig.create({
        data: {
          workspaceId: context.workspaceId,
          enabled,
          environment: "SANDBOX",
          provider: "PRAL",
          defaultScenarioId: parsed.data.defaultScenarioId || null,
        },
      });
    } catch {
      return {
        status: "error",
        message: "FBR configuration changed while you were editing. Refresh settings before trying again.",
      };
    }
  }

  await db.auditLog.create({
    data: {
      workspaceId: context.workspaceId,
      actorId: context.user.id,
      action: "fbr.sandbox_config_updated",
      entityType: "FbrIntegrationConfig",
      entityId: config.id,
      metadata: {
        enabled,
        environment: "SANDBOX",
        defaultScenarioId: parsed.data.defaultScenarioId || null,
      },
    },
  });

  revalidatePath("/settings");
  revalidatePath("/invoices");
  return {
    status: "success",
    message: enabled ? "FBR sandbox setup saved." : "FBR Digital Invoicing disabled for this workspace.",
  };
}
