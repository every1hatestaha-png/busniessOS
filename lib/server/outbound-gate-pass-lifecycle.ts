import "server-only";

import { Prisma, type Role } from "@prisma/client";
import { canPerformAction, type Permission } from "@/lib/server/authorization";
import { outboundGatePassDraftFeatureEnabled } from "@/lib/server/outbound-gate-pass-feature";
import { assertOutboundGatePassActor } from "@/lib/server/outbound-gate-pass-actor";
import { writeAudit } from "@/lib/server/audit";
import { nextDocumentNumber } from "@/lib/server/document-numbers";
import { withSerializableRetry } from "@/lib/server/tx-retry";
import {
  assertManagedWarehouseSelection,
  applyManagedWarehouseStockDelta,
  getWarehouseStockModeInTransaction,
} from "@/lib/server/managed-warehouse-stock";
import { postSaleToGeneralLedger, postInventoryAdjustmentToGeneralLedger } from "@/lib/server/accounting";
import {
  planGatePassBomDispatch, deductGatePassBomComponents,
  readGatePassBomSnapshot, snapshotAcceptedGatePassBomComponents,
  assertGatePassBomAcceptedPrecision,
} from "@/lib/server/outbound-gate-pass-bom";
import { decideOutboundReceiving } from "@/lib/delivery-acceptance/policy";
import {
  receivingInputSchema, returnedGoodsSchema, issueInvoiceFromGatePassSchema,
} from "@/lib/delivery-acceptance/lifecycle-validation";
import { parseInvoiceIssuedSnapshot, type InvoiceIssuedSnapshot } from "@/lib/server/invoice-snapshot";

export class GatePassWorkflowError extends Error {}
type Context = { workspaceId: string; userId: string; role: Role };

function assertPermission(ctx: Context, permission: Permission) {
  if (!canPerformAction(ctx.role, permission))
    throw new GatePassWorkflowError("Insufficient permission for this gate pass action.");
}
type Transaction = Prisma.TransactionClient;

function assertAcceptanceBillingLegallyApproved() {
  // FBR states digital invoices are generally required at the earlier of
  // payment or delivery. Do not dispatch in a deferred-invoice workflow until
  // transaction-specific tax treatment is independently signed off.
  if (process.env.OUTBOUND_GP_ACCEPTANCE_BILLING_LEGALLY_APPROVED !== "true") {
    throw new GatePassWorkflowError(
      "Acceptance-based billing needs a recorded tax/legal approval before physical dispatch."
    );
  }
  if (!process.env.OUTBOUND_GP_ACCEPTANCE_BILLING_APPROVAL_REFERENCE?.trim()) {
    throw new GatePassWorkflowError("A verified, transaction-specific legal approval reference is required.");
  }
}

async function assertFbrCompatibility(tx: Transaction, workspaceId: string) {
  const config = await tx.fbrIntegrationConfig.findUnique({ where: { workspaceId }, select: { enabled: true } });
  if (config?.enabled) throw new GatePassWorkflowError("FBR-enabled transactions require a separately certified invoice-timing adapter. Deferred gate pass billing is blocked.");
}


function assertTenant(id: string) {
  if (!outboundGatePassDraftFeatureEnabled(id))
    throw new GatePassWorkflowError("This workflow is unavailable in this workspace.");
}

