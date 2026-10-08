import fs from "node:fs";
import { createRequire } from "node:module";
import { beforeEach, describe, expect, it, vi } from "vitest";
const require = createRequire(import.meta.url);
const { webMutationInventory } = require("../../scripts/web-mutation-inventory.cjs");
const m = vi.hoisted(() => ({ auth: vi.fn(), db: vi.fn() }));
vi.mock("@/lib/server/auth", () => ({ getOptionalCurrentUser: m.auth, requireWorkspace: m.auth }));
vi.mock("@/lib/server/db", () => ({ db: new Proxy({}, { get: () => m.db }) }));
const routes = [
  { file: "app/api/ai/chat/route.ts", method: "POST", load: () => import("@/app/api/ai/chat/route") },
  { file: "app/api/v1/accounting/cash-bank/route.ts", method: "POST", load: () => import("@/app/api/v1/accounting/cash-bank/route") },
  { file: "app/api/v1/accounting/expenses/route.ts", method: "POST", load: () => import("@/app/api/v1/accounting/expenses/route") },
  { file: "app/api/v1/accounting/expenses/[id]/reverse/route.ts", method: "POST", load: () => import("@/app/api/v1/accounting/expenses/[id]/reverse/route") },
  { file: "app/api/v1/customer-credits/[id]/allocations/route.ts", method: "POST", load: () => import("@/app/api/v1/customer-credits/[id]/allocations/route") },
  { file: "app/api/v1/customer-returns/route.ts", method: "POST", load: () => import("@/app/api/v1/customer-returns/route") },
  { file: "app/api/v1/customer-returns/[id]/cancel/route.ts", method: "POST", load: () => import("@/app/api/v1/customer-returns/[id]/cancel/route") },
  { file: "app/api/v1/customers/route.ts", method: "POST", load: () => import("@/app/api/v1/customers/route") },
  { file: "app/api/v1/customers/[id]/route.ts", method: "PATCH", load: () => import("@/app/api/v1/customers/[id]/route") },
  { file: "app/api/v1/customers/[id]/route.ts", method: "DELETE", load: () => import("@/app/api/v1/customers/[id]/route") },
  { file: "app/api/v1/goods-receipts/route.ts", method: "POST", load: () => import("@/app/api/v1/goods-receipts/route") },
  { file: "app/api/v1/goods-receipts/[id]/route.ts", method: "PATCH", load: () => import("@/app/api/v1/goods-receipts/[id]/route") },
  { file: "app/api/v1/goods-receipts/[id]/route.ts", method: "POST", load: () => import("@/app/api/v1/goods-receipts/[id]/route") },
  { file: "app/api/v1/goods-receipts/[id]/route.ts", method: "DELETE", load: () => import("@/app/api/v1/goods-receipts/[id]/route") },
  { file: "app/api/v1/invitations/[id]/route.ts", method: "DELETE", load: () => import("@/app/api/v1/invitations/[id]/route") },
  { file: "app/api/v1/members/route.ts", method: "POST", load: () => import("@/app/api/v1/members/route") },
  { file: "app/api/v1/members/[id]/route.ts", method: "PATCH", load: () => import("@/app/api/v1/members/[id]/route") },
  { file: "app/api/v1/members/[id]/route.ts", method: "DELETE", load: () => import("@/app/api/v1/members/[id]/route") },
  { file: "app/api/v1/payments/route.ts", method: "POST", load: () => import("@/app/api/v1/payments/route") },
  { file: "app/api/v1/payments/[id]/reverse/route.ts", method: "POST", load: () => import("@/app/api/v1/payments/[id]/reverse/route") },
  { file: "app/api/v1/products/route.ts", method: "POST", load: () => import("@/app/api/v1/products/route") },
  { file: "app/api/v1/products/[id]/route.ts", method: "PATCH", load: () => import("@/app/api/v1/products/[id]/route") },
  { file: "app/api/v1/products/[id]/route.ts", method: "DELETE", load: () => import("@/app/api/v1/products/[id]/route") },
  { file: "app/api/v1/purchases/route.ts", method: "POST", load: () => import("@/app/api/v1/purchases/route") },
  { file: "app/api/v1/purchases/[id]/cancel/route.ts", method: "POST", load: () => import("@/app/api/v1/purchases/[id]/cancel/route") },
  { file: "app/api/v1/purchases/[id]/route.ts", method: "PATCH", load: () => import("@/app/api/v1/purchases/[id]/route") },
  { file: "app/api/v1/purchases/[id]/route.ts", method: "DELETE", load: () => import("@/app/api/v1/purchases/[id]/route") },
  { file: "app/api/v1/sales/route.ts", method: "POST", load: () => import("@/app/api/v1/sales/route") },
  { file: "app/api/v1/sales/[id]/cancel/route.ts", method: "POST", load: () => import("@/app/api/v1/sales/[id]/cancel/route") },
  { file: "app/api/v1/supplier-payments/[id]/reverse/route.ts", method: "POST", load: () => import("@/app/api/v1/supplier-payments/[id]/reverse/route") },
  { file: "app/api/v1/supplier-returns/route.ts", method: "POST", load: () => import("@/app/api/v1/supplier-returns/route") },
  { file: "app/api/v1/supplier-returns/[id]/cancel/route.ts", method: "POST", load: () => import("@/app/api/v1/supplier-returns/[id]/cancel/route") },
  { file: "app/api/v1/suppliers/route.ts", method: "POST", load: () => import("@/app/api/v1/suppliers/route") },
  { file: "app/api/v1/suppliers/[id]/payments/route.ts", method: "POST", load: () => import("@/app/api/v1/suppliers/[id]/payments/route") },
  { file: "app/api/v1/suppliers/[id]/route.ts", method: "PATCH", load: () => import("@/app/api/v1/suppliers/[id]/route") },
  { file: "app/api/v1/suppliers/[id]/route.ts", method: "DELETE", load: () => import("@/app/api/v1/suppliers/[id]/route") },
  { file: "app/api/v1/workspace/route.ts", method: "POST", load: () => import("@/app/api/v1/workspace/route") },
  { file: "app/api/v1/workspace/switch/route.ts", method: "POST", load: () => import("@/app/api/v1/workspace/switch/route") },
];
describe("complete exported mutation route registry and HTTP denial", () => {
  beforeEach(() => vi.clearAllMocks());
  it("accounts for every mutation export, including only the signed webhook exemption", () => {
    const inventory = webMutationInventory();
    expect(inventory.routes.filter((r: { apiHandler: boolean }) => r.apiHandler).map((r: { file: string; method: string }) => r.file + ":" + r.method).sort()).toEqual(routes.map(r => r.file + ":" + r.method).sort());
    expect(inventory.routes.filter((r: { apiHandler: boolean }) => !r.apiHandler).map((r: { file: string }) => r.file).sort()).toEqual([
      "app/api/legal/acceptance/route.ts", "app/api/webhooks/clerk/route.ts",
      "app/auth/confirm/route.ts", "app/auth/recovery/password/route.ts", "app/auth/recovery/start/route.ts",
    ]);
    for (const route of inventory.routes.filter((r: { apiHandler: boolean; file: string }) => !r.apiHandler && r.file !== "app/api/webhooks/clerk/route.ts")) {
      expect(fs.readFileSync(route.file, "utf8")).toContain("isSameOriginWebMutation(request)");
    }
    expect(inventory.serverActions.length).toBeGreaterThan(0);
  });
  for (const route of routes) {
    it.each<Record<string, string>>([{}, { origin: "https://evil.example.invalid" }, { "sec-fetch-site": "cross-site" }])(
      route.method + " " + route.file + " rejects unsafe cookie mutation before identity/database access: %j", async headers => {
        const routeModule = await route.load();
        const handler = routeModule[route.method as keyof typeof routeModule] as (request: Request, context: unknown) => Promise<Response>;
        const path = route.file.slice(3, -9).replaceAll("[id]", "12345678-1234-4234-8234-123456789abc");
        const response = await handler(new Request("https://staging.example.invalid/" + path, { method: route.method, headers: { cookie: "sb-example-auth-token=synthetic", ...headers } }), { params: Promise.resolve({ id: "12345678-1234-4234-8234-123456789abc" }) });
        expect(response.status).toBe(403);
        expect(await response.json()).toMatchObject({ error: { code: "UNTRUSTED_ORIGIN" } });
        expect(m.auth).not.toHaveBeenCalled();
        expect(m.db).not.toHaveBeenCalled();
      },
    );
  }
});
