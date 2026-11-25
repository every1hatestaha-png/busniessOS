import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  class ApiError extends Error {
    constructor(public status: number, public code: string, message: string) {
      super(message);
    }
  }
  class PaymentRequiredError extends Error {}
  return {
    ApiError,
    PaymentRequiredError,
    requireApiUser: vi.fn(),
    getCurrentWorkspace: vi.fn(),
    parseApiBody: vi.fn(),
    createInitialWorkspace: vi.fn(),
  };
});

vi.mock("@/lib/server/api", () => ({
  ApiError: mocks.ApiError,
  apiData: (data: unknown, status = 200) => Response.json({ data }, { status }),
  apiHandler: (handler: (request?: Request) => Promise<Response>) => async (request?: Request) => {
    try {
      return await handler(request);
    } catch (error) {
      if (error instanceof mocks.ApiError) {
        return Response.json({ error: { code: error.code, message: error.message } }, { status: error.status });
      }
      throw error;
    }
  },
  parseApiBody: mocks.parseApiBody,
  requireApiContext: vi.fn(),
  requireApiUser: mocks.requireApiUser,
}));
vi.mock("@/lib/server/auth", () => ({ getCurrentWorkspace: mocks.getCurrentWorkspace }));
vi.mock("@/lib/server/onboarding", () => ({ createInitialWorkspace: mocks.createInitialWorkspace }));
vi.mock("@/lib/saas/payment-first", () => ({ PaymentRequiredError: mocks.PaymentRequiredError }));
vi.mock("@/lib/validation/onboarding", () => ({ onboardingSchema: {} }));

import { POST } from "@/app/api/v1/workspace/route";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireApiUser.mockResolvedValue({ id: "user-a" });
  mocks.getCurrentWorkspace.mockResolvedValue(null);
  mocks.parseApiBody.mockResolvedValue({ businessName: "Synthetic workspace" });
  mocks.createInitialWorkspace.mockResolvedValue({ workspaceId: "workspace-new" });
});

it("blocks Restaurant STAFF from the generic workspace POST before parsing or provisioning", async () => {
  mocks.getCurrentWorkspace.mockResolvedValue({ workspaceId: "restaurant-a", role: "STAFF", vertical: "RESTAURANT" });
  const response = await POST(new Request("https://example.invalid/api/v1/workspace", { method: "POST", body: "{}" }));
  expect(response.status).toBe(403);
  expect(await response.json()).toEqual({
    error: { code: "STATION_ONLY", message: "This account can only access its assigned restaurant station." },
  });
  expect(mocks.parseApiBody).not.toHaveBeenCalled();
  expect(mocks.createInitialWorkspace).not.toHaveBeenCalled();
});

it("still allows onboarding when an authenticated user has no workspace", async () => {
  const response = await POST(new Request("https://example.invalid/api/v1/workspace", { method: "POST", body: "{}" }));
  expect(response.status).toBe(201);
  expect(await response.json()).toEqual({ data: { workspaceId: "workspace-new" } });
  expect(mocks.createInitialWorkspace).toHaveBeenCalledWith("user-a", { businessName: "Synthetic workspace" }, undefined, { provisioningRequestId: undefined });
});

it("does not station-block staff from a non-restaurant workspace", async () => {
  mocks.getCurrentWorkspace.mockResolvedValue({ workspaceId: "legacy-a", role: "STAFF", vertical: "LEGACY" });
  mocks.createInitialWorkspace.mockResolvedValue({ workspaceId: "legacy-a" });
  const response = await POST(new Request("https://example.invalid/api/v1/workspace", { method: "POST", body: "{}" }));
  expect(response.status).toBe(201);
  expect(await response.json()).toEqual({ data: { workspaceId: "legacy-a" } });
});
