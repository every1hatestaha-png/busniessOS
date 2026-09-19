import { ForbiddenError } from "@/lib/server/authorization";
import { requirePermission } from "@/lib/server/authorization";
import { listInvitations, listMembers } from "@/lib/server/members";
import { MemberManager } from "@/components/settings/member-manager";
import { BusinessProfileForm } from "@/components/settings/business-profile-form";
import { db } from "@/lib/server/db";
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
    context = await requirePermission("members.manage");
  } catch (error) {
    if (error instanceof ForbiddenError) {
      return (
        <div>
          <h1 className="text-2xl font-bold">Settings</h1>
          <p className="mt-2 text-neutral-500">Only workspace owners can manage members.</p>
        </div>
      );
    }
    throw error;
  }

  const [members, invitations, workspace] = await Promise.all([
    listMembers(context.workspaceId),
    listInvitations(context.workspaceId),
    db.workspace.findUniqueOrThrow({
      where: { id: context.workspaceId },
      select: { name: true, phone: true, email: true, address: true, city: true, country: true, businessType: true, ntn: true, strn: true },
    }),
  ]);

  const version = getAppVersion();

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-neutral-400">Workspace</p>
        <h1 className="mt-1 text-3xl font-bold tracking-tight">Business settings</h1>
        <p className="mt-1 text-neutral-500">Manage your business identity, location and team access.</p>
      </header>
      <BusinessProfileForm workspace={workspace} />
      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold">Team & access</h2>
          <p className="mt-0.5 text-sm text-neutral-500">Invite teammates and control access roles.</p>
        </div>
        <MemberManager members={members} invitations={invitations} />
      </section>
      <div className="border-t border-neutral-200 pt-6">
        <p className="text-xs text-neutral-400">
          MunshiOS v{version}
        </p>
      </div>
    </div>
  );
}
