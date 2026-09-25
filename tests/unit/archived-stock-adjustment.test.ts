import { describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ findFirst: vi.fn(), updateMany: vi.fn() }));
vi.mock("@/lib/server/db", () => ({ db: {} }));
vi.mock("@/lib/server/tx-retry", () => ({ withSerializableRetry: (callback: (tx: unknown) => unknown) =>
  callback({ product: { findFirst: mocks.findFirst, updateMany: mocks.updateMany } }) }));
import { adjustProductStock } from "@/lib/server/products";

describe("stock adjustment status enforcement", () => {
  it.each(["ARCHIVED", "INACTIVE"])("rejects %s stock changes before mutation", async (status) => {
    mocks.findFirst.mockResolvedValue({ status, costPrice: 100, stockQuantity: 10 });
    await expect(adjustProductStock({ workspaceId: "test-workspace", role: "OWNER" }, "test-product", 0.25, "test"))
      .rejects.toMatchObject({ code: "INACTIVE_PRODUCT" });
    expect(mocks.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "test-product", workspaceId: "test-workspace" } }));
    expect(mocks.updateMany).not.toHaveBeenCalled();
  });
});
