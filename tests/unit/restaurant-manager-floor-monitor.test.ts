import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks=vi.hoisted(()=>({
 role:"MANAGER" as "MANAGER"|"STAFF",
 redirect:vi.fn((to:string):never=>{throw Error(`redirect:${to}`)}),
 listModules:vi.fn(),
 listTables:vi.fn(),
 listReadyIds:vi.fn(),
 listCandidates:vi.fn(),
}));
vi.mock("next/navigation",()=>({redirect:mocks.redirect}));
vi.mock("@/components/restaurant/station-auto-refresh",()=>({RestaurantStationAutoRefresh:()=>null}));
vi.mock("@/components/restaurant/manager-table-transfer",()=>({RestaurantTableTransfer:()=>null}));
vi.mock("@/lib/server/restaurant-table-transfer",()=>({listRestaurantTableTransferCandidates:mocks.listCandidates}));
vi.mock("@/lib/server/auth",()=>({requireWorkspace:async()=>({
 workspaceId:"synthetic-restaurant",role:mocks.role,workspace:{name:"Sample Restaurant"}
})}));
vi.mock("@/lib/server/industry-modules",()=>({
 listWorkspaceModules:mocks.listModules,
 listRestaurantTables:mocks.listTables,
}));
vi.mock("@/lib/server/restaurant-workspace",()=>({
 listRestaurantReadyTableIds:mocks.listReadyIds,
}));

beforeEach(()=>{
 vi.clearAllMocks();mocks.role="MANAGER";
 mocks.listModules.mockResolvedValue([{moduleKey:"restaurant",enabled:true}]);
 mocks.listTables.mockResolvedValue([
  {id:"a",name:"Table 01",capacity:4,area:"Terrace",status:"OCCUPIED"},
  {id:"b",name:"Table 02",capacity:2,area:"Main",status:"AVAILABLE"},
  {id:"c",name:"Table 03",capacity:6,area:"Terrace",status:"AVAILABLE"},
 ]);
 mocks.listReadyIds.mockResolvedValue(["a"]);
 mocks.listCandidates.mockResolvedValue([]);
});
describe("Restaurant manager floor monitoring",()=>{
 it("renders every table grouped by area with ready status",async()=>{
  const {default:Page}=await import("@/app/(dashboard)/restaurant/manager/floor/page");
  const html=renderToStaticMarkup(await Page());
  expect(html).toContain("Table 01");expect(html).toContain("Table 02");expect(html).toContain("Table 03");
  expect(html).toContain("Ready to serve");expect(html).toContain("Terrace");expect(html).toContain("Main");
  expect(html).toContain("12 configured seats");
  expect(mocks.listReadyIds).toHaveBeenCalledWith("synthetic-restaurant");
  expect(mocks.listCandidates).toHaveBeenCalledWith("synthetic-restaurant");
 });
 it("never fetches table status or ready orders for staff",async()=>{
  mocks.role="STAFF";
  const {default:Page}=await import("@/app/(dashboard)/restaurant/manager/floor/page");
  await expect(Page()).rejects.toThrow("redirect:/restaurant");
  expect(mocks.listModules).not.toHaveBeenCalled();
  expect(mocks.listTables).not.toHaveBeenCalled();
  expect(mocks.listReadyIds).not.toHaveBeenCalled();
  expect(mocks.listCandidates).not.toHaveBeenCalled();
 });
});
