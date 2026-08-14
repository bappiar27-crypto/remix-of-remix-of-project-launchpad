import { createClient } from "@supabase/supabase-js";
import type { Database } from "./types";

function isNewSupabaseApiKey(value: string): boolean {
  return value.startsWith("sb_publishable_") || value.startsWith("sb_secret_");
}

function createSupabaseFetch(supabaseKey: string): typeof fetch {
  return (input, init) => {
    const headers = new Headers(
      typeof Request !== "undefined" && input instanceof Request ? input.headers : undefined,
    );

    if (init?.headers) {
      new Headers(init.headers).forEach((value, key) => headers.set(key, value));
    }

    if (
      isNewSupabaseApiKey(supabaseKey) &&
      headers.get("Authorization") === `Bearer ${supabaseKey}`
    ) {
      headers.delete("Authorization");
    }

    headers.set("apikey", supabaseKey);
    return fetch(input, { ...init, headers });
  };
}

// Hardcoded fallback values for Cloudflare deployment
const FALLBACK_SUPABASE_URL = "https://wvuapodktpixgtygvclq.supabase.co";
const FALLBACK_SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind2dWFwb2RrdHBpeGd0eWd2Y2xxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE3MjE0MzEsImV4cCI6MjA5NzI5NzQzMX0.Cj6Je9NK_G9wu5nBZIibRE-dAUP3KlNT480aI0Vm9qE";

function createSupabaseClient() {
  const SUPABASE_URL =
    (typeof import.meta !== "undefined" && import.meta.env?.VITE_SUPABASE_URL) ||
    (typeof process !== "undefined" && process.env?.SUPABASE_URL) ||
    (typeof process !== "undefined" && process.env?.VITE_SUPABASE_URL) ||
    FALLBACK_SUPABASE_URL;

  const SUPABASE_PUBLISHABLE_KEY =
    (typeof import.meta !== "undefined" && import.meta.env?.VITE_SUPABASE_PUBLISHABLE_KEY) ||
    (typeof process !== "undefined" && process.env?.SUPABASE_PUBLISHABLE_KEY) ||
    (typeof process !== "undefined" && process.env?.VITE_SUPABASE_PUBLISHABLE_KEY) ||
    FALLBACK_SUPABASE_KEY;

  return createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    global: {
      fetch: createSupabaseFetch(SUPABASE_PUBLISHABLE_KEY),
    },
    auth: {
      storage: typeof window !== "undefined" ? localStorage : undefined,
      persistSession: true,
      autoRefreshToken: true,
    },
  });
}

let _supabase: ReturnType<typeof createSupabaseClient> | undefined;

// Import the supabase client like this:
// import { supabase } from "@/integrations/supabase/client";
export const supabase = new Proxy({} as ReturnType<typeof createSupabaseClient>, {
  get(_, prop, receiver) {
    if (!_supabase) _supabase = createSupabaseClient();
    return Reflect.get(_supabase, prop, receiver);
  },
});