async function getGatePassForUpdate(tx: Transaction, ctx: Context, id: string) {
  // Explicit workspace-scoped lock. Serializable transaction also guards stock races.
  const ids = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT "id"::text AS id FROM "outbound_gate_passes"
    WHERE "id"=${id} AND "workspaceId"=${ctx.workspaceId}
    FOR UPDATE
  `;
  if (ids.length !== 1) throw new GatePassWorkflowError("Gate pass not found.");
  const record = await tx.outboundGatePass.findFirst({
    where: { workspaceId: ctx.workspaceId, id },
    include: { items: true },
  });
  if (!record) throw new GatePassWorkflowError("Gate pass not found.");
  return record;
}

async function audit(tx: Transaction, ctx: Context, id: string, action: string, metadata?: Prisma.InputJsonValue) {
  await writeAudit(tx, {
    workspaceId: ctx.workspaceId, actorId: ctx.userId, entityType: "OutboundGatePass",
    entityId: id, action, ...(metadata ? { metadata } : {}),
  });
}

// All parent and customer-BOM deductions are one serializable transaction.
// For V2 call at ISSUE; legacy GPs still call this at DISPATCH.
async function deductGatePassStock(tx: Transaction, ctx: Context, gp: Awaited<ReturnType<typeof getGatePassForUpdate>>) {
    const mode = await getWarehouseStockModeInTransaction(tx, ctx.workspaceId);
    if ((mode === "MANAGED") !== Boolean(gp.warehouseId)) throw new GatePassWorkflowError("Warehouse stock mode changed after draft creation.");
    if (mode === "MANAGED") {
      await assertManagedWarehouseSelection(tx, { workspaceId: ctx.workspaceId, warehouseId: gp.warehouseId });
    }
    const productIds = gp.items.map((x) => x.productId);
    // Freeze customer-specific BOM components when stock first leaves available inventory. A later
    // change to their configuration cannot cause a duplicate consumption or
    // alter historical sale costs when the receiver accepts the shipment.
    const bomPlan = await planGatePassBomDispatch(tx, {
      workspaceId: ctx.workspaceId, customerId: gp.customerId,
      lines: gp.items.map((item) => ({
        id: item.id, productId: item.productId, dispatchedQuantity: item.dispatchedQuantity,
      })),
    });
    if (bomPlan.byItem.size > 0 && process.env.OUTBOUND_GATE_PASS_BOM_DISPATCH_ENABLED !== "true") {
      throw new GatePassWorkflowError("Assembly dispatch requires the separately certified BOM stock adapter.");
    }
    const products = await tx.product.findMany({
      where: { workspaceId: ctx.workspaceId, id: { in: productIds }, status: "ACTIVE" },
      select: { id: true, stockQuantity: true, costPrice: true },
    });
    if (products.length !== productIds.length) throw new GatePassWorkflowError("One or more products are unavailable.");
    for (const item of gp.items) {
      const cost = products.find((product) => product.id === item.productId)!.costPrice;
      if (cost.isNegative()) throw new GatePassWorkflowError("Invalid dispatch cost.");
      const embedded = bomPlan.byItem.get(item.id);
      const dispatchedUnitCost = cost.plus(embedded?.embeddedUnitCost ?? new Prisma.Decimal(0));
      if (!dispatchedUnitCost.isFinite() || dispatchedUnitCost.isNegative()) {
        throw new GatePassWorkflowError("Assembly dispatch valuation is invalid.");
      }
      // Inventory/GL unit costs use currency cents. Refuse fractional-paisa
      // assemblies rather than silently truncate historical asset value.
      if (!dispatchedUnitCost.eq(dispatchedUnitCost.toDecimalPlaces(2))) {
        throw new GatePassWorkflowError("Assembly unit valuation has fractional cents; review component quantities and costs.");
      }
      await tx.outboundGatePassItem.update({
        where: { id: item.id, gatePassId: gp.id },
        data: {
          unitCostSnapshot: dispatchedUnitCost.toDecimalPlaces(2),
          ...(embedded ? { bomComponentsSnapshot: embedded.snapshot as unknown as Prisma.InputJsonValue } : {}),
        },
      });
      // Available stock moves OUT of the warehouse at issue (V2) or dispatch (legacy). The inventory
      // asset stays in the GL until accepted goods are recognized as COGS.
      const changed = await tx.product.updateMany({
        where: { id: item.productId, workspaceId: ctx.workspaceId,
          stockQuantity: { gte: item.dispatchedQuantity } },
        data: { stockQuantity: { decrement: item.dispatchedQuantity } },
      });
      if (changed.count !== 1) throw new GatePassWorkflowError("Insufficient stock available for this gate pass.");
      await applyManagedWarehouseStockDelta(tx, {
        workspaceId: ctx.workspaceId, warehouseId: gp.warehouseId,
        productId: item.productId, delta: item.dispatchedQuantity.negated(),
      });
      await tx.inventoryTransaction.create({
        data: { workspaceId: ctx.workspaceId, productId: item.productId,
          type: "GATE_PASS_DISPATCH", quantityChanged: item.dispatchedQuantity.negated(),
          unitCost: cost, reference: gp.gatePassNumber },
      });
    }
    await deductGatePassBomComponents(tx, {
      workspaceId: ctx.workspaceId, warehouseId: gp.warehouseId,
      gatePassNumber: gp.gatePassNumber,
      deductions: bomPlan.deductions, products: bomPlan.products,
    });
}

// Reverse only a V2-issued, physically undispatched Gate Pass.
// Inventory remains an owned GL asset throughout reservation; no sale or COGS posts.
async function reverseUndispatchedIssueStock(tx: Transaction, ctx: Context, gp: Awaited<ReturnType<typeof getGatePassForUpdate>>) {
  const mode = await getWarehouseStockModeInTransaction(tx, ctx.workspaceId);
  if ((mode === "MANAGED") !== Boolean(gp.warehouseId)) {
    throw new GatePassWorkflowError("Warehouse stock mode changed; reconcile before cancelling issued stock.");
  }
  if (mode === "MANAGED") {
    await assertManagedWarehouseSelection(tx, { workspaceId: ctx.workspaceId, warehouseId: gp.warehouseId });
  }
  const components = new Map<string, { quantity: Prisma.Decimal; cost: Prisma.Decimal }>();
  for (const item of gp.items) {
    const restored = await tx.product.updateMany({
      where: { workspaceId: ctx.workspaceId, id: item.productId },
      data: { stockQuantity: { increment: item.dispatchedQuantity } },
    });
    if (restored.count !== 1) throw new GatePassWorkflowError("Reserved parent product is unavailable for reversal.");
    await applyManagedWarehouseStockDelta(tx, {
      workspaceId: ctx.workspaceId, warehouseId: gp.warehouseId,
      productId: item.productId, delta: item.dispatchedQuantity,
    });
    const embedded = readGatePassBomSnapshot(item.bomComponentsSnapshot);
    const embeddedCost = embedded.reduce((total, part) => total.plus(
      new Prisma.Decimal(part.quantityPerUnit).mul(part.unitCost)
    ), new Prisma.Decimal(0));
    const parentCost = item.unitCostSnapshot.minus(embeddedCost);
    if (!parentCost.isFinite() || parentCost.isNegative()) {
      throw new GatePassWorkflowError("Reserved stock valuation is invalid; cancellation was not applied.");
    }
    await tx.inventoryTransaction.create({ data: {
      workspaceId: ctx.workspaceId, productId: item.productId, type: "GATE_PASS_RETURN",
      quantityChanged: item.dispatchedQuantity, unitCost: parentCost.toDecimalPlaces(2),
      reference: `CANCEL:${gp.gatePassNumber}`,
    } });
    for (const part of embedded) {
      const quantity = item.dispatchedQuantity.mul(part.quantityPerUnit);
      if (quantity.decimalPlaces() > 4) throw new GatePassWorkflowError("Reserved component return precision is invalid.");
      const prior = components.get(part.productId);
      if (prior && !prior.cost.eq(part.unitCost)) {
        throw new GatePassWorkflowError("Reserved component valuation disagrees across Gate Pass lines.");
      }
      components.set(part.productId, {
        quantity: (prior?.quantity ?? new Prisma.Decimal(0)).plus(quantity),
        cost: new Prisma.Decimal(part.unitCost),
      });
    }
  }
  for (const [productId, { quantity, cost }] of components) {
    const result = await tx.product.updateMany({
      where: { workspaceId: ctx.workspaceId, id: productId },
      data: { stockQuantity: { increment: quantity } },
    });
    if (result.count !== 1) throw new GatePassWorkflowError("Reserved component is unavailable for reversal.");
    await applyManagedWarehouseStockDelta(tx, {
      workspaceId: ctx.workspaceId, warehouseId: gp.warehouseId, productId, delta: quantity,
    });
    await tx.inventoryTransaction.create({ data: {
      workspaceId: ctx.workspaceId, productId, type: "GATE_PASS_RETURN",
      quantityChanged: quantity, unitCost: cost,
      reference: `BOM:CANCEL:${gp.gatePassNumber}`,
    } });
  }
}

export async function issueGatePass(ctx: Context, id: string) {
  assertPermission(ctx, "sales.create");
  assertTenant(ctx.workspaceId);
  return withSerializableRetry(async (tx) => {
    await assertOutboundGatePassActor(tx, ctx, "sales.create");
    const gp = await getGatePassForUpdate(tx, ctx, id);
    if (gp.status === "ISSUED") return { id }; // Identical issue retry: no second audit or version bump.
    if (gp.status !== "DRAFT" || !gp.items.length) throw new GatePassWorkflowError("Only populated drafts can be issued.");
    const ids = gp.items.map((x) => x.productId);
    // Issuance is document-only. Customer BOMs require a certified dispatch
    // adapter, but must not prevent drafting and printing the gate pass.
    const products = await tx.product.findMany({
      where: { workspaceId: ctx.workspaceId, id: { in: ids }, status: "ACTIVE" },
      select: { id: true, sellingPrice: true, costPrice: true },
    });
    if (products.length !== ids.length) throw new GatePassWorkflowError("One or more products are unavailable.");
    const productMap = new Map(products.map((x) => [x.id, x]));
    for (const item of gp.items) {
      const product = productMap.get(item.productId)!;
      if (product.sellingPrice.isNegative() || product.costPrice.isNegative())
        throw new GatePassWorkflowError("Invalid product valuation.");
      await tx.outboundGatePassItem.update({
        where: { id: item.id, gatePassId: gp.id },
        data: { unitPriceSnapshot: product.sellingPrice, unitCostSnapshot: product.costPrice },
      });
    }
    const issueStockV2 = process.env.OUTBOUND_GP_ISSUE_STOCK_V2_ENABLED === "true";
    if (issueStockV2) {
      assertPermission(ctx, "inventory.adjust");
      await assertOutboundGatePassActor(tx, ctx, "inventory.adjust");
    }
    await tx.outboundGatePass.update({ where: { id, workspaceId: ctx.workspaceId }, data: { status: "ISSUED", issuedAt: new Date(), version: { increment: 1 } } });
    if (issueStockV2) {
      await deductGatePassStock(tx, ctx, gp);
      await tx.outboundGatePass.update({ where: { id, workspaceId: ctx.workspaceId }, data: { issueStockDeductedAt: new Date() } });
    }
    await audit(tx, ctx, id, "gate_pass.issued", { number: gp.gatePassNumber });
    return { id };
  });
}

export async function cancelUndispatchedGatePass(ctx: Context, id: string) {
  assertPermission(ctx, "sales.create");
  assertTenant(ctx.workspaceId);
  return withSerializableRetry(async (tx) => {
    await assertOutboundGatePassActor(tx, ctx, "sales.create");
    const gp = await getGatePassForUpdate(tx, ctx, id);
    if (gp.status === "CANCELLED") return { id };
    if (!["DRAFT", "ISSUED"].includes(gp.status))
      throw new GatePassWorkflowError("Dispatched goods cannot be cancelled. Reconcile receiving and physical returns.");
    if (gp.issueStockDeductedAt) {
      assertPermission(ctx, "inventory.adjust");
      await assertOutboundGatePassActor(tx, ctx, "inventory.adjust");
      await reverseUndispatchedIssueStock(tx, ctx, gp);
    }
    await tx.outboundGatePass.update({
      where: { id, workspaceId: ctx.workspaceId }, data: { status: "CANCELLED", version: { increment: 1 } },
    });
    await audit(tx, ctx, id, "gate_pass.cancelled_before_dispatch", { number: gp.gatePassNumber });
    return { id };
  });
}

export async function dispatchGatePass(ctx: Context, id: string) {
  assertPermission(ctx, "inventory.adjust");
  assertTenant(ctx.workspaceId);
  assertAcceptanceBillingLegallyApproved();
  return withSerializableRetry(async (tx) => {
    await assertOutboundGatePassActor(tx, ctx, "inventory.adjust");
    await assertFbrCompatibility(tx, ctx.workspaceId);
    const gp = await getGatePassForUpdate(tx, ctx, id);
    if (gp.status !== "ISSUED") throw new GatePassWorkflowError("Only an issued gate pass can be dispatched.");
    // Marker distinguishes new V2 reserved stock from legacy passes issued before rollout.
    // Never re-deduct the same stock at physical dispatch.
    if (!gp.issueStockDeductedAt) await deductGatePassStock(tx, ctx, gp);
    await tx.outboundGatePass.update({ where: { id, workspaceId: ctx.workspaceId }, data: { status: "IN_TRANSIT", dispatchedAt: new Date(), version: { increment: 1 } } });
    await audit(tx, ctx, id, "gate_pass.dispatched", { number: gp.gatePassNumber, lineCount: gp.items.length });
    return { id };
  });
}

export async function recordGatePassReceiving(ctx: Context, input: unknown) {
  assertPermission(ctx, "returns.create");
  assertTenant(ctx.workspaceId);
  const parsed = receivingInputSchema.parse(input);
  return withSerializableRetry(async (tx) => {
    await assertOutboundGatePassActor(tx, ctx, "returns.create");
    const gp = await getGatePassForUpdate(tx, ctx, parsed.gatePassId);
    const byItem = new Map(parsed.lines.map((x) => [x.itemId, x]));
    if (byItem.size !== gp.items.length) throw new GatePassWorkflowError("All gate pass items must be reconciled.");
    // A browser retry with the same signed receiving evidence must be a read-only
    // replay, including after the delivery has been invoiced. Never write a
    // second receiving event, advance the version or reopen a closed receipt.
    const sameReceiving = Boolean(gp.receivingAt)
      && gp.receivingReference === parsed.reference
      && gp.receivingRecipient === parsed.recipient
      && (gp.receivingNotes ?? "") === parsed.notes
      && gp.items.every((item) => {
        const submitted = byItem.get(item.id);
        return submitted
          && item.acceptedQuantity.eq(new Prisma.Decimal(submitted.accepted))
          && item.rejectedQuantity.eq(new Prisma.Decimal(submitted.rejected));
      });
    if (sameReceiving && ["RECEIVING_PENDING", "ACCEPTED", "PARTIALLY_ACCEPTED", "REJECTED", "INVOICED"].includes(gp.status)) {
      return { id: gp.id, status: gp.status };
    }
    if (gp.status !== "IN_TRANSIT" && gp.status !== "RECEIVING_PENDING")
      throw new GatePassWorkflowError("Receiving is closed or dispatch has not occurred.");
    const decision = decideOutboundReceiving(gp.items.map((item) => {
      const next = byItem.get(item.id);
      if (!next) throw new GatePassWorkflowError("Receiving line does not match this gate pass.");
      const accepted = new Prisma.Decimal(next.accepted);
      const rejected = new Prisma.Decimal(next.rejected);
      if (accepted.lessThan(item.acceptedQuantity) || rejected.lessThan(item.rejectedQuantity))
        throw new GatePassWorkflowError("Cumulative receiving quantities cannot decrease.");
      assertGatePassBomAcceptedPrecision(item.bomComponentsSnapshot, accepted);
      return { lineId: item.id, dispatchedQuantity: item.dispatchedQuantity.toString(),
        acceptedQuantity: next.accepted, rejectedQuantity: next.rejected };
    }));
    for (const item of gp.items) {
      const line = byItem.get(item.id)!;
      await tx.outboundGatePassItem.update({ where: { id: item.id, gatePassId: gp.id },
        data: { acceptedQuantity: new Prisma.Decimal(line.accepted), rejectedQuantity: new Prisma.Decimal(line.rejected) } });
    }
    await tx.outboundGatePass.update({ where: { id: gp.id, workspaceId: ctx.workspaceId }, data: {
      status: decision.status, receivingReference: parsed.reference,
      receivingRecipient: parsed.recipient, receivingNotes: parsed.notes,
      receivingAt: new Date(), version: { increment: 1 },
    } });
    await audit(tx, ctx, gp.id, "gate_pass.receiving_recorded", {
      reference: parsed.reference, recipient: parsed.recipient,
      status: decision.status, accepted: decision.acceptedQuantity,
      rejected: decision.rejectedQuantity, outstanding: decision.outstandingQuantity,
    });
    return { id: gp.id, status: decision.status };
  });
}

export async function confirmRejectedStockReturn(ctx: Context, input: unknown) {
  assertPermission(ctx, "returns.create");
  assertTenant(ctx.workspaceId);
  const parsed = returnedGoodsSchema.parse(input);
  return withSerializableRetry(async (tx) => {
    await assertOutboundGatePassActor(tx, ctx, "returns.create");
    const gp = await getGatePassForUpdate(tx, ctx, parsed.gatePassId);
    if (!["REJECTED", "PARTIALLY_ACCEPTED", "INVOICED"].includes(gp.status))
      throw new GatePassWorkflowError("Rejected quantities are not yet finalized.");
    const byItem = new Map(parsed.lines.map((x) => [x.itemId, x]));
    if (byItem.size !== gp.items.length) throw new GatePassWorkflowError("All return quantities must be supplied.");
    const mode = await getWarehouseStockModeInTransaction(tx, ctx.workspaceId);
    if ((mode === "MANAGED") !== Boolean(gp.warehouseId)) {
      throw new GatePassWorkflowError("Warehouse stock mode changed after dispatch. Reconcile stock mode before receiving the return.");
    }
    let changed = false;
    let valuationRoundingDelta = new Prisma.Decimal(0);
    for (const item of gp.items) {
      const line = byItem.get(item.id);
      if (!line) throw new GatePassWorkflowError("Unknown return line.");
      const desired = new Prisma.Decimal(line.returned);
      if (desired.lessThan(item.returnedQuantity) || desired.greaterThan(item.rejectedQuantity))
        throw new GatePassWorkflowError("Returned quantity must be cumulative and cannot exceed rejection.");
      const delta = desired.minus(item.returnedQuantity);
      if (delta.isZero()) continue;
      changed = true;
      const components = readGatePassBomSnapshot(item.bomComponentsSnapshot);
      if (components.length) {
        // Customer returned the assembled item, NOT detached accessories.
        // Fold its historical component value into the returned parent's WAC
        // and reconcile the unavoidable two-decimal cost-rounding residual.
        const product = await tx.product.findFirst({
          where: { id: item.productId, workspaceId: ctx.workspaceId },
          select: { stockQuantity: true, costPrice: true },
        });
        if (!product) throw new GatePassWorkflowError("Original assembly is unavailable for stock return.");
        const newQuantity = product.stockQuantity.plus(delta);
        const historicalCost = item.unitCostSnapshot.mul(delta);
        const previousValue = product.costPrice.mul(product.stockQuantity);
        const newPrice = previousValue.plus(historicalCost).div(newQuantity).toDecimalPlaces(2);
        const productUpdate = await tx.product.updateMany({
          where: { id: item.productId, workspaceId: ctx.workspaceId, stockQuantity: product.stockQuantity },
          data: { stockQuantity: { increment: delta }, costPrice: newPrice },
        });
        if (productUpdate.count !== 1) throw new GatePassWorkflowError("Assembly inventory changed during reconciliation.");
        valuationRoundingDelta = valuationRoundingDelta.plus(newQuantity.mul(newPrice).minus(previousValue).minus(historicalCost));
      } else {
        const productUpdate = await tx.product.updateMany({
          where: { id: item.productId, workspaceId: ctx.workspaceId },
          data: { stockQuantity: { increment: delta } },
        });
        if (productUpdate.count !== 1) throw new GatePassWorkflowError("Original product is unavailable for stock return.");
      }
      await applyManagedWarehouseStockDelta(tx, {
        workspaceId: ctx.workspaceId, warehouseId: gp.warehouseId, productId: item.productId, delta,
      });
      await tx.inventoryTransaction.create({
        data: { workspaceId: ctx.workspaceId, productId: item.productId,
          type: "GATE_PASS_RETURN", quantityChanged: delta,
          unitCost: item.unitCostSnapshot, reference: gp.gatePassNumber },
      });
      await tx.outboundGatePassItem.update({ where: { id: item.id, gatePassId: gp.id }, data: { returnedQuantity: desired } });
    }
    if (!changed) return { id: gp.id };
    // Product WAC stores cents. A sub-cent residual on a composite return
    // must not silently break the inventory-asset GL reconciliation.
    await postInventoryAdjustmentToGeneralLedger(tx, {
      workspaceId: ctx.workspaceId, sourceId: gp.id,
      documentNo: `${gp.gatePassNumber}-BOM-WAC-${gp.version + 1}`,
      date: new Date(), value: valuationRoundingDelta.toDecimalPlaces(2),
    });
    await tx.outboundGatePass.update({ where: { id: gp.id, workspaceId: ctx.workspaceId }, data: { version: { increment: 1 } } });
    await audit(tx, ctx, gp.id, "gate_pass.rejected_goods_returned", { number: gp.gatePassNumber, lines: parsed.lines });
    return { id: gp.id };
  });
}

export async function invoiceAcceptedGatePass(ctx: Context, input: unknown) {
  assertPermission(ctx, "financial.manage");
  assertTenant(ctx.workspaceId);
  assertAcceptanceBillingLegallyApproved();
  const request = issueInvoiceFromGatePassSchema.parse(input);
  return withSerializableRetry(async (tx) => {
    await assertOutboundGatePassActor(tx, ctx, "financial.manage");
    await assertFbrCompatibility(tx, ctx.workspaceId);
    const gp = await getGatePassForUpdate(tx, ctx, request.gatePassId);
    if (gp.status === "INVOICED" && gp.invoiceId) {
      const existing = await tx.invoice.findFirst({ where: { id: gp.invoiceId, workspaceId: ctx.workspaceId }, select: { issuedSnapshot: true } });
      const snapshot = parseInvoiceIssuedSnapshot(existing?.issuedSnapshot);
      if (!snapshot || snapshot.order.items.length !== request.lines.length || request.lines.some((line) => {
        const prior = snapshot.order.items.find((item) => item.key === line.itemId);
        return !prior || !new Prisma.Decimal(prior.unitPrice).eq(line.unitPrice) || !new Prisma.Decimal(prior.taxRate ?? -1).eq(line.taxRate);
      })) throw new GatePassWorkflowError("Gate pass was already invoiced with different pricing or tax.");
      return { id: gp.invoiceId };
    }
    if (!["ACCEPTED", "PARTIALLY_ACCEPTED"].includes(gp.status))
      throw new GatePassWorkflowError("Customer receiving must be fully reconciled first.");
    if (gp.invoiceId || gp.salesOrderId || !gp.receivingAt || !gp.receivingReference || !gp.receivingRecipient)
      throw new GatePassWorkflowError("Receiving evidence is incomplete or already invoiced.");
    if (!request.complianceAcknowledged)
      throw new GatePassWorkflowError("Check tax invoice timing before issuing a commercial invoice.");
    const decision = decideOutboundReceiving(gp.items.map((item) => ({ lineId: item.id, dispatchedQuantity: item.dispatchedQuantity.toString(), acceptedQuantity: item.acceptedQuantity.toString(), rejectedQuantity: item.rejectedQuantity.toString() })));
    if (!decision.canIssueCommercialInvoice || decision.status !== gp.status) throw new GatePassWorkflowError("Stored receiving quantities do not reconcile.");
    const accepted = gp.items.filter((x) => x.acceptedQuantity.greaterThan(0));
    if (accepted.length !== request.lines.length || accepted.length === 0)
      throw new GatePassWorkflowError("Invoice lines must match accepted quantities exactly.");
    const requested = new Map(request.lines.map((x) => [x.itemId, x]));
    const priced = accepted.map((item) => {
      const choice = requested.get(item.id);
      if (!choice) throw new GatePassWorkflowError("An accepted product is missing from the invoice.");
      const unitPrice = new Prisma.Decimal(choice.unitPrice);
      const taxable = unitPrice.mul(item.acceptedQuantity).toDecimalPlaces(2);
      const tax = taxable.mul(choice.taxRate).div(100).toDecimalPlaces(2);
      return { item, unitPrice, taxRate: new Prisma.Decimal(choice.taxRate), taxable, tax };
    });
    const subtotal = priced.reduce((n, x) => n.plus(x.taxable), new Prisma.Decimal(0));
    const taxTotal = priced.reduce((n, x) => n.plus(x.tax), new Prisma.Decimal(0));
    const total = subtotal.plus(taxTotal);
    if (total.lessThanOrEqualTo(0)) throw new GatePassWorkflowError("Invoice total must be positive.");
    const cost = priced.reduce((n, x) => n.plus(x.item.unitCostSnapshot.mul(x.item.acceptedQuantity)), new Prisma.Decimal(0)).toDecimalPlaces(2);
    const customer = await tx.customer.findFirst({ where: { workspaceId: ctx.workspaceId, id: gp.customerId, status: "ACTIVE" },
      select: { id: true, name: true, companyName: true, phone: true, address: true, city: true,
        taxId: true, province: true, registrationType: true, currentBalance: true, creditLimit: true, creditDays: true } });
    if (!customer) throw new GatePassWorkflowError("Customer is unavailable.");
    if (customer.creditLimit.greaterThan(0) && customer.currentBalance.plus(total).greaterThan(customer.creditLimit))
      throw new GatePassWorkflowError("Customer credit limit exceeded.");
    const seller = await tx.workspace.findUniqueOrThrow({ where: { id: ctx.workspaceId }, select: {
      name: true, phone: true, email: true, address: true, city: true, country: true,
      currency: true, timezone: true, ntn: true, strn: true, province: true,
    } });
    const warehouseRows = gp.warehouseId ? await tx.$queryRaw<Array<{ id: string; name: string; code: string | null }>>`
      SELECT "id"::text as id, "name", "code" FROM "warehouses"
      WHERE "id"=${gp.warehouseId}::uuid AND "workspaceId"=${ctx.workspaceId}::uuid LIMIT 1
    ` : [];
    const warehouse = warehouseRows[0] ?? null;
    if (gp.warehouseId && !warehouse) throw new GatePassWorkflowError("Original dispatch warehouse cannot be resolved.");
    const taxProducts = await tx.product.findMany({
      where: { workspaceId: ctx.workspaceId, id: { in: accepted.map((x) => x.productId) } },
      select: {
        id: true, fbrHsCode: true, fbrUom: true, fbrUomId: true,
        fbrTransactionTypeId: true, fbrTransactionTypeDesc: true,
        fbrRateId: true, fbrRateDesc: true, fbrRateValue: true,
        fbrReferenceVerifiedAt: true, fbrReferenceVerifiedForDate: true,
        fbrReferenceProvinceCode: true, fbrReferenceProvinceDesc: true,
        fbrHsUomVerifiedAt: true, fbrHsUomAnnexureId: true,
      },
    });
    if (taxProducts.length !== accepted.length) throw new GatePassWorkflowError("Invoice tax master data is incomplete.");
    const taxProductMap = new Map(taxProducts.map((x) => [x.id, x]));
    const orderNumber = await nextDocumentNumber(tx, ctx.workspaceId, "SALES_ORDER");
    const invoiceNumber = await nextDocumentNumber(tx, ctx.workspaceId, "INVOICE");
    const now = new Date();
    const due = new Date(now);
    due.setUTCDate(due.getUTCDate() + customer.creditDays);
    const order = await tx.salesOrder.create({ data: {
      workspaceId: ctx.workspaceId, customerId: customer.id,
      orderNumber, status: "CONFIRMED", subtotal, discount: 0, total,
      paidAmount: 0, balanceAmount: total, orderDate: now, warehouseId: gp.warehouseId,
      notes: `Accepted receiving ${gp.receivingReference} from gate pass ${gp.gatePassNumber}`,
      items: { create: priced.map(({ item, unitPrice, taxable, taxRate, tax }) => {
        const product = taxProductMap.get(item.productId)!;
        return {
          productId: item.productId, productName: item.productNameSnapshot, productSku: item.productSkuSnapshot,
          quantity: item.acceptedQuantity, unitPrice, discountPerUnit: 0,
          totalPrice: taxable, taxRate, taxableAmount: taxable, salesTaxAmount: tax,
          fbrHsCode: product.fbrHsCode, fbrUom: product.fbrUom,
          fbrUomId: product.fbrUomId, fbrTransactionTypeId: product.fbrTransactionTypeId,
          fbrSaleType: product.fbrTransactionTypeDesc, fbrRateId: product.fbrRateId,
          fbrRateDesc: product.fbrRateDesc, fbrRateValue: product.fbrRateValue,
          fbrReferenceVerifiedAt: product.fbrReferenceVerifiedAt,
          fbrReferenceVerifiedForDate: product.fbrReferenceVerifiedForDate,
          fbrReferenceProvinceCode: product.fbrReferenceProvinceCode,
          fbrReferenceProvinceDesc: product.fbrReferenceProvinceDesc,
          fbrHsUomVerifiedAt: product.fbrHsUomVerifiedAt,
          fbrHsUomAnnexureId: product.fbrHsUomAnnexureId,
        };
      }) },
    }, select: { id: true } });
    // Exactly one immutable snapshot of accepted BOM components per sales
    // line; stock was already deducted at dispatch and MUST NOT move again.
    await snapshotAcceptedGatePassBomComponents(tx, {
      workspaceId: ctx.workspaceId, salesOrderId: order.id,
      acceptedLines: accepted.map((item) => ({
        productId: item.productId, acceptedQuantity: item.acceptedQuantity,
        snapshot: item.bomComponentsSnapshot,
      })),
    });
    const snapshot = {
      version: 1, seller,
      buyer: { id: customer.id, name: customer.name, companyName: customer.companyName,
        phone: customer.phone, address: customer.address, city: customer.city,
        taxId: customer.taxId, province: customer.province, registrationType: customer.registrationType },
      order: { number: orderNumber, warehouse, items: priced.map(({ item, unitPrice, taxable, taxRate }) => ({
        key: item.id, name: item.productNameSnapshot, sku: item.productSkuSnapshot,
        unit: item.productUnitSnapshot, quantity: item.acceptedQuantity.toNumber(),
        unitPrice: unitPrice.toNumber(), discountPerUnit: 0, total: taxable.toNumber(),
        pricingMode: "UNIT" as const, taxRate: taxRate.toNumber(),
        unitWeight: null, totalWeight: null, perKgRate: null,
      })) },
      totals: { subtotal: subtotal.toNumber(), discount: 0, taxableAmount: subtotal.toNumber(),
        gstRate: new Set(priced.map((x) => x.taxRate.toString())).size === 1 ? priced[0]!.taxRate.toNumber() : null,
        gstAmount: taxTotal.toNumber(), total: total.toNumber() },
    } satisfies InvoiceIssuedSnapshot;
    const invoice = await tx.invoice.create({ data: {
      workspaceId: ctx.workspaceId, customerId: customer.id, salesOrderId: order.id, invoiceNumber,
      amount: total, status: "UNPAID", paidAmount: 0, dueDate: due,
      issuedAt: now, issuedSnapshot: snapshot as unknown as Prisma.InputJsonValue,
    }, select: { id: true } });
    await tx.invoiceDocumentVersion.create({ data: {
      workspaceId: ctx.workspaceId, invoiceId: invoice.id, version: 1, issuedAt: now,
      snapshot: snapshot as unknown as Prisma.InputJsonValue,
    } });
    await tx.ledgerEntry.create({ data: { workspaceId: ctx.workspaceId, customerId: customer.id,
      type: "SALE", debit: total, description: `Sale ${orderNumber} from ${gp.gatePassNumber}`, referenceId: order.id } });
    await tx.customer.update({ where: { id: customer.id, workspaceId: ctx.workspaceId }, data: { currentBalance: { increment: total } } });
    // Do NOT call createSale or consume BOM: the physical stock was already
    // decremented once, at the time of shipment.
    await postSaleToGeneralLedger(tx, { workspaceId: ctx.workspaceId, saleId: order.id,
      orderNumber, date: now, revenue: subtotal, salesTax: taxTotal,
      costOfGoodsSold: cost, cashReceived: new Prisma.Decimal(0) });
    await tx.outboundGatePass.update({ where: { id: gp.id, workspaceId: ctx.workspaceId }, data: { status: "INVOICED",
      invoiceId: invoice.id, salesOrderId: order.id,
      complianceReviewedAt: now, complianceReviewedById: ctx.userId,
      version: { increment: 1 } } });
    await audit(tx, ctx, gp.id, "gate_pass.invoice_issued", {
      invoiceId: invoice.id, salesOrderId: order.id, total: total.toString(),
      tax: taxTotal.toString(), reviewedBy: ctx.userId,
    });
    return { id: invoice.id };
  });
}
