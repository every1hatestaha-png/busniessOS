import { beforeEach, describe, expect, it, vi } from "vitest";

const m=vi.hoisted(()=>({query:vi.fn(),module:vi.fn()}));
vi.mock("@/lib/server/db",()=>({db:{$queryRaw:m.query}}));
vi.mock("@/lib/server/industry-modules",()=>({
  IndustryDomainError:class IndustryDomainError extends Error {
    constructor(readonly code:string,message:string){super(message);}
  },
  requireWorkspaceModule:m.module,
}));

beforeEach(()=>{
  vi.clearAllMocks();m.module.mockResolvedValue(undefined);m.query.mockResolvedValue([]);
});

describe("Restaurant Kitchen order query minimises data exposure",()=>{
  it("queries only operational fields and the authenticated tenant",async()=>{
    const {listKitchenOrders}=await import("@/lib/server/restaurant-kitchen-orders");
    await listKitchenOrders("workspace-qa","CONFIRMED",300);
    expect(m.module).toHaveBeenCalledWith("workspace-qa","restaurant");
    expect(m.query).toHaveBeenCalledTimes(1);
    const sql=Array.from(m.query.mock.calls[0][0] as TemplateStringsArray).join(" ");
    expect(sql).toContain('ro."workspaceId"=');
    expect(sql).toContain('ro."createdAt"');
    expect(sql).toContain('rt."workspaceId"=ro."workspaceId"');
    expect(sql).not.toContain('ro."total"');
    expect(sql).not.toContain('"paymentStatus"');
    expect(sql).not.toContain('"customerPhone"');
    expect(sql).not.toContain('"customerName"');
    expect(sql).not.toContain('"deliveryAddress"');
    expect(m.query.mock.calls[0].at(-1)).toBe(75);
  });
  it("refuses an invalid status instead of running a generic order read",async()=>{
    const {listKitchenOrders}=await import("@/lib/server/restaurant-kitchen-orders");
    await expect(listKitchenOrders("workspace-qa","COMPLETED" as "CONFIRMED"))
      .rejects.toThrow("Kitchen stage is invalid");
    expect(m.query).not.toHaveBeenCalled();
  });
});
