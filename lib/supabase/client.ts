"use client";

import { createBrowserClient } from "@supabase/ssr";

const FALLBACK_SUPABASE_URL = "https://wunynhbseytthrwceqhg.supabase.co";
const FALLBACK_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_ZrVgIikHRhL86YNlopG72g_Em-2_wWP";

export function createSupabaseBrowserClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || FALLBACK_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || FALLBACK_SUPABASE_PUBLISHABLE_KEY;

  return createBrowserClient(url, key);
}
