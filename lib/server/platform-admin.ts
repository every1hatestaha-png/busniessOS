import "server-only";

import { clerkClient } from "@clerk/nextjs/server";
import { createClient } from "@supabase/supabase-js";

import { db } from "@/lib/server/db";
import { assertPlatformMfaEnabled } from "@/lib/server/platform-security";

/**
 * Tenant tables audited against production Neon on 2026-10-22. Child tables
 * precede restrictive parents. Unknown tenant tables block deletion entirely,
 * rather than leaving silently orphaned data after a schema expansion.
 *
 * Non-tenant child tables are deleted by their own ON DELETE CASCADE links.
 * An outbound-gate-pass item has a RESTRICT link and is handled explicitly.
 */
export const WORKSPACE_PURGE_ORDER = [
  "audit_logs",
  "collection_promises",
  "customer_credit_allocations",
  "credit_notes",
  "customer_price_rules",
  "customer_returns",
  "customer_sales_boms",
  "debit_notes",
  "document_sequences",
  "expenses",
  "fbr_integration_configs",
  "fbr_integration_credentials",
  "fbr_invoice_submissions",
  "general_ledger_entries",
  "inventory_transactions",
  "invoice_document_versions",
  "kitchen_tickets",
  "ledger_entries",
  "outbound_gate_passes",
  "payment_allocations",
  "payments",
  "cash_bank_accounts",
  "accounts",
  "invoices",
  "production_runs",
  "boms",
  "recipes",
  "restaurant_inventory_consumptions",
  "restaurant_order_sequences",
  "restaurant_refunds",
  "restaurant_return_inventory_movements",
  "restaurant_return_items",
  "restaurant_return_payment_allocations",
  "restaurant_payments",
  "cash_shifts",
  "restaurant_returns",
  "restaurant_whatsapp_messages",
  "restaurant_orders",
  "restaurant_menu_items",
  "restaurant_menu_categories",
  "restaurant_tables",
  "sales_order_component_snapshots",
  "sales_orders",
  "customers",
  "service_jobs",
  "service_quotes",
  "subscription_events",
  "supplier_returns",
  "goods_received_notes",
  "purchase_orders",
  "products",
  "suppliers",
  "warehouse_stocks",
  "warehouses",
  "workspace_invitations",
  "workspace_members",
  "workspace_modules",
  "workspace_subscriptions"
] as const;
export const KNOWN_WORKSPACE_TABLES = new Set<string>(WORKSPACE_PURGE_ORDER);

/** Pure guard: refuse a purge if a new tenant table lacks a cleanup definition. */
export function assertWorkspaceDeletionCoverage(actual: readonly string[]) {
  const unknown = actual.filter((table) => !KNOWN_WORKSPACE_TABLES.has(table));
  const missing = WORKSPACE_PURGE_ORDER.filter((table) => !actual.includes(table));
  if (unknown.length || missing.length) {
    throw new Error("Deletion blocked: database schema changed. Re-audit tenant tables before purging an account.");
  }
}

/** Server-configured immutable allowlist. Never purge production owner or customer workspaces here. */
function assertWorkspaceNotProtected(workspaceId: string) {
  const protectedIds = (process.env.MUNSHIOS_PROTECTED_WORKSPACE_IDS ?? "")
    .split(",").map((id) => id.trim()).filter(Boolean);
  if (protectedIds.includes(workspaceId)) {
    throw new Error("Protected MunshiOS workspace cannot be permanently deleted.");
  }
}

type ExclusiveMember = {
  userId: string;
  email: string;
  clerkId: string | null;
  supabaseId: string | null;
  workspaceCount: number;
  externalInvitations: number;
};

const OWNER_REQUESTED_PROTECTED_EMAILS = new Set([
  "625arshad@gmail.com",
  "hafizahmadarshad3@gmail.com",
  "every1hatestaha@gmail.com",
]);

function isProtectedMember(member: ExclusiveMember) {
  const email = member.email.trim().toLowerCase();
  return OWNER_REQUESTED_PROTECTED_EMAILS.has(email)
    || email === process.env.MUNSHIOS_PLATFORM_OWNER_EMAIL?.trim().toLowerCase()
    || Boolean(member.supabaseId && member.supabaseId === process.env.MUNSHIOS_PLATFORM_OWNER_SUPABASE_ID);
}

