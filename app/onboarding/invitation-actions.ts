"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { getCurrentUser } from "@/lib/server/auth";
import {
  acceptInvitationForUser,
  declineInvitationForUser,
  MemberDomainError,
} from "@/lib/server/members";

export type InvitationActionState = { error: string | null };

export async function acceptWorkspaceInvitation(
  _previousState: InvitationActionState,
  formData: FormData,
): Promise<InvitationActionState> {
  const invitationId = String(formData.get("invitationId") ?? "").trim();
  if (!invitationId) return { error: "Invitation is missing." };

  const user = await getCurrentUser();
  try {
    const result = await acceptInvitationForUser(user.id, user.email, invitationId);
    (await cookies()).set("businessos_workspace", result.workspaceId, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
    });
  } catch (error) {
    if (error instanceof MemberDomainError) return { error: error.message };
    throw error;
  }

  redirect("/dashboard");
}

export async function declineWorkspaceInvitation(
  _previousState: InvitationActionState,
  formData: FormData,
): Promise<InvitationActionState> {
  const invitationId = String(formData.get("invitationId") ?? "").trim();
  if (!invitationId) return { error: "Invitation is missing." };

  const user = await getCurrentUser();
  try {
    await declineInvitationForUser(user.id, user.email, invitationId);
    revalidatePath("/onboarding");
    return { error: null };
  } catch (error) {
    if (error instanceof MemberDomainError) return { error: error.message };
    throw error;
  }
}
