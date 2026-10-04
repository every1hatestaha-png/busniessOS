export type SupabasePublicConfig = {
  url: string;
  publishableKey: string;
};

function requireConfiguredValue(name: string, value: string | undefined) {
  const trimmed = value?.trim();
  if (!trimmed) {
    throw new Error(`Supabase auth is not configured: missing ${name}.`);
  }
  return trimmed;
}

export function getSupabasePublicConfig(): SupabasePublicConfig {
  const url = requireConfiguredValue("NEXT_PUBLIC_SUPABASE_URL", process.env.NEXT_PUBLIC_SUPABASE_URL);
  const publishableKey = requireConfiguredValue(
    "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  );

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("Supabase auth is not configured: NEXT_PUBLIC_SUPABASE_URL is invalid.");
  }

  if (parsed.protocol !== "https:" || !parsed.hostname) {
    throw new Error("Supabase auth is not configured: NEXT_PUBLIC_SUPABASE_URL must be an HTTPS URL.");
  }

  return { url: parsed.toString().replace(/\/$/, ""), publishableKey };
}
