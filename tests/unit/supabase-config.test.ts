import { afterEach, describe, expect, it, vi } from "vitest";

import { getSupabasePublicConfig } from "@/lib/supabase/config";

describe("Supabase public auth configuration", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("requires both production-facing public auth values", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "");
    expect(() => getSupabasePublicConfig()).toThrow("NEXT_PUBLIC_SUPABASE_URL");
  });

  it("rejects non-HTTPS Supabase URLs", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://localhost:54321");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "test-key");
    expect(() => getSupabasePublicConfig()).toThrow("HTTPS URL");
  });

  it("returns the explicitly configured project without a fallback", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co/");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "test-key");
    expect(getSupabasePublicConfig()).toEqual({
      url: "https://example.supabase.co",
      publishableKey: "test-key",
    });
  });
});
