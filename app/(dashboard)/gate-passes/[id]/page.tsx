import Link from "next/link";
import { notFound } from "next/navigation";

import { canPerformAction, requirePermission } from "@/lib/server/authorization";
import { GatePassWorkflowControls } from "@/components/gate-passes/workflow-controls";
import { getOutboundGatePass } from "@/lib/server/outbound-gate-passes";
import { db } from "@/lib/server/db";
import { requireOutboundGatePassDraftFeature } from "@/lib/server/outbound-gate-pass-feature";
import { gatePassIssueStockMode, needsGatePassStockPreview } from "@/lib/delivery-acceptance/issue-stock-rollout";
import { readOwnerBillingDeclaration } from "@/lib/server/outbound-gate-pass-billing-authorization";

export default async function OutboundGatePassPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { workspaceId, role } = await requirePermission("business.read");
  requireOutboundGatePassDraftFeature(workspaceId);
  const gatePass = await getOutboundGatePass(workspaceId, id);
  if (!gatePass) notFound();
  const issueMode = gatePassIssueStockMode(
    gatePass.createdAt,
    process.env.OUTBOUND_GP_ISSUE_STOCK_V2_ENABLED,
    process.env.OUTBOUND_GP_ISSUE_STOCK_V2_CUTOVER_AT,
  );
  // Read-only, tenant-scoped preview: configured customer assemblies require
  // their own component dispatch/return adapter. Never present a button that
  // will fail after the operator has physically shipped the goods.
  const bomDispatchEnabled = process.env.OUTBOUND_GATE_PASS_BOM_DISPATCH_ENABLED === "true";
  const isUnissuedV2Draft = gatePass.status === "DRAFT" && issueMode === "v2";
  const configuredBOMs = await db.$queryRaw<Array<{ name: string; configurationIssue: string | null }>>`
    SELECT DISTINCT i."productNameSnapshot" AS name,
      CASE
        WHEN NOT EXISTS (
          SELECT 1 FROM "customer_sales_bom_items" bi
          WHERE bi."customerSalesBomId"=b."id"
        ) THEN 'no components are configured'
        WHEN EXISTS (
          SELECT 1 FROM "customer_sales_bom_items" bi
          LEFT JOIN "products" component
            ON component."id"=bi."componentProductId"::text
            AND component."workspaceId"=${workspaceId}
          WHERE bi."customerSalesBomId"=b."id"
            AND (component."id" IS NULL OR component."status"::text <> 'ACTIVE'
              OR bi."componentProductId"=b."productId")
        ) THEN 'a component is missing, inactive or refers to the assembly itself'
        ELSE NULL
      END AS "configurationIssue"
    FROM "outbound_gate_pass_items" i
    JOIN "customer_sales_boms" b ON b."productId"::text = i."productId"
    WHERE i."gatePassId"=${gatePass.id}
      AND b."workspaceId"=${workspaceId}::uuid
      AND b."customerId"=${gatePass.customerId}::uuid
      AND b."isActive"=true
    ORDER BY name
  `;
  const invalidConfiguredBOMs = configuredBOMs.filter((bom) => bom.configurationIssue !== null);
  // Aggregate both assembled parent and accessory quantities before
  // comparing against either core stock or the original managed warehouse.
  // This avoids suggesting dispatch is possible when two different assembly
  // lines compete for the same component stock.
  // Preview future-only V2 stock at DRAFT, before an operator can attempt ISSUE.
  // Legacy drafts intentionally remain document-only and are checked at DISPATCH.
  // This preview never reserves stock; the serializable ISSUE transaction is authoritative.
  const needsStockPreview = needsGatePassStockPreview(gatePass.status, Boolean(gatePass.issueStockDeductedAt), issueMode);
  const stockShortages = needsStockPreview ? await db.$queryRaw<Array<{
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
  const ownerDeclaration = await readOwnerBillingDeclaration(db, gatePass);
  const deferredBillingReady = ((process.env.OUTBOUND_GP_ACCEPTANCE_BILLING_LEGALLY_APPROVED === "true"
    && Boolean(process.env.OUTBOUND_GP_ACCEPTANCE_BILLING_APPROVAL_REFERENCE?.trim()))
    || Boolean(ownerDeclaration)) && !fbrConfig?.enabled;
  const v2IssueStockReady = stockShortages.length === 0 && invalidConfiguredBOMs.length === 0
    && (configuredBOMs.length === 0 || bomDispatchEnabled);

  return <div className="mx-auto max-w-5xl space-y-5" data-gate-pass-print-route={["DRAFT", "CANCELLED"].includes(gatePass.status) ? "" : `/gate-passes/${gatePass.id}/print`}>
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <Link href="/gate-passes" className="text-sm underline underline-offset-4">All Gate Passes</Link>
        <h1 className="mt-2 font-mono text-2xl font-bold">{gatePass.gatePassNumber}</h1>
        <p className="text-sm text-muted-foreground">{gatePass.status} · {gatePass.gatePassDate.toLocaleDateString("en-GB", { timeZone: "Asia/Karachi" })}</p>
      </div>
      {gatePass.status === "DRAFT" && <div className="flex flex-wrap items-center gap-3"><span className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">Draft only, not valid for dispatch</span>{canPerformAction(role, "sales.create") && <Link href={`/gate-passes/${gatePass.id}/edit`} className="rounded-md border px-3 py-2 text-sm font-medium">Edit draft</Link>}</div>}
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
    {ownerDeclaration && <div role="status" className="rounded-md border p-4 text-sm">
      <p className="font-semibold">Owner invoice-timing declaration recorded</p>
      <p>Reference: {ownerDeclaration.reference}. This records the workspace owner&apos;s declaration; it is not independent tax or legal certification.</p>
      <p className="mt-1 whitespace-pre-wrap">{ownerDeclaration.basis}</p>
    </div>}
    {gatePass.receivingReference && <p className="text-sm"><span className="font-semibold">Customer receiving reference: </span>{gatePass.receivingReference}{gatePass.receivingRecipient ? ` · ${gatePass.receivingRecipient}` : ""}</p>}
    {gatePass.receivingAt && <Link href={`/gate-passes/${gatePass.id}/receiving/print`} className="inline-flex rounded-md border px-4 py-2 text-sm font-medium">Print Customer Receiving Acknowledgement</Link>}
    {gatePass.invoiceId && <Link href={`/invoices/${gatePass.invoiceId}`} className="inline-flex rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium text-white">View and print final invoice</Link>}
    {(isUnissuedV2Draft || (gatePass.status === "ISSUED" && !gatePass.issueStockDeductedAt)) && invalidConfiguredBOMs.length > 0 && <div role="alert" className="rounded-md border border-amber-400 bg-amber-50 p-4 text-sm text-amber-950">
      <p className="font-semibold">Customer assembly configuration is incomplete. {isUnissuedV2Draft ? "V2 issuance" : "Dispatch"} cannot proceed yet.</p>
      <p className="mt-1">Correct the assembly configuration before proceeding. This check changes no stock or existing documents.</p>
      <ul className="mt-2 list-disc pl-5">{invalidConfiguredBOMs.map((row) => <li key={row.name}>{row.name}: {row.configurationIssue}</li>)}</ul>
    </div>}
    {(isUnissuedV2Draft || (gatePass.status === "ISSUED" && !gatePass.issueStockDeductedAt)) && configuredBOMs.length > 0 && !bomDispatchEnabled && <div role="status" className="rounded-md border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
      <p className="font-semibold">Assembly products require component-stock reconciliation before {isUnissuedV2Draft ? "V2 issue" : "dispatch"}.</p>
      <p className="mt-1">{isUnissuedV2Draft ? "V2 issue is paused before any stock deduction." : "Gate Pass printing is available, but dispatch is paused."} The customer BOM stock adapter is not yet enabled; use the standard Sales flow until the component-return adapter is certified.</p>
      <ul className="mt-2 list-disc pl-5">{configuredBOMs.map((row) => <li key={row.name}>{row.name}</li>)}</ul>
    </div>}
    {stockShortages.length > 0 && <div role="alert" className="rounded-md border border-amber-400 bg-amber-50 p-4 text-sm text-amber-950">
      <p className="font-semibold">Insufficient {isUnissuedV2Draft ? "V2 issue" : "dispatch"} stock — {isUnissuedV2Draft ? "issuance" : "shipment"} cannot proceed yet.</p>
      <p className="mt-1">Review the listed items before {isUnissuedV2Draft ? "issuing" : "dispatching"}. This is a read-only preview, not a stock reservation; the server will check again during the actual action. No inventory was changed.</p>
      <ul className="mt-2 list-disc pl-5">{stockShortages.map((item) => <li key={item.name}>{item.name}: required {item.required}, available {item.available}</li>)}</ul>
    </div>}
    {issueMode === "misconfigured" && gatePass.status === "DRAFT" && <div role="alert" className="rounded-md border border-amber-400 bg-amber-50 p-4 text-sm text-amber-950">
      Gate Pass issuance is paused until the administrator configures a valid UTC V2 cutover. No inventory was changed.
    </div>}
    <GatePassWorkflowControls
      key={`${gatePass.id}:${gatePass.updatedAt.toISOString()}`}
      id={gatePass.id}
      status={gatePass.status}
      customerReference={gatePass.receivingReference}
      recipient={gatePass.receivingRecipient}
      receivingNotes={gatePass.receivingNotes}
      deferredBillingReady={deferredBillingReady}
      ownerAttestationEnabled={process.env.OUTBOUND_GP_OWNER_ATTESTATION_ENABLED === "true"
        && (issueMode === "v2" || (issueMode === "legacy" && process.env.OUTBOUND_GP_LEGACY_OWNER_DISPATCH_ENABLED === "true"))
        && !fbrConfig?.enabled}
      canAttestBilling={role === "OWNER"}
      documentVersion={gatePass.version}
      canIssue={issueMode !== "misconfigured" && canPerformAction(role, "sales.create") && (issueMode !== "v2" || canPerformAction(role, "inventory.adjust"))}
      issueStockReady={v2IssueStockReady}
      canCancel={canPerformAction(role, "sales.create") && (!gatePass.issueStockDeductedAt || canPerformAction(role, "inventory.adjust"))}
      issueDeductsStock={issueMode === "v2"}
      stockAlreadyDeducted={Boolean(gatePass.issueStockDeductedAt)}
      canDispatch={canPerformAction(role, "inventory.adjust") && (Boolean(gatePass.issueStockDeductedAt) || ((configuredBOMs.length === 0 || bomDispatchEnabled) && invalidConfiguredBOMs.length === 0)) && stockShortages.length === 0}
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
