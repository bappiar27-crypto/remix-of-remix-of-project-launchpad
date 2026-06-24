import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

type ProfileUpsert = {
  id: string;
  email: string;
  full_name: string;
  updated_at: string;
};

type AdminRoleUpsert = {
  user_id: string;
  role: "admin";
};

async function requireAdmin(userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("user_roles")
    .select("id")
    .eq("user_id", userId)
    .eq("role", "admin")
    .limit(1);
  if (error) throw new Error(error.message);
  if (data?.length) return supabaseAdmin;

  const { count, error: countError } = await supabaseAdmin
    .from("user_roles")
    .select("id", { count: "exact", head: true })
    .eq("role", "admin");
  if (countError) throw new Error(countError.message);

  if ((count ?? 0) === 0) {
    const { data: authUser, error: userError } = await supabaseAdmin.auth.admin.getUserById(userId);
    if (userError) throw new Error(userError.message);
    const email = authUser.user?.email ?? "";
    const fullName =
      (authUser.user?.user_metadata?.full_name as string | undefined) || email || "Admin";
    const profile: ProfileUpsert = {
      id: userId,
      email,
      full_name: fullName,
      updated_at: new Date().toISOString(),
    };

    const { error: profileError } = await supabaseAdmin
      .from("profiles")
      .upsert(profile, { onConflict: "id" });
    if (profileError) throw new Error(profileError.message);

    const adminRole: AdminRoleUpsert = { user_id: userId, role: "admin" };
    const { error: roleError } = await supabaseAdmin
      .from("user_roles")
      .upsert(adminRole, { onConflict: "user_id,role" });
    if (roleError) throw new Error(roleError.message);
    return supabaseAdmin;
  }

  throw new Error("Forbidden — this account is not admin. Sign in with the owner account.");
}

// ============ Settings ============
export const getSettingsPublic = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("app_settings")
      .select(
        "fb_system_user_token,fb_app_id,fb_business_id,sync_interval_minutes,auto_sync_enabled,updated_at,fb_verify_token,fb_app_secret,token_status,token_scopes,token_missing_scopes,token_user_name,token_expires_at,token_checked_at,token_error,org_name,org_email,org_phone,org_address,brand_logo_url,brand_primary_color,brand_secondary_color,pref_timezone,pref_currency,pref_language,pref_attribution_window",
      )
      .eq("id", 1)
      .maybeSingle();
    if (error) throw new Error(error.message);
    const d: any = data ?? {};
    return {
      has_token: !!d.fb_system_user_token,
      fb_app_id: d.fb_app_id ?? null,
      fb_business_id: d.fb_business_id ?? null,
      sync_interval_minutes: d.sync_interval_minutes ?? 5,
      auto_sync_enabled: d.auto_sync_enabled ?? true,
      updated_at: d.updated_at ?? null,
      has_verify_token: !!d.fb_verify_token,
      has_app_secret: !!d.fb_app_secret,
      token_status: d.token_status ?? null,
      token_scopes: d.token_scopes ?? null,
      token_missing_scopes: d.token_missing_scopes ?? null,
      token_user_name: d.token_user_name ?? null,
      token_expires_at: d.token_expires_at ?? null,
      token_checked_at: d.token_checked_at ?? null,
      token_error: d.token_error ?? null,
      org_name: d.org_name ?? null,
      org_email: d.org_email ?? null,
      org_phone: d.org_phone ?? null,
      org_address: d.org_address ?? null,
      brand_logo_url: d.brand_logo_url ?? null,
      brand_primary_color: d.brand_primary_color ?? "#1F2240",
      brand_secondary_color: d.brand_secondary_color ?? "#8B5CF6",
      pref_timezone: d.pref_timezone ?? "Asia/Dhaka",
      pref_currency: d.pref_currency ?? "USD",
      pref_language: d.pref_language ?? "en",
      pref_attribution_window: d.pref_attribution_window ?? "28d_click",
    };
  });

