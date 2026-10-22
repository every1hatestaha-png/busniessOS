"use server";

import { revalidatePath } from "next/cache";

import {
  activateWorkspaceSubscription,
  extendWorkspaceTrial,
  grantWorkspaceGrace,
  suspendWorkspaceSubscription,
} from "@/lib/server/subscriptions";
import { deleteCustomerWorkspaceAccount, getWorkspaceDeletionPreview } from "@/lib/server/platform-admin";
import { assertPlatformMfaEnabled } from "@/lib/server/platform-security";

const ALLOWED_PLANS = new Set(["starter", "business", "pro"]);

function readWorkspaceId(formData: FormData) {
  const value = formData.get("workspaceId");
  if (typeof value !== "string") throw new Error("Workspace is required.");
  const workspaceId = value.trim();
  if (!workspaceId || workspaceId.length > 128) throw new Error("Invalid workspace.");
  return workspaceId;
}

function readDays(formData: FormData, fallback: number, max: number) {
  const raw = formData.get("days");
  if (raw == null || raw === "") return fallback;
  const days = Number(raw);
  if (!Number.isInteger(days) || days < 1 || days > max) {
    throw new Error(`Days must be a whole number between 1 and ${max}.`);
  }
  return days;
}

async function requireRecentPlatformMfa() {
  await assertPlatformMfaEnabled();
}

export async function extendTrialAction(formData: FormData) {
  await requireRecentPlatformMfa();
  const workspaceId = readWorkspaceId(formData);
  const days = readDays(formData, 7, 365);
  await extendWorkspaceTrial(workspaceId, days);
  revalidatePath("/platform");
}

export async function activateSubscriptionAction(formData: FormData) {
  await requireRecentPlatformMfa();
  const workspaceId = readWorkspaceId(formData);
  const planCode = String(formData.get("planCode") ?? "starter").trim().toLowerCase();
  if (!ALLOWED_PLANS.has(planCode)) throw new Error("Invalid subscription plan.");
  const days = readDays(formData, 30, 1095);
  await activateWorkspaceSubscription(workspaceId, planCode, days);
  revalidatePath("/platform");
}

export async function grantGraceAction(formData: FormData) {
  await requireRecentPlatformMfa();
  const workspaceId = readWorkspaceId(formData);
  const days = readDays(formData, 7, 90);
  await grantWorkspaceGrace(workspaceId, days);
  revalidatePath("/platform");
}

export async function suspendSubscriptionAction(formData: FormData) {
  await requireRecentPlatformMfa();
  const workspaceId = readWorkspaceId(formData);
  const reason = String(formData.get("reason") ?? "").trim();
  if (!reason || reason.length > 240) throw new Error("Suspension reason must be between 1 and 240 characters.");
  await suspendWorkspaceSubscription(workspaceId, reason);
  revalidatePath("/platform");
}

export async function previewCustomerAccountDeletionAction(workspaceId: string) {
  await requireRecentPlatformMfa();
  if (!workspaceId || workspaceId.length > 128) throw new Error("Invalid workspace.");
  return getWorkspaceDeletionPreview(workspaceId);
}

export async function deleteCustomerAccountAction(formData: FormData) {
  await requireRecentPlatformMfa();
  const workspaceId = readWorkspaceId(formData);
  const confirmation = String(formData.get("confirmName") ?? "").trim();
  if (!confirmation || confirmation.length > 200) throw new Error("Type the exact business name to confirm deletion.");
  if (formData.get("acknowledgeIrreversible") !== "yes") {
    throw new Error("Acknowledge that this operation cannot be undone.");
  }
  const phrase = String(formData.get("deletePhrase") ?? "");
  const result = await deleteCustomerWorkspaceAccount(workspaceId, confirmation, phrase);
  revalidatePath("/platform");
  revalidatePath("/admin/dashboard");
  return result;
}
