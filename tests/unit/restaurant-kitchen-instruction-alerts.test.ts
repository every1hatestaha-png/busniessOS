import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks=vi.hoisted(()=>({read:vi.fn(),module:vi.fn()}));
vi.mock("@/lib/server/db",()=>({db:{auditLog:{findMany:mocks.read}}}));
vi.mock("@/lib/server/industry-modules",()=>({
  IndustryDomainError:class IndustryDomainError extends Error {
    constructor(readonly code:string,message:string){super(message);}
  },
  requireWorkspaceModule:mocks.module,
}));

const first="11111111-1111-4111-8111-111111111111";
const second="22222222-2222-4222-8222-222222222222";

beforeEach(()=>{
  vi.clearAllMocks();
  mocks.module.mockResolvedValue(undefined);
  mocks.read.mockResolvedValue([
    {entityId:first,createdAt:new Date("2026-11-01T10:00:00Z")},
    {entityId:first,createdAt:new Date("2026-11-01T09:00:00Z")},
    {entityId:second,createdAt:new Date("2026-11-01T08:00:00Z")},
  ]);
});

describe("Kitchen instruction notices expose no manager or financial record",()=>{
  it("returns latest correction timestamps per visible order",async()=>{
    const {listKitchenInstructionUpdateTimes}=await import("@/lib/server/restaurant-kitchen-instruction-alerts");
    const result=await listKitchenInstructionUpdateTimes("workspace",[first,second]);
    expect(result.get(first)?.toISOString()).toBe("2026-11-01T10:00:00.000Z");
    expect(result.get(second)).toBeInstanceOf(Date);
    expect(mocks.read).toHaveBeenCalledWith(expect.objectContaining({
      where:expect.objectContaining({workspaceId:"workspace",action:"restaurant.order.kitchen_instructions_corrected",entityId:{in:[first,second]}}),
      select:{entityId:true,createdAt:true},
    }));
  });
  it("refuses malformed ticket ids and oversized selections",async()=>{
    const {listKitchenInstructionUpdateTimes}=await import("@/lib/server/restaurant-kitchen-instruction-alerts");
    await expect(listKitchenInstructionUpdateTimes("workspace",["not-a-uuid"])).rejects.toThrow("invalid");
    await expect(listKitchenInstructionUpdateTimes("workspace",Array.from({length:251},()=>first))).rejects.toThrow("invalid");
    expect(mocks.read).not.toHaveBeenCalled();
  });
});
