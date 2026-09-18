import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "crypto";

let db: typeof import("@/lib/server/db")["db"];
let createServiceJob: typeof import("@/lib/server/industry-modules")["createServiceJob"];
let createServiceQuote: typeof import("@/lib/server/industry-modules")["createServiceQuote"];
let getServiceJobDetail: typeof import("@/lib/server/industry-modules")["getServiceJobDetail"];
let getServiceQuoteDetail: typeof import("@/lib/server/industry-modules")["getServiceQuoteDetail"];
let setServiceQuoteStatus: typeof import("@/lib/server/industry-modules")["setServiceQuoteStatus"];
let setWorkspaceModule: typeof import("@/lib/server/industry-modules")["setWorkspaceModule"];

const runId = randomUUID();
let userId = "";
let workspaceId = "";
let otherWorkspaceId = "";
let customerId = "";
let quoteId = "";
let jobId = "";

const context = () => ({ workspaceId, userId, role: "OWNER" as const });

describe("services quotations and jobs", () => {
  beforeAll(async () => {
    const { config } = await import("dotenv");
    config({ path: ".env.local", quiet: true });

    ({ db } = await import("@/lib/server/db"));
    ({
      createServiceJob,
      createServiceQuote,
      getServiceJobDetail,
      getServiceQuoteDetail,
      setServiceQuoteStatus,
      setWorkspaceModule,
    } = await import("@/lib/server/industry-modules"));

    const user = await db.user.create({
      data: { clerkId: "services-user-" + runId, email: "services-" + runId + "@example.invalid" },
    });
    userId = user.id;

    const workspace = await db.workspace.create({
      data: { name: "Services " + runId, members: { create: { userId, role: "OWNER" } } },
    });
    workspaceId = workspace.id;

    const otherWorkspace = await db.workspace.create({
      data: { name: "Services Other " + runId, members: { create: { userId, role: "OWNER" } } },
    });
    otherWorkspaceId = otherWorkspace.id;

    await Promise.all([
      setWorkspaceModule({ workspaceId, userId, role: "OWNER" }, "services", true),
      setWorkspaceModule({ workspaceId: otherWorkspaceId, userId, role: "OWNER" }, "services", true),
    ]);

    const customer = await db.customer.create({
      data: {
        workspaceId,
        name: "Client Contact",
        companyName: "Trace Services Client",
        phone: "03001234567",
        email: "client@example.invalid",
        address: "1 Service Road",
        city: "Lahore",
      },
    });
    customerId = customer.id;

    const quote = await createServiceQuote(context(), {
      customerId,
      quoteNumber: "SQ-" + runId,
      validUntil: new Date("2026-12-31T00:00:00.000Z"),
      discount: 500,
      tax: 250,
      notes: "Commercial terms for integration test",
      items: [
        { description: "Implementation", quantity: 2, unitPrice: 3000 },
        { description: "Training", quantity: 1.5, unitPrice: 2000 },
      ],
    });
    quoteId = quote.id;
  }, 30_000);

  afterAll(async () => {
    if (!db || !userId) return;

    if (workspaceId) {
      await db.$executeRawUnsafe('DELETE FROM "service_jobs" WHERE "workspaceId"=$1::uuid', workspaceId);
      await db.$executeRawUnsafe('DELETE FROM "service_quote_items" WHERE "serviceQuoteId" IN (SELECT "id" FROM "service_quotes" WHERE "workspaceId"=$1::uuid)', workspaceId);
      await db.$executeRawUnsafe('DELETE FROM "service_quotes" WHERE "workspaceId"=$1::uuid', workspaceId);
      await db.$executeRawUnsafe('DELETE FROM "workspace_modules" WHERE "workspaceId"=$1::uuid', workspaceId);
      await db.customer.deleteMany({ where: { workspaceId } });
      await db.workspace.delete({ where: { id: workspaceId } });
    }

    if (otherWorkspaceId) {
      await db.$executeRawUnsafe('DELETE FROM "workspace_modules" WHERE "workspaceId"=$1::uuid', otherWorkspaceId);
      await db.workspace.delete({ where: { id: otherWorkspaceId } });
    }

    await db.user.delete({ where: { id: userId } });
  }, 30_000);

  it("returns quotation client data, line totals, and commercial totals", async () => {
    const quote = await getServiceQuoteDetail(workspaceId, quoteId);

    expect(quote).not.toBeNull();
    expect(quote?.quoteNumber).toBe("SQ-" + runId);
    expect(quote?.customerName).toBe("Trace Services Client");
    expect(quote?.customerPhone).toBe("03001234567");
    expect(quote?.customerCity).toBe("Lahore");
    expect(quote?.subtotal).toBe(9000);
    expect(quote?.discount).toBe(500);
    expect(quote?.tax).toBe(250);
    expect(quote?.total).toBe(8750);
    expect(quote?.items).toEqual([
      expect.objectContaining({ description: "Implementation", quantity: 2, unitPrice: 3000, lineTotal: 6000, position: 1 }),
      expect.objectContaining({ description: "Training", quantity: 1.5, unitPrice: 2000, lineTotal: 3000, position: 2 }),
    ]);
  });

  it("does not leave an orphan job when an unaccepted quotation conversion is rejected", async () => {
    await expect(
      createServiceJob(context(), {
        customerId,
        serviceQuoteId: quoteId,
        jobNumber: "JOB-REJECT-" + runId,
        title: "Should rollback",
      }),
    ).rejects.toThrow(/accepted quotation/i);

    const jobs = await db.$queryRawUnsafe<Array<{ count: bigint }>>(
      'SELECT count(*)::bigint AS "count" FROM "service_jobs" WHERE "workspaceId"=$1::uuid AND "jobNumber"=$2',
      workspaceId,
      "JOB-REJECT-" + runId,
    );
    expect(Number(jobs[0]?.count ?? 0)).toBe(0);

    const quote = await getServiceQuoteDetail(workspaceId, quoteId);
    expect(quote?.status).toBe("DRAFT");
  });

  it("atomically creates a job and converts an accepted quotation", async () => {
    await setServiceQuoteStatus(context(), quoteId, "ACCEPTED");

    const job = await createServiceJob(context(), {
      customerId,
      serviceQuoteId: quoteId,
      jobNumber: "JOB-" + runId,
      title: "Implementation delivery",
      description: "Deliver the accepted scope.",
      scheduledAt: new Date("2026-10-10T05:00:00.000Z"),
    });
    jobId = job.id;

    const [quote, detail] = await Promise.all([
      getServiceQuoteDetail(workspaceId, quoteId),
      getServiceJobDetail(workspaceId, jobId),
    ]);

    expect(quote?.status).toBe("CONVERTED");
    expect(quote?.jobs).toEqual([
      expect.objectContaining({ id: jobId, jobNumber: "JOB-" + runId, title: "Implementation delivery", status: "OPEN" }),
    ]);

    expect(detail).toMatchObject({
      id: jobId,
      customerId,
      serviceQuoteId: quoteId,
      jobNumber: "JOB-" + runId,
      title: "Implementation delivery",
      description: "Deliver the accepted scope.",
      status: "OPEN",
      customerName: "Trace Services Client",
      quoteNumber: "SQ-" + runId,
    });
  });

  it("prevents cross-workspace quotation and job reads", async () => {
    await expect(getServiceQuoteDetail(otherWorkspaceId, quoteId)).resolves.toBeNull();
    await expect(getServiceJobDetail(otherWorkspaceId, jobId)).resolves.toBeNull();
  });
});
