# Outbound gate pass, receiving and commercial invoice workflow

Status: Foundation only. This PR deliberately does not deploy a working screen, change the database, reserve stock, or alter existing invoices. Do not present this as a complete feature.

## Request

A supplier must be able to create a gate pass before a commercial invoice, send goods to a customer's company, record the customer's acknowledged acceptance or rejection and then see eligible accepted deliveries in a Pending Invoices queue. Rejected goods must not require a fictitious sale and return.

## Existing application behavior confirmed on main

- The current printable gate pass is at app/(dashboard)/invoices/[id]/gate-pass/page.tsx and loads an existing invoice with getInvoice.
- The challan number is derived from an invoice number by lib/document-references.ts. There is no independently issued outbound gate pass.
- lib/server/sales.ts creates the sales order, deducts product and warehouse stock, creates inventory transactions and BOM consumption, issues the invoice, adds ledger/GL entries and records a payment in the same sale transaction.
- Therefore simply moving the existing gate-pass button to another page will create incorrect inventory/accounting states.

## Operator journey

1. New outbound gate pass: choose customer, source warehouse, date, delivery address, item descriptions and quantities; set responsible staff, optional vehicle/driver and notes. Snapshot the names, units, quantities and destination at issue time. Never print as a tax invoice.
2. Issue and print independently generated GP reference. DRAFT to ISSUED. Store issuer and timestamp. Cancellation after issuance requires audit reason and is allowed only before dispatch.
3. Mark dispatched. ISSUED to IN_TRANSIT. Capture dispatch evidence and perform exactly one warehouse-to-in-transit stock movement or an equivalent formally reserved inventory movement.
4. Record customer receiving: recipient name, company reference, receiving date, attachment/reference and line-by-line accepted, rejected and not-yet-confirmed quantities. Partial acknowledgements leave RECEIVING_PENDING. Allow repeated revisions with explicit version and audit, but never double-apply stock movements.
5. On full reconciliation, all accepted results in ACCEPTED, accepted plus rejected in PARTIALLY_ACCEPTED, all rejected in REJECTED. Rejected units become a separately recorded physical return to the source warehouse and cannot be silently restocked before arrival.
6. An accepted or partially accepted gate pass enters Pending Invoices. Each item uses the accepted quantity only, with a link to the signed receiving. Completing commercial invoicing is a single serializable transaction and the gate pass changes to INVOICED. If FBR required a tax invoice earlier, show the linked preexisting tax document instead of issuing a second tax invoice.
7. Rejected goods must be visible in a Returns In Transit queue until physically received and audited. Never count a rejected shipment as a completed sale.
8. Keep existing invoice-first behavior unchanged. This is an opt-in separately labeled outbound workflow.

## Suggested persistent data model, not implemented by this PR

- outbound_gate_passes: id, workspaceId, customerId, sourceWarehouseId, number, date, status, immutable issuedSnapshot, createdBy, issuedBy, dispatchedBy, receivingRecordedBy, issue/dispatch/receiving timestamps, recipientName, receivingReference, evidenceReference, idempotencyKey, version, createdAt, updatedAt.
- outbound_gate_pass_items: id, gatePassId, productId, descriptionSnapshot, skuSnapshot, unitSnapshot, dispatchedQuantity DECIMAL(15,4), acceptedQuantity DECIMAL(15,4), rejectedQuantity DECIMAL(15,4), outstandingQuantity DECIMAL(15,4), unitCostSnapshot for ledger valuation, createdAt, updatedAt.
- outbound_gate_pass_stock_movements: gatePassId, itemId, movementKind, warehouseId, quantity, unique business event identifier. Ensure exact-once dispatch and exact-once physical return receipt movements.
- outbound_gate_pass_receiving_events: workspaceId, gatePassId, version, reference, recipient, actor, item quantities, evidence path/ref, timestamp, idempotencyKey. No replacement of historical signed acknowledgements.
- invoice linkage: workspace-scoped unique nullable outboundGatePassId or equivalent one-to-one idempotent source mapping. Never derive GP references from invoice numbers.
- database checks for nonnegative quantities, accepted+rejected<=dispatched, uniqueness of reference/idempotency per workspace, tenant-safe foreign keys, and immutable invoice links.

## Finance and tax controls

- Gate pass generation must never create customer receivables, revenue, sales GL, COGS, or a payment.
- Distinguish dispatch stock and inventory ownership. Use a stock-in-transit ledger or equivalent until legally recognized sale. Avoid both premature COGS and overselling in available warehouse stock.
- When invoicing accepted quantities, do not deduct the same product/warehouse/BOM stock a second time. The current createSale method cannot be reused unchanged.
- Recognize cost, revenue, customer balance and tax only using the applicable transaction terms and compliance controls. Preserve tax rate and valuation snapshots with auditability.
- Federal Board of Revenue FAQ states that taxable digital invoices generally arise at the earlier of payment or delivery (Sales Tax Act Section 2(44)); verify whether the specific approval/consignment supply can legally defer the tax invoice. Reference: https://www.fbr.gov.pk/faqs/173967/173969
- Until transaction classification is confirmed by a qualified Pakistan tax/accounting adviser, do not enable a mode that automatically defers a required tax invoice until receiving. For ordinary taxable deliveries, issue the required fiscal invoice on time and use allowed returns/credit notes for rejection.
- Keep FBR production print/transmission blockers, user permissions and legal gates intact.

## Security and acceptance

- Authorization: create/issue gate passes uses sales permission; dispatch/receiving permissions are dedicated and role-gated; only authorized finance staff may invoice. Re-check current role server-side.
- Every read and write must filter workspaceId and verify linked customer, product and warehouse ownership, including the referenced receiving/evidence record.
- All mutations run with idempotency keys, serialized retries, a state/version compare and audit entries. Parallel tabs, replay and cross-tenant IDs must be rejected safely.
- Printable GP lists customer, date, independent gate pass number, items, quantities, vehicle/ref and signature blocks, with no commercial or FBR invoice label.
- Reconciliation tests: all accepted, partial accepted, all rejected, unreceived, over-receipt, customer rejection after dispatch, duplicate receipt, duplicate invoice, concurrent acceptance, partial return, BOM, weight KG decimals, legacy/managed warehouses, credit controls, tenant crossover, customer/account statements, balanced GL, FBR safeguard and independent sales unchanged.
- Manual end-to-end test in disposable local database first. No production migration, main merge, customer data writes, deployment or live FBR submission without explicit release approval.

## Scope of this draft PR

Pure, independently testable policy helpers plus tests. All database schema, actions, UI, printing, stock moves, invoice adapter and end-to-end tests remain to be implemented in a follow-on gated PR.