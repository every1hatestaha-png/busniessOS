import { describe, expect, it } from "vitest";

import { allocateCustomerCredit } from "@/lib/server/customer-credits";
import { recordPayment } from "@/lib/server/payments";
import { createSale, SaleDomainError } from "@/lib/server/sales";

const workspaceId = "0f2730ee-635b-4d5a-b95f-9282ab09a311";

describe("service-level permission boundaries", () => {
  it("rejects sale creation when a direct internal caller lacks sales.create", async () => {
    await expect(createSale({ workspaceId, role: "VIEWER", userId: "viewer-1" }, {} as never)).rejects.toMatchObject<SaleDomainError>({
      code: "PERMISSION_DENIED",
    });
  });

  it("rejects payment recording when a direct internal caller lacks payments.record", async () => {
    await expect(recordPayment({ workspaceId, role: "STAFF", userId: "staff-1" }, {} as never)).rejects.toThrow("Unauthorized");
  });

  it("rejects customer credit allocation when a direct internal caller lacks financial.manage", async () => {
    await expect(allocateCustomerCredit({ workspaceId, role: "STAFF", userId: "staff-1" }, {} as never)).rejects.toThrow("Unauthorized");
  });
});
