import { ForbiddenError, canPerformAction, requirePermission } from "@/lib/server/authorization";
import { listInvitations, listMembers } from "@/lib/server/members";
import { MemberManager } from "@/components/settings/member-manager";
import { BusinessProfileForm } from "@/components/settings/business-profile-form";
import { FbrIntegrationForm } from "@/components/settings/fbr-integration-form";
import { db } from "@/lib/server/db";
import { resolveFbrBearerToken } from "@/lib/server/fbr-credentials";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function getAppVersion(): string {
  try {
    const pkg = JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf8"));
    return pkg.version || "unknown";
  } catch {
    return "unknown";
  }
}

export default async function SettingsPage() {
  let context;
  try {
    context = await requirePermission("workspace.manage");
  } catch (error) {
    if (error instanceof ForbiddenError) {
      return (
        <div>
          <h1 className="text-2xl font-bold">Settings</h1>
          <p className="mt-2 text-neutral-500">You do not have permission to manage workspace settings.</p>
        </div>
      );
    }
    throw error;
  }

  const canManageMembers = canPerformAction(context.role, "members.manage");
  const [members, invitations, workspace, fbrConfig] = await Promise.all([
    canManageMembers ? listMembers(context.workspaceId) : Promise.resolve([]),
    canManageMembers ? listInvitations(context.workspaceId) : Promise.resolve([]),
    db.workspace.findUniqueOrThrow({
      where: { id: context.workspaceId },
      select: { name: true, phone: true, email: true, address: true, city: true, country: true, businessType: true, ntn: true, strn: true, province: true },
    }),
    db.fbrIntegrationConfig.findUnique({
      where: { workspaceId: context.workspaceId },
      select: { enabled: true, environment: true, defaultScenarioId: true, provider: true, integratorName: true, integratorLicenseNo: true },
    }),
  ]);

  let sandboxCredentialReady = false;
  try {
    resolveFbrBearerToken(context.workspaceId, "SANDBOX");
    sandboxCredentialReady = true;
  } catch {
    sandboxCredentialReady = false;
  }

  const version = getAppVersion();

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-neutral-400">Workspace</p>
        <h1 className="mt-1 text-3xl font-bold tracking-tight">Business settings</h1>
        <p className="mt-1 text-neutral-500">Manage your business identity, location and team access.</p>
      </header>
      <BusinessProfileForm workspace={workspace} />
      <FbrIntegrationForm config={fbrConfig} sandboxCredentialReady={sandboxCredentialReady} />
      {canManageMembers ? (
        <section className="space-y-3">
          <div>
            <h2 className="text-lg font-semibold">Team & access</h2>
            <p className="mt-0.5 text-sm text-neutral-500">Invite teammates and control access roles.</p>
          </div>
          <MemberManager members={members} invitations={invitations} />
        </section>
      ) : (
        <section className="rounded-2xl border bg-slate-50/70 p-5">
          <h2 className="text-sm font-semibold text-slate-900">Team & access</h2>
          <p className="mt-1 text-xs leading-5 text-slate-500">Workspace owners manage invitations and member roles. Administrators can update business identity without changing team access.</p>
        </section>
      )}
      <div className="border-t border-neutral-200 pt-6">
        <p className="text-xs text-neutral-400">
          MunshiOS v{version}
        </p>
      </div>
    </div>
  );
}