export const saveSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (d: {
      token?: string;
      fb_app_id?: string;
      fb_business_id?: string;
      sync_interval_minutes?: number;
      auto_sync_enabled?: boolean;
      fb_verify_token?: string;
      fb_app_secret?: string;
    }) =>
      z
        .object({
          token: z.string().optional(),
          fb_app_id: z.string().optional(),
          fb_business_id: z.string().optional(),
          sync_interval_minutes: z.number().min(1).max(1440).optional(),
          auto_sync_enabled: z.boolean().optional(),
          fb_verify_token: z.string().max(200).optional(),
          fb_app_secret: z.string().max(200).optional(),
        })
        .parse(d),
  )
  .handler(async ({ data, context }) => {
    const supabaseAdmin = await requireAdmin(context.userId);
    const update: Record<string, any> = {
      id: 1,
      updated_at: new Date().toISOString(),
      updated_by: context.userId,
    };
    if (data.token !== undefined && data.token.trim() !== "")
      update.fb_system_user_token = data.token.trim();
    if (data.fb_app_id !== undefined) update.fb_app_id = data.fb_app_id;
    if (data.fb_business_id !== undefined) update.fb_business_id = data.fb_business_id;
    if (data.sync_interval_minutes !== undefined)
      update.sync_interval_minutes = data.sync_interval_minutes;
    if (data.auto_sync_enabled !== undefined) update.auto_sync_enabled = data.auto_sync_enabled;
    if (data.fb_verify_token !== undefined && data.fb_verify_token !== "")
      update.fb_verify_token = data.fb_verify_token;
    if (data.fb_app_secret !== undefined && data.fb_app_secret !== "")
      update.fb_app_secret = data.fb_app_secret;

    const { error } = await supabaseAdmin
      .from("app_settings")
      .upsert(update as any, { onConflict: "id" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const checkTokenHealthNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireAdmin(context.userId);
    const { checkTokenHealth } = await import("./permissions.server");
    return checkTokenHealth();
  });

export const rotatePortalToken = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { client_id: string; clear?: boolean }) =>
    z.object({ client_id: z.string().uuid(), clear: z.boolean().optional() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const supabaseAdmin = await requireAdmin(context.userId);
    if (data.clear) {
      const { error } = await supabaseAdmin
        .from("clients")
        .update({ portal_token: null })
        .eq("id", data.client_id);
      if (error) throw new Error(error.message);
      return { token: null as string | null };
    }
    const arr = new Uint8Array(24);
    crypto.getRandomValues(arr);
    const token = Array.from(arr)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    const { error } = await supabaseAdmin
      .from("clients")
      .update({ portal_token: token })
      .eq("id", data.client_id);
    if (error) throw new Error(error.message);
    return { token };
  });

export const getPortalToken = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { client_id: string }) => z.object({ client_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const supabaseAdmin = await requireAdmin(context.userId);
    const { data: row } = await supabaseAdmin
      .from("clients")
      .select("portal_token")
      .eq("id", data.client_id)
      .maybeSingle();
    return { token: (row?.portal_token ?? null) as string | null };
  });

export const testFbToken = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const supabaseAdmin = await requireAdmin(context.userId);
    const { data: s } = await supabaseAdmin
      .from("app_settings")
      .select("fb_system_user_token,fb_business_id")
      .eq("id", 1)
      .maybeSingle();
    const token = s?.fb_system_user_token;
    if (!token)
      return {
        ok: false,
        error: "No Facebook token configured. Paste your System User token in Settings first.",
        probes: [] as any[],
      };
    try {
      const { fb } = await import("./api.server");
      const me = await fb.validateToken(token);
      const { accounts, probes } = await fb.listAdAccountsDetailed(token, s?.fb_business_id);
      const dataProbes =
        accounts.length > 0 ? await fb.probeAccountDataAccess(accounts, token) : [];
      if (accounts.length === 0) {
        return {
          ok: false,
          user: me,
          accounts: [],
          probes,
          dataProbes,
          error:
            "Token works, but 0 ad accounts visible. In Business Settings → Users → System Users → select your user → Add Assets → choose your Ad Accounts (Full control). Then set Business ID in Settings here and retry.",
        };
      }
      const blocked = dataProbes.filter((p) => !p.ok);
      if (blocked.length > 0) {
        return {
          ok: false,
          user: me,
          accounts,
          probes,
          dataProbes,
          error: `Found ${accounts.length} ad accounts, but Facebook blocks campaign/insights reads. First failed call: ${blocked[0].endpoint} — ${blocked[0].error?.message ?? "permission denied"}`,
        };
      }
      return { ok: true, user: me, accounts, probes, dataProbes };
    } catch (e: any) {
      return { ok: false, error: e?.message ?? "Token validation failed", probes: [] as any[] };
    }
  });

export const importVisibleAdAccounts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const supabaseAdmin = await requireAdmin(context.userId);
    const { data: s } = await supabaseAdmin
      .from("app_settings")
      .select("fb_system_user_token,fb_business_id")
      .eq("id", 1)
      .maybeSingle();
    const token = s?.fb_system_user_token;
    if (!token) throw new Error("No Facebook token configured");
    const { fb } = await import("./api.server");
    const { accounts } = await fb.listAdAccountsDetailed(token, s?.fb_business_id);
    if (accounts.length === 0)
      throw new Error("Facebook returned 0 visible ad accounts. Fix asset assignment first.");

    const { data: existingClient } = await supabaseAdmin
      .from("clients")
      .select("id")
      .eq("slug", "meta-imported-accounts")
      .maybeSingle();
    let clientId = existingClient?.id as string | undefined;
    if (!clientId) {
      const { data: client, error: clientError } = await supabaseAdmin
        .from("clients")
        .insert({
          name: "Meta Imported Accounts",
          slug: "meta-imported-accounts",
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

    const { syncAdAccount } = await import("./sync.server");
    const syncResults = [] as Array<{
      id: string;
      fb_account_id: string;
      ok: boolean;
      error?: string | null;
      itemsSynced?: number;
    }>;
    for (const account of imported ?? []) {
      const result = await syncAdAccount(account.id);
      syncResults.push({
        id: account.id,
        fb_account_id: account.fb_account_id,
        ok: result.ok,
        error: result.error,
        itemsSynced: result.itemsSynced,
      });
    }
    return { imported: imported?.length ?? 0, syncResults };
  });

export const detectBusinessesFromToken = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const supabaseAdmin = await requireAdmin(context.userId);
    const { data: s } = await supabaseAdmin
      .from("app_settings")
      .select("fb_system_user_token")
      .eq("id", 1)
      .maybeSingle();
    const token = s?.fb_system_user_token;
    if (!token)
      return {
        ok: false,
        businesses: [] as Array<{ id: string; name: string }>,
        error: "No token configured",
      };
    try {
      const { fb } = await import("./api.server");
      const businesses = await fb.listBusinesses(token);
      return { ok: true, businesses };
    } catch (e: any) {
      return {
        ok: false,
        businesses: [] as Array<{ id: string; name: string }>,
        error: e?.message ?? "Failed",
      };
    }
  });

