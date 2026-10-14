import Link from "next/link";
import { notFound } from "next/navigation";

import { canPerformAction, requirePermission } from "@/lib/server/authorization";
import { GatePassWorkflowControls } from "@/components/gate-passes/workflow-controls";
import { getOutboundGatePass } from "@/lib/server/outbound-gate-passes";
import { db } from "@/lib/server/db";
import { requireOutboundGatePassDraftFeature } from "@/lib/server/outbound-gate-pass-feature";

export default async function OutboundGatePassPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { workspaceId, role } = await requirePermission("business.read");
  requireOutboundGatePassDraftFeature(workspaceId);
  const gatePass = await getOutboundGatePass(workspaceId, id);
  if (!gatePass) notFound();
  // Read-only, tenant-scoped preview: configured customer assemblies require
  // their own component dispatch/return adapter. Never present a button that
  // will fail after the operator has physically shipped the goods.
  const bomDispatchEnabled = process.env.OUTBOUND_GATE_PASS_BOM_DISPATCH_ENABLED === "true";
  const configuredBOMs = await db.$queryRaw<Array<{ name: string }>>`
    SELECT DISTINCT i."productNameSnapshot" AS name
    FROM "outbound_gate_pass_items" i
    JOIN "customer_sales_boms" b ON b."productId"::text = i."productId"
    WHERE i."gatePassId"=${gatePass.id}
      AND b."workspaceId"=${workspaceId}::uuid
      AND b."customerId"=${gatePass.customerId}::uuid
      AND b."isActive"=true
    ORDER BY name
  `;
  // Aggregate both assembled parent and accessory quantities before
  // comparing against either core stock or the original managed warehouse.
  // This avoids suggesting dispatch is possible when two different assembly
  // lines compete for the same component stock.
  const stockShortages = gatePass.status === "ISSUED" && !gatePass.issueStockDeductedAt ? await db.$queryRaw<Array<{
    name: string; required: string; available: string;
  }>>`
    WITH required_components AS (
      SELECT i."componentProductId"::text AS "productId",
        SUM(i."quantityPerUnit" * gpi."dispatchedQuantity") AS required
      FROM "outbound_gate_pass_items" gpi
      JOIN "customer_sales_boms" b ON b."productId"::text=gpi."productId"
        AND b."workspaceId"=${workspaceId}::uuid
        AND b."customerId"=${gatePass.customerId}::uuid
        AND b."isActive"=true
      JOIN "customer_sales_bom_items" i ON i."customerSalesBomId"=b."id"
      WHERE gpi."gatePassId"=${gatePass.id}
      GROUP BY i."componentProductId"
    ), required_parents AS (
      SELECT gpi."productId", SUM(gpi."dispatchedQuantity") AS required
      FROM "outbound_gate_pass_items" gpi
      WHERE gpi."gatePassId"=${gatePass.id}
      GROUP BY gpi."productId"
    ), required_total AS (
      SELECT "productId",SUM(required) AS required
      FROM (
        SELECT "productId", required FROM required_components
        UNION ALL
        SELECT "productId", required FROM required_parents
      ) all_requirements GROUP BY "productId"
    ), availability AS (
      SELECT rt.required, COALESCE(p."name", 'Unavailable inventory product') AS name,
        CASE WHEN ${gatePass.warehouseId}::uuid IS NOT NULL
          THEN LEAST(COALESCE(p."stockQuantity",0), COALESCE(ws."quantity",0))
          ELSE COALESCE(p."stockQuantity",0) END AS available,
        p."status"::text AS status
      FROM required_total rt
      LEFT JOIN "products" p ON p."id"=rt."productId" AND p."workspaceId"=${workspaceId}
      LEFT JOIN "warehouse_stocks" ws ON ws."productId"=rt."productId"::uuid
        AND ws."workspaceId"=${workspaceId}::uuid
        AND ws."warehouseId"=${gatePass.warehouseId}::uuid
    )
    SELECT name,required::text,available::text
    FROM availability WHERE status IS DISTINCT FROM 'ACTIVE' OR available < required
    ORDER BY name
  ` : [];
  const fbrConfig = await db.fbrIntegrationConfig.findUnique({ where: { workspaceId }, select: { enabled: true } });
  const deferredBillingReady = process.env.OUTBOUND_GP_ACCEPTANCE_BILLING_LEGALLY_APPROVED === "true"
    && Boolean(process.env.OUTBOUND_GP_ACCEPTANCE_BILLING_APPROVAL_REFERENCE?.trim())
    && !fbrConfig?.enabled;

  return <div className="mx-auto max-w-5xl space-y-5">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <Link href="/gate-passes" className="text-sm underline underline-offset-4">All Gate Passes</Link>
        <h1 className="mt-2 font-mono text-2xl font-bold">{gatePass.gatePassNumber}</h1>
        <p className="text-sm text-muted-foreground">{gatePass.status} · {gatePass.gatePassDate.toLocaleDateString("en-GB", { timeZone: "Asia/Karachi" })}</p>
      </div>
      {gatePass.status === "DRAFT" && <span className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">Draft only, not valid for dispatch</span>}
    </div>
    <div className="rounded-md border p-5">
      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Customer</p>
      <p className="font-semibold">{gatePass.customer.companyName || gatePass.customer.name}</p>
      <p className="text-sm">{gatePass.deliveryAddress || gatePass.customer.address || "No delivery address supplied"}</p>
      {gatePass.customer.phone && <p className="text-sm">{gatePass.customer.phone}</p>}
    </div>
    <div className="overflow-x-auto rounded-md border">
      <table className="w-full min-w-[760px] text-left text-sm">
        <thead className="bg-muted/40"><tr><th className="p-3">Product</th><th className="p-3">SKU</th><th className="p-3 text-right">Sent</th><th className="p-3">Unit</th>{gatePass.dispatchedAt && <><th className="p-3 text-right">Accepted</th><th className="p-3 text-right">Rejected</th><th className="p-3 text-right">Awaiting</th></>}</tr></thead>
        <tbody>{gatePass.items.map((item) => <tr key={item.id} className="border-t">
          <td className="p-3">{item.productNameSnapshot}</td>
          <td className="p-3 font-mono">{item.productSkuSnapshot || "-"}</td>
          <td className="p-3 text-right tabular-nums">{item.dispatchedQuantity.toString()}</td>
          <td className="p-3">{item.productUnitSnapshot}</td>
          {gatePass.dispatchedAt && <><td className="p-3 text-right tabular-nums">{item.acceptedQuantity.toString()}</td><td className="p-3 text-right tabular-nums">{item.rejectedQuantity.toString()}</td><td className="p-3 text-right tabular-nums">{item.dispatchedQuantity.minus(item.acceptedQuantity).minus(item.rejectedQuantity).toString()}</td></>}
        </tr>)}</tbody>
      </table>
    </div>
    {gatePass.notes && <p className="text-sm"><span className="font-semibold">Notes: </span>{gatePass.notes}</p>}
    {gatePass.receivingReference && <p className="text-sm"><span className="font-semibold">Customer receiving reference: </span>{gatePass.receivingReference}{gatePass.receivingRecipient ? ` · ${gatePass.receivingRecipient}` : ""}</p>}
    {gatePass.receivingAt && <Link href={`/gate-passes/${gatePass.id}/receiving/print`} className="inline-flex rounded-md border px-4 py-2 text-sm font-medium">Print Customer Receiving Acknowledgement</Link>}
    {gatePass.invoiceId && <Link href={`/invoices/${gatePass.invoiceId}`} className="inline-flex rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium text-white">View and print final invoice</Link>}
    {gatePass.status === "ISSUED" && !gatePass.issueStockDeductedAt && configuredBOMs.length > 0 && !bomDispatchEnabled && <div role="status" className="rounded-md border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
      <p className="font-semibold">Assembly products require component-stock reconciliation before dispatch.</p>
      <p className="mt-1">Gate Pass printing is available, but dispatching this assembled customer BOM through the deferred-invoice workflow is not yet supported. Use the standard Sales flow until the component-return adapter is certified.</p>
      <ul className="mt-2 list-disc pl-5">{configuredBOMs.map((row) => <li key={row.name}>{row.name}</li>)}</ul>
    </div>}
    {gatePass.status === "ISSUED" && stockShortages.length > 0 && <div role="alert" className="rounded-md border border-amber-400 bg-amber-50 p-4 text-sm text-amber-950">
      <p className="font-semibold">Insufficient dispatch stock — shipment cannot be recorded yet.</p>
      <p className="mt-1">Replenish or correct the listed items first. Gate Pass printing remains available; no inventory was changed.</p>
      <ul className="mt-2 list-disc pl-5">{stockShortages.map((item) => <li key={item.name}>{item.name}: required {item.required}, available {item.available}</li>)}</ul>
    </div>}
    <GatePassWorkflowControls
      key={`${gatePass.id}:${gatePass.updatedAt.toISOString()}`}
      id={gatePass.id}
      status={gatePass.status}
      customerReference={gatePass.receivingReference}
      recipient={gatePass.receivingRecipient}
      receivingNotes={gatePass.receivingNotes}
      deferredBillingReady={deferredBillingReady}
      canIssue={canPerformAction(role, "sales.create") && (process.env.OUTBOUND_GP_ISSUE_STOCK_V2_ENABLED !== "true" || canPerformAction(role, "inventory.adjust"))}
      issueDeductsStock={process.env.OUTBOUND_GP_ISSUE_STOCK_V2_ENABLED === "true"}
      canDispatch={canPerformAction(role, "inventory.adjust") && (Boolean(gatePass.issueStockDeductedAt) || configuredBOMs.length === 0 || bomDispatchEnabled) && stockShortages.length === 0}
      canReceive={canPerformAction(role, "returns.create")}
      canInvoice={canPerformAction(role, "financial.manage")}
      items={gatePass.items.map((item) => ({
        id: item.id,
        name: item.productNameSnapshot,
        quantity: item.dispatchedQuantity.toString(),
        accepted: item.acceptedQuantity.toString(),
        rejected: item.rejectedQuantity.toString(),
        returned: item.returnedQuantity.toString(),
        price: item.unitPriceSnapshot.toString(),
      }))}
    />
  </div>;
}
