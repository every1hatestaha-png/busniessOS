import { randomUUID, createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/server/db";
import { createProduct } from "@/lib/server/products";
import { createCustomerReturn, cancelSale } from "@/lib/server/sales";
import { updateSaleAndInvoice } from "@/lib/server/sale-edit";
import { createOutboundGatePassDraft, updateOutboundGatePassDraft, getOutboundGatePass, listOutboundGatePasses } from "@/lib/server/outbound-gate-passes";
import { issueGatePass, dispatchGatePass, recordGatePassReceiving, confirmRejectedStockReturn, invoiceAcceptedGatePass, cancelUndispatchedGatePass } from "@/lib/server/outbound-gate-pass-lifecycle";
import { ownedTransitInventory } from "@/lib/delivery-acceptance/transit-reconciliation";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("@/lib/server/auth", () => ({ requireWorkspace: async () => ({ workspaceId: tenant, workspace: await db.workspace.findUniqueOrThrow({where:{id:tenant}}), user: {id:userId}, role:"OWNER" }) }));
vi.mock("next/navigation", async (importOriginal) => ({
  ...await importOriginal<typeof import("next/navigation")>(),
  useRouter: () => ({refresh:vi.fn(),push:vi.fn()}),
}));

const tenant = "4bc313cf-2869-4d87-8f1e-22a147f18d2d";
const other = randomUUID();
let userId: string;
const ctx = () => ({ workspaceId: tenant, userId, role: "OWNER" as const });
const run = process.env.RUN_OUTBOUND_GP_ACCEPTANCE === "true";

describe.skipIf(!run)("disposable PG18 gate pass end-to-end acceptance", () => {
  beforeAll(async () => {
    const url = new URL(process.env.DATABASE_URL!);
    if (!["127.0.0.1", "localhost"].includes(url.hostname) || !url.pathname.startsWith("/munshios_gatepass_")) throw new Error("Disposable loopback gate pass database required");
    vi.stubEnv("OUTBOUND_GATE_PASS_V1_ENABLED", "true");
    vi.stubEnv("OUTBOUND_GATE_PASS_V1_WORKSPACE_ID", tenant);
    // Simulated legal approval for synthetic local acceptance only, never a real signoff.
    vi.stubEnv("OUTBOUND_GP_ACCEPTANCE_BILLING_LEGALLY_APPROVED", "true");
    vi.stubEnv("OUTBOUND_GP_ACCEPTANCE_BILLING_APPROVAL_REFERENCE", "SYNTHETIC-LOCAL-ONLY");
    vi.stubEnv("OUTBOUND_GATE_PASS_BOM_DISPATCH_ENABLED", "true");
    // The disposable acceptance fixtures are all created after this synthetic
    // cutover. Production must use its actual future activation instant.
    vi.stubEnv("OUTBOUND_GP_ISSUE_STOCK_V2_CUTOVER_AT", "2000-01-01T00:00:00.000Z");
    const user = await db.user.create({ data: { clerkId: randomUUID(), email: `${randomUUID()}@example.invalid` } }); userId = user.id;
    await db.workspace.upsert({ where: { id: tenant }, update: {}, create: { id: tenant, name: "Synthetic Ahmad acceptance" } });
    await db.workspaceMember.create({ data: { workspaceId: tenant, userId, role: "OWNER" } });
    await db.workspace.create({ data: { id: other, name: "Synthetic unrelated tenant", members: { create: { userId, role: "OWNER" } } } });
    await db.$executeRaw`INSERT INTO "workspace_subscriptions" ("id","workspaceId","status") VALUES (${randomUUID()},${tenant},'ACTIVE') ON CONFLICT ("workspaceId") DO UPDATE SET "status"='ACTIVE',"suspendedAt"=NULL`;
  });
  afterAll(async () => { vi.unstubAllEnvs(); await db.$disconnect(); });

  async function fixture(quantity = "10", stock = 100, warehouseId = "") {
    const customer = await db.customer.create({ data: { workspaceId: tenant, name: "Synthetic receiving customer" } });
    const productId = await createProduct(ctx(), { name: "Synthetic GP part", sku: randomUUID(), category: "QA", costPrice: 50, sellingPrice: 200, stockQuantity: stock, reorderLevel: 0, unit: "PIECE", status: "ACTIVE", description: "" });
    const draft = { customerId: customer.id, warehouseId, date: "2026-10-11", deliveryAddress: "Synthetic address", notes: "QA only", idempotencyKey: randomUUID(), items: [{ productId, quantity }] };
    const { id } = await createOutboundGatePassDraft(ctx(), draft);
    const gp = await db.outboundGatePass.findUniqueOrThrow({ where: { id }, include: { items: true } });
    return { gp, customer, productId, draft };
  }
  async function accepted(f: Awaited<ReturnType<typeof fixture>>, good = "8", bad = "2") {
    await issueGatePass(ctx(), f.gp.id); await dispatchGatePass(ctx(), f.gp.id);
    return recordGatePassReceiving(ctx(), { gatePassId: f.gp.id, reference: "SYNTHETIC-RCV", recipient: "QA receiving", lines: [{ itemId: f.gp.items[0]!.id, accepted: good, rejected: bad }] });
  }
  function invoiceInput(f: Awaited<ReturnType<typeof fixture>>) {
    return { gatePassId: f.gp.id, complianceAcknowledged: true as const, lines: [{ itemId: f.gp.items[0]!.id, unitPrice: "200", taxRate: 18 }] };
  }

  it("attests every applied migration checksum with zero failed or pending rows", async () => {
    const rows = await db.$queryRaw<Array<{ migration_name: string; checksum: string; finished_at: Date | null; rolled_back_at: Date | null }>>`SELECT migration_name,checksum,finished_at,rolled_back_at FROM "_prisma_migrations" ORDER BY migration_name`;
    const dirs = readdirSync("prisma/migrations").filter(x => x !== "migration_lock.toml").sort();
    expect(rows.map(x => x.migration_name)).toEqual(dirs);
    for (const row of rows) { expect(row.finished_at).not.toBeNull(); expect(row.rolled_back_at).toBeNull(); expect(row.checksum).toBe(createHash("sha256").update(readFileSync(`prisma/migrations/${row.migration_name}/migration.sql`)).digest("hex")); }
  });
  it("creates idempotent independent drafts and issuance with zero finance/stock effects", async () => {
    const f = await fixture();
    expect((await createOutboundGatePassDraft(ctx(), f.draft)).id).toBe(f.gp.id);
    await expect(createOutboundGatePassDraft(ctx(), { ...f.draft, notes: "Changed request" })).rejects.toThrow();
    await issueGatePass(ctx(), f.gp.id);
    const issued = await db.outboundGatePass.findUniqueOrThrow({ where: { id: f.gp.id } });
    await issueGatePass(ctx(), f.gp.id);
    expect((await db.outboundGatePass.findUniqueOrThrow({ where: { id: f.gp.id } })).version).toBe(issued.version);
    expect((await db.product.findUniqueOrThrow({ where: { id: f.productId } })).stockQuantity.toNumber()).toBe(100);
    expect(await db.invoice.count({ where: { customerId: f.customer.id } })).toBe(0);
    expect(await db.inventoryTransaction.count({ where: { productId: f.productId, type: "GATE_PASS_DISPATCH" } })).toBe(0);
    expect((await db.customer.findUniqueOrThrow({ where: { id: f.customer.id } })).currentBalance.toNumber()).toBe(0);
  });
  it("offers manual preparation from an issued Gate Pass with no mutation or premature invoice", async () => {
    const f = await fixture();
    await issueGatePass(ctx(), f.gp.id);
    async function state() {
      return {
        gatePass: await db.outboundGatePass.findUniqueOrThrow({ where: { id: f.gp.id } }),
        stock: (await db.product.findUniqueOrThrow({ where: { id: f.productId } })).stockQuantity.toString(),
        balance: (await db.customer.findUniqueOrThrow({ where: { id: f.customer.id } })).currentBalance.toString(),
        invoices: await db.invoice.count({ where: { customerId: f.customer.id } }),
        ledger: await db.ledgerEntry.count({ where: { customerId: f.customer.id } }),
        audit: await db.auditLog.count({ where: { entityId: f.gp.id } }),
      };
    }
    const before = await state();
    vi.stubEnv("OUTBOUND_GP_ACCEPTANCE_BILLING_LEGALLY_APPROVED", "false");
    try {
      const { default: Pending } = await import("@/app/(dashboard)/gate-passes/pending-invoices/page");
      const { default: Detail } = await import("@/app/(dashboard)/gate-passes/[id]/page");
      const pending = renderToStaticMarkup(await Pending());
      expect(pending).toContain(`/gate-passes/${f.gp.id}#generate-invoice`);
      expect(pending).toContain("Create Invoice from Gate Pass");
      const detail = renderToStaticMarkup(await Detail({ params: Promise.resolve({ id: f.gp.id }) }));
      expect(detail).toContain('id="generate-invoice"');
      expect(detail).toContain("Preparation only");
      expect(detail).not.toContain("Create Final Invoice");
      await expect(invoiceAcceptedGatePass(ctx(), invoiceInput(f))).rejects.toThrow("approval");
      expect(await state()).toEqual(before);
    } finally { vi.stubEnv("OUTBOUND_GP_ACCEPTANCE_BILLING_LEGALLY_APPROVED", "true"); }
    await expect(invoiceAcceptedGatePass(ctx(), invoiceInput(f))).rejects.toThrow("receiving");
    expect(await state()).toEqual(before);
  });
  it("edits a draft with replay and stale-tab protection and no inventory or finance effects", async () => {
    const f = await fixture();
    const edit = {...f.draft,gatePassId:f.gp.id,version:0,notes:"Revised synthetic delivery",items:[{productId:f.productId,quantity:"2.5000"}]};
    await updateOutboundGatePassDraft(ctx(),edit);
    await updateOutboundGatePassDraft(ctx(),edit);
    await expect(updateOutboundGatePassDraft(ctx(),{...edit,notes:"Stale overwrite"})).rejects.toThrow("another tab");
    const saved = await getOutboundGatePass(tenant,f.gp.id);
    expect(saved!.version).toBe(1); expect(saved!.items[0]!.dispatchedQuantity.toString()).toBe("2.5");
    expect(saved!.gatePassNumber).toBe(f.gp.gatePassNumber);
    expect((await createOutboundGatePassDraft(ctx(),f.draft)).id).toBe(f.gp.id);
    expect(await db.auditLog.count({where:{entityId:f.gp.id,action:"GATE_PASS_DRAFT_UPDATED"}})).toBe(1);
    expect((await db.product.findUniqueOrThrow({where:{id:f.productId}})).stockQuantity.toString()).toBe("100");
    expect(await db.inventoryTransaction.count({where:{productId:f.productId,type:{in:["GATE_PASS_ISSUE","GATE_PASS_DISPATCH"]}}})).toBe(0);
    expect(await db.invoice.count({where:{customerId:f.customer.id}})).toBe(0);
    const {default:Edit} = await import("@/app/(dashboard)/gate-passes/[id]/edit/page");
    const html = renderToStaticMarkup(await Edit({params:Promise.resolve({id:f.gp.id})}));
    expect(html).toContain("Save draft changes"); expect(html).toContain("Revised synthetic delivery");
    expect(html).toContain('value="2.5"');
  });
  it("rejects foreign/stale-role draft edits atomically", async () => {
    const f = await fixture();
    const edit = {...f.draft,gatePassId:f.gp.id,version:0,notes:"Changed"};
    await expect(updateOutboundGatePassDraft({...ctx(),workspaceId:other},edit)).rejects.toThrow("not enabled");
    const customer = await db.customer.create({data:{workspaceId:other,name:"Synthetic foreign draft buyer"}});
    await expect(updateOutboundGatePassDraft(ctx(),{...edit,customerId:customer.id})).rejects.toThrow("active customer");
    await db.workspaceMember.update({where:{workspaceId_userId:{workspaceId:tenant,userId}},data:{role:"STAFF"}});
    try {
      // STAFF may create sales; a persisted role with no sales permission may not edit.
      await db.workspaceMember.delete({where:{workspaceId_userId:{workspaceId:tenant,userId}}});
      await expect(updateOutboundGatePassDraft(ctx(),edit)).rejects.toThrow("permission denied");
    } finally { await db.workspaceMember.upsert({where:{workspaceId_userId:{workspaceId:tenant,userId}},create:{workspaceId:tenant,userId,role:"OWNER"},update:{role:"OWNER"}}); }
    const saved = await getOutboundGatePass(tenant,f.gp.id);
    expect(saved!.version).toBe(0); expect(saved!.items[0]!.id).toBe(f.gp.items[0]!.id);
  });
  it("serializes draft edits against V2 issue and never edits reserved stock", async () => {
    const f = await fixture("2");
    vi.stubEnv("OUTBOUND_GP_ISSUE_STOCK_V2_ENABLED","true");
    try {
      const results = await Promise.allSettled([
        updateOutboundGatePassDraft(ctx(),{...f.draft,gatePassId:f.gp.id,version:0,items:[{productId:f.productId,quantity:"3"}]}),
        issueGatePass(ctx(),f.gp.id),
      ]);
      expect(results[1]!.status).toBe("fulfilled");
      const gp = await getOutboundGatePass(tenant,f.gp.id);
      expect(gp!.status).toBe("ISSUED"); expect(gp!.issueStockDeductedAt).not.toBeNull();
      const quantity = gp!.items[0]!.dispatchedQuantity;
      expect((await db.product.findUniqueOrThrow({where:{id:f.productId}})).stockQuantity.toString()).toBe(new Prisma.Decimal(100).minus(quantity).toString());
      expect(await db.inventoryTransaction.count({where:{productId:f.productId,type:"GATE_PASS_ISSUE"}})).toBe(1);
      await expect(updateOutboundGatePassDraft(ctx(),{...f.draft,gatePassId:f.gp.id,version:gp!.version})).rejects.toThrow("unissued draft");
      await cancelUndispatchedGatePass(ctx(),f.gp.id);
      expect((await db.product.findUniqueOrThrow({where:{id:f.productId}})).stockQuantity.toString()).toBe("100");
    } finally { vi.stubEnv("OUTBOUND_GP_ISSUE_STOCK_V2_ENABLED","false"); }
  });
  it("deducts stock once under parallel dispatch, invoices acceptance once, restores only physical returns", async () => {
    const f = await fixture(); await issueGatePass(ctx(), f.gp.id);
    const dispatched = await Promise.allSettled([dispatchGatePass(ctx(), f.gp.id), dispatchGatePass(ctx(), f.gp.id)]);
    expect(dispatched.filter(x => x.status === "fulfilled")).toHaveLength(1);
    expect((await db.product.findUniqueOrThrow({ where: { id: f.productId } })).stockQuantity.toNumber()).toBe(90);
    expect(await db.inventoryTransaction.count({ where: { productId: f.productId, type: "GATE_PASS_DISPATCH" } })).toBe(1);
    await recordGatePassReceiving(ctx(), { gatePassId: f.gp.id, reference: "SYNTHETIC-RCV", recipient: "QA", lines: [{ itemId: f.gp.items[0]!.id, accepted: "8", rejected: "2" }] });
    expect((await listOutboundGatePasses(tenant)).find(x => x.id === f.gp.id)?.status).toBe("PARTIALLY_ACCEPTED");
    const [a,b] = await Promise.all([invoiceAcceptedGatePass(ctx(), invoiceInput(f)), invoiceAcceptedGatePass(ctx(), invoiceInput(f))]);
    expect(a.id).toBe(b.id);
    expect(await db.invoice.count({ where: { customerId: f.customer.id } })).toBe(1);
    const invoice = await db.invoice.findUniqueOrThrow({ where: { id: a.id }, include: { salesOrder: { include: { items: true } } } });
    expect(invoice.amount.toNumber()).toBe(1888); expect(invoice.salesOrder!.items[0]!.quantity.toNumber()).toBe(8);
    expect((await db.customer.findUniqueOrThrow({ where: { id: f.customer.id } })).currentBalance.toNumber()).toBe(1888);
    expect(await db.ledgerEntry.count({ where: { customerId: f.customer.id, type: "SALE" } })).toBe(1);
    const gl = await db.generalLedgerEntry.findMany({ where: { sourceId: invoice.salesOrderId! } });
    expect(gl).toHaveLength(5); expect(gl.reduce((s,x)=>s.plus(x.debit).minus(x.credit),new Prisma.Decimal(0)).toNumber()).toBe(0);
    expect(gl.filter(x=>x.debit.eq(400))).toHaveLength(1);
    expect((await db.product.findUniqueOrThrow({ where: { id: f.productId } })).stockQuantity.toNumber()).toBe(90);
    const returned = { gatePassId: f.gp.id, lines: [{ itemId: f.gp.items[0]!.id, returned: "2" }] };
    await Promise.all([confirmRejectedStockReturn(ctx(), returned), confirmRejectedStockReturn(ctx(), returned)]);
    expect((await db.product.findUniqueOrThrow({ where: { id: f.productId } })).stockQuantity.toNumber()).toBe(92);
    expect(await db.inventoryTransaction.count({ where: { productId: f.productId, type: "GATE_PASS_RETURN" } })).toBe(1);
    expect(await db.auditLog.count({where:{entityId:f.gp.id,action:"gate_pass.rejected_goods_returned"}})).toBe(1);
    const final = await getOutboundGatePass(tenant, f.gp.id); const item = final!.items[0]!;
    expect(ownedTransitInventory({ dispatched: item.dispatchedQuantity, accepted: item.acceptedQuantity, rejected: item.rejectedQuantity, returned: item.returnedQuantity, status: final!.status, unitCost: item.unitCostSnapshot }).quantity.toNumber()).toBe(0);
    await expect(invoiceAcceptedGatePass(ctx(), { ...invoiceInput(f), lines: [{ itemId: item.id, unitPrice: "201", taxRate: 18 }] })).rejects.toThrow("different pricing");
  });
  it("prevents standard Sale mutation routes from changing a Gate Pass-origin invoice and physical stock", async () => {
    const f = await fixture("10", 100);
    await accepted(f, "8", "2");
    const created = await invoiceAcceptedGatePass(ctx(), invoiceInput(f));
    const invoice = await db.invoice.findUniqueOrThrow({
      where: { id: created.id },
      include: { salesOrder: { include: { items: true } } },
    });
    const order = invoice.salesOrder!;
    const originalStock = (await db.product.findUniqueOrThrow({ where: { id: f.productId } })).stockQuantity;
    const originalInvoiceCount = await db.invoice.count({ where: { customerId: f.customer.id } });
    const originalReturnCount = await db.customerReturn.count({ where: { salesOrderId: order.id } });
    const originalInventoryTxCount = await db.inventoryTransaction.count({ where: { workspaceId: tenant } });
    const originalLedgerCount = await db.generalLedgerEntry.count({ where: { workspaceId: tenant } });
    const originalCustomerBalance = (await db.customer.findUniqueOrThrow({ where: { id: f.customer.id } })).currentBalance;
    const originalStatus = order.status;
    await expect(cancelSale(ctx(), order.id, false))
      .rejects.toThrow("originates from a dispatched Gate Pass");
    await expect(createCustomerReturn(ctx(), {
      salesOrderId: order.id,
      items: [{ itemId: order.items[0]!.id, quantity: 1 }],
      restock: true,
      reason: "Synthetic ordinary return attempt",
      notes: "Test-only stock guard",
      idempotencyKey: randomUUID(),
    })).rejects.toThrow("originates from a dispatched Gate Pass");
    await expect(updateSaleAndInvoice(ctx(), {
      saleId: order.id, customerId: f.customer.id,
      issuedAt: new Date("2026-10-12T00:00:00Z"),
      dueDate: new Date("2026-11-12T00:00:00Z"),
      items: [{ productId: f.productId, quantity: 8, pricingMode: "UNIT",
        unitPrice: 200, discountPerUnit: 0, taxRate: 18 }],
      orderDiscount: 0, gstRate: 18, notes: "Synthetic ordinary edit attempt",
    })).rejects.toThrow("originates from a dispatched Gate Pass");
    expect((await db.product.findUniqueOrThrow({ where: { id: f.productId } })).stockQuantity.eq(originalStock)).toBe(true);
    expect(await db.customerReturn.count({ where: { salesOrderId: order.id } })).toBe(originalReturnCount);
    expect(await db.invoice.count({ where: { customerId: f.customer.id } })).toBe(originalInvoiceCount);
    expect(await db.inventoryTransaction.count({ where: { workspaceId: tenant } })).toBe(originalInventoryTxCount);
    expect(await db.generalLedgerEntry.count({ where: { workspaceId: tenant } })).toBe(originalLedgerCount);
    expect((await db.customer.findUniqueOrThrow({ where: { id: f.customer.id } })).currentBalance.eq(originalCustomerBalance)).toBe(true);
    expect((await db.salesOrder.findUniqueOrThrow({ where: { id: order.id } })).status).toBe(originalStatus);
    // A rejected physical unit can still return by the explicit Gate Pass
    // path; blocking ordinary Sale returns must not strand these goods.
    await confirmRejectedStockReturn(ctx(), {
      gatePassId: f.gp.id, lines: [{ itemId: f.gp.items[0]!.id, returned: "2" }],
    });
    expect((await db.product.findUniqueOrThrow({ where: { id: f.productId } })).stockQuantity.toNumber()).toBe(92);
  });

  it("supports partial receiving, blocks premature invoicing, and prevents decreasing/reopening receipt", async () => {
    const f = await fixture(); await accepted(f,"3","2");
    // A partially received Gate Pass remains editable. Persisted notes must
    // survive reloading the form, otherwise an exact replay sends blank notes
    // and needlessly increments the receipt version.
    const partial = {
      gatePassId: f.gp.id, reference: "QA", recipient: "QA",
      notes: "Keep pallet count pending",
      lines: [{ itemId: f.gp.items[0]!.id, accepted: "3", rejected: "2" }],
    };
    await recordGatePassReceiving(ctx(), partial);
    const beforeReload = await db.outboundGatePass.findUniqueOrThrow({ where: { id: f.gp.id } });
    const { default: GatePassDetail } = await import("@/app/(dashboard)/gate-passes/[id]/page");
    const partialPage = renderToStaticMarkup(await GatePassDetail({ params: Promise.resolve({ id: f.gp.id }) }));
    expect(partialPage).toContain('name="notes"');
    expect(partialPage).toContain("Keep pallet count pending");
    await recordGatePassReceiving(ctx(), partial);
    const afterReplay = await db.outboundGatePass.findUniqueOrThrow({ where: { id: f.gp.id } });
    expect(afterReplay.version).toBe(beforeReload.version);
    expect(afterReplay.receivingAt?.toISOString()).toBe(beforeReload.receivingAt?.toISOString());
    await expect(invoiceAcceptedGatePass(ctx(), invoiceInput(f))).rejects.toThrow();
    await expect(recordGatePassReceiving(ctx(), { gatePassId:f.gp.id, reference:"QA", recipient:"QA", lines:[{itemId:f.gp.items[0]!.id,accepted:"2",rejected:"2"}] })).rejects.toThrow("cannot decrease");
    await recordGatePassReceiving(ctx(), { gatePassId:f.gp.id, reference:"QA", recipient:"QA", lines:[{itemId:f.gp.items[0]!.id,accepted:"8",rejected:"2"}] });
    await expect(recordGatePassReceiving(ctx(), { gatePassId:f.gp.id, reference:"QA", recipient:"QA", lines:[{itemId:f.gp.items[0]!.id,accepted:"9",rejected:"1"}] })).rejects.toThrow();
  });
  it("deduplicates repeated signed receiving after reconciliation and after invoice without mutations", async () => {
    const f = await fixture();
    await issueGatePass(ctx(), f.gp.id);
    await dispatchGatePass(ctx(), f.gp.id);
    const receipt = { gatePassId: f.gp.id, reference: "SIGNED-RECEIVING-001", recipient: "Customer receiver", notes: "Received", lines: [{ itemId: f.gp.items[0]!.id, accepted: "8", rejected: "2" }] };
    const first = await recordGatePassReceiving(ctx(), receipt);
    // A customer receiving acknowledgement is a separate printable proof
    // of entered quantities, not a transaction, invoice, or sales receipt.
    const { default: PrintReceiving } = await import("@/app/(dashboard)/gate-passes/[id]/receiving/print/page");
    const beforePrinting = await db.inventoryTransaction.count({ where: { workspaceId: tenant } });
    const rendered = renderToStaticMarkup(await PrintReceiving({ params: Promise.resolve({ id: f.gp.id }) }));
    expect(rendered).toContain("SIGNED-RECEIVING-001");
    expect(rendered).toContain("Customer receiving signature / stamp");
    expect(rendered).toContain("Print Receiving 80mm");
    expect(rendered).toContain("not an invoice");
    expect(await db.invoice.count({ where: { customerId: f.customer.id } })).toBe(0);
    expect(await db.inventoryTransaction.count({ where: { workspaceId: tenant } })).toBe(beforePrinting);
    const recorded = await db.outboundGatePass.findUniqueOrThrow({ where: { id: f.gp.id } });
    const replay = await recordGatePassReceiving(ctx(), receipt);
    const unchanged = await db.outboundGatePass.findUniqueOrThrow({ where: { id: f.gp.id } });
    expect(replay.status).toBe(first.status);
    expect(unchanged.version).toBe(recorded.version);
    expect(unchanged.receivingAt?.toISOString()).toBe(recorded.receivingAt?.toISOString());
    await expect(recordGatePassReceiving(ctx(), { ...receipt, reference: "CHANGED-RECEIPT" })).rejects.toThrow();
    await invoiceAcceptedGatePass(ctx(), invoiceInput(f));
    const invoiced = await db.outboundGatePass.findUniqueOrThrow({ where: { id: f.gp.id } });
    expect((await recordGatePassReceiving(ctx(), receipt)).status).toBe("INVOICED");
    const postReplay = await db.outboundGatePass.findUniqueOrThrow({ where: { id: f.gp.id } });
    expect(postReplay.version).toBe(invoiced.version);
    expect(await db.invoice.count({ where: { customerId: f.customer.id } })).toBe(1);
  });
  it("fully rejected goods never create invoices and cumulative returns cannot exceed rejection", async () => {
    const f=await fixture(); await accepted(f,"0","10");
    await expect(invoiceAcceptedGatePass(ctx(),invoiceInput(f))).rejects.toThrow();
    await expect(confirmRejectedStockReturn(ctx(),{gatePassId:f.gp.id,lines:[{itemId:f.gp.items[0]!.id,returned:"11"}]})).rejects.toThrow();
    await confirmRejectedStockReturn(ctx(),{gatePassId:f.gp.id,lines:[{itemId:f.gp.items[0]!.id,returned:"10"}]});
    expect((await db.product.findUniqueOrThrow({where:{id:f.productId}})).stockQuantity.toNumber()).toBe(100);
  });
  it("rolls back insufficient stock and credit-limit failures without partial financial records", async () => {
    const f=await fixture("10",5); await issueGatePass(ctx(),f.gp.id); await expect(dispatchGatePass(ctx(),f.gp.id)).rejects.toThrow("Insufficient stock");
    expect((await getOutboundGatePass(tenant,f.gp.id))!.status).toBe("ISSUED");
    const good=await fixture(); await accepted(good); await db.customer.update({where:{id:good.customer.id},data:{creditLimit:100}});
    await expect(invoiceAcceptedGatePass(ctx(),invoiceInput(good))).rejects.toThrow("credit limit");
    expect(await db.invoice.count({where:{customerId:good.customer.id}})).toBe(0); expect(await db.salesOrder.count({where:{customerId:good.customer.id}})).toBe(0);
  });
  it("rejects stale roles, removed memberships and expired entitlement at the DB service boundary", async () => {
    const f=await fixture(); await issueGatePass(ctx(),f.gp.id);
    await db.workspaceMember.update({where:{workspaceId_userId:{workspaceId:tenant,userId}},data:{role:"STAFF"}});
    await expect(dispatchGatePass(ctx(),f.gp.id)).rejects.toThrow("permission denied");
    await db.workspaceMember.delete({where:{workspaceId_userId:{workspaceId:tenant,userId}}});
    await expect(createOutboundGatePassDraft(ctx(),f.draft)).rejects.toThrow("permission denied");
    await db.workspaceMember.create({data:{workspaceId:tenant,userId,role:"OWNER"}});
    await db.$executeRaw`UPDATE "workspace_subscriptions" SET "status"='SUSPENDED' WHERE "workspaceId"=${tenant}`;
    await expect(dispatchGatePass(ctx(),f.gp.id)).rejects.toThrow("entitlement");
    await db.$executeRaw`UPDATE "workspace_subscriptions" SET "status"='ACTIVE' WHERE "workspaceId"=${tenant}`;
  });
  it("fails closed for other tenants even with a matching forged environment selector", async () => {
    const f=await fixture(); vi.stubEnv("OUTBOUND_GATE_PASS_V1_WORKSPACE_ID",other);
    await expect(createOutboundGatePassDraft({...ctx(),workspaceId:other},f.draft)).rejects.toThrow();
    await expect(getOutboundGatePass(other,f.gp.id)).rejects.toThrow();
    vi.stubEnv("OUTBOUND_GATE_PASS_V1_WORKSPACE_ID",tenant);
    const foreign=await db.customer.create({data:{workspaceId:other,name:"Synthetic foreign"}});
    await expect(createOutboundGatePassDraft(ctx(),{...f.draft,idempotencyKey:randomUUID(),customerId:foreign.id})).rejects.toThrow();
    await expect(db.outboundGatePass.update({where:{id:f.gp.id},data:{customerId:foreign.id}})).rejects.toThrow();
    await expect(db.outboundGatePass.update({where:{id:f.gp.id},data:{workspaceId:other}})).rejects.toThrow();
    const product=await db.product.create({data:{workspaceId:other,name:"Foreign",sku:randomUUID(),unit:"PIECE"}});
    await expect(db.outboundGatePassItem.update({where:{id:f.gp.items[0]!.id},data:{productId:product.id}})).rejects.toThrow();
    await expect(db.product.update({where:{id:f.productId},data:{workspaceId:other}})).rejects.toThrow();
  });
  it("blocks concurrent parent tenant moves while linking a gate pass", async () => {
    const f = await fixture();
    const customer = await db.customer.create({data:{workspaceId:tenant,name:"Synthetic concurrent buyer"}});
    let release!: () => void;
    let ready!: () => void;
    const hold = new Promise<void>((resolve) => { release = resolve; });
    const locked = new Promise<void>((resolve) => { ready = resolve; });
    const linking = db.$transaction(async (tx) => {
      await tx.outboundGatePass.update({where:{id:f.gp.id},data:{customerId:customer.id}});
      ready();
      await hold;
    });
    await locked;
    try {
      await expect(db.$transaction(async (tx) => {
        await tx.$executeRawUnsafe("SET LOCAL lock_timeout = '200ms'");
        await tx.customer.update({where:{id:customer.id},data:{workspaceId:other}});
      })).rejects.toThrow(/lock timeout/);
    } finally {
      release();
      await linking;
    }
    await expect(db.customer.update({where:{id:customer.id},data:{workspaceId:other}})).rejects.toThrow();
    expect((await db.customer.findUniqueOrThrow({where:{id:customer.id}})).workspaceId).toBe(tenant);
  });
  it("legal approval and FBR enablement gates deny dispatch without stock changes or transmissions", async () => {
    const f=await fixture(); await issueGatePass(ctx(),f.gp.id);
    vi.stubEnv("OUTBOUND_GP_ACCEPTANCE_BILLING_LEGALLY_APPROVED","false"); await expect(dispatchGatePass(ctx(),f.gp.id)).rejects.toThrow("tax/legal");
    vi.stubEnv("OUTBOUND_GP_ACCEPTANCE_BILLING_LEGALLY_APPROVED","true"); vi.stubEnv("OUTBOUND_GP_ACCEPTANCE_BILLING_APPROVAL_REFERENCE",""); await expect(dispatchGatePass(ctx(),f.gp.id)).rejects.toThrow("approval reference");
    vi.stubEnv("OUTBOUND_GP_ACCEPTANCE_BILLING_APPROVAL_REFERENCE","SYNTHETIC-LOCAL-ONLY");
    await db.fbrIntegrationConfig.create({data:{workspaceId:tenant,enabled:true}});
    await expect(dispatchGatePass(ctx(),f.gp.id)).rejects.toThrow("FBR-enabled");
    expect((await db.product.findUniqueOrThrow({where:{id:f.productId}})).stockQuantity.toNumber()).toBe(100);
    expect(await db.fbrInvoiceSubmission.count({where:{workspaceId:tenant}})).toBe(0);
    await db.fbrIntegrationConfig.delete({where:{workspaceId:tenant}});
  });
  it("AHMAD V2: issued GP reserves stock once, cancel restores once, dispatch does not re-deduct", async () => {
    vi.stubEnv("OUTBOUND_GP_ISSUE_STOCK_V2_ENABLED", "true");
    try {
    const f = await fixture();
    const stock = async () => (await db.product.findUniqueOrThrow({ where: { id: f.productId } })).stockQuantity.toNumber();
    expect(await stock()).toBe(100);
    await issueGatePass(ctx(), f.gp.id);
    expect(await stock()).toBe(90);
    await issueGatePass(ctx(), f.gp.id);
    expect(await stock()).toBe(90);
    await dispatchGatePass(ctx(), f.gp.id);
    expect(await stock()).toBe(90);
    await expect(cancelUndispatchedGatePass(ctx(), f.gp.id)).rejects.toThrow();

    const g = await fixture();
    await issueGatePass(ctx(), g.gp.id);
    expect((await db.product.findUniqueOrThrow({ where: { id: g.productId } })).stockQuantity.toNumber()).toBe(90);
    await cancelUndispatchedGatePass(ctx(), g.gp.id);
    await cancelUndispatchedGatePass(ctx(), g.gp.id);
    expect((await db.product.findUniqueOrThrow({ where: { id: g.productId } })).stockQuantity.toNumber()).toBe(100);
    expect(await db.inventoryTransaction.count({ where: { productId: g.productId, type: "GATE_PASS_ISSUE" } })).toBe(1);
    expect(await db.inventoryTransaction.count({ where: { productId: g.productId, type: "GATE_PASS_ISSUE_CANCEL" } })).toBe(1);
    } finally {
      vi.stubEnv("OUTBOUND_GP_ISSUE_STOCK_V2_ENABLED", "false");
    }
  });
  it("keeps an existing draft legacy when V2 is enabled after its creation", async () => {
    const f = await fixture();
    vi.stubEnv("OUTBOUND_GP_ISSUE_STOCK_V2_ENABLED", "true");
    vi.stubEnv("OUTBOUND_GP_ISSUE_STOCK_V2_CUTOVER_AT", "2099-01-01T00:00:00.000Z");
    try {
      await issueGatePass(ctx(), f.gp.id);
      const issued = await db.outboundGatePass.findUniqueOrThrow({ where: { id: f.gp.id } });
      expect(issued.status).toBe("ISSUED");
      expect(issued.issueStockDeductedAt).toBeNull();
      expect((await db.product.findUniqueOrThrow({ where: { id: f.productId } })).stockQuantity.toNumber()).toBe(100);
      expect(await db.inventoryTransaction.count({ where: { productId: f.productId, type: "GATE_PASS_ISSUE" } })).toBe(0);

      // Historical behavior is retained even with the V2 flag ON.
      await dispatchGatePass(ctx(), f.gp.id);
      expect((await db.product.findUniqueOrThrow({ where: { id: f.productId } })).stockQuantity.toNumber()).toBe(90);
      expect(await db.inventoryTransaction.count({ where: { productId: f.productId, type: "GATE_PASS_DISPATCH" } })).toBe(1);
    } finally {
      vi.stubEnv("OUTBOUND_GP_ISSUE_STOCK_V2_ENABLED", "false");
      vi.stubEnv("OUTBOUND_GP_ISSUE_STOCK_V2_CUTOVER_AT", "2000-01-01T00:00:00.000Z");
    }
  });
  it("blocks V2 issue entirely when an activation cutoff is missing", async () => {
    const f = await fixture();
    vi.stubEnv("OUTBOUND_GP_ISSUE_STOCK_V2_ENABLED", "true");
    vi.stubEnv("OUTBOUND_GP_ISSUE_STOCK_V2_CUTOVER_AT", "");
    try {
      await expect(issueGatePass(ctx(), f.gp.id)).rejects.toThrow("valid UTC rollout cutover");
      const gp = await db.outboundGatePass.findUniqueOrThrow({ where: { id: f.gp.id } });
      expect(gp.status).toBe("DRAFT");
      expect(gp.issueStockDeductedAt).toBeNull();
      expect((await db.product.findUniqueOrThrow({ where: { id: f.productId } })).stockQuantity.toNumber()).toBe(100);
    } finally {
      vi.stubEnv("OUTBOUND_GP_ISSUE_STOCK_V2_ENABLED", "false");
      vi.stubEnv("OUTBOUND_GP_ISSUE_STOCK_V2_CUTOVER_AT", "2000-01-01T00:00:00.000Z");
    }
  });
  it("blocks V2 issue atomically when dispatch approval is absent or incomplete", async () => {
    const f = await fixture();
    vi.stubEnv("OUTBOUND_GP_ISSUE_STOCK_V2_ENABLED", "true");
    try {
      vi.stubEnv("OUTBOUND_GP_ACCEPTANCE_BILLING_LEGALLY_APPROVED", "false");
      await expect(issueGatePass(ctx(), f.gp.id)).rejects.toThrow("tax/legal approval");
      vi.stubEnv("OUTBOUND_GP_ACCEPTANCE_BILLING_LEGALLY_APPROVED", "true");
      vi.stubEnv("OUTBOUND_GP_ACCEPTANCE_BILLING_APPROVAL_REFERENCE", "");
      await expect(issueGatePass(ctx(), f.gp.id)).rejects.toThrow("approval reference");
      const gp = await db.outboundGatePass.findUniqueOrThrow({ where: { id: f.gp.id }, include: { items: true } });
      expect(gp.status).toBe("DRAFT");
      expect(gp.issueStockDeductedAt).toBeNull();
      expect(gp.items[0]!.unitPriceSnapshot.toNumber()).toBe(0);
      expect((await db.product.findUniqueOrThrow({ where: { id: f.productId } })).stockQuantity.toNumber()).toBe(100);
      expect(await db.inventoryTransaction.count({ where: { productId: f.productId, type: "GATE_PASS_ISSUE" } })).toBe(0);
    } finally {
      vi.stubEnv("OUTBOUND_GP_ACCEPTANCE_BILLING_LEGALLY_APPROVED", "true");
      vi.stubEnv("OUTBOUND_GP_ACCEPTANCE_BILLING_APPROVAL_REFERENCE", "SYNTHETIC-LOCAL-ONLY");
      vi.stubEnv("OUTBOUND_GP_ISSUE_STOCK_V2_ENABLED", "false");
    }
  });
  it("keeps legacy draft ISSUE behavior unchanged when dispatch approval is absent", async () => {
    const f = await fixture();
    vi.stubEnv("OUTBOUND_GP_ISSUE_STOCK_V2_ENABLED", "false");
    vi.stubEnv("OUTBOUND_GP_ACCEPTANCE_BILLING_LEGALLY_APPROVED", "false");
    try {
      await issueGatePass(ctx(), f.gp.id);
      const gp = await db.outboundGatePass.findUniqueOrThrow({ where: { id: f.gp.id } });
      expect(gp.status).toBe("ISSUED");
      expect(gp.issueStockDeductedAt).toBeNull();
      expect((await db.product.findUniqueOrThrow({ where: { id: f.productId } })).stockQuantity.toNumber()).toBe(100);
      await expect(dispatchGatePass(ctx(), f.gp.id)).rejects.toThrow("tax/legal approval");
      expect(await db.inventoryTransaction.count({ where: { productId: f.productId, type: "GATE_PASS_DISPATCH" } })).toBe(0);
    } finally {
      vi.stubEnv("OUTBOUND_GP_ACCEPTANCE_BILLING_LEGALLY_APPROVED", "true");
    }
  });
  it("blocks V2 issue before stock reservation if this workspace has an incompatible integration", async () => {
    const f = await fixture();
    vi.stubEnv("OUTBOUND_GP_ISSUE_STOCK_V2_ENABLED", "true");
    await db.fbrIntegrationConfig.create({ data: { workspaceId: tenant, enabled: true } });
    try {
      await expect(issueGatePass(ctx(), f.gp.id)).rejects.toThrow("FBR-enabled");
      const gp = await db.outboundGatePass.findUniqueOrThrow({ where: { id: f.gp.id } });
      expect(gp.status).toBe("DRAFT");
      expect(gp.issueStockDeductedAt).toBeNull();
      expect((await db.product.findUniqueOrThrow({ where: { id: f.productId } })).stockQuantity.toNumber()).toBe(100);
      expect(await db.inventoryTransaction.count({ where: { productId: f.productId, type: "GATE_PASS_ISSUE" } })).toBe(0);
    } finally {
      await db.fbrIntegrationConfig.delete({ where: { workspaceId: tenant } });
      vi.stubEnv("OUTBOUND_GP_ISSUE_STOCK_V2_ENABLED", "false");
    }
  });
  it("AHMAD V2: insufficient issue stock rolls back status, snapshots and inventory writes", async () => {
    vi.stubEnv("OUTBOUND_GP_ISSUE_STOCK_V2_ENABLED", "true");
    try {
      const f = await fixture("10", 5);
      await expect(issueGatePass(ctx(), f.gp.id)).rejects.toThrow("Insufficient stock available");
      const gp = await db.outboundGatePass.findUniqueOrThrow({ where: { id: f.gp.id } });
      expect(gp.status).toBe("DRAFT");
      expect(gp.issueStockDeductedAt).toBeNull();
      expect((await db.product.findUniqueOrThrow({ where: { id: f.productId } })).stockQuantity.toNumber()).toBe(5);
      expect(await db.inventoryTransaction.count({ where: { productId: f.productId, type: "GATE_PASS_ISSUE" } })).toBe(0);
    } finally {
      vi.stubEnv("OUTBOUND_GP_ISSUE_STOCK_V2_ENABLED", "false");
    }
  });
  it("AHMAD V2: serializes two issue attempts against last available units", async () => {
    vi.stubEnv("OUTBOUND_GP_ISSUE_STOCK_V2_ENABLED", "true");
    try {
      const f = await fixture("4", 5);
      const g = await createOutboundGatePassDraft(ctx(), { ...f.draft, idempotencyKey: randomUUID() });
      const settled = await Promise.allSettled([issueGatePass(ctx(), f.gp.id), issueGatePass(ctx(), g.id)]);
      expect(settled.filter((entry) => entry.status === "fulfilled")).toHaveLength(1);
      expect((await db.product.findUniqueOrThrow({ where: { id: f.productId } })).stockQuantity.toNumber()).toBe(1);
      expect(await db.inventoryTransaction.count({ where: { productId: f.productId, type: "GATE_PASS_ISSUE" } })).toBe(1);
    } finally {
      vi.stubEnv("OUTBOUND_GP_ISSUE_STOCK_V2_ENABLED", "false");
    }
  });
  it("AHMAD V2: freezes BOM components at issue and reverses parent and components exactly once", async () => {
    vi.stubEnv("OUTBOUND_GP_ISSUE_STOCK_V2_ENABLED", "true");
    try {
      const f = await fixture("10", 100);
      const componentId = await createProduct(ctx(), {
        name: "Synthetic V2 component", sku: randomUUID(), category: "QA",
        costPrice: 10, sellingPrice: 25, stockQuantity: 100, reorderLevel: 0,
        unit: "PIECE", status: "ACTIVE", description: "",
      });
      const [bom] = await db.$queryRaw<Array<{ id: string }>>`
        INSERT INTO "customer_sales_boms" ("workspaceId","customerId","productId","productCode")
        VALUES (${tenant}::uuid,${f.customer.id}::uuid,${f.productId}::uuid,'SYNTHETIC-V2-BOM')
        RETURNING "id"::text AS "id"
      `;
      await db.$executeRaw`
        INSERT INTO "customer_sales_bom_items" ("customerSalesBomId","componentProductId","quantityPerUnit")
        VALUES (${bom!.id}::uuid,${componentId}::uuid,2)
      `;
      await issueGatePass(ctx(), f.gp.id);
      const issued = await db.outboundGatePass.findUniqueOrThrow({ where: { id: f.gp.id }, include: { items: true } });
      expect(issued.issueStockDeductedAt).not.toBeNull();
      expect(issued.items[0]!.bomComponentsSnapshot).toMatchObject({ version: 1, components: [{ productId: componentId }] });
      await expect(db.outboundGatePassItem.update({
        where: { id: issued.items[0]!.id }, data: { unitCostSnapshot: 999 },
      })).rejects.toThrow();
      await expect(db.outboundGatePassItem.update({
        where: { id: issued.items[0]!.id }, data: { bomComponentsSnapshot: { version: 1, components: [] } },
      })).rejects.toThrow();
      expect((await db.product.findUniqueOrThrow({ where: { id: f.productId } })).stockQuantity.toNumber()).toBe(90);
      expect((await db.product.findUniqueOrThrow({ where: { id: componentId } })).stockQuantity.toNumber()).toBe(80);
      await cancelUndispatchedGatePass(ctx(), f.gp.id);
      await cancelUndispatchedGatePass(ctx(), f.gp.id);
      expect((await db.product.findUniqueOrThrow({ where: { id: f.productId } })).stockQuantity.toNumber()).toBe(100);
      expect((await db.product.findUniqueOrThrow({ where: { id: componentId } })).stockQuantity.toNumber()).toBe(100);
      expect(await db.inventoryTransaction.count({ where: { productId: componentId, type: "GATE_PASS_ISSUE_CANCEL" } })).toBe(1);
    } finally {
      vi.stubEnv("OUTBOUND_GP_ISSUE_STOCK_V2_ENABLED", "false");
    }
  });
  it("AHMAD V2: cancel restores reserved stock using historical cost when WAC changed", async () => {
    vi.stubEnv("OUTBOUND_GP_ISSUE_STOCK_V2_ENABLED", "true");
    try {
      const f = await fixture("10", 100);
      await issueGatePass(ctx(), f.gp.id);
      expect((await db.product.findUniqueOrThrow({ where: { id: f.productId } })).stockQuantity.toNumber()).toBe(90);
      // Simulate an independent cost change after stock reservation.
      await db.product.update({ where: { id: f.productId }, data: { costPrice: new Prisma.Decimal("55.00") } });
      await cancelUndispatchedGatePass(ctx(), f.gp.id);
      const restored = await db.product.findUniqueOrThrow({ where: { id: f.productId } });
      expect(restored.stockQuantity.toNumber()).toBe(100);
      expect(restored.costPrice.toNumber()).toBe(54.5); // 90*55 + 10*50 = 100*54.5
      // Reset the isolated synthetic fixture's direct cost change so the
      // independent full inventory/GL reconciliation test remains meaningful.
      await db.product.update({ where: { id: f.productId }, data: { costPrice: new Prisma.Decimal("50.00") } });
    } finally {
      vi.stubEnv("OUTBOUND_GP_ISSUE_STOCK_V2_ENABLED", "false");
    }
  });
  it("restores issued Gate Pass reserved stock once on pre-dispatch cancellation", async () => {
    const f=await fixture(); await issueGatePass(ctx(),f.gp.id); await cancelUndispatchedGatePass(ctx(),f.gp.id); await cancelUndispatchedGatePass(ctx(),f.gp.id);
    await expect(dispatchGatePass(ctx(),f.gp.id)).rejects.toThrow();
    expect((await db.product.findUniqueOrThrow({where:{id:f.productId}})).stockQuantity.toNumber()).toBe(100);
  });
  it.each(["new","pending-invoices","in-transit"])("reproduces the invalid %s/print URL as an authenticated HTTP404", async (id) => {
    const {default:Print}=await import("@/app/(dashboard)/gate-passes/[id]/print/page");
    await expect(Print({params:Promise.resolve({id})})).rejects.toMatchObject({digest:"NEXT_HTTP_ERROR_FALLBACK;404"});
  });
  it("renders issued independent print and accepted-only pending invoices before final invoicing", async () => {
    const f=await fixture();
    const {default:Print}=await import("@/app/(dashboard)/gate-passes/[id]/print/page");
    await expect(Print({params:Promise.resolve({id:f.gp.id})})).rejects.toThrow();
    await issueGatePass(ctx(),f.gp.id);
    const printed=renderToStaticMarkup(await Print({params:Promise.resolve({id:f.gp.id})}));
    expect(printed).toContain(f.gp.gatePassNumber); expect(printed).toContain("Receiver signature"); expect(printed).not.toContain("INV-");
    await dispatchGatePass(ctx(),f.gp.id);
    await recordGatePassReceiving(ctx(),{gatePassId:f.gp.id,reference:"QA",recipient:"QA",lines:[{itemId:f.gp.items[0]!.id,accepted:"8",rejected:"2"}]});
    const {default:Pending}=await import("@/app/(dashboard)/gate-passes/pending-invoices/page");
    expect(renderToStaticMarkup(await Pending())).toContain(f.gp.gatePassNumber);
    await invoiceAcceptedGatePass(ctx(),invoiceInput(f));
    expect(renderToStaticMarkup(await Pending())).not.toContain(f.gp.gatePassNumber);
    const invoice=await db.outboundGatePass.findUniqueOrThrow({where:{id:f.gp.id}});
    const {default:Invoice}=await import("@/app/(dashboard)/invoices/[id]/page");
    const document=renderToStaticMarkup(await Invoice({params:Promise.resolve({id:invoice.invoiceId!})}));
    expect(document).toContain("Original Gate Pass:"); expect(document).toContain(f.gp.gatePassNumber);
    expect(document).toContain("Print invoice"); expect(document).toContain("80mm receipt");
    const foreign=await db.customer.create({data:{workspaceId:tenant,name:"Different synthetic buyer"}});
    await expect(db.invoice.update({where:{id:invoice.invoiceId!},data:{customerId:foreign.id}})).rejects.toThrow();
  });
  it("renders 24 long dispatch lines and mixed units without a misleading total or an invoice", async () => {
    const customer = await db.customer.create({ data: { workspaceId: tenant, name: "Synthetic print-receiving customer" } });
    const lines: Array<{ productId: string; quantity: string }> = [];
    const expectedNames: string[] = [];
    for (let index = 0; index < 24; index++) {
      const name = `Synthetic long industrial component description ${index + 1} for Gate Pass printer page-break certification`;
      const productId = await createProduct(ctx(), {
        name, sku: randomUUID(), category: "QA", costPrice: 50, sellingPrice: 200,
        stockQuantity: 100, reorderLevel: 0, unit: index % 2 === 0 ? "PIECE" : "KG",
        status: "ACTIVE", description: "",
      });
      expectedNames.push(name);
      lines.push({ productId, quantity: "1.2500" });
    }
    const draft = await createOutboundGatePassDraft(ctx(), {
      customerId: customer.id, warehouseId: "", date: "2026-10-11",
      deliveryAddress: "Synthetic long dispatch print address", notes: "Synthetic QA only",
      idempotencyKey: randomUUID(), items: lines,
    });
    await issueGatePass(ctx(), draft.id);
    const { default: Print } = await import("@/app/(dashboard)/gate-passes/[id]/print/page");
    const rendered = renderToStaticMarkup(await Print({ params: Promise.resolve({ id: draft.id }) }));
    expect(rendered).toContain("data-gate-pass-print");
    expect(rendered).toContain("data-gatepass-items");
    expect(rendered).toContain("Print A4 Gate Pass");
    expect(rendered).toContain("Print 80mm Copy");
    expect(rendered).toContain("Mixed units");
    expect(rendered).toContain("Receiver signature");
    for (const name of expectedNames) expect(rendered).toContain(name);
    expect(rendered).not.toContain("Invoice:");
    expect(rendered).not.toContain("Rs 200");
    expect(await db.invoice.count({ where: { customerId: customer.id } })).toBe(0);
    expect(await db.salesOrder.count({ where: { customerId: customer.id } })).toBe(0);
  });
  it("serializes different dispatches competing for last stock", async () => {
    const f=await fixture("4",5);
    const second=await createOutboundGatePassDraft(ctx(),{...f.draft,idempotencyKey:randomUUID()});
    await issueGatePass(ctx(),f.gp.id); await issueGatePass(ctx(),second.id);
    const attempts=await Promise.allSettled([dispatchGatePass(ctx(),f.gp.id),dispatchGatePass(ctx(),second.id)]);
    expect(attempts.filter(x=>x.status==="fulfilled")).toHaveLength(1);
    expect((await db.product.findUniqueOrThrow({where:{id:f.productId}})).stockQuantity.toNumber()).toBe(1);
    expect(await db.inventoryTransaction.count({where:{productId:f.productId,type:"GATE_PASS_DISPATCH"}})).toBe(1);
  });
  it("AHMAD V2: issuing and cancelling a managed-warehouse GP reverses original warehouse stock once", async () => {
    const warehouseId = randomUUID();
    await db.$executeRaw`UPDATE "warehouses" SET "isDefault"=false WHERE "workspaceId"=${tenant}::uuid AND "name"='Synthetic GP warehouse'`;
    await db.$executeRaw`INSERT INTO "warehouses" ("id","workspaceId","name","code","isDefault") VALUES (${warehouseId}::uuid,${tenant}::uuid,'Synthetic GP warehouse',${randomUUID()},true)`;
    await db.$executeRaw`INSERT INTO "workspace_modules" ("workspaceId","moduleKey","enabled","config") VALUES (${tenant}::uuid,'inventory',true,'{"warehouseStockMode":"MANAGED"}'::jsonb)
      ON CONFLICT ("workspaceId","moduleKey") DO UPDATE SET "enabled"=true,"config"='{"warehouseStockMode":"MANAGED"}'::jsonb`;
    vi.stubEnv("OUTBOUND_GP_ISSUE_STOCK_V2_ENABLED", "true");
    try {
      const f = await fixture("10", 100, warehouseId);
      const warehouse = async () => db.$queryRaw<Array<{quantity:Prisma.Decimal}>>`SELECT "quantity" FROM "warehouse_stocks" WHERE "workspaceId"=${tenant}::uuid AND "warehouseId"=${warehouseId}::uuid AND "productId"=${f.productId}::uuid`;
      expect((await warehouse())[0]!.quantity.toNumber()).toBe(100);
      await issueGatePass(ctx(), f.gp.id);
      await issueGatePass(ctx(), f.gp.id);
      expect((await warehouse())[0]!.quantity.toNumber()).toBe(90);
      expect((await db.product.findUniqueOrThrow({where:{id:f.productId}})).stockQuantity.toNumber()).toBe(90);
      await cancelUndispatchedGatePass(ctx(), f.gp.id);
      await cancelUndispatchedGatePass(ctx(), f.gp.id);
      expect((await warehouse())[0]!.quantity.toNumber()).toBe(100);
      expect((await db.product.findUniqueOrThrow({where:{id:f.productId}})).stockQuantity.toNumber()).toBe(100);
    } finally {
      vi.stubEnv("OUTBOUND_GP_ISSUE_STOCK_V2_ENABLED", "false");
      await db.$executeRaw`UPDATE "workspace_modules" SET "enabled"=false WHERE "workspaceId"=${tenant}::uuid AND "moduleKey"='inventory'`;
      await db.$executeRaw`UPDATE "warehouses" SET "isDefault"=false,"isActive"=false WHERE "id"=${warehouseId}::uuid AND "workspaceId"=${tenant}::uuid`;
    }
  });
  it("deducts managed warehouse and core stock once and restores rejection in the same warehouse", async () => {
    const warehouseId=randomUUID();
    await db.$executeRaw`UPDATE "warehouses" SET "isDefault"=false WHERE "workspaceId"=${tenant}::uuid AND "name"='Synthetic GP warehouse'`;
    await db.$executeRaw`INSERT INTO "warehouses" ("id","workspaceId","name","code","isDefault") VALUES (${warehouseId}::uuid,${tenant}::uuid,'Synthetic GP warehouse',${randomUUID()},true)`;
    await db.$executeRaw`INSERT INTO "workspace_modules" ("workspaceId","moduleKey","enabled","config") VALUES (${tenant}::uuid,'inventory',true,'{"warehouseStockMode":"MANAGED"}'::jsonb) ON CONFLICT ("workspaceId","moduleKey") DO UPDATE SET "enabled"=true,"config"='{"warehouseStockMode":"MANAGED"}'::jsonb`;
    try {
      const f=await fixture("10",100,warehouseId); await accepted(f);
      const stock=()=>db.$queryRaw<Array<{quantity:Prisma.Decimal}>>`SELECT "quantity" FROM "warehouse_stocks" WHERE "workspaceId"=${tenant}::uuid AND "warehouseId"=${warehouseId}::uuid AND "productId"=${f.productId}::uuid`;
      expect((await stock())[0]!.quantity.toNumber()).toBe(90);
      await invoiceAcceptedGatePass(ctx(),invoiceInput(f));
      expect((await stock())[0]!.quantity.toNumber()).toBe(90);
      await confirmRejectedStockReturn(ctx(),{gatePassId:f.gp.id,lines:[{itemId:f.gp.items[0]!.id,returned:"2"}]});
      expect((await stock())[0]!.quantity.toNumber()).toBe(92);
      expect((await db.product.findUniqueOrThrow({where:{id:f.productId}})).stockQuantity.toNumber()).toBe(92);
    } finally {
      await db.$executeRaw`UPDATE "workspace_modules" SET "enabled"=false WHERE "workspaceId"=${tenant}::uuid AND "moduleKey"='inventory'`;
      await db.$executeRaw`UPDATE "warehouses" SET "isDefault"=false,"isActive"=false WHERE "id"=${warehouseId}::uuid AND "workspaceId"=${tenant}::uuid`;
    }
  });
  it("ships and invoices customer BOM assemblies exactly once using immutable component snapshots", async () => {
    const f = await fixture("10", 100);
    const componentId = await createProduct(ctx(), {
      name: "Synthetic assembly bolt", sku: randomUUID(), category: "QA",
      costPrice: 10, sellingPrice: 25, stockQuantity: 100, reorderLevel: 0,
      unit: "PIECE", status: "ACTIVE", description: "",
    });
    const [bom] = await db.$queryRaw<Array<{ id: string }>>`
      INSERT INTO "customer_sales_boms" ("workspaceId","customerId","productId","productCode")
      VALUES (${tenant}::uuid,${f.customer.id}::uuid,${f.productId}::uuid,'SYNTHETIC-BOM')
      RETURNING "id"::text AS "id"
    `;
    await db.$executeRaw`
      INSERT INTO "customer_sales_bom_items" ("customerSalesBomId","componentProductId","quantityPerUnit")
      VALUES (${bom!.id}::uuid,${componentId}::uuid,2)
    `;
    await issueGatePass(ctx(), f.gp.id);
    vi.stubEnv("OUTBOUND_GATE_PASS_BOM_DISPATCH_ENABLED", "false");
    await expect(dispatchGatePass(ctx(), f.gp.id)).rejects.toThrow("certified BOM stock adapter");
    expect((await db.product.findUniqueOrThrow({ where: { id: componentId } })).stockQuantity.toNumber()).toBe(100);
    vi.stubEnv("OUTBOUND_GATE_PASS_BOM_DISPATCH_ENABLED", "true");
    const attempts = await Promise.allSettled([dispatchGatePass(ctx(), f.gp.id), dispatchGatePass(ctx(), f.gp.id)]);
    expect(attempts.filter((entry) => entry.status === "fulfilled")).toHaveLength(1);
    expect((await db.product.findUniqueOrThrow({ where: { id: f.productId } })).stockQuantity.toNumber()).toBe(90);
    expect((await db.product.findUniqueOrThrow({ where: { id: componentId } })).stockQuantity.toNumber()).toBe(80);
    const gp = await db.outboundGatePass.findUniqueOrThrow({ where: { id: f.gp.id }, include: { items: true } });
    expect(gp.items[0]!.unitCostSnapshot.toNumber()).toBe(70);
    expect(gp.items[0]!.bomComponentsSnapshot).toMatchObject({
      version: 1, components: [{ productId: componentId, quantityPerUnit: "2", unitCost: "10" }],
    });
    // Historical component structure/cost is enforced by the database too,
    // not just a client-side convention.
    await expect(db.outboundGatePassItem.update({
      where: { id: gp.items[0]!.id },
      data: { bomComponentsSnapshot: { version: 1, components: [] } },
    })).rejects.toThrow();
    expect((await db.outboundGatePassItem.findUniqueOrThrow({
      where: { id: gp.items[0]!.id },
    })).bomComponentsSnapshot).toEqual(gp.items[0]!.bomComponentsSnapshot);
    await expect(db.outboundGatePassItem.update({
      where: { id: gp.items[0]!.id },
      data: { unitCostSnapshot: 999 },
    })).rejects.toThrow();
    expect((await db.outboundGatePassItem.findUniqueOrThrow({
      where: { id: gp.items[0]!.id },
    })).unitCostSnapshot.toNumber()).toBe(70);
    // Mutation of the customer's active BOM after dispatch MUST NOT change
    // the components or cost carried by the original physical shipment.
    await db.$executeRaw`
      UPDATE "customer_sales_bom_items" SET "quantityPerUnit"=5
      WHERE "customerSalesBomId"=${bom!.id}::uuid
    `;
    await db.product.update({ where: { id: componentId }, data: { costPrice: 11 } });
    await recordGatePassReceiving(ctx(), {
      gatePassId: f.gp.id, reference: "BOM-RECEIVER-001", recipient: "Customer receiving",
      lines: [{ itemId: f.gp.items[0]!.id, accepted: "8", rejected: "2" }],
    });
    const issued = await invoiceAcceptedGatePass(ctx(), invoiceInput(f));
    const replay = await invoiceAcceptedGatePass(ctx(), invoiceInput(f));
    expect(issued.id).toBe(replay.id);
    const sale = await db.invoice.findUniqueOrThrow({ where: { id: issued.id } });
    const rows = await db.$queryRaw<Array<{ quantityPerUnit: Prisma.Decimal; soldQuantity: Prisma.Decimal; unitCost: Prisma.Decimal; totalQuantityConsumed: Prisma.Decimal }>>`
      SELECT "quantityPerUnit","soldQuantity","unitCost","totalQuantityConsumed"
      FROM "sales_order_component_snapshots" WHERE "salesOrderId"=${sale.salesOrderId}::uuid
    `;
    expect(rows).toHaveLength(1);
    expect(rows[0]!.quantityPerUnit.toNumber()).toBe(2);
    expect(rows[0]!.soldQuantity.toNumber()).toBe(8);
    expect(rows[0]!.totalQuantityConsumed.toNumber()).toBe(16);
    expect(rows[0]!.unitCost.toNumber()).toBe(10);
    // Return the synthetic component's current unit cost to its original value.
    // The preceding mutation proved invoice snapshots are immutable, but an
    // unrelated direct product repricing must not contaminate the global
    // stock-vs-GL reconciliation acceptance test.
    await db.product.update({ where: { id: componentId }, data: { costPrice: 10 } });
    const gl = await db.generalLedgerEntry.findMany({ where: { sourceId: sale.salesOrderId! } });
    expect(gl.filter((row) => row.debit.eq(560))).toHaveLength(1);
    const countComponents = await db.inventoryTransaction.count({
      where: { workspaceId: tenant, productId: componentId, type: "GATE_PASS_DISPATCH", reference: `BOM:${gp.gatePassNumber}` },
    });
    expect(countComponents).toBe(1);
    await Promise.all([
      confirmRejectedStockReturn(ctx(), { gatePassId: f.gp.id, lines: [{ itemId: f.gp.items[0]!.id, returned: "2" }] }),
      confirmRejectedStockReturn(ctx(), { gatePassId: f.gp.id, lines: [{ itemId: f.gp.items[0]!.id, returned: "2" }] }),
    ]);
    const parent = await db.product.findUniqueOrThrow({ where: { id: f.productId } });
    expect(parent.stockQuantity.toNumber()).toBe(92);
    expect(parent.costPrice.toNumber()).toBe(50.43);
    expect((await db.product.findUniqueOrThrow({ where: { id: componentId } })).stockQuantity.toNumber()).toBe(80);
    expect(await db.inventoryTransaction.count({ where: { productId: componentId, type: "GATE_PASS_RETURN" } })).toBe(0);
    expect(await db.inventoryTransaction.count({
      where: { productId: f.productId, type: "GATE_PASS_RETURN", reference: gp.gatePassNumber },
    })).toBe(1);
    const adjustments = await db.generalLedgerEntry.findMany({
      where: { sourceId: gp.id, documentNo: { startsWith: `${gp.gatePassNumber}-BOM-WAC-` } },
    });
    expect(adjustments).toHaveLength(2);
    expect(adjustments.reduce((sum, row) => sum.plus(row.debit).minus(row.credit), new Prisma.Decimal(0)).isZero()).toBe(true);
  });

  it("rolls back assemblies when a component cannot cover required dispatch stock", async () => {
    const f = await fixture("10", 100);
    const componentId = await createProduct(ctx(), {
      name: "Insufficient synthetic component", sku: randomUUID(), category: "QA",
      costPrice: 10, sellingPrice: 25, stockQuantity: 2, reorderLevel: 0,
      unit: "PIECE", status: "ACTIVE", description: "",
    });
    const [bom] = await db.$queryRaw<Array<{ id: string }>>`
      INSERT INTO "customer_sales_boms" ("workspaceId","customerId","productId","productCode")
      VALUES (${tenant}::uuid,${f.customer.id}::uuid,${f.productId}::uuid,'SYNTHETIC-INSUFFICIENT')
      RETURNING "id"::text AS "id"
    `;
    await db.$executeRaw`
      INSERT INTO "customer_sales_bom_items" ("customerSalesBomId","componentProductId","quantityPerUnit")
      VALUES (${bom!.id}::uuid,${componentId}::uuid,2)
    `;
    await issueGatePass(ctx(), f.gp.id);
    await expect(dispatchGatePass(ctx(), f.gp.id)).rejects.toThrow("Insufficient component stock");
    expect((await db.outboundGatePass.findUniqueOrThrow({ where: { id: f.gp.id } })).status).toBe("ISSUED");
    expect((await db.product.findUniqueOrThrow({ where: { id: f.productId } })).stockQuantity.toNumber()).toBe(100);
    expect((await db.product.findUniqueOrThrow({ where: { id: componentId } })).stockQuantity.toNumber()).toBe(2);
    expect(await db.inventoryTransaction.count({ where: { productId: componentId, type: "GATE_PASS_DISPATCH" } })).toBe(0);
    const { default: Detail } = await import("@/app/(dashboard)/gate-passes/[id]/page");
    const shown = renderToStaticMarkup(await Detail({ params: Promise.resolve({ id: f.gp.id }) }));
    expect(shown).toContain("Insufficient dispatch stock");
    expect(shown).toContain("Insufficient synthetic component");
    expect(shown).toContain("required 20");
    expect(shown).toContain("available 2");
    expect(shown).not.toContain("Confirm Dispatch");
  });
  it("rejects an unrepresentable fractional BOM acceptance without changing receiving or invoice records", async () => {
    const f = await fixture("1", 100);
    const componentId = await createProduct(ctx(), {
      name: "Synthetic precision component", sku: randomUUID(), category: "QA",
      costPrice: 12, sellingPrice: 15, stockQuantity: 100,
      reorderLevel: 0, unit: "KG", status: "ACTIVE", description: "",
    });
    const [bom] = await db.$queryRaw<Array<{ id: string }>>`
      INSERT INTO "customer_sales_boms" ("workspaceId","customerId","productId","productCode")
      VALUES (${tenant}::uuid,${f.customer.id}::uuid,${f.productId}::uuid,'SYNTHETIC-PRECISION')
      RETURNING "id"::text AS "id"
    `;
    await db.$executeRaw`
      INSERT INTO "customer_sales_bom_items" ("customerSalesBomId","componentProductId","quantityPerUnit")
      VALUES (${bom!.id}::uuid,${componentId}::uuid,0.25)
    `;
    await issueGatePass(ctx(), f.gp.id);
    await dispatchGatePass(ctx(), f.gp.id);
    const itemId = f.gp.items[0]!.id;
    const impossible = {
      gatePassId: f.gp.id, reference: "PRECISION-SIGNED-001", recipient: "Receiving QA",
      lines: [{ itemId, accepted: "0.0001", rejected: "0.9999" }],
    };
    await expect(recordGatePassReceiving(ctx(), impossible))
      .rejects.toThrow("cannot be represented exactly");
    const unchanged = await db.outboundGatePass.findUniqueOrThrow({ where: { id: f.gp.id }, include: { items: true } });
    expect(unchanged.status).toBe("IN_TRANSIT");
    expect(unchanged.receivingAt).toBeNull();
    expect(unchanged.items[0]!.acceptedQuantity.isZero()).toBe(true);
    expect(await db.invoice.count({ where: { customerId: f.customer.id } })).toBe(0);
    expect((await db.product.findUniqueOrThrow({ where: { id: componentId } })).stockQuantity.toNumber()).toBe(99.75);
    await recordGatePassReceiving(ctx(), { ...impossible,
      lines: [{ itemId, accepted: "1", rejected: "0" }],
    });
    const final = await db.outboundGatePass.findUniqueOrThrow({ where: { id: f.gp.id } });
    expect(final.status).toBe("ACCEPTED");
  });
  it("handles fractional BOM components in a managed warehouse with balanced returns", async () => {
    const warehouseId = randomUUID();
    await db.$executeRaw`UPDATE "warehouses" SET "isDefault"=false WHERE "workspaceId"=${tenant}::uuid AND "isDefault"=true`;
    await db.$executeRaw`
      INSERT INTO "warehouses" ("id","workspaceId","name","code","isDefault")
      VALUES (${warehouseId}::uuid,${tenant}::uuid,'Synthetic BOM fractional warehouse',${randomUUID()},true)
    `;
    await db.$executeRaw`
      INSERT INTO "workspace_modules" ("workspaceId","moduleKey","enabled","config")
      VALUES (${tenant}::uuid,'inventory',true,'{"warehouseStockMode":"MANAGED"}'::jsonb)
      ON CONFLICT ("workspaceId","moduleKey") DO UPDATE SET "enabled"=true,"config"='{"warehouseStockMode":"MANAGED"}'::jsonb
    `;
    try {
      const f = await fixture("4", 100, warehouseId);
      const componentId = await createProduct(ctx(), {
        name: "Synthetic fractional accessory", sku: randomUUID(), category: "QA",
        costPrice: 12, sellingPrice: 25, stockQuantity: 100, reorderLevel: 0,
        unit: "KG", status: "ACTIVE", description: "",
      });
      const [bom] = await db.$queryRaw<Array<{ id: string }>>`
        INSERT INTO "customer_sales_boms" ("workspaceId","customerId","productId","productCode")
        VALUES (${tenant}::uuid,${f.customer.id}::uuid,${f.productId}::uuid,'SYNTHETIC-FRACTIONAL')
        RETURNING "id"::text AS "id"
      `;
      await db.$executeRaw`
        INSERT INTO "customer_sales_bom_items" ("customerSalesBomId","componentProductId","quantityPerUnit")
        VALUES (${bom!.id}::uuid,${componentId}::uuid,0.25)
      `;
      await issueGatePass(ctx(), f.gp.id);
      await dispatchGatePass(ctx(), f.gp.id);
      const warehouseQty = async (id: string) => db.$queryRaw<Array<{ quantity: Prisma.Decimal }>>`
        SELECT "quantity" FROM "warehouse_stocks"
        WHERE "workspaceId"=${tenant}::uuid AND "warehouseId"=${warehouseId}::uuid AND "productId"=${id}::uuid
      `;
      expect((await warehouseQty(f.productId))[0]!.quantity.toNumber()).toBe(96);
      expect((await warehouseQty(componentId))[0]!.quantity.toNumber()).toBe(99);
      const gp = await db.outboundGatePass.findUniqueOrThrow({ where: { id: f.gp.id }, include: { items: true } });
      expect(gp.items[0]!.unitCostSnapshot.toNumber()).toBe(53);
      await recordGatePassReceiving(ctx(), {
        gatePassId: f.gp.id, reference: "SYNTHETIC-FRACTIONAL-RECEIVING",
        recipient: "Warehouse receiver", lines: [{ itemId: f.gp.items[0]!.id, accepted: "3", rejected: "1" }],
      });
      await invoiceAcceptedGatePass(ctx(), invoiceInput(f));
      await confirmRejectedStockReturn(ctx(), {
        gatePassId: f.gp.id, lines: [{ itemId: f.gp.items[0]!.id, returned: "1" }],
      });
      expect((await warehouseQty(f.productId))[0]!.quantity.toNumber()).toBe(97);
      expect((await warehouseQty(componentId))[0]!.quantity.toNumber()).toBe(99);
      expect((await db.product.findUniqueOrThrow({ where: { id: componentId } })).stockQuantity.toNumber()).toBe(99);
      const linked = await db.$queryRaw<Array<{ totalQuantityConsumed: Prisma.Decimal }>>`
        SELECT s."totalQuantityConsumed" FROM "sales_order_component_snapshots" s
        JOIN "outbound_gate_passes" gp ON gp."salesOrderId"=s."salesOrderId"::text
        WHERE gp."id"=${f.gp.id}
      `;
      expect(linked).toHaveLength(1);
      expect(linked[0]!.totalQuantityConsumed.toNumber()).toBe(0.75);
    } finally {
      await db.$executeRaw`UPDATE "workspace_modules" SET "enabled"=false WHERE "workspaceId"=${tenant}::uuid AND "moduleKey"='inventory'`;
      await db.$executeRaw`UPDATE "warehouses" SET "isDefault"=false,"isActive"=false WHERE "id"=${warehouseId}::uuid AND "workspaceId"=${tenant}::uuid`;
    }
  });
  it.each(["before", "after"])("reconciles fractional assembly return %s invoice to the exact cent", async (timing) => {
    const f = await fixture("1");
    const componentId = await createProduct(ctx(),{name:"Synthetic cent-rounding component",sku:randomUUID(),category:"QA",costPrice:0.02,sellingPrice:1,stockQuantity:100,reorderLevel:0,unit:"KG",status:"ACTIVE",description:""});
    const secondId = await createProduct(ctx(),{name:"Synthetic second cent-rounding assembly",sku:randomUUID(),category:"QA",costPrice:50,sellingPrice:200,stockQuantity:100,reorderLevel:0,unit:"PIECE",status:"ACTIVE",description:""});
    await updateOutboundGatePassDraft(ctx(),{...f.draft,gatePassId:f.gp.id,version:0,items:[{productId:f.productId,quantity:"1"},{productId:secondId,quantity:"1"}]});
    for (const productId of [f.productId,secondId]) {
      const [bom] = await db.$queryRaw<Array<{id:string}>>`INSERT INTO customer_sales_boms ("workspaceId","customerId","productId","productCode") VALUES (${tenant}::uuid,${f.customer.id}::uuid,${productId}::uuid,${"SYNTHETIC-CENTS-"+productId}) RETURNING id::text`;
      await db.$executeRaw`INSERT INTO customer_sales_bom_items ("customerSalesBomId","componentProductId","quantityPerUnit") VALUES (${bom!.id}::uuid,${componentId}::uuid,0.5)`;
    }
    await issueGatePass(ctx(),f.gp.id); await dispatchGatePass(ctx(),f.gp.id);
    f.gp = await db.outboundGatePass.findUniqueOrThrow({where:{id:f.gp.id},include:{items:true}});
    await recordGatePassReceiving(ctx(),{gatePassId:f.gp.id,reference:"SYNTHETIC-CENTS",recipient:"Synthetic receiver",lines:f.gp.items.map(i=>({itemId:i.id,accepted:"0.5",rejected:"0.5"}))});
    const returned={gatePassId:f.gp.id,lines:f.gp.items.map(i=>({itemId:i.id,returned:"0.5"}))};
    if (timing === "before") await confirmRejectedStockReturn(ctx(),returned);
    const invoice = await invoiceAcceptedGatePass(ctx(),{gatePassId:f.gp.id,complianceAcknowledged:true,lines:f.gp.items.map(i=>({itemId:i.id,unitPrice:"200",taxRate:18}))});
    const pass = await getOutboundGatePass(tenant,f.gp.id);
    const transit=pass!.items.reduce((sum,item)=>sum.plus(ownedTransitInventory({dispatched:item.dispatchedQuantity,accepted:item.acceptedQuantity,rejected:item.rejectedQuantity,returned:item.returnedQuantity,status:pass!.status,unitCost:item.unitCostSnapshot}).value),new Prisma.Decimal(0));
    const sale = await db.invoice.findUniqueOrThrow({where:{id:invoice.id}});
    const stockValue = async () => (await db.product.findMany({where:{id:{in:[f.productId,secondId,componentId]}}})).reduce((sum,p)=>sum.plus(p.stockQuantity.mul(p.costPrice).toDecimalPlaces(2)),new Prisma.Decimal(0));
    const ledgerValue = async () => {const rows=await db.generalLedgerEntry.findMany({where:{workspaceId:tenant,sourceId:{in:[f.productId,secondId,componentId,f.gp.id,sale.salesOrderId!]},account:{systemCode:"INVENTORY"}}});return rows.reduce((sum,e)=>sum.plus(e.debit).minus(e.credit),new Prisma.Decimal(0));};
    expect((await stockValue()).plus(transit).toFixed(2)).toBe((await ledgerValue()).toFixed(2));
    if (timing === "after") await confirmRejectedStockReturn(ctx(),returned);
    await confirmRejectedStockReturn(ctx(),returned);
    expect((await stockValue()).toFixed(2)).toBe((await ledgerValue()).toFixed(2));
    expect((await db.product.findUniqueOrThrow({where:{id:componentId}})).stockQuantity.toString()).toBe("99");
    expect((await db.customer.findUniqueOrThrow({where:{id:f.customer.id}})).currentBalance.toString()).toBe("236");
  });
  it("reconciles owned inventory including transit to the inventory GL asset", async () => {
    const products=await db.product.findMany({where:{workspaceId:tenant}});
    const stock=products.reduce((n,p)=>n.plus(p.stockQuantity.mul(p.costPrice)),new Prisma.Decimal(0));
    const passes=await db.outboundGatePass.findMany({where:{workspaceId:tenant,OR:[{status:{in:["IN_TRANSIT","RECEIVING_PENDING","ACCEPTED","PARTIALLY_ACCEPTED","REJECTED","INVOICED"]}},{status:"ISSUED",issueStockDeductedAt:{not:null}}]},include:{items:true}});
    const transit=passes.reduce((n,gp)=>gp.items.reduce((s,item)=>s.plus(ownedTransitInventory({dispatched:item.dispatchedQuantity,accepted:item.acceptedQuantity,rejected:item.rejectedQuantity,returned:item.returnedQuantity,status:gp.status,unitCost:item.unitCostSnapshot}).value),n),new Prisma.Decimal(0));
    const ledger=await db.generalLedgerEntry.aggregate({where:{workspaceId:tenant,account:{systemCode:"INVENTORY"}},_sum:{debit:true,credit:true}});
    expect(stock.plus(transit).toNumber()).toBe(new Prisma.Decimal(ledger._sum.debit??0).minus(ledger._sum.credit??0).toNumber());
    const all=await db.generalLedgerEntry.aggregate({where:{workspaceId:tenant},_sum:{debit:true,credit:true}});
    expect(new Prisma.Decimal(all._sum.debit??0).minus(all._sum.credit??0).toNumber()).toBe(0);
  });
  it("serializes two accepted invoices against the same customer's credit limit", async () => {
    const f=await fixture("1");
    const second=await createOutboundGatePassDraft(ctx(),{...f.draft,idempotencyKey:randomUUID()});
    await accepted(f,"1","0"); await issueGatePass(ctx(),second.id); await dispatchGatePass(ctx(),second.id);
    const next=await db.outboundGatePass.findUniqueOrThrow({where:{id:second.id},include:{items:true}});
    await recordGatePassReceiving(ctx(),{gatePassId:next.id,reference:"QA",recipient:"QA",lines:[{itemId:next.items[0]!.id,accepted:"1",rejected:"0"}]});
    await db.customer.update({where:{id:f.customer.id},data:{creditLimit:300}});
    const attempts=await Promise.allSettled([invoiceAcceptedGatePass(ctx(),invoiceInput(f)),invoiceAcceptedGatePass(ctx(),{...invoiceInput(f),gatePassId:next.id,lines:[{itemId:next.items[0]!.id,unitPrice:"200",taxRate:18}]})]);
    expect(attempts.filter(x=>x.status==="fulfilled")).toHaveLength(1);
    expect((await db.customer.findUniqueOrThrow({where:{id:f.customer.id}})).currentBalance.toNumber()).toBe(236);
    expect(await db.invoice.count({where:{customerId:f.customer.id}})).toBe(1);
  });
});