export const listAvailableAdAccounts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const supabaseAdmin = await requireAdmin(context.userId);
    const { data: s } = await supabaseAdmin
      .from("app_settings")
      .select("fb_system_user_token,fb_business_id")
      .eq("id", 1)
      .maybeSingle();
    const token = s?.fb_system_user_token;
    const [{ data: existing }, { data: campaigns }] = await Promise.all([
      supabaseAdmin
        .from("ad_accounts")
        .select(
          "id,fb_account_id,account_name,currency,timezone_name,account_status,business_name,total_spend,total_reach,total_results,active_campaigns,last_sync_at,last_sync_status,client_id,clients(name,slug)",
        ),
      supabaseAdmin
        .from("campaigns")
        .select("id,ad_account_id,name,effective_status,spend,reach,impressions,clicks,results")
        .order("spend", { ascending: false })
        .limit(1000),
    ]);

    const campaignMap = new Map<string, any[]>();
    for (const c of campaigns ?? []) {
      const rows = campaignMap.get(c.ad_account_id) ?? [];
      rows.push(c);
      campaignMap.set(c.ad_account_id, rows);
    }

    const existingByFb = new Map<string, any>();
    for (const row of existing ?? []) existingByFb.set(row.fb_account_id, row);

    let liveAccounts: any[] = [];
    let liveError: string | null = null;
    if (token) {
      try {
        const { fb } = await import("./api.server");
        liveAccounts = await fb.listAdAccounts(token, s?.fb_business_id);
      } catch (e: any) {
        liveError = e?.message ?? "Could not refresh live Meta accounts";
      }
    }

    if (!token && existingByFb.size === 0) throw new Error("No Facebook token configured");

    const merged = new Map<string, any>();
    for (const live of liveAccounts) {
      const db = existingByFb.get(live.id);
      const client = Array.isArray(db?.clients) ? db.clients[0] : db?.clients;
      const accountCampaigns = db?.id ? (campaignMap.get(db.id) ?? []) : [];
      merged.set(live.id, {
        ...live,
        db_id: db?.id ?? null,
        connectedClientName: client?.name ?? null,
        connectedClientSlug: client?.slug ?? null,
        alreadyConnected: !!client && client.slug !== "meta-imported-accounts",
        isImportBucket: client?.slug === "meta-imported-accounts",
        campaignCount: accountCampaigns.length,
        activeCampaignCount:
          accountCampaigns.filter((c) => c.effective_status === "ACTIVE").length ||
          Number(db?.active_campaigns ?? 0),
        topCampaigns: accountCampaigns.slice(0, 8).map((c) => ({
          id: c.id,
          name: c.name,
          status: c.effective_status,
          spend: c.spend,
          reach: c.reach,
          impressions: c.impressions,
          clicks: c.clicks,
          results: c.results,
        })),
        last_sync_at: db?.last_sync_at ?? null,
        last_sync_status: db?.last_sync_status ?? null,
      });
    }
    for (const db of existing ?? []) {
      if (merged.has(db.fb_account_id)) continue;
      const client = Array.isArray((db as any).clients)
        ? (db as any).clients[0]
        : (db as any).clients;
      const accountCampaigns = campaignMap.get(db.id) ?? [];
      merged.set(db.fb_account_id, {
        id: db.fb_account_id,
        name: db.account_name ?? db.fb_account_id,
        account_status: db.account_status,
        currency: db.currency,
        timezone_name: db.timezone_name,
        business: db.business_name ? { name: db.business_name } : undefined,
        db_id: db.id,
        connectedClientName: client?.name ?? null,
        connectedClientSlug: client?.slug ?? null,
        alreadyConnected: !!client && client.slug !== "meta-imported-accounts",
        isImportBucket: client?.slug === "meta-imported-accounts",
        campaignCount: accountCampaigns.length,
        activeCampaignCount:
          accountCampaigns.filter((c) => c.effective_status === "ACTIVE").length ||
          Number(db.active_campaigns ?? 0),
        topCampaigns: accountCampaigns.slice(0, 8).map((c) => ({
          id: c.id,
          name: c.name,
          status: c.effective_status,
          spend: c.spend,
          reach: c.reach,
          impressions: c.impressions,
          clicks: c.clicks,
          results: c.results,
        })),
        last_sync_at: db.last_sync_at,
        last_sync_status: db.last_sync_status,
        cachedOnly: true,
      });
    }

    return Array.from(merged.values())
      .sort(
        (a, b) =>
          (Number(b.campaignCount) || 0) - (Number(a.campaignCount) || 0) ||
          String(a.name).localeCompare(String(b.name)),
      )
      .map((a) => ({ ...a, liveError }));
  });

