import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

/** The conventional sales flow must never replay stock for a delivery-origin invoice. */
describe("Gate Pass-linked Sale and invoice action guards", () => {
  it("guards normal Sale returns/cancellation and posted invoice editing at the service boundary", () => {
    const sales = read("lib/server/sales.ts");
    const editor = read("lib/server/sale-edit.ts");
    const integrity = read("lib/server/gate-pass-sale-integrity.ts");
    expect(sales.split("await assertStandaloneSaleMutationAllowed(tx, context.workspaceId, order.id)").length - 1).toBe(2);
    expect(editor).toContain("await assertStandaloneSaleMutationAllowed(tx, context.workspaceId, order.id)");
    expect(integrity).toContain("where: { workspaceId, salesOrderId }");
    expect(integrity).not.toContain("OUTBOUND_GATE_PASS_BOM_DISPATCH_ENABLED");
  });

  it("hides incompatible standard Sale controls and links the original Gate Pass", () => {
    const page = read("app/(dashboard)/sales/[id]/page.tsx");
    expect(page).toContain('where: { workspaceId, salesOrderId: sale.id }');
    expect(page).toContain('!gatePassOrigin && canManageFinancials && <CancelSaleButton');
    expect(page).toContain('!gatePassOrigin && canManageFinancials && <Card');
    expect(page).toContain("Open original Gate Pass and receiving record");
    expect(page).toContain("/gate-passes/");
  });

  it("prevents editing via direct Sale edit URL and hides invoice edit/cancel actions", () => {
    const editPage = read("app/(dashboard)/sales/[id]/edit/page.tsx");
    const invoicePage = read("app/(dashboard)/invoices/[id]/page.tsx");
    expect(editPage).toContain('where: { workspaceId, salesOrderId: sale.id }');
    expect(editPage).toContain("if (source) redirect(");
    expect(invoicePage).toContain("where: { workspaceId, invoiceId: invoice.id }");
    expect(invoicePage).toContain('!gatePassOrigin && invoice.status !== "CANCELLED" && canManageFinancials && <Link');
    expect(invoicePage).toContain('!gatePassOrigin && invoice.status !== "CANCELLED" && canManageFinancials && <CancelSaleButton');
    expect(invoicePage).toContain("Source Gate Pass");
  });
});