async function requireAuthCleanupClient(members: ExclusiveMember[]) {
  const exclusive = members.filter((member) => member.workspaceCount === 1 && member.externalInvitations === 0);
  // Even memberless accounts need a Storage inventory before any permanent purge.
  const key = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url || !key) {
    throw new Error("Account purge unavailable: configure a server-only Supabase secret key before removing customer identities.");
  }
  const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  const users: Array<{ id: string; email?: string }> = [];
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error || !data) throw new Error("Account purge unavailable: Supabase Auth users cannot be checked.");
    users.push(...data.users.map((user) => ({ id: user.id, email: user.email })));
    if (data.users.length < 1000) break;
    if (page === 20) throw new Error("Account purge unavailable: Supabase Auth catalog too large for safe identity reconciliation.");
  }
  const byEmail = new Map(users.filter((user) => user.email).map((user) => [user.email!.trim().toLowerCase(), user.id]));
  const userIds = new Set<string>();
  for (const member of exclusive) {
    const matched = byEmail.get(member.email.trim().toLowerCase());
    if (matched && member.supabaseId && matched !== member.supabaseId) {
      throw new Error("Account purge blocked: member identity mismatches Supabase Auth. Investigate before deleting.");
    }
    if (!matched && member.supabaseId) {
      throw new Error("Account purge blocked: pinned Supabase identity was not found. Verify identity reconciliation first.");
    }
    if (!matched && !member.clerkId?.startsWith("user_") && !member.supabaseId) {
      throw new Error("Account purge blocked: an unclassified customer identity needs manual verification.");
    }
    if (matched) userIds.add(matched);
  }
  const { data: buckets, error: storageError } = await admin.storage.listBuckets();
  if (storageError) throw new Error("Account purge unavailable: Supabase Storage cannot be inventoried.");
  if (buckets?.length) throw new Error("Account purge blocked: Storage buckets require a separate object ownership and cleanup review.");
  return { admin, userIds: [...userIds] };
}

export async function getWorkspaceDeletionPreview(workspaceId: string) {
  await assertPlatformMfaEnabled();
  assertWorkspaceNotProtected(workspaceId);
  const workspace = await db.workspace.findUnique({ where: { id: workspaceId }, select: { id: true, name: true } });
  if (!workspace) throw new Error("Customer account no longer exists.");
  const [members, customerCount, productCount, invoiceCount, orderCount] = await Promise.all([
    db.workspaceMember.count({ where: { workspaceId } }),
    db.customer.count({ where: { workspaceId } }),
    db.product.count({ where: { workspaceId } }),
    db.invoice.count({ where: { workspaceId } }),
    db.salesOrder.count({ where: { workspaceId } }),
  ]);
  return {
    workspaceId, workspaceName: workspace.name, members, customerCount,
    productCount, invoiceCount, orderCount,
    permanentPurgeConfigured: Boolean(process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY),
    notes: "Removes active workspace records. Database backups, external exports and provider snapshots follow their separate retention policies.",
  };
}