// ============ Clients ============
export const createClient = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: any) =>
    z
      .object({
        name: z.string().min(1).max(200),
        slug: z
          .string()
          .regex(/^[a-z0-9-]+$/)
          .max(80)
          .optional(),
        contact_email: z.string().email().optional().or(z.literal("")),
        contact_phone: z.string().max(40).optional(),
        company: z.string().max(200).optional(),
        website: z.string().max(300).optional().or(z.literal("")),
        address: z.string().max(500).optional(),
        notes: z.string().max(2000).optional(),
        monthly_budget: z.number().nonnegative().optional(),
        deposit_amount: z.number().nonnegative().optional(),
        deposit_currency: z.string().max(8).optional(),
        bdt_rate: z.number().nonnegative().optional().nullable(),
        commission_enabled: z.boolean().optional(),
        commission_percent: z.number().min(0).max(100).optional(),
        commission_notes: z.string().max(2000).optional(),
        brand_color: z.string().max(20).optional(),
        ad_account_ids: z.array(z.string()).optional(),
        campaign_ids: z.array(z.string().uuid()).optional(),
        ad_set_fb_ids: z.array(z.string().min(1)).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const supabaseAdmin = await requireAdmin(context.userId);
    // ✅ Duplicate-name guard — block creating two clients with the same name
    // (case-insensitive, trimmed). Without this the slug auto-suffixes to
    // "-1", "-2" and the Clients list shows what looks like duplicate rows.
    const trimmedName = data.name.trim();
    const { data: dupe } = await supabaseAdmin
      .from("clients")
      .select("id,name")
      .ilike("name", trimmedName)
      .maybeSingle();
    if (dupe) {
      throw new Error(
        `A client named "${dupe.name}" already exists. Please choose a different name.`,
      );
    }
    const baseSlug =
      (data.slug && data.slug.length > 0
        ? data.slug
        : data.name
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/(^-|-$)/g, "")) || Math.random().toString(36).slice(2, 10);
    let slug = baseSlug;
    let attempt = 0;
    while (true) {
      const { data: existing } = await supabaseAdmin
        .from("clients")
        .select("id")
        .eq("slug", slug)
        .maybeSingle();
      if (!existing) break;
      attempt += 1;
      slug = `${baseSlug}-${attempt}`;
    }
    const { error, data: row } = await context.supabase
      .from("clients")
      .insert({
        name: data.name,
        slug,
        contact_email: data.contact_email || null,
        contact_phone: data.contact_phone || null,
        company: data.company || null,
        website: data.website || null,
        address: data.address || null,
        notes: data.notes || null,
        monthly_budget: data.monthly_budget ?? 0,
        deposit_amount: data.deposit_amount ?? 0,
        deposit_currency: data.deposit_currency || "USD",
        bdt_rate: data.bdt_rate ?? null,
        commission_enabled: !!data.commission_enabled,
        commission_percent: data.commission_percent ?? 0,
        commission_notes: data.commission_notes || null,
        brand_color: data.brand_color || null,
        created_by: context.userId,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);

    if (data.ad_account_ids && data.ad_account_ids.length > 0 && row) {
      const { data: s } = await supabaseAdmin
        .from("app_settings")
        .select("fb_system_user_token")
        .eq("id", 1)
        .maybeSingle();
      const token = s?.fb_system_user_token;
      const { fb, normalizeActId } = await import("./api.server");
      for (const accId of data.ad_account_ids) {
        const actId = normalizeActId(accId);
        const { data: existingAccount } = await supabaseAdmin
          .from("ad_accounts")
          .select("id")
          .eq("fb_account_id", actId)
          .maybeSingle();
        if (existingAccount?.id) {
          await supabaseAdmin
            .from("ad_accounts")
            .update({ client_id: row.id, is_active: true })
            .eq("id", existingAccount.id);
          continue;
        }
        if (!token) continue;
        try {
          const info = await fb.getAccount(actId, token);
          await supabaseAdmin.from("ad_accounts").insert({
            client_id: row.id,
            fb_account_id: actId,
            account_name: info.name,
            currency: info.currency,
            timezone_name: info.timezone_name,
            account_status: info.account_status,
            business_name: info.business?.name ?? null,
            is_active: true,
          });
        } catch (e) {
          /* keep saving the partner even if one account fails */
        }
      }
    }
    if (data.campaign_ids && data.campaign_ids.length > 0 && row) {
      const rows = data.campaign_ids.map((campaignId: string) => ({
        client_id: row.id,
        campaign_id: campaignId,
      }));
      const { error: campaignError } = await supabaseAdmin
        .from("client_campaigns")
        .upsert(rows, { onConflict: "client_id,campaign_id" });
      if (campaignError) throw new Error(campaignError.message);
    }
    // Ad-set level scoping — store the exact FB ad-set IDs the admin picked.
    // The portal uses these to filter ad sets + ads so we do NOT leak every
    // ad set under the parent campaign.
    if (data.ad_set_fb_ids && data.ad_set_fb_ids.length > 0 && row) {
      const adsetRows = data.ad_set_fb_ids.map((fbId: string) => ({
        client_id: row.id,
        fb_adset_id: fbId,
      }));
      const { error: adsetError } = await supabaseAdmin
        .from("client_ad_sets")
        .upsert(adsetRows, { onConflict: "client_id,fb_adset_id" });
      if (adsetError) throw new Error(adsetError.message);
    }
    return row;
  });

