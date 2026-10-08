import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ context: vi.fn(), page: vi.fn() }));
vi.mock("@/lib/server/api", async importOriginal => ({
  ...await importOriginal<typeof import("@/lib/server/api")>(), requireApiContext: m.context,
}));
vi.mock("@/lib/server/auth", () => ({ requireWorkspace: async () => ({ workspaceId: "workspace-a" }) }));
vi.mock("@/lib/server/sales", () => ({ listSalesPage: m.page, createSale: vi.fn(), SaleDomainError: class extends Error {} }));
import { GET } from "@/app/api/v1/sales/route";
import Page from "@/app/(dashboard)/sales/page";
import { ApiError } from "@/lib/server/api";
import { SalesCursorError } from "@/lib/sales-pagination";

describe("sales HTTP and UI pagination", () => {
  beforeEach(() => {
    vi.clearAllMocks(); m.context.mockResolvedValue({ workspaceId: "workspace-a" });
    m.page.mockResolvedValue({ data: [], pagination: { limit: 50, hasMore: true, nextCursor: "cursor-for-next-page" } });
  });
  it("retains the data array and adds bounded pagination metadata", async () => {
    const response = await GET(new Request("https://example.invalid/api/v1/sales?limit=10&q=buyer"));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ data: [], pagination: { limit: 50, hasMore: true, nextCursor: "cursor-for-next-page" } });
    expect(m.context).toHaveBeenCalledExactlyOnceWith("business.read");
    expect(m.page).toHaveBeenCalledWith("workspace-a", expect.objectContaining({ limit: 10, query: "buyer" }));
  });
  it("denies unauthenticated and forbidden callers before reading sales", async () => {
    for (const status of [401,403] as const) {
      m.context.mockRejectedValue(new ApiError(status,"DENIED","Denied"));
      expect((await GET(new Request("https://example.invalid/api/v1/sales"))).status).toBe(status);
    }
    expect(m.page).not.toHaveBeenCalled();
  });
  it("returns 422 for invalid limits and malformed/cross-tenant cursors", async () => {
    expect((await GET(new Request("https://example.invalid/api/v1/sales?limit=101"))).status).toBe(422);
    expect(m.page).not.toHaveBeenCalled();
    m.page.mockRejectedValue(new SalesCursorError("Invalid sales cursor"));
    const response = await GET(new Request("https://example.invalid/api/v1/sales?cursor=foreign"));
    expect(response.status).toBe(422); expect(await response.json()).toMatchObject({ error: { code: "INVALID_CURSOR" } });
  });
  it("renders forward traversal and server-wide filters while preserving query/status", async () => {
    const html = renderToStaticMarkup(await Page({ searchParams: Promise.resolve({ q: "buyer", status: "DRAFT" }) }));
    expect(html).toContain("Next page"); expect(html).toContain("cursor=cursor-for-next-page");
    expect(html).toContain("q=buyer"); expect(html).toContain("status=DRAFT");
    expect(html).toContain("Search all sales or customers"); expect(html).toContain("Totals reflect this page");
    expect(html).toContain('method="get"'); expect(html).toContain('name="q"');
  });
  it("offers recovery from stale/malformed page parameters", async () => {
    const html = renderToStaticMarkup(await Page({ searchParams: Promise.resolve({ limit: "500" }) }));
    expect(html).toContain("Restart sales list"); expect(m.page).not.toHaveBeenCalled();
  });
});
