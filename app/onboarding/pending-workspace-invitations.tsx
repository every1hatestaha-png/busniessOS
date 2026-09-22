"use client";

import { useActionState } from "react";
import { Building2, ShieldCheck, X } from "lucide-react";

import {
  acceptWorkspaceInvitation,
  declineWorkspaceInvitation,
  type InvitationActionState,
} from "@/app/onboarding/invitation-actions";
import { Button } from "@/components/ui/button";

const initialState: InvitationActionState = { error: null };

type Invitation = {
  id: string;
  role: string;
  expiresAt: Date | string;
  workspace: { name: string };
};

export function PendingWorkspaceInvitations({ invitations }: { invitations: Invitation[] }) {
  if (!invitations.length) return null;

  return (
    <section className="mx-auto mb-6 max-w-7xl rounded-2xl border border-emerald-200 bg-emerald-50/70 p-4 sm:p-5">
      <div className="flex items-start gap-3">
        <ShieldCheck className="mt-0.5 size-5 shrink-0 text-emerald-700" />
        <div>
          <h1 className="font-semibold text-emerald-950">Workspace invitation{invitations.length === 1 ? "" : "s"} waiting for you</h1>
          <p className="mt-1 text-sm leading-6 text-emerald-900/75">Joining is always your choice. MunshiOS will never accept a workspace invitation automatically from an identity webhook.</p>
        </div>
      </div>
      <div className="mt-4 grid gap-3">
        {invitations.map((invitation) => <InvitationDecision key={invitation.id} invitation={invitation} />)}
      </div>
    </section>
  );
}

function InvitationDecision({ invitation }: { invitation: Invitation }) {
  const [acceptState, acceptAction, accepting] = useActionState(acceptWorkspaceInvitation, initialState);
  const [declineState, declineAction, declining] = useActionState(declineWorkspaceInvitation, initialState);
  const error = acceptState.error ?? declineState.error;

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-emerald-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <Building2 className="size-4 shrink-0 text-emerald-700" />
          <p className="truncate font-semibold text-slate-900">{invitation.workspace.name}</p>
        </div>
        <p className="mt-1 text-xs text-slate-500">Role: {invitation.role} · expires {new Date(invitation.expiresAt).toLocaleDateString("en-PK")}</p>
        {error && <p role="alert" className="mt-2 text-xs text-red-700">{error}</p>}
      </div>
      <div className="flex shrink-0 gap-2">
        <form action={declineAction}>
          <input type="hidden" name="invitationId" value={invitation.id} />
          <Button type="submit" variant="outline" disabled={accepting || declining}><X className="size-3.5" />Decline</Button>
        </form>
        <form action={acceptAction}>
          <input type="hidden" name="invitationId" value={invitation.id} />
          <Button type="submit" disabled={accepting || declining}>{accepting ? "Joining..." : "Accept invitation"}</Button>
        </form>
      </div>
    </div>
  );
}