export const updateClient = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: any) =>
    z
      .object({
        id: z.string().uuid(),
        name: z.string().min(1).optional(),
        slug: z
          .string()
          .regex(/^[a-z0-9-]+$/)
          .optional(),
        contact_email: z.string().optional(),
        contact_phone: z.string().optional(),
        company: z.string().optional(),
        website: z.string().optional(),
        address: z.string().optional(),
        notes: z.string().optional(),
        monthly_budget: z.number().optional(),
        deposit_amount: z.number().optional(),
        deposit_currency: z.string().optional(),
        bdt_rate: z.number().nullable().optional(),
        commission_enabled: z.boolean().optional(),
        commission_percent: z.number().optional(),
        commission_notes: z.string().optional(),
        brand_color: z.string().optional(),
        status: z.enum(["active", "paused", "archived"]).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { id, ...rest } = data;
    const { error } = await context.supabase.from("clients").update(rest).eq("id", id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteClient = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("clients").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ============ Ad accounts ============
export const connectAdAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { client_id: string; fb_account_id: string }) =>
    z.object({ client_id: z.string().uuid(), fb_account_id: z.string().min(1) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const supabaseAdmin = await requireAdmin(context.userId);
    const { data: s } = await supabaseAdmin
      .from("app_settings")
      .select("fb_system_user_token")
      .eq("id", 1)
      .maybeSingle();
    const token = s?.fb_system_user_token;
    if (!token) throw new Error("Configure your Facebook token in Settings first");
    const { fb, normalizeActId } = await import("./api.server");
    const actId = normalizeActId(data.fb_account_id);
    const info = await fb.getAccount(actId, token);
    const { error, data: row } = await supabaseAdmin
      .from("ad_accounts")
      .insert({
        client_id: data.client_id,
        fb_account_id: info.id,
        account_name: info.name,
        currency: info.currency,
        timezone_name: info.timezone_name,
        account_status: info.account_status,
        business_name: info.business?.name ?? null,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    try {
      const { syncAdAccount } = await import("./sync.server");
      await syncAdAccount(row.id);
    } catch (e) {
      console.error("[connectAdAccount] initial sync failed", e);
    }
    return row;
  });

export const disconnectAdAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("ad_accounts").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ============ Manual sync ============
export const syncAllAccountsNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireAdmin(context.userId);
    const { syncAllAccounts } = await import("./sync.server");
    const res = await syncAllAccounts();
    return res;
  });

export const syncOneAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await requireAdmin(context.userId);
    const { syncAdAccount } = await import("./sync.server");
    return syncAdAccount(data.id);
  });

// ============ Refresh all data ============
export const refreshAllData = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const supabaseAdmin = await requireAdmin(context.userId);
    await supabaseAdmin.from("insights_snapshots").delete().not("id", "is", null);
    await supabaseAdmin.from("ads").delete().not("id", "is", null);
    await supabaseAdmin.from("ad_sets").delete().not("id", "is", null);
    await supabaseAdmin.from("campaigns").delete().not("id", "is", null);
    await supabaseAdmin.from("sync_logs").delete().not("id", "is", null);
    await supabaseAdmin
      .from("ad_accounts")
      .update({
        total_spend: 0,
        total_reach: 0,
        total_results: 0,
        active_campaigns: 0,
        last_sync_status: null,
        last_sync_error: null,
        last_sync_at: null,
      })
      .not("id", "is", null);
    const { syncAllAccounts } = await import("./sync.server");
    const res = await syncAllAccounts();
    return { cleared: true, ...res };
  });