export async function deleteCustomerWorkspaceAccount(
  workspaceId: string,
  confirmation: string,
  destructivePhrase: string,
) {
  await assertPlatformMfaEnabled();
  if (destructivePhrase !== "DELETE PERMANENTLY") throw new Error("Enter DELETE PERMANENTLY to confirm.");
  if (!workspaceId || workspaceId.length > 128) throw new Error("Invalid customer account.");
  assertWorkspaceNotProtected(workspaceId);

  const workspace = await db.workspace.findUnique({ where: { id: workspaceId }, select: { id: true, name: true } });
  if (!workspace || confirmation.trim() !== workspace.name) {
    throw new Error("Type the exact business name to confirm deletion.");
  }

  const memberRows = await db.$queryRaw<ExclusiveMember[]>`
    SELECT u."id" AS "userId", u."email", u."clerkId", u."supabaseId",
      (SELECT COUNT(*)::int FROM "workspace_members" m2 WHERE m2."userId" = u."id") AS "workspaceCount",
      (SELECT COUNT(*)::int FROM "workspace_invitations" i WHERE i."invitedById" = u."id" AND i."workspaceId" <> ${workspaceId}) AS "externalInvitations"
    FROM "users" u JOIN "workspace_members" wm ON wm."userId" = u."id"
    WHERE wm."workspaceId" = ${workspaceId}
  `;
  if (memberRows.some(isProtectedMember)) {
    throw new Error("Protected platform owner identity cannot be deleted.");
  }

  const exclusiveMembers = memberRows.filter((member) => member.workspaceCount === 1 && member.externalInvitations === 0);
  const authCleanup = await requireAuthCleanupClient(exclusiveMembers);
  // Clerk remains a legacy desktop provider. Do not attempt to delete synthetic
  // or Supabase-only clerk IDs and do not delete users from other workspaces.
  const clerkIdentities = exclusiveMembers.filter((member) => member.clerkId?.startsWith("user_"));
  if (clerkIdentities.length && !process.env.CLERK_SECRET_KEY) {
    throw new Error("Account purge unavailable: legacy Clerk admin credentials are missing.");
  }

  const result = await db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${workspaceId})) IS NULL AS "locked"`;
    const found = await tx.$queryRaw<Array<{ id: string; name: string }>>`
      SELECT "id", "name" FROM "workspaces" WHERE "id"=${workspaceId} FOR UPDATE
    `;
    if (!found.length || found[0].name !== workspace.name) throw new Error("Customer account changed. Reconfirm deletion.");
    assertWorkspaceNotProtected(workspaceId);

    const lockedMembers = await tx.$queryRaw<Array<{ userId: string; workspaceCount: number; externalInvitations: number }>>`
      SELECT u."id" AS "userId",
        (SELECT COUNT(*)::int FROM "workspace_members" m2 WHERE m2."userId" = u."id") AS "workspaceCount",
        (SELECT COUNT(*)::int FROM "workspace_invitations" i WHERE i."invitedById" = u."id" AND i."workspaceId" <> ${workspaceId}) AS "externalInvitations"
      FROM "users" u JOIN "workspace_members" wm ON wm."userId" = u."id"
      WHERE wm."workspaceId"=${workspaceId}
    `;
    const expectedMemberships = memberRows.map((member) => `${member.userId}:${member.workspaceCount}:${member.externalInvitations}`).sort().join("|");
    const actualMemberships = lockedMembers.map((member) => `${member.userId}:${member.workspaceCount}:${member.externalInvitations}`).sort().join("|");
    if (expectedMemberships !== actualMemberships) {
      throw new Error("Customer membership changed during account purge. No records were deleted.");
    }

    const currentTables = await tx.$queryRaw<Array<{ table_name: string }>>`
      SELECT table_name FROM information_schema.columns
      WHERE table_schema='public' AND column_name='workspaceId' ORDER BY table_name
    `;
    assertWorkspaceDeletionCoverage(currentTables.map((entry) => entry.table_name));

    // A transaction-local purge context lets immutable evidence triggers permit
    // physical cleanup ONLY for this exact workspace. The context is set after
    // MFA, owner identity, confirmation, membership and schema checks.
    // PostgreSQL clears it automatically on commit or rollback.
    await tx.$queryRaw`
      SELECT pg_catalog.set_config('munshios.purge_workspace_id', ${workspaceId}, true) AS scope
    `;

    // Break self-referential RESTRICT relationships before bulk deletion.
    for (const table of ["payments", "general_ledger_entries", "restaurant_returns"]) {
      await tx.$executeRawUnsafe(`UPDATE "${table}" SET "reversalOfId" = NULL WHERE "workspaceId" = $1 AND "reversalOfId" IS NOT NULL`, workspaceId);
    }
    await tx.$executeRaw`
      DELETE FROM "outbound_gate_pass_items" WHERE "gatePassId" IN
        (SELECT "id" FROM "outbound_gate_passes" WHERE "workspaceId"=${workspaceId})
    `;
    let removedRows = 0;
    for (const table of WORKSPACE_PURGE_ORDER) {
      removedRows += await tx.$executeRawUnsafe(`DELETE FROM "${table}" WHERE "workspaceId" = $1`, workspaceId);
    }
    const rootDeleted = await tx.$executeRaw`DELETE FROM "workspaces" WHERE "id"=${workspaceId}`;
    if (rootDeleted !== 1) throw new Error("Account was modified; deletion rolled back.");

    for (const member of exclusiveMembers) {
      await tx.user.deleteMany({ where: { id: member.userId } });
    }
    return { removedRows, removedLocalUsers: exclusiveMembers.length };
  }, { maxWait: 10_000, timeout: 90_000 });

  const failures: string[] = [];
  // Identity providers are not in the Neon transaction. We must report every
  // failed external cleanup explicitly instead of misreporting full deletion.
  if (authCleanup.admin) {
    for (const userId of authCleanup.userIds) {
      try {
        const { error } = await authCleanup.admin.auth.admin.deleteUser(userId, false);
        if (error) throw error;
      } catch {
        failures.push("Supabase Auth identity cleanup failed; review the provider user inventory.");
      }
    }
  }

  if (clerkIdentities.length) {
    try {
      const clerk = await clerkClient();
      for (const member of clerkIdentities) {
        try {
          await clerk.users.deleteUser(member.clerkId!);
        } catch {
          failures.push("Legacy Clerk identity cleanup pending for an exclusively owned member.");
        }
      }
    } catch {
      failures.push("Legacy Clerk cleanup could not start.");
    }
  }

  return {
    workspaceId, workspaceName: workspace.name,
    ...result, deletedFromDatabase: true, identityCleanupComplete: failures.length === 0,
    warnings: failures,
  };
}

/**
 * Owner-requested one-time cleanup of Supabase Auth profiles that were never
 * linked to a workspace, or whose last workspace has already been purged.
 * This operation refuses to run until ONLY the three explicitly protected
 * production workspaces AND their three protected local members remain.
 * It does not broadly delete future signup identities.
 */
const OWNER_CLEANUP_PROTECTED_WORKSPACE_IDS = [
  "c15e0dd4-9d61-407b-a4dc-5490e2247151", // KHZR
  "4bc313cf-2869-4d87-8f1e-22a147f18d2d", // 625 Arshad
  "a9e7ed7d-d3c2-434a-992e-972fb088273a", // second Arshad Sons
] as const;

const OWNER_CLEANUP_LEGACY_AUTH_EMAILS = new Set([
  "devasadamir@gmail.com",
  "ducker@ducker.com",
  "every1hatestaha+munshi-e2e@gmail.com",
  "every1hatestaha+munshi-e2e2@gmail.com",
  "every1hatestaha+munshi-e2e3@gmail.com",
  "meerabfatima1844@gmail.com",
  "synthtest992026@tempmail.plus",
  "tahakhizar1106@gmail.com",
  "tahakhizar1106+munshiaudit2809@gmail.com",
  "testuser1234567890@mailinator.com",
  "testuser92847@tmpbox.email",
  "testuser9823476@disposable-mail.com",
  "testuser98765@syntheticmail.com",
]);

export async function finalizeOwnerRequestedAuthCleanup() {
  await assertPlatformMfaEnabled();
  const [workspaces, localUsers] = await Promise.all([
    db.workspace.findMany({ select: { id: true } }),
    db.user.findMany({ select: { email: true } }),
  ]);
  const protectedWorkspaceIds = new Set<string>(OWNER_CLEANUP_PROTECTED_WORKSPACE_IDS);
  if (workspaces.length !== 3 || workspaces.some((workspace) => !protectedWorkspaceIds.has(workspace.id))) {
    throw new Error("Cleanup incomplete: only the three protected workspaces may remain before identity finalization.");
  }
  if (localUsers.length !== 3 || localUsers.some((user) => !OWNER_REQUESTED_PROTECTED_EMAILS.has(user.email.trim().toLowerCase()))) {
    throw new Error("Cleanup incomplete: unexpected local users remain. No Supabase identities were removed.");
  }

  const { admin } = await requireAuthCleanupClient([]);
  const catalog: Array<{ id: string; email: string }> = [];
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error || !data) throw new Error("Cannot verify Supabase Auth identity inventory.");
    catalog.push(...data.users.map((user) => ({ id: user.id, email: (user.email ?? "").trim().toLowerCase() })));
    if (data.users.length < 1000) break;
    if (page === 20) throw new Error("Auth inventory too large for the approved cleanup.");
  }

  const unexpected = catalog.filter((user) =>
    !OWNER_REQUESTED_PROTECTED_EMAILS.has(user.email)
    && !OWNER_CLEANUP_LEGACY_AUTH_EMAILS.has(user.email)
  );
  if (unexpected.length > 0) {
    throw new Error("Unrecognized new Auth profiles exist. Cleanup stopped before deleting identities.");
  }

  let deleted = 0;
  const failures: string[] = [];
  for (const user of catalog) {
    if (!OWNER_CLEANUP_LEGACY_AUTH_EMAILS.has(user.email)) continue;
    try {
      const { error } = await admin.auth.admin.deleteUser(user.id, false);
      if (error) throw error;
      deleted++;
    } catch {
      failures.push(`Supabase Auth deletion failed for ${user.email}.`);
    }
  }
  return { deletedAuthUsers: deleted, warnings: failures, identityCleanupComplete: failures.length === 0 };
}
