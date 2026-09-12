import { Prisma } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ queryRaw: vi.fn(), findPayments: vi.fn() }));

vi.mock("@/lib/server/db", () => ({
  db: { $queryRaw: mocks.queryRaw, payment: { findMany: mocks.findPayments } },
}));

import { getInvoice } from "@/lib/server/invoices";

describe("getInvoice", () => {
  it("queries and maps per-unit discount and pricing metadata without changing stored invoice totals", async () => {
    const id = "781d6143-151a-4b33-8dcd-a52dfeee2d5d";
    const workspaceId = "workspace_1";
    mocks.queryRaw.mockImplementation(async (strings: TemplateStringsArray, ...values: unknown[]) => {
      const sql = strings.join("?");
      if (sql.includes('FROM "invoices" i')) {
        expect(sql).toContain('so."discount"');
        expect(sql).toContain('WHERE i."id" = ? AND i."workspaceId" = ?');
        expect(values).toEqual([id, workspaceId]);
        return [{
          id, invoiceNumber: "INV-000001", issuedAt: new Date("2026-09-11T00:00:00Z"),
          dueDate: null, amount: new Prisma.Decimal(47500), paidAmount: new Prisma.Decimal(0),
          creditApplied: new Prisma.Decimal(0), status: "UNPAID",
          customerId: "customer_1", customerName: "Customer", customerCompanyName: null,
          customerPhone: null, customerAddress: null, salesOrderId: "sale_1", orderNumber: "SO-000001",
          subtotal: new Prisma.Decimal(50000), discount: new Prisma.Decimal(2500),
        }];
      }
      if (sql.includes('FROM "sales_order_items" soi')) {
        expect(sql).toContain('soi."discountPerUnit"');
        expect(sql).toContain('soi."pricingMode"');
        expect(sql).toContain('soi."unitWeight"');
        expect(sql).toContain('soi."totalWeight"');
        expect(sql).toContain('soi."perKgRate"');
        expect(sql).not.toContain('soi."discount"');
        expect(values).toEqual(["sale_1"]);
        return [{
          id: "item_1", productName: "Saved product", fallbackProductName: "Current product",
          productSku: "SAVED-SKU", fallbackSku: "CURRENT-SKU", unit: "PIECE", quantity: new Prisma.Decimal(50),
          unitPrice: new Prisma.Decimal(1000), discountPerUnit: new Prisma.Decimal(50),
          totalPrice: new Prisma.Decimal(47500), pricingMode: "UNIT",
          unitWeight: null, totalWeight: null, perKgRate: null,
        }];
      }
      if (sql.includes('FROM "payment_allocations" pa')) return [];
      throw new Error(`Unexpected query: ${sql}`);
    });
    mocks.findPayments.mockResolvedValue([]);

    const invoice = await getInvoice(workspaceId, id);

    expect(mocks.queryRaw).toHaveBeenCalledTimes(3);
    expect(invoice).toMatchObject({ total: 47500, paid: 0, creditApplied: 0, balance: 47500, status: "UNPAID" });
    expect(invoice?.order).toEqual({
      id: "sale_1", number: "SO-000001", subtotal: 50000, discount: 2500,
      items: [{
        id: "item_1", name: "Saved product", sku: "SAVED-SKU", unit: "PIECE", quantity: 50,
        unitPrice: 1000, discountPerUnit: 50, total: 47500, pricingMode: "UNIT",
        unitWeight: null, totalWeight: null, perKgRate: null,
      }],
    });
    const item = invoice!.order!.items[0];
    expect(item.quantity * (item.unitPrice - item.discountPerUnit)).toBe(item.total);
    expect(invoice!.order!.subtotal - invoice!.order!.discount).toBe(invoice!.total);
  });
});
