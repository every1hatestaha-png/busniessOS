import type { ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  cursor: 0,
  state: new Map<number, unknown>(),
  updates: [] as unknown[],
  signIn: vi.fn(),
  navigate: vi.fn(),
}));

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return {
    ...actual,
    useMemo: (fn: () => unknown) => fn(),
    useState: (initial: unknown) => {
      const index = mocks.cursor++;
      return [mocks.state.has(index) ? mocks.state.get(index) : initial, (value: unknown) => mocks.updates.push(value)];
    },
  };
});
vi.mock("@/lib/supabase/client", () => ({
  createSupabaseBrowserClient: () => ({ auth: { signInWithPassword: mocks.signIn } }),
}));

import { AdminLoginForm } from "@/components/admin/admin-login-form";

type Element = ReactElement<{ children?: unknown; onSubmit?: (event: { preventDefault: () => void }) => Promise<void> }>;
function find(tree: unknown, type: string): Element | undefined {
  if (Array.isArray(tree)) return tree.map((x) => find(x, type)).find(Boolean);
  if (!tree || typeof tree !== "object") return undefined;
  const element = tree as Element;
  return element.type === type ? element : find(element.props?.children, type);
}
function render(state: Record<number, unknown>) {
  mocks.cursor = 0;
  mocks.state = new Map(Object.entries(state).map(([key, value]) => [Number(key), value]));
  return AdminLoginForm();
}
function submit(tree: unknown) {
  return find(tree, "form")!.props.onSubmit!({ preventDefault() {} });
}

describe("standalone /admin sign in", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.updates = [];
    mocks.signIn.mockResolvedValue({ error: null });
    vi.stubGlobal("window", { location: { replace: mocks.navigate } });
  });

  it("sends successful administrator credentials to the owner-only MFA route", async () => {
    await submit(render({ 0: " OWNER@EXAMPLE.INVALID ", 1: "SyntheticTestPassword!123" }));
    expect(mocks.signIn).toHaveBeenCalledExactlyOnceWith({
      email: "owner@example.invalid",
      password: "SyntheticTestPassword!123",
    });
    expect(mocks.navigate).toHaveBeenCalledExactlyOnceWith("/admin/security");
  });

  it("never redirects to a business dashboard after failed credentials", async () => {
    mocks.signIn.mockResolvedValue({ error: { status: 400, message: "Invalid login credentials" } });
    await submit(render({ 0: "intruder@example.invalid", 1: "Incorrect" }));
    expect(mocks.navigate).not.toHaveBeenCalled();
    expect(mocks.updates).toContain("Unable to sign in. Check your credentials and try again.");
  });

  it("never submits blank credentials", async () => {
    await submit(render({ 0: "", 1: "" }));
    expect(mocks.signIn).not.toHaveBeenCalled();
    expect(mocks.navigate).not.toHaveBeenCalled();
  });
});
