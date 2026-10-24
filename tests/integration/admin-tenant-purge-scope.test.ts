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
});
