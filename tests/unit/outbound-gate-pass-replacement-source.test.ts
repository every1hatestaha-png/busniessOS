import { isValidElement, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  permission: vi.fn(), getSource: vi.fn(), requireFeature: vi.fn(),
  stockMode: vi.fn(), customers: vi.fn(), products: vi.fn(),
}));

vi.mock("@/lib/server/authorization", () => ({ requirePermission: m.permission }));
vi.mock("@/lib/server/outbound-gate-pass-feature", () => ({ requireOutboundGatePassDraftFeature: m.requireFeature }));
vi.mock("@/lib/server/outbound-gate-passes", () => ({ getOutboundGatePass: m.getSource }));
vi.mock("@/lib/server/managed-warehouse-stock", () => ({
  getWarehouseStockMode: m.stockMode, listActiveStockWarehouses: vi.fn().mockResolvedValue([]),
}));
vi.mock("@/lib/server/db", () => ({
  db: { customer: { findMany: m.customers }, product: { findMany: m.products } },
}));
vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("NEXT_NOT_FOUND"); } }));
vi.mock("@/components/gate-passes/gate-pass-draft-form", () => ({
  OutboundGatePassDraftForm: () => null,
}));

import NewOutboundGatePassPage from "@/app/(dashboard)/gate-passes/new/page";

const workspaceId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const customerId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const productId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const sourceId = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

type ElementLike = { type: unknown; props: { children?: ReactNode; [key: string]: unknown } };
function findDraftForm(node: unknown): ElementLike | null {
  if (Array.isArray(node)) {
    for (const child of node) { const result = findDraftForm(child); if (result) return result; }
    return null;
  }
  if (!isValidElement(node)) return null;
  const element = node as ElementLike;
  if (typeof element.type === "function" && element.type.name === "OutboundGatePassDraftForm") return element;
  return findDraftForm(element.props.children);
}
const source = {
  id: sourceId, workspaceId, status: "ISSUED", dispatchedAt: null,
  customerId, warehouseId: null, gatePassNumber: "GP-000001",
  notes: "Original", deliveryAddress: "Existing destination",
  items: [{productId, dispatchedQuantity: {toString: () => "300"}}],
};

describe("replacement draft source boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    m.permission.mockResolvedValue({workspaceId});
    m.stockMode.mockResolvedValue("LEGACY");
    m.customers.mockResolvedValue([{id:customerId,name:"Customer",companyName:null}]);
    m.products.mockResolvedValue([{id:productId,name:"Hub",sku:"HUB",unit:"PIECE",stockQuantity:{toString:()=> "4"}}]);
    m.getSource.mockResolvedValue(source);
  });

  it("copies only a tenant-authorized unshipped source as a separate draft", async () => {
    const page = await NewOutboundGatePassPage({searchParams:Promise.resolve({copyFrom:sourceId})});
    expect(m.permission).toHaveBeenCalledWith("sales.create");
    expect(m.requireFeature).toHaveBeenCalledWith(workspaceId);
    expect(m.getSource).toHaveBeenCalledWith(workspaceId,sourceId);
    const form = findDraftForm(page);
    expect(form?.props.initialDraft).toMatchObject({
      customerId, warehouseId:"", deliveryAddress:"Existing destination",
      items:[{productId,quantity:"300"}],
    });
    expect(form?.props.editing).toBeUndefined();
    expect(form?.props.idempotencyKey).toBeTruthy();
  });

  it("denies unknown tenants and dispatched documents before any form can render", async () => {
    m.getSource.mockResolvedValueOnce(null);
    await expect(NewOutboundGatePassPage({searchParams:Promise.resolve({copyFrom:sourceId})}))
      .rejects.toThrow("NEXT_NOT_FOUND");
    m.getSource.mockResolvedValueOnce({...source,status:"IN_TRANSIT",dispatchedAt:new Date()});
    await expect(NewOutboundGatePassPage({searchParams:Promise.resolve({copyFrom:sourceId})}))
      .rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("rejects malformed or multiple source identifiers without database lookup", async () => {
    await expect(NewOutboundGatePassPage({searchParams:Promise.resolve({copyFrom:"../../invalid"})}))
      .rejects.toThrow("NEXT_NOT_FOUND");
    await expect(NewOutboundGatePassPage({searchParams:Promise.resolve({copyFrom:[sourceId,sourceId]})}))
      .rejects.toThrow("NEXT_NOT_FOUND");
    expect(m.getSource).not.toHaveBeenCalled();
  });
});