// ============ Re-test token + re-import ============
export const retestAndReimport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const supabaseAdmin = await requireAdmin(context.userId);
    const { fb } = await import("./api.server");
    const { syncAdAccount } = await import("./sync.server");

    const { data: connections } = await supabaseAdmin
      .from("meta_connections")
      .select("id,label,fb_system_user_token,fb_business_id")
      .eq("is_active", true);

    let connImported = 0;
    const connSyncResults: Array<{
      id: string;
      fb_account_id: string;
      account_name: string | null;
      ok: boolean;
      error?: string | null;
      itemsSynced?: number;
    }> = [];

    for (const conn of connections ?? []) {
      if (!conn.fb_system_user_token) continue;
      try {
        const { accounts } = await fb.listAdAccountsDetailed(
          conn.fb_system_user_token,
          conn.fb_business_id,
        );
        if (accounts.length === 0) continue;

        const bucketSlug = `meta-imported-${conn.id.slice(0, 8)}`;
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
              name: `Meta Imported — ${conn.label}`,
              slug: bucketSlug,
              company: "Facebook Ads",
              created_by: context.userId,
            })
            .select("id")
            .single();
          if (clientError) continue;
          clientId = client.id;
        }

        const rows = accounts.map((a) => ({
          client_id: clientId,
          connection_id: conn.id,
          fb_account_id: a.id,
          account_name: a.name,
          currency: a.currency,
          timezone_name: a.timezone_name,
          account_status: a.account_status,
          business_name: a.business?.name ?? null,
          is_active: true,
        }));
        const { data: imported } = await supabaseAdmin
          .from("ad_accounts")
          .upsert(rows, { onConflict: "fb_account_id" })
          .select("id,fb_account_id,account_name");

        await supabaseAdmin
          .from("ad_accounts")
          .update({ connection_id: conn.id })
          .in(
            "fb_account_id",
            accounts.map((a) => a.id),
          );

        connImported += imported?.length ?? 0;

        for (const a of imported ?? []) {
          try {
            const r = await syncAdAccount(a.id);
            connSyncResults.push({
              id: a.id,
              fb_account_id: a.fb_account_id,
              account_name: a.account_name,
              ok: r.ok,
              error: r.error,
              itemsSynced: r.itemsSynced,
            });
          } catch (e: any) {
            connSyncResults.push({
              id: a.id,
              fb_account_id: a.fb_account_id,
              account_name: a.account_name,
              ok: false,
              error: e?.message ?? "sync failed",
            });
          }
        }
      } catch (_e) {}
    }

    const { data: s } = await supabaseAdmin
      .from("app_settings")
      .select("fb_system_user_token,fb_business_id")
      .eq("id", 1)
      .maybeSingle();
    const token = s?.fb_system_user_token;

    if (!token) {
      if (connImported > 0) {
        return { ok: true, imported: connImported, syncResults: connSyncResults };
      }
      return {
        ok: false,
        error: "No Facebook token configured (legacy or multi-BM).",
        imported: 0,
      };
    }

    const { checkTokenHealth } = await import("./permissions.server");
    const health = await checkTokenHealth();
    if (health.status !== "ok") {
      if (connImported > 0) {
        return { ok: true, imported: connImported, syncResults: connSyncResults, health };
      }
      return {
        ok: false,
        error: health.error ?? `Token status: ${health.status}`,
        health,
        imported: 0,
      };
    }

    const { accounts } = await fb.listAdAccountsDetailed(token, s?.fb_business_id);
    if (accounts.length === 0 && connImported === 0) {
      return {
        ok: false,
        error: "Token works, but 0 ad accounts visible. Assign assets in Meta Business Settings.",
        imported: 0,
        health,
      };
    }

    const { data: existingClient } = await supabaseAdmin
      .from("clients")
      .select("id")
      .eq("slug", "meta-imported-accounts")
      .maybeSingle();
    let clientId = existingClient?.id as string | undefined;
    if (!clientId && accounts.length > 0) {
      const { data: created, error: ce } = await supabaseAdmin
        .from("clients")
        .insert({
          name: "Meta Imported Accounts",
          slug: "meta-imported-accounts",
          company: "Facebook Ads",
          created_by: context.userId,
        })
        .select("id")
        .single();
      if (ce) throw new Error(ce.message);
      clientId = created.id;
    }

    const legacySyncResults: Array<{
      id: string;
      fb_account_id: string;
      account_name: string | null;
      ok: boolean;
      error?: string | null;
      itemsSynced?: number;
    }> = [];

    if (accounts.length > 0 && clientId) {
      const rows = accounts.map((a) => ({
        client_id: clientId,
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
        .select("id,fb_account_id,account_name");
      if (error) throw new Error(error.message);

      for (const a of imported ?? []) {
        try {
          const r = await syncAdAccount(a.id);
          legacySyncResults.push({
            id: a.id,
            fb_account_id: a.fb_account_id,
            account_name: a.account_name,
            ok: r.ok,
            error: r.error,
            itemsSynced: r.itemsSynced,
          });
        } catch (e: any) {
          legacySyncResults.push({
            id: a.id,
            fb_account_id: a.fb_account_id,
            account_name: a.account_name,
            ok: false,
            error: e?.message ?? "sync failed",
          });
        }
      }
      connImported += imported?.length ?? 0;
    }

    return {
      ok: true,
      imported: connImported,
      accounts,
      syncResults: [...connSyncResults, ...legacySyncResults],
      health,
    };
  });

// ============ Campaign-mapping verification ============
export const verifyCampaignMapping = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const supabaseAdmin = await requireAdmin(context.userId);
    const { fb } = await import("./api.server");

    async function getTokenForAccountLocal(connectionId: string | null): Promise<string | null> {
      if (connectionId) {
        const { data: c } = await supabaseAdmin
          .from("meta_connections")
          .select("fb_system_user_token")
          .eq("id", connectionId)
          .maybeSingle();
        if (c?.fb_system_user_token) return c.fb_system_user_token;
      }
      const { data: s } = await supabaseAdmin
        .from("app_settings")
        .select("fb_system_user_token")
        .eq("id", 1)
        .maybeSingle();
      return s?.fb_system_user_token ?? null;
    }

    const { data: accounts } = await supabaseAdmin
      .from("ad_accounts")
      .select("id,fb_account_id,account_name,connection_id")
      .eq("is_active", true);

    const report: Array<{
      ad_account_id: string;
      fb_account_id: string;
      account_name: string | null;
      fb_count: number;
      db_count: number;
      matched: number;
      missing_in_db: Array<{ id: string; name: string; status?: string }>;
      stale_in_db: Array<{ id: string; name: string | null }>;
      diffs: Array<{ id: string; field: "name" | "status"; fb: string | null; db: string | null }>;
      error?: string;
    }> = [];

    for (const a of accounts ?? []) {
      try {
        const token = await getTokenForAccountLocal((a as any).connection_id ?? null);
        if (!token) {
          report.push({
            ad_account_id: a.id,
            fb_account_id: a.fb_account_id,
            account_name: a.account_name,
            fb_count: 0,
            db_count: 0,
            matched: 0,
            missing_in_db: [],
            stale_in_db: [],
            diffs: [],
            error: "No token configured — assign a Business Manager connection or set legacy token",
          });
          continue;
        }

        const live = await fb.listCampaigns(a.fb_account_id, token);
        const { data: dbRows } = await supabaseAdmin
          .from("campaigns")
          .select("fb_campaign_id,name,status,effective_status")
          .eq("ad_account_id", a.id);
        const liveMap = new Map(live.map((c: any) => [String(c.id), c]));
        const dbMap = new Map((dbRows ?? []).map((c: any) => [String(c.fb_campaign_id), c]));
        const missing_in_db: any[] = [];
        const stale_in_db: any[] = [];
        const diffs: any[] = [];
        let matched = 0;
        for (const [id, lc] of liveMap) {
          const dc = dbMap.get(id);
          if (!dc) {
            missing_in_db.push({ id, name: lc.name, status: lc.effective_status ?? lc.status });
            continue;
          }
          matched++;
          if ((dc.name ?? "") !== (lc.name ?? ""))
            diffs.push({ id, field: "name", fb: lc.name ?? null, db: dc.name ?? null });
          if (
            (dc.effective_status ?? dc.status ?? "") !== (lc.effective_status ?? lc.status ?? "")
          ) {
            diffs.push({
              id,
              field: "status",
              fb: lc.effective_status ?? lc.status ?? null,
              db: dc.effective_status ?? dc.status ?? null,
            });
          }
        }
        for (const [id, dc] of dbMap) if (!liveMap.has(id)) stale_in_db.push({ id, name: dc.name });
        report.push({
          ad_account_id: a.id,
          fb_account_id: a.fb_account_id,
          account_name: a.account_name,
          fb_count: liveMap.size,
          db_count: dbMap.size,
          matched,
          missing_in_db,
          stale_in_db,
          diffs,
        });
      } catch (e: any) {
        report.push({
          ad_account_id: a.id,
          fb_account_id: a.fb_account_id,
          account_name: a.account_name,
          fb_count: 0,
          db_count: 0,
          matched: 0,
          missing_in_db: [],
          stale_in_db: [],
          diffs: [],
          error: e?.message ?? "fetch failed",
        });
      }
    }
    return { generated_at: new Date().toISOString(), report };
  });

