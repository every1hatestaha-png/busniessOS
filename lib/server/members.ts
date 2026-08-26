import "server-only";

import { randomBytes } from "node:crypto";
import type { Role } from "@prisma/client";
import { writeAudit } from "@/lib/server/audit";
import { db } from "@/lib/server/db";
import type { ServiceContext } from "@/lib/server/sales";

export class MemberDomainError extends Error {}
const assignableRoles: Role[] = ["ADMIN", "MANAGER", "STAFF"];

export function listMembers(workspaceId: string) {
  return db.workspaceMember.findMany({ where: { workspaceId }, include: { user: { select: { email: true, firstName: true, lastName: true } } }, orderBy: { createdAt: "asc" } });
}
export function listInvitations(workspaceId: string) {
  return db.workspaceInvitation.findMany({ where: { workspaceId, status: "PENDING" }, select: { id: true, email: true, role: true, expiresAt: true, createdAt: true }, orderBy: { createdAt: "desc" } });
}
export async function inviteMember(context: ServiceContext, email: string, role: Role) {
  const normalized = email.trim().toLowerCase();
  if (!assignableRoles.includes(role)) throw new MemberDomainError("Invalid invitation role.");
  const existing = await db.user.findUnique({ where: { email: normalized }, include: { memberships: { where: { workspaceId: context.workspaceId } } } });
  if (existing?.memberships.length) throw new MemberDomainError("This user is already a member.");
  return db.$transaction(async (tx) => {
    await tx.workspaceInvitation.updateMany({ where: { workspaceId: context.workspaceId, email: normalized, status: "PENDING" }, data: { status: "REVOKED" } });
    const invitation = await tx.workspaceInvitation.create({ data: { workspaceId: context.workspaceId, email: normalized, role, token: randomBytes(32).toString("hex"), invitedById: context.userId!, expiresAt: new Date(Date.now() + 7 * 86_400_000) }, select: { id: true, email: true, role: true, expiresAt: true } });
    await writeAudit(tx, { workspaceId: context.workspaceId, actorId: context.userId, action: "member.invited", entityType: "WorkspaceInvitation", entityId: invitation.id, metadata: { email: normalized, role } });
    return invitation;
  });
}
export async function updateMemberRole(context: ServiceContext, memberId: string, role: Role) {
  if (!assignableRoles.includes(role)) throw new MemberDomainError("Ownership cannot be assigned here.");
  return db.$transaction(async (tx) => {
    const member = await tx.workspaceMember.findFirst({ where: { id: memberId, workspaceId: context.workspaceId } });
    if (!member || member.role === "OWNER") throw new MemberDomainError("Owner role cannot be changed.");
    const updated = await tx.workspaceMember.update({ where: { id: memberId }, data: { role } });
    await writeAudit(tx, { workspaceId: context.workspaceId, actorId: context.userId, action: "member.role_updated", entityType: "WorkspaceMember", entityId: memberId, metadata: { role } });
    return updated;
  });
}
export async function removeMember(context: ServiceContext, memberId: string) {
  return db.$transaction(async (tx) => {
    const member = await tx.workspaceMember.findFirst({ where: { id: memberId, workspaceId: context.workspaceId } });
    if (!member || member.role === "OWNER") throw new MemberDomainError("Owner cannot be removed.");
    await writeAudit(tx, { workspaceId: context.workspaceId, actorId: context.userId, action: "member.removed", entityType: "WorkspaceMember", entityId: memberId });
    await tx.workspaceMember.delete({ where: { id: memberId } });
  });
}

export async function acceptPendingInvitations(userId: string, email: string) {
  const pending = await db.workspaceInvitation.findMany({ where: { email: email.toLowerCase(), status: "PENDING", expiresAt: { gt: new Date() } } });
  for (const invitation of pending) {
    await db.$transaction(async (tx) => {
      await tx.workspaceMember.upsert({ where: { workspaceId_userId: { workspaceId: invitation.workspaceId, userId } }, create: { workspaceId: invitation.workspaceId, userId, role: invitation.role }, update: {} });
      await tx.workspaceInvitation.update({ where: { id: invitation.id }, data: { status: "ACCEPTED", acceptedAt: new Date() } });
      await writeAudit(tx, { workspaceId: invitation.workspaceId, action: "member.joined", entityType: "User", entityId: userId });
    });
  }
}
