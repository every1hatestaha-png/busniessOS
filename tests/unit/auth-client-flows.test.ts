import type { ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  cursor: 0, state: new Map<number, unknown>(), updates: [] as unknown[],
  login: vi.fn(), signup: vi.fn(), verify: vi.fn(), logout: vi.fn(), navigate: vi.fn(), policy: vi.fn(),
  params: new URLSearchParams(),
}));
vi.mock("react", async importOriginal => {
  const actual = await importOriginal<typeof import("react")>();
  vi.stubGlobal("React", actual);
  return { ...actual, useEffect: () => {}, useMemo: (fn: () => unknown) => fn(), useState: (initial: unknown) => {
    const index = mocks.cursor++;
    return [mocks.state.has(index) ? mocks.state.get(index) : initial, (value: unknown) => mocks.updates.push(value)];
  } };
});
vi.mock("next/image", () => ({ default: "img" }));
vi.mock("next/link", () => ({ default: "a" }));
vi.mock("next/navigation", () => ({ useSearchParams: () => mocks.params }));
vi.mock("@/components/ui/button", () => ({ Button: "button" }));
vi.mock("@/lib/supabase/client", () => ({ createSupabaseBrowserClient: () => ({ auth: { signInWithPassword: mocks.login, signUp: mocks.signup, verifyOtp: mocks.verify, signOut: mocks.logout } }) }));
import SignInPage from "@/app/sign-in/[[...sign-in]]/page";
import SignUpPage from "@/app/sign-up/[[...sign-up]]/page";
import RecoveryNewPasswordPage from "@/app/recovery/new-password/page";
import { WebAccountMenu } from "@/components/layout/web-account-menu";

type Element = ReactElement<{ children?: unknown; onSubmit?: (event: { preventDefault: () => void }) => Promise<void>; onClick?: () => Promise<void> }>;
function find(tree: unknown, type: string): Element | undefined {
  if (Array.isArray(tree)) return tree.map(t => find(t, type)).find(Boolean);
  if (!tree || typeof tree !== "object") return undefined;
  const element = tree as Element;
  return element.type === type ? element : find(element.props?.children, type);
}
function render(page: () => unknown, state: Record<number, unknown>) {
  mocks.cursor = 0; mocks.state = new Map(Object.entries(state).map(([k, v]) => [Number(k), v]));
  return page();
}
const email = "synthetic@example.invalid", password = "SyntheticOnly!123";
const submit = (tree: unknown) => find(tree, "form")!.props.onSubmit!({ preventDefault() {} });

