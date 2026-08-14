// Multi Business Manager connection management — server fns.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

async function requireAdminClient(userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("user_roles")
    .select("id")
    .eq("user_id", userId)
    .eq("role", "admin")
    .limit(1);
  if (error) throw new Error(error.message);
  if (!data?.length) throw new Error("Forbidden — admin role required");
  return supabaseAdmin;
}

// ============ List connections (safe fields only) ============
export const listConnections = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const supabaseAdmin = await requireAdminClient(context.userId);
    const { data, error } = await supabaseAdmin.rpc("get_meta_connections_public");
    if (error) throw new Error(error.message);
    return (data ?? []) as Array<{
      id: string;
      label: string;
      fb_app_id: string | null;
      fb_business_id: string | null;
      has_token: boolean;
      has_app_secret: boolean;
      token_status: string | null;
      token_scopes: string[] | null;
      token_missing_scopes: string[] | null;
      token_user_name: string | null;
      token_expires_at: string | null;
      token_checked_at: string | null;
      token_error: string | null;
      is_active: boolean;
      account_count: number;
      created_at: string;
      updated_at: string;
    }>;
  });

// ============ Add / Update / Remove ============
const connectionInput = z.object({
  id: z.string().uuid().optional(),
  label: z.string().min(1).max(120),
  fb_app_id: z.string().max(120).optional().nullable(),
  fb_app_secret: z.string().max(400).optional().nullable(),
  fb_business_id: z.string().max(120).optional().nullable(),
  fb_system_user_token: z.string().max(2000).optional().nullable(),
  is_active: z.boolean().optional(),
});

function datePresetBounds(datePreset: string) {
  const d = new Date();
  if (datePreset === "today") {
    const day = d.toISOString().slice(0, 10);
    return { since: day, until: day };
  }
  if (datePreset === "yesterday") {
    d.setDate(d.getDate() - 1);
    const day = d.toISOString().slice(0, 10);
    return { since: day, until: day };
  }
  if (datePreset === "last_month") {
    const first = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 1, 1));
    const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 0));
    return { since: first.toISOString().slice(0, 10), until: last.toISOString().slice(0, 10) };
  }
  if (datePreset === "last_30d") d.setDate(d.getDate() - 29);
  else if (datePreset === "this_month") d.setDate(1);
  else d.setDate(d.getDate() - 6);
  return { since: d.toISOString().slice(0, 10), until: undefined as string | undefined };
}

export const upsertConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: z.infer<typeof connectionInput>) => connectionInput.parse(d))
  .handler(async ({ data, context }) => {
    const supabaseAdmin = await requireAdminClient(context.userId);
    const row: Record<string, any> = {
      label: data.label,
      updated_at: new Date().toISOString(),
    };
    if (data.fb_app_id !== undefined) row.fb_app_id = data.fb_app_id || null;
    if (data.fb_business_id !== undefined) row.fb_business_id = data.fb_business_id || null;
    if (data.fb_app_secret) row.fb_app_secret = data.fb_app_secret;
    if (data.fb_system_user_token) row.fb_system_user_token = data.fb_system_user_token;
    if (data.is_active !== undefined) row.is_active = data.is_active;

    if (data.id) {
      const { error } = await (supabaseAdmin as any)
        .from("meta_connections")
        .update(row as any)
        .eq("id", data.id);
      if (error) throw new Error(error.message);
      return { id: data.id };
    } else {
      row.created_by = context.userId;
      const { data: inserted, error } = await (supabaseAdmin as any)
        .from("meta_connections")
        .insert(row as any)
        .select("id")
        .single();

      if (error) throw new Error(error.message);
      return { id: inserted.id };
    }
  });

export const removeConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const supabaseAdmin = await requireAdminClient(context.userId);
    // Detach ad_accounts (FK ON DELETE SET NULL handles it, but be explicit)
    await supabaseAdmin
      .from("ad_accounts")
      .update({ connection_id: null })
      .eq("connection_id", data.id);
    const { error } = await (supabaseAdmin as any).from("meta_connections").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ============ Test a connection (validates token + lists ad accounts) ============
export const testConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const supabaseAdmin = await requireAdminClient(context.userId);
    const { data: c } = await (supabaseAdmin as any)
      .from("meta_connections")
      .select("fb_system_user_token,fb_business_id")
      .eq("id", data.id)
      .maybeSingle();
    const token = c?.fb_system_user_token;
    if (!token)
      return { ok: false, error: "No token saved for this connection.", accounts: [] as any[] };
    try {
      const { fb } = await import("./api.server");
      const me = await fb.validateToken(token);
      const { accounts, probes } = await fb.listAdAccountsDetailed(token, c?.fb_business_id);
      return {
        ok: accounts.length > 0,
        user: me,
        accounts,
        probes,
        error:
          accounts.length === 0
            ? "Token works but 0 ad accounts visible. Assign ad accounts to this System User with Full Control."
            : null,
      };
    } catch (e: any) {
      return { ok: false, error: e?.message ?? "Validation failed", accounts: [] as any[] };
    }
  });

// ============ Health check (updates token_* columns) ============
export const checkConnectionHealth = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await requireAdminClient(context.userId);
    const { checkConnectionHealth: run } = await import("./permissions.server");
    return run(data.id);
  });

// ============ Import & sync all accounts for a connection ============
export const syncConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await requireAdminClient(context.userId);
    const { syncConnectionAccounts } = await import("./sync.server");
    return syncConnectionAccounts(data.id);
  });

