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


const fbrHsUomAnnexureSchema = z.object({
  annexureId: z.coerce.number().int().positive().max(1_000_000),
  reference: z.string().trim().min(3, "Record the FBR/PRAL/integrator confirmation reference.").max(160),
  confirmed: z.literal("yes"),
});

export type FbrHsUomAnnexureState = { status?: "success" | "error"; message?: string };

export async function confirmFbrHsUomAnnexureAction(
  _previousState: FbrHsUomAnnexureState,
  formData: FormData,
): Promise<FbrHsUomAnnexureState> {
  const context = await requirePermission("workspace.manage");
  const parsed = fbrHsUomAnnexureSchema.safeParse({
    annexureId: formData.get("annexureId"),
    reference: String(formData.get("reference") ?? ""),
    confirmed: formData.get("confirmed"),
  });
  if (!parsed.success) {
    return {
      status: "error",
      message: parsed.error.issues[0]?.message ?? "Check the HS/UOM annexure confirmation.",
    };
  }

  try {
    await db.$transaction(async (tx) => {
      const existing = await tx.fbrIntegrationConfig.findUnique({
        where: { workspaceId: context.workspaceId },
        select: { id: true, updatedAt: true, hsUomAnnexureId: true },
      });
      const confirmedAt = new Date();

      let config;
      if (existing) {
        const updated = await tx.fbrIntegrationConfig.updateMany({
          where: {
            id: existing.id,
            workspaceId: context.workspaceId,
            updatedAt: existing.updatedAt,
          },
          data: {
            hsUomAnnexureId: parsed.data.annexureId,
            hsUomAnnexureConfirmedAt: confirmedAt,
            hsUomAnnexureConfirmedBy: context.user.id,
            hsUomAnnexureReference: parsed.data.reference,
          },
        });
        if (updated.count !== 1) {
          throw new Error("FBR configuration changed while you were confirming the annexure.");
        }
        config = await tx.fbrIntegrationConfig.findUniqueOrThrow({
          where: { workspaceId: context.workspaceId },
        });
      } else {
        config = await tx.fbrIntegrationConfig.create({
          data: {
            workspaceId: context.workspaceId,
            enabled: false,
            environment: "SANDBOX",
            provider: "PRAL",
            hsUomAnnexureId: parsed.data.annexureId,
            hsUomAnnexureConfirmedAt: confirmedAt,
            hsUomAnnexureConfirmedBy: context.user.id,
            hsUomAnnexureReference: parsed.data.reference,
          },
        });
      }

      await tx.product.updateMany({
        where: { workspaceId: context.workspaceId },
        data: {
          fbrHsUomVerifiedAt: null,
          fbrHsUomAnnexureId: null,
        },
      });

      await tx.auditLog.create({
        data: {
          workspaceId: context.workspaceId,
          actorId: context.user.id,
          action: "fbr.hs_uom_annexure_confirmed",
          entityType: "FbrIntegrationConfig",
          entityId: config.id,
          metadata: {
            annexureId: parsed.data.annexureId,
            reference: parsed.data.reference,
            previousAnnexureId: existing?.hsUomAnnexureId ?? null,
            productHsUomVerificationInvalidated: true,
          },
        },
      });
    });
  } catch (error) {
    return {
      status: "error",
      message: error instanceof Error
        ? error.message
        : "The FBR HS/UOM annexure confirmation could not be saved.",
    };
  }

  revalidatePath("/settings");
  revalidatePath("/inventory");
  revalidatePath("/invoices");
  return {
    status: "success",
    message: "HS/UOM annexure confirmation saved. Product compatibility checks must now be re-verified.",
  };
}


const fbrProductionRouteSchema = z.object({
  provider: z.enum(["PRAL", "LICENSED_INTEGRATOR"]),
  integratorName: z.string().trim().min(2, "Enter the PRAL or licensed integrator name.").max(120),
  integratorLicenseNo: z.string().trim().max(120).optional().default(""),
  softwareRegistrationNo: z.string().trim().min(2, "Enter the FBR-verifiable software registration number.").max(120),
  reference: z.string().trim().min(3, "Record the FBR, PRAL, or licensed-integrator onboarding or approval reference.").max(200),
  confirmed: z.literal("yes"),
}).superRefine((value, ctx) => {
  if (value.provider !== "PRAL" && !value.integratorLicenseNo) {
    ctx.addIssue({
      code: "custom",
      path: ["integratorLicenseNo"],
      message: "Record the licensed integrator reference before confirming production setup.",
    });
  }
});

