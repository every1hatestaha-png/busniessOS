"use server";

import { auth, reverificationError } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";

import {
  activateWorkspaceSubscription,
  extendWorkspaceTrial,
  grantWorkspaceGrace,
  suspendWorkspaceSubscription,
} from "@/lib/server/subscriptions";
import { deleteCustomerWorkspaceAccount } from "@/lib/server/platform-admin";

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
  const session = await auth.protect();
  if (!session.has({ reverification: "strict_mfa" })) {
    return reverificationError("strict_mfa");
  }
  return null;
}

export async function extendTrialAction(formData: FormData) {
  const verificationError = await requireRecentPlatformMfa();
  if (verificationError) return verificationError;
  const workspaceId = readWorkspaceId(formData);
  const days = readDays(formData, 7, 365);
  await extendWorkspaceTrial(workspaceId, days);
  revalidatePath("/platform");
}

export async function activateSubscriptionAction(formData: FormData) {
  const verificationError = await requireRecentPlatformMfa();
  if (verificationError) return verificationError;
  const workspaceId = readWorkspaceId(formData);
  const planCode = String(formData.get("planCode") ?? "starter").trim().toLowerCase();
  if (!ALLOWED_PLANS.has(planCode)) throw new Error("Invalid subscription plan.");
  const days = readDays(formData, 30, 1095);
  await activateWorkspaceSubscription(workspaceId, planCode, days);
  revalidatePath("/platform");
}

export async function grantGraceAction(formData: FormData) {
  const verificationError = await requireRecentPlatformMfa();
  if (verificationError) return verificationError;
  const workspaceId = readWorkspaceId(formData);
  const days = readDays(formData, 7, 90);
  await grantWorkspaceGrace(workspaceId, days);
  revalidatePath("/platform");
}

export async function suspendSubscriptionAction(formData: FormData) {
  const verificationError = await requireRecentPlatformMfa();
  if (verificationError) return verificationError;
  const workspaceId = readWorkspaceId(formData);
  const reason = String(formData.get("reason") ?? "").trim();
  if (!reason || reason.length > 240) throw new Error("Suspension reason must be between 1 and 240 characters.");
  await suspendWorkspaceSubscription(workspaceId, reason);
  revalidatePath("/platform");
}

export async function deleteCustomerAccountAction(formData: FormData) {
  const verificationError = await requireRecentPlatformMfa();
  if (verificationError) return verificationError;
  const workspaceId = readWorkspaceId(formData);
  const confirmation = String(formData.get("confirmName") ?? "").trim();
  if (!confirmation || confirmation.length > 200) throw new Error("Type the exact business name to confirm deletion.");
  await deleteCustomerWorkspaceAccount(workspaceId, confirmation);
  revalidatePath("/platform");
}