// ============ Import visible accounts for one connection ============
export const importVisibleForConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const supabaseAdmin = await requireAdminClient(context.userId);
    const { data: c } = await (supabaseAdmin as any)
      .from("meta_connections")
      .select("id,label,fb_system_user_token,fb_business_id")
      .eq("id", data.id)
      .maybeSingle();
    if (!c?.fb_system_user_token) throw new Error("No token saved for this connection");

    const { fb } = await import("./api.server");
    const { accounts } = await fb.listAdAccountsDetailed(c.fb_system_user_token, c.fb_business_id);
    if (accounts.length === 0)
      throw new Error("Facebook returned 0 visible ad accounts for this connection");

    const bucketSlug = `meta-imported-${c.id.slice(0, 8)}`;
    const { data: existingClient } = await supabaseAdmin
      .from("clients")
      .select("id")
      .eq("slug", bucketSlug)
      .maybeSingle();
    let clientId = existingClient?.id as string | undefined;
    if (!clientId) {
      const { data: client, error: clientError } = await supabaseAdmin
        .from("clients")
        .insert({
          name: `Meta Imported — ${c.label}`,
          slug: bucketSlug,
          company: "Facebook Ads",
          created_by: context.userId,
        })
        .select("id")
        .single();
      if (clientError) throw new Error(clientError.message);
      clientId = client.id;
    }

    const rows = accounts.map((a) => ({
      client_id: clientId,
      connection_id: c.id,
      fb_account_id: a.id,
      account_name: a.name,
      currency: a.currency,
      timezone_name: a.timezone_name,
      account_status: a.account_status,
      business_name: a.business?.name ?? null,
      is_active: true,
    }));
    const { data: imported, error } = await supabaseAdmin
      .from("ad_accounts")
      .upsert(rows, { onConflict: "fb_account_id" })
      .select("id,fb_account_id");
    if (error) throw new Error(error.message);

    // Ensure connection_id is set even for previously-existing rows
    await supabaseAdmin
      .from("ad_accounts")
      .update({ connection_id: c.id })
      .in(
        "fb_account_id",
        accounts.map((a) => a.id),
      );

    return { imported: imported?.length ?? 0 };
  });

// ============ Per-connection account sync status (real-time) ============
export const getConnectionAccountsStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const supabaseAdmin = await requireAdminClient(context.userId);
    const { data: rows, error } = await supabaseAdmin
      .from("ad_accounts")
      .select(
        "id,fb_account_id,account_name,currency,last_sync_at,last_sync_status,last_sync_error,total_spend,is_active",
      )
      .eq("connection_id", data.id)
      .order("account_name", { ascending: true });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

// ============ Match check (Ads Manager ↔ our DB) ============
// For each ad account in the connection, fetch live account-level spend for
// the chosen date_preset from Meta and compare to the sum we have in DB
// (campaigns table). Returns a diff so admins can verify 1:1 accuracy.
export const matchCheckConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; date_preset?: string }) =>
    z
      .object({
        id: z.string().uuid(),
        date_preset: z
          .enum([
            "today",
            "yesterday",
            "last_7d",
            "last_30d",
            "this_month",
            "last_month",
            "maximum",
          ])
          .optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const supabaseAdmin = await requireAdminClient(context.userId);
    const datePreset = data.date_preset ?? "last_7d";

    const { data: c } = await (supabaseAdmin as any)
      .from("meta_connections")
      .select("fb_system_user_token,label")
      .eq("id", data.id)
      .maybeSingle();
    const token = c?.fb_system_user_token;
    if (!token) throw new Error("No token saved for this connection");

    const { data: accts } = await supabaseAdmin
      .from("ad_accounts")
      .select("id,fb_account_id,account_name,currency,total_spend")
      .eq("connection_id", data.id);

    const { fb } = await import("./api.server");
    const results: Array<{
      ad_account_id: string;
      fb_account_id: string;
      account_name: string | null;
      currency: string | null;
      live_spend: number;
      db_spend: number;
      diff: number;
      diff_pct: number;
      ok: boolean;
      error?: string | null;
    }> = [];

    for (const a of accts ?? []) {
      try {
        const live = await fb.getAccountInsights(a.fb_account_id, token, datePreset);
        const liveSpend = Number(live?.spend ?? 0);
        // DB spend for the same window must use daily snapshots, not lifetime account totals.
        let dbSpend = 0;
        if (datePreset === "maximum") {
          dbSpend = Number(a.total_spend ?? 0);
        } else {
          const bounds = datePresetBounds(datePreset);
          let q = supabaseAdmin
            .from("insights_snapshots")
            .select("spend")
            .eq("ad_account_id", a.id)
            .eq("level", "account")
            .gte("date_start", bounds.since);
          if (bounds.until) q = q.lte("date_start", bounds.until);
          const { data: rows } = await q;
          dbSpend = (rows ?? []).reduce((s: number, r: any) => s + (Number(r.spend) || 0), 0);
        }
        const diff = liveSpend - dbSpend;
        const diff_pct = dbSpend > 0 ? (diff / dbSpend) * 100 : liveSpend > 0 ? 100 : 0;
        results.push({
          ad_account_id: a.id,
          fb_account_id: a.fb_account_id,
          account_name: a.account_name,
          currency: a.currency,
          live_spend: liveSpend,
          db_spend: dbSpend,
          diff,
          diff_pct,
          ok: Math.abs(diff_pct) < 1,
        });
      } catch (e: any) {
        results.push({
          ad_account_id: a.id,
          fb_account_id: a.fb_account_id,
          account_name: a.account_name,
          currency: a.currency,
          live_spend: 0,
          db_spend: Number(a.total_spend ?? 0),
          diff: 0,
          diff_pct: 0,
          ok: false,
          error: e?.message ?? "Failed",
        });
      }
    }
    return { date_preset: datePreset, results };
  });