// ============ Settings: Org / Branding / Preferences ============
export const saveOrgInfo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (d: { org_name?: string; org_email?: string; org_phone?: string; org_address?: string }) =>
      z
        .object({
          org_name: z.string().trim().max(200).optional(),
          org_email: z.string().trim().max(255).optional().or(z.literal("")),
          org_phone: z.string().trim().max(50).optional(),
          org_address: z.string().trim().max(1000).optional(),
        })
        .parse(d),
  )
  .handler(async ({ data, context }) => {
    const supabaseAdmin = await requireAdmin(context.userId);
    const { error } = await supabaseAdmin.from("app_settings").upsert(
      {
        id: 1,
        org_name: data.org_name ?? null,
        org_email: data.org_email ?? null,
        org_phone: data.org_phone ?? null,
        org_address: data.org_address ?? null,
        updated_at: new Date().toISOString(),
        updated_by: context.userId,
      } as any,
      { onConflict: "id" },
    );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const saveBranding = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (d: {
      brand_logo_url?: string;
      brand_primary_color?: string;
      brand_secondary_color?: string;
    }) =>
      z
        .object({
          brand_logo_url: z.string().trim().max(2000).optional(),
          brand_primary_color: z
            .string()
            .trim()
            .regex(/^#[0-9A-Fa-f]{6}$/)
            .optional(),
          brand_secondary_color: z
            .string()
            .trim()
            .regex(/^#[0-9A-Fa-f]{6}$/)
            .optional(),
        })
        .parse(d),
  )
  .handler(async ({ data, context }) => {
    const supabaseAdmin = await requireAdmin(context.userId);
    const update: Record<string, any> = {
      id: 1,
      updated_at: new Date().toISOString(),
      updated_by: context.userId,
    };
    if (data.brand_logo_url !== undefined) update.brand_logo_url = data.brand_logo_url || null;
    if (data.brand_primary_color !== undefined)
      update.brand_primary_color = data.brand_primary_color;
    if (data.brand_secondary_color !== undefined)
      update.brand_secondary_color = data.brand_secondary_color;
    const { error } = await supabaseAdmin
      .from("app_settings")
      .upsert(update as any, { onConflict: "id" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const savePreferences = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (d: {
      pref_timezone?: string;
      pref_currency?: string;
      pref_language?: string;
      pref_attribution_window?: string;
    }) =>
      z
        .object({
          pref_timezone: z.string().trim().max(100).optional(),
          pref_currency: z.string().trim().max(10).optional(),
          pref_language: z.string().trim().max(20).optional(),
          pref_attribution_window: z.string().trim().max(50).optional(),
        })
        .parse(d),
  )
  .handler(async ({ data, context }) => {
    const supabaseAdmin = await requireAdmin(context.userId);
    const { error } = await supabaseAdmin
      .from("app_settings")
      .upsert(
        { id: 1, ...data, updated_at: new Date().toISOString(), updated_by: context.userId } as any,
        { onConflict: "id" },
      );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const updateMyProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { full_name?: string; new_password?: string; current_password?: string }) =>
    z
      .object({
        full_name: z.string().trim().min(1).max(150).optional(),
        new_password: z.string().min(8).max(200).optional(),
        current_password: z.string().min(1).max(200).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    if (data.full_name !== undefined) {
      const { error } = await supabaseAdmin
        .from("profiles")
        .update({ full_name: data.full_name, updated_at: new Date().toISOString() })
        .eq("id", context.userId);
      if (error) throw new Error(error.message);
    }
    if (data.new_password) {
      const { error } = await supabaseAdmin.auth.admin.updateUserById(context.userId, {
        password: data.new_password,
      });
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });

// Soft refresh — clears synced data only (insights/campaigns/adsets/ads + logs).
// Keeps: ad_accounts rows, clients, client_campaigns, meta_connections, app_settings.
export const clearSyncedData = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const supabaseAdmin = await requireAdmin(context.userId);
    const { data, error } = await supabaseAdmin.rpc("admin_clear_synced_data", {
      _user_id: context.userId,
    });
    if (error) throw new Error(error.message);
    return { ok: true, result: data };
  });

// Full factory reset — wipes EVERYTHING including FB token, BM ID, App ID/Secret.
// Requires typing "FULL RESET" in the UI; backend re-validates with CONFIRM_FULL_RESET.
export const clearAllData = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { confirm: string }) =>
    z.object({ confirm: z.literal("FULL RESET") }).parse(d),
  )
  .handler(async ({ context }) => {
    const supabaseAdmin = await requireAdmin(context.userId);
    const { data, error } = await supabaseAdmin.rpc("admin_full_reset", {
      _user_id: context.userId,
      _confirm: "CONFIRM_FULL_RESET",
    });
    if (error) throw new Error(error.message);
    return { ok: true, result: data };
  });

export const listAvailableAdSets = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const supabaseAdmin = await requireAdmin(context.userId);
    const { data: s } = await supabaseAdmin
      .from("app_settings")
      .select("fb_system_user_token,fb_business_id")
      .eq("id", 1)
      .maybeSingle();
    const token = s?.fb_system_user_token;
    if (!token)
      throw new Error("No Facebook token configured. Open Meta connection settings first.");

    const { fb } = await import("./api.server");

    let liveAccounts: any[] = [];
    let liveError: string | null = null;
    try {
      liveAccounts = await fb.listAdAccounts(token, s?.fb_business_id);
    } catch (e: any) {
      liveError = e?.message ?? "Could not reach Meta";
    }

    const [{ data: existingAccounts }, { data: existingCampaigns }] = await Promise.all([
      supabaseAdmin
        .from("ad_accounts")
        .select("id,fb_account_id,account_name,client_id,clients(name,slug)"),
      supabaseAdmin.from("campaigns").select("id,fb_campaign_id,ad_account_id"),
    ]);
    const accByFb = new Map<string, any>();
    for (const a of existingAccounts ?? []) accByFb.set(a.fb_account_id, a);
    const internalCampaignByFb = new Map<string, string>();
    for (const c of existingCampaigns ?? []) {
      if (c.fb_campaign_id) internalCampaignByFb.set(c.fb_campaign_id, c.id);
    }

    const MAX_ACCOUNTS = 20;
    const accountsToFetch = liveAccounts.slice(0, MAX_ACCOUNTS);

    type AdSetRow = {
      id: string;
      name: string;
      status: string;
      campaign_id: string;
      campaign_name: string;
      account_id: string;
      account_name: string;
      currency: string | null;
      thumbnail_url: string | null;
      internal_campaign_id: string | null;
      assignedClientName: string | null;
      assignedClientSlug: string | null;
    };
    const results: AdSetRow[] = [];
    const perAccountErrors: Array<{ account_id: string; account_name: string; error: string }> = [];

    await Promise.all(
      accountsToFetch.map(async (acc) => {
        try {
          const [campaigns, adsets, ads] = await Promise.all([
            fb.listCampaigns(acc.id, token),
            fb.listAdSets(acc.id, token),
            fb.listAds(acc.id, token),
          ]);
          const campaignNameById = new Map<string, string>();
          for (const c of campaigns as any[]) campaignNameById.set(c.id, c.name);

          const thumbByAdset = new Map<string, string>();
          for (const ad of ads as any[]) {
            const adsetId = ad.adset_id;
            if (!adsetId || thumbByAdset.has(adsetId)) continue;
            const thumb = ad?.creative?.thumbnail_url ?? null;
            if (thumb) thumbByAdset.set(adsetId, thumb);
          }

          const dbAcc = accByFb.get(acc.id);
          const client = Array.isArray(dbAcc?.clients) ? dbAcc.clients[0] : dbAcc?.clients;
          const assignedClientName =
            client && client.slug !== "meta-imported-accounts" ? client.name : null;
          const assignedClientSlug =
            client && client.slug !== "meta-imported-accounts" ? client.slug : null;

          for (const a of adsets as any[]) {
            results.push({
              id: a.id,
              name: a.name,
              status: a.effective_status ?? a.status ?? "UNKNOWN",
              campaign_id: a.campaign_id,
              campaign_name: campaignNameById.get(a.campaign_id) ?? "(unknown campaign)",
              account_id: acc.id,
              account_name: acc.name ?? acc.id,
              currency: acc.currency ?? null,
              thumbnail_url: thumbByAdset.get(a.id) ?? null,
              internal_campaign_id: internalCampaignByFb.get(a.campaign_id) ?? null,
              assignedClientName,
              assignedClientSlug,
            });
          }
        } catch (e: any) {
          perAccountErrors.push({
            account_id: acc.id,
            account_name: acc.name ?? acc.id,
            error: e?.message ?? String(e),
          });
        }
      }),
    );

    return {
      adsets: results,
      accounts: accountsToFetch.map((a) => ({
        id: a.id,
        name: a.name,
        currency: a.currency ?? null,
      })),
      totalAccounts: liveAccounts.length,
      truncatedAccounts: Math.max(0, liveAccounts.length - MAX_ACCOUNTS),
      perAccountErrors,
      liveError,
    };
  });
