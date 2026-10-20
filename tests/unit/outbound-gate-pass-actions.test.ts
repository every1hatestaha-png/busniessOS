import { beforeEach, describe, expect, it, vi } from "vitest";
const m=vi.hoisted(()=>({workspace:"4bc313cf-2869-4d87-8f1e-22a147f18d2d",permission:vi.fn(),service:vi.fn()}));
vi.mock("@/lib/server/authorization",()=>({requirePermission:m.permission}));
vi.mock("@/lib/server/outbound-gate-pass-lifecycle",()=>({
  GatePassWorkflowError:class extends Error {}, issueGatePass:m.service, dispatchGatePass:m.service,
  cancelUndispatchedGatePass:m.service, recordGatePassReceiving:m.service, confirmRejectedStockReturn:m.service, invoiceAcceptedGatePass:m.service,
}));
vi.mock("@/lib/server/outbound-gate-pass-bom",()=>({GatePassBomError:class extends Error {}}));
vi.mock("next/cache",()=>({revalidatePath:vi.fn()}));
vi.mock("next/navigation",()=>({redirect:vi.fn()}));
import { issueGatePassAction, dispatchGatePassAction, cancelGatePassAction, receivingGatePassAction, returnedGatePassAction, invoiceGatePassAction } from "@/app/(dashboard)/gate-passes/lifecycle-actions";
const actions=[issueGatePassAction,dispatchGatePassAction,cancelGatePassAction,receivingGatePassAction,returnedGatePassAction,invoiceGatePassAction];
describe("gate pass direct server-action authorization",()=>{
  beforeEach(()=>{vi.clearAllMocks();vi.stubEnv("OUTBOUND_GATE_PASS_V1_ENABLED","true");vi.stubEnv("OUTBOUND_GATE_PASS_V1_WORKSPACE_ID",m.workspace);m.permission.mockResolvedValue({workspaceId:m.workspace,user:{id:"authenticated-actor"},role:"OWNER"});});
  it.each(actions)("blocks foreign authenticated workspace before calling lifecycle %s",async action=>{
    m.permission.mockResolvedValue({workspaceId:"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",user:{id:"foreign"},role:"OWNER"});
    await expect(action({},new FormData())).rejects.toThrow("not enabled");expect(m.service).not.toHaveBeenCalled();
  });
  it.each(actions)("preserves requirePermission failures and cannot take a role from form data %s",async action=>{
    m.permission.mockRejectedValue(new Error("Persisted role forbidden"));const form=new FormData();form.set("role","OWNER");form.set("workspaceId",m.workspace);
    await expect(action({},form)).rejects.toThrow("Persisted role forbidden");expect(m.service).not.toHaveBeenCalled();
  });
  it("uses the required financial permission and rejects invalid input without invoicing",async()=>{
    expect(await invoiceGatePassAction({},new FormData())).toHaveProperty("error");expect(m.permission).toHaveBeenCalledWith("financial.manage");expect(m.service).not.toHaveBeenCalled();
  });
  it("passes an explicit declaration payload without accepting a submitted signer identity",async()=>{
    const form=new FormData(); form.set("gatePassId","00000000-0000-4000-8000-000000000001");form.set("ownerDeclaration","yes");
    form.set("ownerReference","SYNTHETIC-REFERENCE");form.set("ownerBasis","Synthetic delivery terms and factual invoice timing basis only.");
    form.set("ownerDraftVersion","0");
    form.set("ownerTaxTimingAssessed","yes");form.set("ownerNoEarlierInvoiceObligation","yes");form.set("ownerResponsibilityAcknowledged","yes");
    form.set("actorId","forged-owner");
    const result = await issueGatePassAction({},form);
    expect(result.ok).toContain("Printing is optional for an approved digital-only workflow.");
    expect(result.ok).not.toContain("Print it before dispatch");
    expect(m.service).toHaveBeenCalledWith({workspaceId:m.workspace,userId:"authenticated-actor",role:"OWNER"},form.get("gatePassId"),expect.objectContaining({taxTimingAssessed:true,noEarlierInvoiceObligation:true,responsibilityAcknowledged:true}));
    expect(m.service.mock.calls[0]![2]).not.toHaveProperty("actorId");
  });
});
