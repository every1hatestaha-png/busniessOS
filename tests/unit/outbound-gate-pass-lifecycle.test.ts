import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { Prisma } from "@prisma/client";
import { ownedTransitInventory } from "@/lib/delivery-acceptance/transit-reconciliation";
import { receivingInputSchema, returnedGoodsSchema, issueInvoiceFromGatePassSchema } from "@/lib/delivery-acceptance/lifecycle-validation";

const uuid = (n: number) => `${String(n).padStart(8, "0")}-0000-4000-8000-000000000001`;
const line = { itemId: uuid(2), accepted: "8.5", rejected: "1.5" };

describe("Ahmad-only outbound workflow acceptance", () => {
  it("validates cumulative receiving and recipient evidence", () => {
    const valid = { gatePassId: uuid(1), reference: "RCV-100", recipient: "Customer Manager", notes: "", lines: [line] };
    expect(receivingInputSchema.safeParse(valid).success).toBe(true);
    expect(receivingInputSchema.safeParse({ ...valid, reference: "" }).success).toBe(false);
    expect(receivingInputSchema.safeParse({ ...valid, recipient: "" }).success).toBe(false);
    expect(receivingInputSchema.safeParse({ ...valid, lines: [line, line] }).success).toBe(false);
    expect(receivingInputSchema.safeParse({ ...valid, lines: [{ ...line, accepted: "-1" }] }).success).toBe(false);
  });

  it("rejects duplicate physical return lines and invalid quantities", () => {
    const valid = { gatePassId: uuid(1), lines: [{ itemId: uuid(2), returned: "1.5000" }] };
    expect(returnedGoodsSchema.safeParse(valid).success).toBe(true);
    expect(returnedGoodsSchema.safeParse({ ...valid, lines: [...valid.lines, ...valid.lines] }).success).toBe(false);
    expect(returnedGoodsSchema.safeParse({ ...valid, lines: [{ itemId: uuid(2), returned: "NaN" }] }).success).toBe(false);
  });

  it("requires explicit tax approval and prices for all accepted quantities", () => {
    const valid = { gatePassId: uuid(1), complianceAcknowledged: true, lines: [{ itemId: uuid(2), unitPrice: "200.00", taxRate: 18 }] };
    expect(issueInvoiceFromGatePassSchema.safeParse(valid).success).toBe(true);
    expect(issueInvoiceFromGatePassSchema.safeParse({ ...valid, complianceAcknowledged: false }).success).toBe(false);
    expect(issueInvoiceFromGatePassSchema.safeParse({ ...valid, lines: [] }).success).toBe(false);
    expect(issueInvoiceFromGatePassSchema.safeParse({ ...valid, lines: [{ itemId: uuid(2), unitPrice: "2", taxRate: 101 }] }).success).toBe(false);
  });

  it("moves stock at issue for V2, preserves legacy dispatch and avoids second stock deduction at invoice", () => {
    const source = readFileSync("lib/server/outbound-gate-pass-lifecycle.ts", "utf8");
    const dispatch = source.split("export async function dispatchGatePass(")[1]!.split("export async function recordGatePassReceiving(")[0]!;
    const invoice = source.split("export async function invoiceAcceptedGatePass(")[1]!;
    const returns = source.split("export async function confirmRejectedStockReturn(")[1]!.split("export async function invoiceAcceptedGatePass(")[0]!;
    expect(source).toContain("async function deductGatePassStock(");
    expect(source).toContain('atIssue ? "GATE_PASS_ISSUE" : "GATE_PASS_DISPATCH"');
    expect(source).toContain("stockQuantity: { decrement: item.dispatchedQuantity }");
    expect(source).toContain("async function reverseUndispatchedIssueStock(");
    expect(source).toContain("issueStockDeductedAt: new Date()");
    expect(dispatch).toContain("if (!gp.issueStockDeductedAt) await deductGatePassStock");
    expect(returns).toContain("type: \"GATE_PASS_RETURN\"");
    expect(returns).toContain("stockQuantity: { increment: delta }");
    expect(invoice).toContain("postSaleToGeneralLedger(");
    expect(invoice).not.toContain("tx.inventoryTransaction.create(");
    expect(invoice).not.toContain("applyManagedWarehouseStockDelta(");
    expect(invoice).not.toContain("createSale(");
  });

  it("surfaces customer BOM preflight before physical dispatch instead of presenting a broken button", () => {
    const page = readFileSync("app/(dashboard)/gate-passes/[id]/page.tsx", "utf8");
    expect(page).toContain("configuredBOMs.length === 0");
    expect(page).toContain("customer_sales_boms");
    expect(page).toContain("component-stock reconciliation before dispatch");
    expect(page).toContain("Gate Pass printing is available");
  });
  it("fails closed unless tax timing has separately been approved", () => {
    const source = readFileSync("lib/server/outbound-gate-pass-lifecycle.ts", "utf8");
    expect(source).toContain('OUTBOUND_GP_ACCEPTANCE_BILLING_LEGALLY_APPROVED !== "true"');
    expect(source.split("assertAcceptanceBillingLegallyApproved();").length).toBe(3);
  });
  it("reconciles warehouse-out goods, invoiced acceptance, and physically returned rejection", () => {
    const D = (n: string) => new Prisma.Decimal(n);
    const base = { dispatched: D("10"), accepted: D("8"), rejected: D("2"),
      returned: D("0"), unitCost: D("50") };
    expect(ownedTransitInventory({ ...base, status: "PARTIALLY_ACCEPTED" }).quantity.toString()).toBe("10");
    expect(ownedTransitInventory({ ...base, status: "INVOICED" }).value.toString()).toBe("100");
    expect(ownedTransitInventory({ ...base, status: "INVOICED", returned: D("2") }).quantity.toString()).toBe("0");
    expect(() => ownedTransitInventory({ ...base, status: "INVOICED", returned: D("3") })).toThrow();
  });
});