export type FbrProductionRouteState = { status?: "success" | "error"; message?: string };

export async function confirmFbrProductionRouteAction(
  _previousState: FbrProductionRouteState,
  formData: FormData,
): Promise<FbrProductionRouteState> {
  const context = await requirePermission("workspace.manage");
  if (context.role !== "OWNER") {
    return {
      status: "error",
      message: "Only the workspace owner can confirm the FBR production integration route.",
    };
  }

  const parsed = fbrProductionRouteSchema.safeParse({
    provider: String(formData.get("provider") ?? ""),
    integratorName: String(formData.get("integratorName") ?? ""),
    integratorLicenseNo: String(formData.get("integratorLicenseNo") ?? ""),
    softwareRegistrationNo: String(formData.get("softwareRegistrationNo") ?? ""),
    reference: String(formData.get("reference") ?? ""),
    confirmed: formData.get("confirmed"),
  });
  if (!parsed.success) {
    return {
      status: "error",
      message: parsed.error.issues[0]?.message ?? "Check the FBR production integration evidence.",
    };
  }

  try {
    await db.$transaction(async (tx) => {
      const existing = await tx.fbrIntegrationConfig.findUnique({
        where: { workspaceId: context.workspaceId },
        select: { id: true, updatedAt: true },
      });
      const confirmedAt = new Date();

      let config;
      if (existing) {
        const updated = await tx.fbrIntegrationConfig.updateMany({
          where: {
            id: existing.id,
            workspaceId: context.workspaceId,
            updatedAt: existing.updatedAt,
          },
          data: {
            provider: parsed.data.provider,
            integratorName: parsed.data.integratorName,
            integratorLicenseNo: parsed.data.integratorLicenseNo || null,
            softwareRegistrationNo: parsed.data.softwareRegistrationNo,
            productionApprovedAt: confirmedAt,
            productionApprovedBy: context.user.id,
            productionApprovalReference: parsed.data.reference,
          },
        });
        if (updated.count !== 1) {
          throw new Error("FBR configuration changed while you were confirming the production route.");
        }
        config = await tx.fbrIntegrationConfig.findUniqueOrThrow({
          where: { workspaceId: context.workspaceId },
        });
      } else {
        config = await tx.fbrIntegrationConfig.create({
          data: {
            workspaceId: context.workspaceId,
            enabled: false,
            environment: "SANDBOX",
            provider: parsed.data.provider,
            integratorName: parsed.data.integratorName,
            integratorLicenseNo: parsed.data.integratorLicenseNo || null,
            softwareRegistrationNo: parsed.data.softwareRegistrationNo,
            productionApprovedAt: confirmedAt,
            productionApprovedBy: context.user.id,
            productionApprovalReference: parsed.data.reference,
          },
        });
      }

      await tx.fbrInvoiceSubmission.updateMany({
        where: {
          workspaceId: context.workspaceId,
          environment: "PRODUCTION",
          status: { not: "SUBMITTED" },
        },
        data: {
          status: "BLOCKED",
          lastErrorCode: "PRODUCTION_CONFIGURATION_CHANGED",
          lastErrorMessage: "Production integration evidence changed. Prepare and validate a fresh FBR submission before any production POST.",
          validatedAt: null,
        },
      });

      await tx.auditLog.create({
        data: {
          workspaceId: context.workspaceId,
          actorId: context.user.id,
          action: "fbr.production_route_confirmed",
          entityType: "FbrIntegrationConfig",
          entityId: config.id,
          metadata: {
            provider: parsed.data.provider,
            integratorName: parsed.data.integratorName,
            integratorLicenseNo: parsed.data.integratorLicenseNo || null,
            softwareRegistrationNo: parsed.data.softwareRegistrationNo,
            productionApprovalReference: parsed.data.reference,
            productionTransmissionEnabled: false,
          },
        },
      });
    });
  } catch (error) {
    return {
      status: "error",
      message: error instanceof Error
        ? error.message
        : "The FBR production integration evidence could not be saved.",
    };
  }

  revalidatePath("/settings");
  revalidatePath("/invoices");
  return {
    status: "success",
    message: "Production integration evidence saved. Live FBR transmission remains locked by the deployment-level safety switch.",
  };
}
