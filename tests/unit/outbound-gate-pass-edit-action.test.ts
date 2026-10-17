import {beforeEach,describe,expect,it,vi} from "vitest";
const m=vi.hoisted(()=>({workspace:"4bc313cf-2869-4d87-8f1e-22a147f18d2d",permission:vi.fn(),update:vi.fn(),redirect:vi.fn()}));
vi.mock("@/lib/server/authorization",()=>({requirePermission:m.permission}));
vi.mock("@/lib/server/outbound-gate-passes",()=>({createOutboundGatePassDraft:vi.fn(),updateOutboundGatePassDraft:m.update,OutboundGatePassDomainError:class extends Error{}}));
vi.mock("next/cache",()=>({revalidatePath:vi.fn()}));
vi.mock("next/navigation",()=>({redirect:m.redirect}));
import {updateOutboundGatePassDraftAction} from "@/app/(dashboard)/gate-passes/actions";
const id="10000000-0000-4000-8000-000000000001";
function form() {
  const data=new FormData();
  for(const [key,value] of Object.entries({gatePassId:id,version:"0",customerId:id,idempotencyKey:id,date:"2026-10-15",itemsJson:JSON.stringify([{productId:id,quantity:"1"}]),workspaceId:"forged-tenant",role:"OWNER"}))data.set(key,value);
  return data;
}
describe("draft edit direct action boundaries",()=>{
  beforeEach(()=>{vi.clearAllMocks();vi.stubEnv("OUTBOUND_GATE_PASS_V1_ENABLED","true");vi.stubEnv("OUTBOUND_GATE_PASS_V1_WORKSPACE_ID",m.workspace);m.permission.mockResolvedValue({workspaceId:m.workspace,user:{id:"authenticated-actor"}});m.update.mockResolvedValue({id});});
  it("requires persisted authorization before reading input",async()=>{
    m.permission.mockRejectedValue(new Error("Role denied"));
    await expect(updateOutboundGatePassDraftAction({},form())).rejects.toThrow("Role denied");expect(m.update).not.toHaveBeenCalled();
  });
  it("rejects a foreign authenticated workspace",async()=>{
    m.permission.mockResolvedValue({workspaceId:id,user:{id:"foreign"}});
    expect(await updateOutboundGatePassDraftAction({},form())).toHaveProperty("error");expect(m.update).not.toHaveBeenCalled();
  });
  it("requires an explicit draft version and bounded input",async()=>{
    const missing=form();missing.delete("version");
    expect(await updateOutboundGatePassDraftAction({},missing)).toHaveProperty("error");
    const huge=form();huge.set("itemsJson"," ".repeat(25001));
    expect(await updateOutboundGatePassDraftAction({},huge)).toHaveProperty("error");expect(m.update).not.toHaveBeenCalled();
  });
  it("uses authenticated context and redirects to the existing detail route",async()=>{
    await updateOutboundGatePassDraftAction({},form());
    expect(m.permission).toHaveBeenCalledWith("sales.create");
    expect(m.update).toHaveBeenCalledWith({workspaceId:m.workspace,userId:"authenticated-actor"},expect.objectContaining({gatePassId:id,version:0}));
    expect(m.redirect).toHaveBeenCalledWith(`/gate-passes/${id}`);
  });
});
