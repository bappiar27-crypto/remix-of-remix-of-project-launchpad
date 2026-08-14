import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { createClient } from "@supabase/supabase-js";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// Hardcoded fallback values for Cloudflare deployment (same as src/integrations/supabase/client.ts)
const FALLBACK_SUPABASE_URL = "https://wvuapodktpixgtygvclq.supabase.co";
const FALLBACK_SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind2dWFwb2RrdHBpeGd0eWd2Y2xxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE3MjE0MzEsImV4cCI6MjA5NzI5NzQzMX0.Cj6Je9NK_G9wu5nBZIibRE-dAUP3KlNT480aI0Vm9qE";

function clientIp(): string {
  const req = getRequest();
  const h = req.headers;
  const fwd = h.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return (
    h.get("cf-connecting-ip") ||
    h.get("x-real-ip") ||
    h.get("true-client-ip") ||
    "unknown"
  );
}

function anonClient() {
  const url =
    process.env.SUPABASE_URL ||
    process.env.VITE_SUPABASE_URL ||
    FALLBACK_SUPABASE_URL;
  const key =
    process.env.SUPABASE_PUBLISHABLE_KEY ||
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
    FALLBACK_SUPABASE_KEY;
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export const checkIpBlocked = createServerFn({ method: "GET" }).handler(async () => {
  try {
    const ip = clientIp();
    const sb = anonClient();
    const { data, error } = await sb.rpc("is_ip_blocked", { _ip: ip });
    if (error) return { blocked: false, ip };
    return { blocked: !!data, ip };
  } catch {
    return { blocked: false, ip: "unknown" };
  }
});

export const recordLoginAttempt = createServerFn({ method: "POST" })
  .inputValidator((d: { email: string; success: boolean }) => d)
  .handler(async ({ data }) => {
    try {
      const ip = clientIp();
      const sb = anonClient();
      await sb.rpc("record_login_attempt", {
        _ip: ip,
        _email: data.email ?? null,
        _success: data.success,
      });
      return { ip };
    } catch {
      return { ip: "unknown" };
    }
  });

export const adminListBlockedIps = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: roles } = await context.supabase
      .from("user_roles").select("role").eq("user_id", context.userId).eq("role", "admin").maybeSingle();
    if (!roles) throw new Error("Forbidden");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("login_attempts")
      .select("ip_address,email,success,created_at")
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) throw new Error(error.message);
    const byIp = new Map<string, { ip: string; failures: number; lastEmail: string | null; lastAt: string; blocked: boolean }>();
    for (const r of data ?? []) {
      const cur = byIp.get(r.ip_address) ?? { ip: r.ip_address, failures: 0, lastEmail: null, lastAt: r.created_at, blocked: false };
      if (!r.success) cur.failures += 1;
      if (!cur.lastEmail) cur.lastEmail = r.email;
      cur.blocked = cur.failures >= 2;
      byIp.set(r.ip_address, cur);
    }
    return Array.from(byIp.values()).sort((a, b) => b.failures - a.failures);
  });

export const adminUnblockIp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { ip: string }) => d)
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("admin_unblock_ip", { _ip: data.ip });
    if (error) throw new Error(error.message);
    return { ok: true };
  });
