import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "crypto";

let db: typeof import("@/lib/server/db")["db"];
let getProductionRunDetail: typeof import("@/lib/server/industry-modules")["getProductionRunDetail"];
let setWorkspaceModule: typeof import("@/lib/server/industry-modules")["setWorkspaceModule"];

const runId = randomUUID();
let userId = "";
let workspaceId = "";
let otherWorkspaceId = "";
let finishedProductId = "";
let materialProductId = "";
let bomId = "";
let productionRunId = "";

describe("manufacturing production traceability", () => {
  beforeAll(async () => {
    const { config } = await import("dotenv");
    config({ path: ".env.local", quiet: true });

    ({ db } = await import("@/lib/server/db"));
    ({ getProductionRunDetail, setWorkspaceModule } = await import("@/lib/server/industry-modules"));

    const user = await db.user.create({
      data: { clerkId: "trace-user-" + runId, email: "trace-" + runId + "@example.invalid" },
    });
    userId = user.id;

    const workspace = await db.workspace.create({
      data: { name: "Traceability " + runId, members: { create: { userId, role: "OWNER" } } },
    });
    workspaceId = workspace.id;

    const otherWorkspace = await db.workspace.create({
      data: { name: "Traceability Other " + runId, members: { create: { userId, role: "OWNER" } } },
    });
    otherWorkspaceId = otherWorkspace.id;

    await Promise.all([
      setWorkspaceModule({ workspaceId, userId, role: "OWNER" }, "manufacturing", true),
      setWorkspaceModule({ workspaceId: otherWorkspaceId, userId, role: "OWNER" }, "manufacturing", true),
    ]);

    const [finished, material] = await Promise.all([
      db.product.create({
        data: {
          workspaceId,
          name: "Finished Assembly",
          sku: "finished-" + runId,
          stockQuantity: 5,
          costPrice: 50,
          sellingPrice: 100,
        },
      }),
      db.product.create({
        data: {
          workspaceId,
          name: "Raw Material",
          sku: "raw-" + runId,
          stockQuantity: 100,
          costPrice: 20,
          sellingPrice: 25,
        },
      }),
    ]);
    finishedProductId = finished.id;
    materialProductId = material.id;

    const boms = await db.$queryRawUnsafe<Array<{ id: string }>>(
      'INSERT INTO "boms" ("workspaceId", "finishedProductId", "name", "version", "outputQuantity", "notes") VALUES ($1::uuid, $2::uuid, $3, 2, 10, $4) RETURNING "id"',
      workspaceId,
      finishedProductId,
      "Trace BOM",
      "Trace BOM note",
    );
    bomId = boms[0]!.id;

    const runs = await db.$queryRawUnsafe<Array<{ id: string }>>(
      'INSERT INTO "production_runs" ("workspaceId", "bomId", "runNumber", "plannedOutput", "actualOutput", "wastageQuantity", "status", "approvedById", "approvedAt", "postedById", "postedAt", "notes") VALUES ($1::uuid, $2::uuid, $3, 20, 18, 1.5, $4, $5::uuid, now() - interval \'1 hour\', $5::uuid, now(), $6) RETURNING "id"',
      workspaceId,
      bomId,
      "TRACE-" + runId,
      "POSTED",
      userId,
      "Production trace note",
    );
    productionRunId = runs[0]!.id;

    await db.$executeRawUnsafe(
      'INSERT INTO "production_consumptions" ("productionRunId", "productId", "plannedQuantity", "actualQuantity", "unitCost") VALUES ($1::uuid, $2::uuid, 8, 9, 20)',
      productionRunId,
      materialProductId,
    );
  }, 30_000);

  afterAll(async () => {
    if (!db || !userId) return;
    if (workspaceId) {
      if (productionRunId) {
        await db.$executeRawUnsafe('DELETE FROM "production_consumptions" WHERE "productionRunId"=$1::uuid', productionRunId);
      }
      await db.$executeRawUnsafe('DELETE FROM "production_runs" WHERE "workspaceId"=$1::uuid', workspaceId);
      if (bomId) {
        await db.$executeRawUnsafe('DELETE FROM "bom_items" WHERE "bomId"=$1::uuid', bomId);
      }
      await db.$executeRawUnsafe('DELETE FROM "boms" WHERE "workspaceId"=$1::uuid', workspaceId);
      await db.$executeRawUnsafe('DELETE FROM "workspace_modules" WHERE "workspaceId"=$1::uuid', workspaceId);
      await db.product.deleteMany({ where: { workspaceId } });
      await db.workspace.delete({ where: { id: workspaceId } });
    }
    if (otherWorkspaceId) {
      await db.$executeRawUnsafe('DELETE FROM "workspace_modules" WHERE "workspaceId"=$1::uuid', otherWorkspaceId);
      await db.workspace.delete({ where: { id: otherWorkspaceId } });
    }
    await db.user.delete({ where: { id: userId } });
  }, 30_000);

  it("returns the production lifecycle, BOM, consumption quantities, and material cost", async () => {
    const detail = await getProductionRunDetail(workspaceId, productionRunId);

    expect(detail).not.toBeNull();
    expect(detail?.runNumber).toBe("TRACE-" + runId);
    expect(detail?.status).toBe("POSTED");
    expect(detail?.plannedOutput).toBe(20);
    expect(detail?.actualOutput).toBe(18);
    expect(detail?.wastageQuantity).toBe(1.5);
    expect(detail?.notes).toBe("Production trace note");
    expect(detail?.approvedAt).toBeInstanceOf(Date);
    expect(detail?.postedAt).toBeInstanceOf(Date);

    expect(detail?.bom).toMatchObject({
      id: bomId,
      name: "Trace BOM",
      version: 2,
      outputQuantity: 10,
      finishedProductId,
      finishedProductName: "Finished Assembly",
    });

    expect(detail?.consumptions).toEqual([
      {
        productId: materialProductId,
        productName: "Raw Material",
        plannedQuantity: 8,
        actualQuantity: 9,
        unitCost: 20,
        totalCost: 180,
      },
    ]);
    expect(detail?.materialCost).toBe(180);
  });

  it("cannot read another workspace's production run", async () => {
    await expect(getProductionRunDetail(otherWorkspaceId, productionRunId)).resolves.toBeNull();
  });
});
