import { afterAll, describe, expect, it } from "vitest";

// Integration runs against an isolated, migrated test database. It never
// deletes customer data or disables database triggers.
describe("admin tenant purge transaction scope", () => {
  let db: typeof import("@/lib/server/db")["db"] | undefined;

  afterAll(async () => { await db?.$disconnect(); });

  it("permits only a matching workspace during the explicit transaction", async () => {
    ({ db } = await import("@/lib/server/db"));
    const a = "11111111-1111-4111-8111-111111111111";
    const b = "22222222-2222-4222-8222-222222222222";
    const allowed = (id: string) => db!.$queryRaw<Array<{ value: boolean }>>`
      SELECT munshios_admin_purge_matches_workspace(${id}) AS value
    `;

    expect((await allowed(a))[0]?.value).toBe(false);

    await db.$transaction(async (tx) => {
      await tx.$queryRaw`
        SELECT pg_catalog.set_config('munshios.purge_workspace_id', ${a}, true) AS scope
      `;
      const rows = await tx.$queryRaw<Array<{ for_a: boolean; for_b: boolean }>>`
        SELECT munshios_admin_purge_matches_workspace(${a}) AS for_a,
               munshios_admin_purge_matches_workspace(${b}) AS for_b
      `;
      expect(rows).toEqual([{ for_a: true, for_b: false }]);
    });

    expect((await allowed(a))[0]?.value).toBe(false);
  });

  it("preserves evidence by default and removes only an explicitly scoped restaurant tenant", async () => {
    ({ db } = await import("@/lib/server/db"));
    const { randomUUID } = await import("node:crypto");
    const user = await db.user.create({
      data: { clerkId: `purge-scope-${randomUUID()}`, email: `purge-scope-${randomUUID()}@example.invalid` },
    });
    const tenant = await db.workspace.create({
      data: { name: `Purge acceptance ${randomUUID()}`, members: { create: { userId: user.id, role: "OWNER" } } },
    });
    const protectedTenant = await db.workspace.create({
      data: { name: `Purge protected ${randomUUID()}`, members: { create: { userId: user.id, role: "OWNER" } } },
    });
    const orderId = randomUUID();
    await db.$executeRaw`
      INSERT INTO "restaurant_orders" ("id", "workspaceId", "orderNumber", "source", "fulfillmentType", "createdById", "subtotal", "total")
      VALUES (${orderId}::uuid, ${tenant.id}::uuid, ${`P-${randomUUID()}`}, 'POS', 'TAKEAWAY', ${user.id}, 1, 1)
    `;
    await db.$executeRaw`
      INSERT INTO "kitchen_tickets" ("workspaceId", "restaurantOrderId", "ticketNumber")
      VALUES (${tenant.id}::uuid, ${orderId}::uuid, ${`KT-${randomUUID()}`})
    `;

    // The PostgreSQL CI owner is privileged and intentionally bypasses these
    // triggers. Test enforcement using a non-superuser application role.
    await db.$executeRawUnsafe(`
      DO $
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'munshios_purge_test_app') THEN
          CREATE ROLE munshios_purge_test_app NOLOGIN;
        END IF;
      END $;
    `);
    await db.$executeRawUnsafe('GRANT SELECT, DELETE ON TABLE "kitchen_tickets" TO munshios_purge_test_app');

    await expect(db.$transaction(async (tx) => {
      await tx.$executeRawUnsafe("SET LOCAL ROLE munshios_purge_test_app");
      await tx.$executeRaw`
        DELETE FROM "kitchen_tickets" WHERE "workspaceId" = ${tenant.id}::uuid
      `;
    })).rejects.toThrow(/Restaurant kitchen ticket history cannot be deleted/);

    await db.$transaction(async (tx) => {
      await tx.$queryRaw`
        SELECT pg_catalog.set_config('munshios.purge_workspace_id', ${tenant.id}, true) AS scope
      `;
      expect((await tx.$queryRaw<Array<{ value: boolean }>>`
        SELECT munshios_admin_purge_matches_workspace(${protectedTenant.id}) AS value
      `)[0]?.value).toBe(false);

      await tx.$executeRawUnsafe("SET LOCAL ROLE munshios_purge_test_app");
      await tx.$executeRaw`DELETE FROM "kitchen_tickets" WHERE "workspaceId" = ${tenant.id}::uuid`;
      await tx.$executeRawUnsafe("RESET ROLE");
      await tx.$executeRaw`DELETE FROM "restaurant_orders" WHERE "workspaceId" = ${tenant.id}::uuid`;
      await tx.$executeRaw`DELETE FROM "workspace_members" WHERE "workspaceId" = ${tenant.id}`;
      await tx.$executeRaw`DELETE FROM "workspaces" WHERE "id" = ${tenant.id}`;
    });
    expect(await db.workspace.findUnique({ where: { id: tenant.id } })).toBeNull();
    expect(await db.workspace.findUnique({ where: { id: protectedTenant.id } })).not.toBeNull();
    await db.workspace.delete({ where: { id: protectedTenant.id } });
    await db.user.delete({ where: { id: user.id } });
  }, 30_000);
});
