import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const receipt = readFileSync("app/(dashboard)/restaurant/orders/[id]/receipt/print/page.tsx", "utf8");
const kot = readFileSync("app/(dashboard)/restaurant/orders/[id]/kot/print/page.tsx", "utf8");
const orders = readFileSync("app/(dashboard)/restaurant/orders/page.tsx", "utf8");
const printOnLoad = readFileSync("components/documents/print-on-load.tsx", "utf8");
const workspace = readFileSync("lib/server/restaurant-workspace.ts", "utf8");

describe("Restaurant V1.89 print operations contract", () => {
  it("builds the customer receipt from authenticated workspace-scoped Restaurant data", () => {
    expect(receipt).toContain("requireWorkspace()");
    expect(receipt).toContain("getRestaurantOrder(workspaceId, id)");
    expect(receipt).toContain("listRestaurantPayments(workspaceId, order.id)");
    expect(receipt).toContain("listRestaurantNetPaymentSummaries(workspaceId, [order.id])");
    expect(receipt).toContain("data-document");
    expect(receipt).toContain('<PrintOnLoad format="thermal" />');
    expect(receipt).toContain("Operational receipt · not a claim of tax-invoice compliance.");
  });

  it("keeps KOT printing behind a confirmed kitchen lifecycle and excludes financial values", () => {
    expect(kot).toContain('const KITCHEN_STATUSES = new Set(["CONFIRMED", "PREPARING", "READY", "COMPLETED"])');
    expect(kot).toContain("if (!KITCHEN_STATUSES.has(order.status)) notFound()");
    expect(kot).toContain("Kitchen preparation ticket · no financial values");
    expect(kot).not.toContain("unitPrice");
    expect(kot).not.toContain("lineTotal");
    expect(kot).not.toContain("taxAmount");
    expect(kot).not.toContain("paymentStatus");
  });

  it("uses the shared 80mm print mode and exposes receipt/KOT actions from the order board", () => {
    expect(printOnLoad).toContain("root.dataset.printFormat = format");
    expect(printOnLoad).toContain("waitForPrintableAssets()");
    expect(orders).toContain("/receipt/print");
    expect(orders).toContain("/kot/print");
    expect(orders).toContain('target="_blank"');
  });

  it("resolves the table label with the same workspace tuple as the order", () => {
    expect(workspace).toContain('LEFT JOIN "restaurant_tables" rt ON rt."id"=ro."restaurantTableId" AND rt."workspaceId"=ro."workspaceId"');
    expect(workspace).toContain('WHERE ro."id"=\${orderId}::uuid AND ro."workspaceId"=\${workspaceId}::uuid');
  });
});