describe("password login, verification and logout event contracts", () => {
  beforeEach(() => {
    vi.clearAllMocks(); mocks.updates = []; mocks.params = new URLSearchParams();
    mocks.login.mockResolvedValue({ error: null }); mocks.logout.mockResolvedValue({ error: null });
    mocks.verify.mockResolvedValue({ data: { user: { id: "synthetic-user" }, session: {} }, error: null });
    mocks.signup.mockResolvedValue({ data: { user: { id: "synthetic-user" }, session: null }, error: null });
    mocks.policy.mockResolvedValue({
      ok: true,
      type: "basic",
      headers: new Headers({ "content-type": "application/json" }),
      json: vi.fn(async () => ({ ok: true })),
    });
    vi.stubGlobal("fetch", mocks.policy);
    vi.stubGlobal("window", { location: { href: "https://staging.example.invalid/sign-in", origin: "https://staging.example.invalid", assign: mocks.navigate } });
  });
  it("uses password login and routes success through workspace resolution", async () => {
    await submit(render(SignInPage, { 0: ` ${email.toUpperCase()} `, 1: password }));
    expect(mocks.login).toHaveBeenCalledExactlyOnceWith({ email, password });
    expect(mocks.navigate).toHaveBeenCalledWith("/auth/post-login");
    expect(mocks.verify).not.toHaveBeenCalled();
  });
  it.each(["Invalid login credentials", "Email not confirmed"])("does not navigate or invoke recovery after %s", async message => {
    mocks.login.mockResolvedValue({ error: { message, code: message === "Email not confirmed" ? "email_not_confirmed" : "invalid_credentials", status: 400 } });
    await submit(render(SignInPage, { 0: email, 1: password }));
    expect(mocks.navigate).not.toHaveBeenCalled();
    expect(mocks.verify).not.toHaveBeenCalled();
    expect(mocks.updates).toContain(message === "Email not confirmed" ? "Your email has not been verified yet." : "Email or password is incorrect.");
  });
  it("retains the same password across normal logout and later login", async () => {
    await submit(render(SignInPage, { 0: email, 1: password }));
    await find(render(WebAccountMenu, {}), "button")!.props.onClick!();
    await submit(render(SignInPage, { 0: email, 1: password }));
    expect(mocks.logout).toHaveBeenCalledExactlyOnceWith();
    expect(mocks.login.mock.calls.map(c => c[0].password)).toEqual([password, password]);
    expect(mocks.navigate.mock.calls.map(c => c[0])).toEqual(["/auth/post-login", "/sign-in", "/auth/post-login"]);
  });
  it("uses the newly established password for later password login", async () => {
    const nextPassword = "SyntheticChanged!123";
    const update = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", update);
    await submit(render(RecoveryNewPasswordPage, { 0: nextPassword, 1: nextPassword, 4: false }));
    expect(update).toHaveBeenCalledWith("/auth/recovery/password", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password: nextPassword }),
    });
    expect(mocks.navigate).toHaveBeenLastCalledWith("/auth/post-login");
    await find(render(WebAccountMenu, {}), "button")!.props.onClick!();
    await submit(render(SignInPage, { 0: email, 1: nextPassword }));
    expect(mocks.login).toHaveBeenCalledExactlyOnceWith({ email, password: nextPassword });
  });
  it("does not claim successful logout after provider failure", async () => {
    mocks.logout.mockResolvedValue({ error: new Error("network") });
    await find(render(WebAccountMenu, {}), "button")!.props.onClick!();
    expect(mocks.navigate).not.toHaveBeenCalled();
    expect(mocks.updates).toContain("Sign out failed. Please retry.");
  });
  it("requires policy acknowledgement before creating a signup", async () => {
    await submit(render(SignUpPage, { 2: email, 3: password, 5: false }));
    expect(mocks.signup).not.toHaveBeenCalled();
    expect(mocks.updates).toContain("Please agree to the Terms of Service and acknowledge the Privacy Policy before creating an account.");
  });
  it("creates signup using the chosen password and waits for verification", async () => {
    await submit(render(SignUpPage, { 2: email, 3: password, 5: true }));
    expect(mocks.signup.mock.calls[0][0]).toMatchObject({ email, password, options: { emailRedirectTo: "https://staging.example.invalid/auth/callback" } });
    expect(mocks.navigate).not.toHaveBeenCalled();
  });
  it("records policy acceptance before routing a verified signup", async () => {
    await submit(render(SignUpPage, { 2: email, 5: true, 8: true, 9: "123456" }));
    expect(mocks.verify).toHaveBeenCalledWith({ email, token: "123456", type: "email" });
    expect(mocks.policy).toHaveBeenCalledWith("/api/legal/acceptance", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        terms: true,
        privacy: true,
        termsVersion: "2026-10-07",
        privacyVersion: "2026-10-07",
      }),
      redirect: "manual",
    });
    expect(mocks.navigate).toHaveBeenCalledWith("/auth/post-login");
  });
  it("never sends accepted policy confirmation after an unchecked signup state", async () => {
    await submit(render(SignUpPage, { 2: email, 5: false, 8: true, 9: "123456" }));
    expect(mocks.verify).toHaveBeenCalled();
    expect(mocks.policy).not.toHaveBeenCalled();
    expect(mocks.navigate).toHaveBeenCalledWith("/legal/acceptance");
  });
  it("falls back to the policy screen when signup acceptance cannot be recorded", async () => {
    mocks.policy.mockRejectedValueOnce(new Error("network"));
    await submit(render(SignUpPage, { 2: email, 5: true, 8: true, 9: "123456" }));
    expect(mocks.navigate).toHaveBeenCalledWith("/legal/acceptance");
  });
  it("does not mistake an auth redirect or HTML response for policy acceptance", async () => {
    mocks.policy.mockResolvedValueOnce({
      ok: true,
      type: "opaqueredirect",
      headers: new Headers({ "content-type": "text/html" }),
      json: vi.fn(),
    });
    await submit(render(SignUpPage, { 2: email, 5: true, 8: true, 9: "123456" }));
    expect(mocks.navigate).toHaveBeenCalledWith("/legal/acceptance");
  });
  it.each(["invalid", "expired"])("retains verification after an %s signup OTP", async message => {
    mocks.verify.mockResolvedValue({ data: { user: null }, error: new Error(message) });
    await submit(render(SignUpPage, { 2: email, 5: true, 8: true, 9: "123456" }));
    expect(mocks.navigate).not.toHaveBeenCalled();
    expect(mocks.updates).toContain("That code is invalid or expired. Request a new code and try again.");
  });

  it.each(["retail", "restaurant", "wholesale", "manufacturing", "services"])("carries %s preferences through signup and verified OTP without granting access", async business => {
    mocks.params = new URLSearchParams({ business, modules: "manufacturing,accounting,unknown", billing: "annual", next: "https://evil.example", workspaceId: "foreign", role: "OWNER" });
    const onboarding = `/onboarding?business=${business}&modules=inventory%2C${business === "restaurant" ? "restaurant%2C" : ""}wholesale%2Cmanufacturing%2Caccounting${business === "services" ? "%2Cservices" : ""}&billing=annual`;
    const returnPath = `/auth/post-login?next=${encodeURIComponent(onboarding)}`;
    await submit(render(SignUpPage, { 2: email, 3: password, 5: true }));
    expect(mocks.signup).toHaveBeenCalledExactlyOnceWith({ email, password, options: { emailRedirectTo: `https://staging.example.invalid/auth/callback?next=${encodeURIComponent(onboarding)}`, data: { first_name: null, last_name: null } } });
    expect(mocks.navigate).not.toHaveBeenCalled();
    await submit(render(SignUpPage, { 2: email, 5: true, 8: true, 9: "123456" }));
    expect(mocks.verify).toHaveBeenCalledExactlyOnceWith({ email, token: "123456", type: "email" });
    expect(mocks.navigate).toHaveBeenCalledExactlyOnceWith(returnPath);
  });

  it("uses the same workspace resolver when signup immediately establishes a session", async () => {
    mocks.params = new URLSearchParams({ business: "restaurant", modules: "restaurant", billing: "monthly" });
    mocks.signup.mockResolvedValue({ data: { user: { id: "synthetic-user" }, session: {} }, error: null });
    await submit(render(SignUpPage, { 2: email, 3: password, 5: true }));
    expect(mocks.navigate).toHaveBeenCalledWith("/auth/post-login?next=%2Fonboarding%3Fbusiness%3Drestaurant%26modules%3Dinventory%252Crestaurant%26billing%3Dmonthly");
  });

  it("retains preferences at sign-in when verified OTP establishes no session", async () => {
    mocks.params = new URLSearchParams({ business: "services", modules: "services", billing: "monthly" });
    mocks.verify.mockResolvedValue({ data: { user: { id: "synthetic-user" }, session: null }, error: null });
    await submit(render(SignUpPage, { 2: email, 5: true, 8: true, 9: "123456" }));
    expect(mocks.navigate).toHaveBeenCalledWith("/sign-in?confirmed=1&next=%2Fonboarding%3Fbusiness%3Dservices%26modules%3Dservices%26billing%3Dmonthly");
  });

  it.each(["https://evil.example", "//evil.example", "javascript:alert(1)"])("ignores forged signup destination %s", async next => {
    mocks.params = new URLSearchParams({ business: next, next, workspaceId: "foreign", role: "OWNER" });
    await submit(render(SignUpPage, { 2: email, 5: true, 8: true, 9: "123456" }));
    expect(mocks.navigate).toHaveBeenCalledExactlyOnceWith("/auth/post-login");
  });

  it("does not bypass OTP failure when onboarding preferences are supplied", async () => {
    mocks.params = new URLSearchParams({ business: "restaurant", modules: "restaurant" });
    mocks.verify.mockResolvedValue({ data: { session: null }, error: new Error("expired") });
    await submit(render(SignUpPage, { 2: email, 5: true, 8: true, 9: "123456" }));
    expect(mocks.navigate).not.toHaveBeenCalled();
    expect(mocks.signup).not.toHaveBeenCalled();
  });
});
