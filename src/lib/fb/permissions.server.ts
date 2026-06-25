// SERVER ONLY — token health, permissions, expiry checks.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { fb } from "./api.server";

// Note: read_insights is a Pages permission (not Ads). Ads Insights API uses ads_read.
export const REQUIRED_SCOPES = ["ads_read", "ads_management", "business_management"];

export interface TokenHealth {
  ok: boolean;
  status: "ok" | "missing" | "invalid" | "missing_scopes" | "expiring";
  user_name?: string | null;
  granted?: string[];
  missing?: string[];
  expires_at?: string | null;
  error?: string | null;
}

async function fbJson(url: string) {
  const r = await fetch(url, { headers: { Accept: "application/json" } });
  return r.json();
}

export async function checkTokenHealth(): Promise<TokenHealth> {
  const { data: s } = await supabaseAdmin
    .from("app_settings")
    .select("fb_system_user_token")
    .eq("id", 1)
    .maybeSingle();
  const token = s?.fb_system_user_token;
  const checkedAt = new Date().toISOString();

  if (!token) {
    await supabaseAdmin
      .from("app_settings")
      .update({
        token_status: "missing",
        token_error: "No token configured",
        token_checked_at: checkedAt,
        token_scopes: null,
        token_missing_scopes: null,
        token_user_name: null,
        token_expires_at: null,
      })
      .eq("id", 1);
    return { ok: false, status: "missing", error: "No token configured" };
  }

  try {
    const me: any = await fb.validateToken(token);
    const perm: any = await fbJson(
      `https://graph.facebook.com/v21.0/me/permissions?access_token=${encodeURIComponent(token)}`,
    );
    if (perm.error) throw new Error(perm.error.message);
    const granted: string[] = (perm.data ?? [])
      .filter((p: any) => p.status === "granted")
      .map((p: any) => p.permission);
    const missing = REQUIRED_SCOPES.filter((sc) => !granted.includes(sc));

    let expiresAt: string | null = null;
    try {
      const dbg: any = await fbJson(
        `https://graph.facebook.com/v21.0/debug_token?input_token=${encodeURIComponent(token)}&access_token=${encodeURIComponent(token)}`,
      );
      const exp = dbg?.data?.expires_at;
      if (typeof exp === "number" && exp > 0) expiresAt = new Date(exp * 1000).toISOString();
    } catch {
      /* ignore — System User tokens often don't expose */
    }

    const expiringSoon = !!expiresAt && new Date(expiresAt).getTime() - Date.now() < 7 * 86400000;
    const status: TokenHealth["status"] = missing.length
      ? "missing_scopes"
      : expiringSoon
        ? "expiring"
        : "ok";

    await supabaseAdmin
      .from("app_settings")
      .update({
        token_status: status,
        token_scopes: granted,
        token_missing_scopes: missing,
        token_user_name: me?.name ?? null,
        token_expires_at: expiresAt,
        token_checked_at: checkedAt,
        token_error: null,
      })
      .eq("id", 1);

    // Auto-create alerts (deduped via 1h window)
    if (missing.length) {
      await dedupedAlert(
        "token_scopes",
        "warning",
        "Facebook token missing required scopes",
        `Missing: ${missing.join(", ")}. Regenerate the System User token with the correct permissions.`,
      );
    }
    if (expiringSoon) {
      await dedupedAlert(
        "token_expiring",
        "warning",
        "Facebook token expiring soon",
        `Expires ${new Date(expiresAt!).toLocaleString()}. Regenerate a never-expiring System User token.`,
      );
    }

    return {
      ok: status === "ok",
      status,
      user_name: me?.name ?? null,
      granted,
      missing,
      expires_at: expiresAt,
    };
  } catch (e: any) {
    const msg = e?.message ?? "Token validation failed";
    await supabaseAdmin
      .from("app_settings")
      .update({
        token_status: "invalid",
        token_error: msg,
        token_checked_at: checkedAt,
      })
      .eq("id", 1);
    await dedupedAlert("token_invalid", "critical", "Facebook token invalid or expired", msg);
    return { ok: false, status: "invalid", error: msg };
  }
}

// Per-connection variant — updates meta_connections.token_* columns.
export async function checkConnectionHealth(connectionId: string): Promise<TokenHealth> {
  const { data: c } = await (supabaseAdmin as any)
    .from("meta_connections")
    .select("fb_system_user_token")
    .eq("id", connectionId)
    .maybeSingle();
  const token = c?.fb_system_user_token;
  const checkedAt = new Date().toISOString();

  if (!token) {
    await (supabaseAdmin as any)
      .from("meta_connections")
      .update({
        token_status: "missing",
        token_error: "No token configured",
        token_checked_at: checkedAt,
        token_scopes: null,
        token_missing_scopes: null,
        token_user_name: null,
        token_expires_at: null,
      })
      .eq("id", connectionId);
    return { ok: false, status: "missing", error: "No token configured" };
  }
  try {
    const me: any = await fb.validateToken(token);
    const perm: any = await fbJson(
      `https://graph.facebook.com/v21.0/me/permissions?access_token=${encodeURIComponent(token)}`,
    );
    if (perm.error) throw new Error(perm.error.message);
    const granted: string[] = (perm.data ?? [])
      .filter((p: any) => p.status === "granted")
      .map((p: any) => p.permission);
    const missing = REQUIRED_SCOPES.filter((sc) => !granted.includes(sc));
    let expiresAt: string | null = null;
    try {
      const dbg: any = await fbJson(
        `https://graph.facebook.com/v21.0/debug_token?input_token=${encodeURIComponent(token)}&access_token=${encodeURIComponent(token)}`,
      );
      const exp = dbg?.data?.expires_at;
      if (typeof exp === "number" && exp > 0) expiresAt = new Date(exp * 1000).toISOString();
    } catch {
      /* ignore */
    }
    const expiringSoon = !!expiresAt && new Date(expiresAt).getTime() - Date.now() < 7 * 86400000;
    const status: TokenHealth["status"] = missing.length
      ? "missing_scopes"
      : expiringSoon
        ? "expiring"
        : "ok";
    await (supabaseAdmin as any)
      .from("meta_connections")
      .update({
        token_status: status,
        token_scopes: granted,
        token_missing_scopes: missing,
        token_user_name: me?.name ?? null,
        token_expires_at: expiresAt,
        token_checked_at: checkedAt,
        token_error: null,
      })
      .eq("id", connectionId);
    return {
      ok: status === "ok",
      status,
      user_name: me?.name ?? null,
      granted,
      missing,
      expires_at: expiresAt,
    };
  } catch (e: any) {
    const msg = e?.message ?? "Token validation failed";
    await (supabaseAdmin as any)
      .from("meta_connections")
      .update({
        token_status: "invalid",
        token_error: msg,
        token_checked_at: checkedAt,
      })
      .eq("id", connectionId);
    return { ok: false, status: "invalid", error: msg };
  }
}

async function dedupedAlert(
  type: string,
  severity: "info" | "warning" | "critical",
  title: string,
  message: string,
) {
  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { data: existing } = await supabaseAdmin
    .from("alerts")
    .select("id")
    .eq("type", type)
    .gte("created_at", since)
    .limit(1);
  if (existing && existing.length) return;
  await supabaseAdmin.from("alerts").insert({ type, severity, title, message });
}
