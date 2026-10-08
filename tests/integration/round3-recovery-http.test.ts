import { randomUUID } from "node:crypto";
import { afterAll, expect, it, vi } from "vitest";
const provider = vi.hoisted(() => vi.fn());
vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: async () => ({ auth: { resetPasswordForEmail: provider } }) }));
import { POST } from "@/app/auth/recovery/start/route";
import { db } from "@/lib/server/db";
const origin = "https://round3.example.invalid";
afterAll(async () => { await db.$disconnect(); });
it("limits real concurrent recovery HTTP requests using shared DB admission and generic responses", async () => {
  const email = `http-${randomUUID()}@example.invalid`;
  provider.mockResolvedValue({ error: { code: "user_not_found", status: 404 } });
  const beforeUsers = await db.user.count();
  const responses = await Promise.all(Array.from({ length: 12 }, () => POST(new Request(`${origin}/auth/recovery/start`, {
    method: "POST", headers: { origin }, body: JSON.stringify({ email: ` ${email.toUpperCase()} ` }),
  }))));
  for (const response of responses) {
    expect(response.status).toBe(200); expect(await response.json()).toEqual({ ok: true });
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  }
  expect(provider).toHaveBeenCalledTimes(3);
  expect(provider).toHaveBeenCalledWith(email, { redirectTo: `${origin}/auth/callback?next=%2Frecovery%2Fnew-password` });
  expect(await db.user.count()).toBe(beforeUsers);
});
