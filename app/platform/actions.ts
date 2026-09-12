"use server";

import { revalidatePath } from "next/cache";

import {
  activateWorkspaceSubscription,
  extendWorkspaceTrial,
  grantWorkspaceGrace,
  suspendWorkspaceSubscription,
} from "@/lib/server/subscriptions";

function readWorkspaceId(formData: FormData) {
  const value = formData.get("workspaceId");
  if (typeof value !== "string" || !value.trim()) throw new Error("Workspace is required.");
  return value;
}

export async function extendTrialAction(formData: FormData) {
  const workspaceId = readWorkspaceId(formData);
  const days = Number(formData.get("days") ?? 7);
  await extendWorkspaceTrial(workspaceId, Number.isFinite(days) ? days : 7);
  revalidatePath("/platform");
}

export async function activateSubscriptionAction(formData: FormData) {
  const workspaceId = readWorkspaceId(formData);
  const planCode = String(formData.get("planCode") ?? "starter");
  const days = Number(formData.get("days") ?? 30);
  await activateWorkspaceSubscription(workspaceId, planCode, Number.isFinite(days) ? days : 30);
  revalidatePath("/platform");
}

export async function grantGraceAction(formData: FormData) {
  const workspaceId = readWorkspaceId(formData);
  const days = Number(formData.get("days") ?? 7);
  await grantWorkspaceGrace(workspaceId, Number.isFinite(days) ? days : 7);
  revalidatePath("/platform");
}

export async function suspendSubscriptionAction(formData: FormData) {
  const workspaceId = readWorkspaceId(formData);
  const reason = String(formData.get("reason") ?? "");
  await suspendWorkspaceSubscription(workspaceId, reason);
  revalidatePath("/platform");
}
