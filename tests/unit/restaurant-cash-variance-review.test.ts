import { Prisma } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const m=vi.hoisted(()=>({
  find:vi.fn(),findReviews:vi.fn(),query:vi.fn(),audit:vi.fn(),module:vi.fn(),
  transaction:vi.fn(),status:"CLOSED",variance:100,closedAt:new Date("2026-11-01T10:00:00Z"),
}));
vi.mock("@/lib/server/db",()=>({db:{auditLog:{findMany:m.findReviews}}}));
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
const shiftId="22222222-2222-4222-8222-222222222222";
const manager={workspaceId,userId,role:"MANAGER" as const};

beforeEach(()=>{
 vi.clearAllMocks();m.status="CLOSED";m.variance=new Prisma.Decimal(100);m.closedAt=new Date("2026-11-01T10:00:00Z");
 m.find.mockResolvedValue(null);m.findReviews.mockResolvedValue([]);
 m.module.mockResolvedValue(undefined);m.audit.mockResolvedValue(undefined);
 m.query.mockImplementation(async()=>[{
  id:shiftId,status:m.status,variance:m.variance,
  expectedCash:new Prisma.Decimal(1500),closingCash:new Prisma.Decimal(1600),closedAt:m.closedAt,
 }]);
 m.transaction.mockImplementation(async fn=>fn({$queryRaw:m.query,auditLog:{findFirst:m.find}}));
});
describe("Manager-only cash variance review",()=>{
 it("denies cashier staff before reading a shift",async()=>{
  const {reviewRestaurantCashVariance}=await import("@/lib/server/restaurant-shift-review");
  await expect(reviewRestaurantCashVariance({...manager,role:"STAFF"},shiftId,"Count error explanation"))
    .rejects.toThrow("Only a restaurant manager");
  expect(m.query).not.toHaveBeenCalled();expect(m.audit).not.toHaveBeenCalled();
 });
 it("does not review an open or balanced shift",async()=>{
  const {reviewRestaurantCashVariance}=await import("@/lib/server/restaurant-shift-review");
  m.status="OPEN";
  await expect(reviewRestaurantCashVariance(manager,shiftId,"Count error explanation"))
    .rejects.toThrow("only be reviewed after shift close");
  m.status="CLOSED";m.variance=new Prisma.Decimal(0);
  await expect(reviewRestaurantCashVariance(manager,shiftId,"Count error explanation"))
    .rejects.toThrow("no reportable variance");
 });
 it("records one audited acknowledgement without changing money",async()=>{
  const {reviewRestaurantCashVariance}=await import("@/lib/server/restaurant-shift-review");
  expect(await reviewRestaurantCashVariance(manager,shiftId,"Coin count corrected at close"))
    .toEqual({reviewed:true,variance:100});
  expect(m.audit).toHaveBeenCalledWith(expect.anything(),expect.objectContaining({
    action:"restaurant.cash_shift.variance_reviewed",workspaceId,actorId:userId,
    metadata:expect.objectContaining({explanation:"Coin count corrected at close",variance:"100.00"}),
  }));
 });
 it("repeated review does not create a second audit event",async()=>{
  const {reviewRestaurantCashVariance}=await import("@/lib/server/restaurant-shift-review");
  m.find.mockResolvedValueOnce({id:"already-reviewed"});
  expect((await reviewRestaurantCashVariance(manager,shiftId,"Another count explanation")).reviewed).toBe(false);
  expect(m.audit).not.toHaveBeenCalled();
 });
 it("fetches only the selected tenant's 30 latest shift reviews",async()=>{
  const {listRestaurantCashVarianceReviews}=await import("@/lib/server/restaurant-shift-review");
  m.findReviews.mockResolvedValueOnce([{entityId:shiftId}]);
  const rows=await listRestaurantCashVarianceReviews(workspaceId,[shiftId]);
  expect([...rows]).toEqual([shiftId]);
  expect(m.findReviews).toHaveBeenCalledWith(expect.objectContaining({
    where:expect.objectContaining({workspaceId,entityType:"CashShift",entityId:{in:[shiftId]}}),
    select:{entityId:true},
  }));
 });
});
