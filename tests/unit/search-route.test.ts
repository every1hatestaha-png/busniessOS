import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { requireApiContextMock, apiErrorMock, dbMock } = vi.hoisted(() => ({
  requireApiContextMock: vi.fn(),
  apiErrorMock: vi.fn((error: { status?: number; code?: string; message?: string }) =>
    new Response(JSON.stringify({ error: { code: error.code, message: error.message } }), {
      status: error.status ?? 500,
      headers: { "Cache-Control": "no-store" },
    }),
  ),
  dbMock: {
    customer: { findMany: vi.fn() },
    product: { findMany: vi.fn() },
    salesOrder: { findMany: vi.fn() },
    invoice: { findMany: vi.fn() },
  },
}));

vi.mock("@/lib/server/api", () => ({
  requireApiContext: requireApiContextMock,
  apiError: apiErrorMock,
}));
vi.mock("@/lib/server/db", () => ({ db: dbMock }));

import { GET } from "@/app/api/search/route";

describe("global search API authorization", () => {
  beforeEach(() => {
    requireApiContextMock.mockReset();
    apiErrorMock.mockClear();
    for (const model of [dbMock.customer, dbMock.product, dbMock.salesOrder, dbMock.invoice]) {
      model.findMany.mockReset();
      model.findMany.mockResolvedValue([]);
    }
  });

  it("rejects Restaurant STAFF through the explicit API context before querying tenant data", async () => {
    requireApiContextMock.mockRejectedValue({
      status: 403,
      code: "STATION_ONLY",
      message: "This account can only access its assigned restaurant station.",
    });

    const response = await GET(new NextRequest("http://localhost/api/search?q=tea"));

    expect(requireApiContextMock).toHaveBeenCalledWith("business.read");
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: "STATION_ONLY",
        message: "This account can only access its assigned restaurant station.",
      },
    });
    expect(apiErrorMock).toHaveBeenCalledOnce();
    expect(dbMock.customer.findMany).not.toHaveBeenCalled();
    expect(dbMock.product.findMany).not.toHaveBeenCalled();
    expect(dbMock.salesOrder.findMany).not.toHaveBeenCalled();
    expect(dbMock.invoice.findMany).not.toHaveBeenCalled();
  });

  it("keeps the existing response shape for authorized restaurant managers", async () => {
    requireApiContextMock.mockResolvedValue({ workspaceId: "restaurant-workspace", vertical: "RESTAURANT" });

    const response = await GET(new NextRequest("http://localhost/api/search?q=tea"));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ results: [] });
    expect(dbMock.customer.findMany).toHaveBeenCalledOnce();
    expect(dbMock.product.findMany).toHaveBeenCalledOnce();
    expect(dbMock.salesOrder.findMany).toHaveBeenCalledOnce();
    expect(dbMock.invoice.findMany).toHaveBeenCalledOnce();
  });
});
