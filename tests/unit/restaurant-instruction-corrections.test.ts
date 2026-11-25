import { beforeEach, describe, expect, it, vi } from "vitest";

const m=vi.hoisted(()=>({
  query:vi.fn(),write:vi.fn(),audit:vi.fn(),module:vi.fn(),
  transaction:vi.fn(),status:"PREPARING",savedNotes:"No onions",exists:true,
}));
vi.mock("@/lib/server/industry-modules",()=>({
  IndustryDomainError:class IndustryDomainError extends Error {
    constructor(readonly code:string,message:string){super(message);}
  },
  requireWorkspaceModule:m.module,
}));
vi.mock("@/lib/server/audit",()=>({writeAudit:m.audit}));
vi.mock("@/lib/server/tx-retry",()=>({
  withSerializableRetry:(fn:(tx:unknown)=>Promise<unknown>)=>m.transaction(fn),
}));
const workspaceId="2002f828-dbc8-4f2a-bfec-b32f35043144";
const userId="11111111-1111-4111-8111-111111111111";
const orderId="22222222-2222-4222-8222-222222222222";
const owner={workspaceId,userId,role:"OWNER" as const};

beforeEach(()=>{
  vi.clearAllMocks();m.status="PREPARING";m.savedNotes="No onions";m.exists=true;
  m.module.mockResolvedValue(undefined);m.audit.mockResolvedValue(undefined);m.write.mockResolvedValue(1);
  m.transaction.mockImplementation(async fn=>fn({$queryRaw:m.query,$executeRaw:m.write}));
  m.query.mockImplementation(async()=>m.exists?[{
    id:orderId,orderNumber:"R-000077",status:m.status,notes:m.savedNotes,
  }]:[]);
});

describe("audited restaurant instruction corrections",()=>{
  it("rejects restaurant staff without reading a single order",async()=>{
    const {correctRestaurantKitchenInstructions:change}=await import("@/lib/server/restaurant-instruction-corrections");
    await expect(change({...owner,role:"STAFF"},orderId,"No onions","No garlic","Customer preference"))
      .rejects.toThrow("Only managers");
    expect(m.module).not.toHaveBeenCalled();
    expect(m.query).not.toHaveBeenCalled();
  });
  it("cannot change a ready or completed ticket",async()=>{
    const {correctRestaurantKitchenInstructions:change}=await import("@/lib/server/restaurant-instruction-corrections");
    m.status="READY";
    await expect(change(owner,orderId,"No onions","No garlic","Customer preference"))
      .rejects.toThrow("Only confirmed or preparing orders");
    expect(m.write).not.toHaveBeenCalled();expect(m.audit).not.toHaveBeenCalled();
  });
  it("catches stale manager screens instead of silently overwriting",async()=>{
    const {correctRestaurantKitchenInstructions:change}=await import("@/lib/server/restaurant-instruction-corrections");
    await expect(change(owner,orderId,"Previous older note","No garlic","Customer preference"))
      .rejects.toThrow("Another manager updated");
    expect(m.write).not.toHaveBeenCalled();
  });
  it("never mutates a foreign workspace order",async()=>{
    const {correctRestaurantKitchenInstructions:change}=await import("@/lib/server/restaurant-instruction-corrections");
    m.exists=false;
    await expect(change(owner,orderId,"","No garlic","Customer preference"))
      .rejects.toThrow("does not belong");
    expect(m.write).not.toHaveBeenCalled();
  });
  it("updates ONLY kitchen note and creates manager audit with exact before and after",async()=>{
    const {correctRestaurantKitchenInstructions:change}=await import("@/lib/server/restaurant-instruction-corrections");
    const result=await change(owner,orderId,"No onions","No onions, dairy allergy","Customer disclosed dairy allergy");
    expect(result).toEqual({updated:true,orderNumber:"R-000077"});
    expect(m.write).toHaveBeenCalledTimes(1);
    const sql=Array.from(m.write.mock.calls[0]![0] as TemplateStringsArray).join(" ");
    expect(sql).toContain('UPDATE "restaurant_orders"');
    expect(sql).toContain('SET "notes"=');
    expect(sql).not.toContain('total');
    expect(sql).not.toContain('quantity');
    expect(m.audit).toHaveBeenCalledWith(expect.anything(),expect.objectContaining({
      action:"restaurant.order.kitchen_instructions_corrected",
      workspaceId,
      actorId:userId,
      metadata:expect.objectContaining({
        before:"No onions",after:"No onions, dairy allergy",reason:"Customer disclosed dairy allergy",
      }),
    }));
  });
  it("an identical request is idempotent, with no duplicate audit",async()=>{
    const {correctRestaurantKitchenInstructions:change}=await import("@/lib/server/restaurant-instruction-corrections");
    expect((await change(owner,orderId,"No onions","No onions","Customer preference")).updated).toBe(false);
    expect(m.write).not.toHaveBeenCalled();expect(m.audit).not.toHaveBeenCalled();
  });
});
