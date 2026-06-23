// Sync engine — SERVER ONLY.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { fb, extractPrimaryResults, FbApiError } from "./api.server";
import { checkTokenHealth } from "./permissions.server";

async function getLegacyToken(): Promise<string | null> {
  const { data } = await supabaseAdmin.from("app_settings").select("fb_system_user_token").eq("id", 1).maybeSingle();
  return data?.fb_system_user_token ?? null;
}

async function getTokenForAccount(accountId: string): Promise<string> {
  const { data: acc } = await supabaseAdmin
    .from("ad_accounts")
    .select("connection_id,fb_account_id,account_name")
    .eq("id", accountId)
    .maybeSingle();
  if (acc?.connection_id) {
    const { data: c } = await supabaseAdmin
      .from("meta_connections")
      .select("fb_system_user_token")
      .eq("id", acc.connection_id)
      .maybeSingle();
    if (c?.fb_system_user_token) return c.fb_system_user_token;
  }
  const legacy = await getLegacyToken();
  if (legacy) return legacy;
  throw new Error(
    `No Facebook System User token configured for account "${acc?.account_name ?? acc?.fb_account_id ?? accountId}". ` +
    `Go to Settings → Business Managers (or Legacy section) and paste a never-expiring System User token with ads_read + ads_management + business_management scopes.`,
  );
}

async function importVisibleAccountsForSync(token: string) {
  const { data: settings } = await supabaseAdmin.from("app_settings").select("fb_business_id").eq("id", 1).maybeSingle();
  const { accounts } = await fb.listAdAccountsDetailed(token, settings?.fb_business_id);
  if (accounts.length === 0) return { imported: 0 };

  const { data: client, error: clientError } = await supabaseAdmin.from("clients").upsert({
    name: "Meta Imported Accounts",
    slug: "meta-imported-accounts",
    company: "Facebook Ads",
  }, { onConflict: "slug" }).select("id").single();
  if (clientError) throw new Error(`client upsert: ${clientError.message}`);

  const rows = accounts.map((a) => ({
    client_id: client.id,
    fb_account_id: a.id,
    account_name: a.name,
    currency: a.currency,
    timezone_name: a.timezone_name,
    account_status: a.account_status,
    business_name: a.business?.name ?? null,
    is_active: true,
  }));
  const { data: imported, error } = await supabaseAdmin.from("ad_accounts").upsert(rows, { onConflict: "fb_account_id" }).select("id");
  if (error) throw new Error(`ad accounts upsert: ${error.message}`);
  return { imported: imported?.length ?? 0 };
}

export async function syncAdAccount(adAccountId: string) {
  const started = Date.now();
  const { data: account } = await supabaseAdmin
    .from("ad_accounts")
    .select("id,fb_account_id,client_id,account_name")
    .eq("id", adAccountId)
    .maybeSingle();
  if (!account) {
    throw new Error(
      `Ad account row missing in DB for id="${adAccountId}". ` +
      `Click "Re-test & Re-import" to re-pull from Facebook, or the row was deleted from Business Manager.`,
    );
  }

  let itemsSynced = 0;
  let error: string | null = null;

  try {
    const token = await getTokenForAccount(account.id);
    const actId = account.fb_account_id;

    const info = await fb.getAccount(actId, token);

    const campaigns = await fb.listCampaigns(actId, token);
    if (campaigns.length > 0) {
      const rows = campaigns.map((c: any) => ({
        ad_account_id: account.id,
        fb_campaign_id: c.id,
        name: c.name,
        objective: c.objective ?? null,
        status: c.status ?? null,
        effective_status: c.effective_status ?? null,
        daily_budget: c.daily_budget ? Number(c.daily_budget) / 100 : null,
        lifetime_budget: c.lifetime_budget ? Number(c.lifetime_budget) / 100 : null,
        buying_type: c.buying_type ?? null,
        start_time: c.start_time ?? null,
        stop_time: c.stop_time ?? null,
        last_sync_at: new Date().toISOString(),
      }));
      const { error: e1 } = await supabaseAdmin.from("campaigns").upsert(rows, { onConflict: "fb_campaign_id" });
      if (e1) throw new Error(`campaigns upsert: ${e1.message}`);
      itemsSynced += campaigns.length;
    }

    // Capture optimization_goal per ad set so we can map "Results" correctly.
    const adSets = await fb.listAdSets(actId, token);
    const adSetGoalByFbId = new Map<string, string>();
    if (adSets.length > 0) {
      const { data: cps } = await supabaseAdmin.from("campaigns").select("id,fb_campaign_id").eq("ad_account_id", account.id);
      const cpMap = new Map((cps ?? []).map((c) => [c.fb_campaign_id, c.id]));
      const rows = adSets.filter((a: any) => cpMap.has(a.campaign_id)).map((a: any) => {
        if (a.optimization_goal) adSetGoalByFbId.set(a.id, a.optimization_goal);
        return {
          campaign_id: cpMap.get(a.campaign_id)!,
          ad_account_id: account.id,
          fb_adset_id: a.id,
          name: a.name,
          status: a.status ?? null,
          effective_status: a.effective_status ?? null,
          daily_budget: a.daily_budget ? Number(a.daily_budget) / 100 : null,
          lifetime_budget: a.lifetime_budget ? Number(a.lifetime_budget) / 100 : null,
          optimization_goal: a.optimization_goal ?? null,
          billing_event: a.billing_event ?? null,
          bid_amount: a.bid_amount ? Number(a.bid_amount) / 100 : null,
          start_time: a.start_time ?? null,
          end_time: a.end_time ?? null,
          last_sync_at: new Date().toISOString(),
        };
      });
      if (rows.length > 0) {
        const { error: e2 } = await supabaseAdmin.from("ad_sets").upsert(rows, { onConflict: "fb_adset_id" });
        if (e2) throw new Error(`ad_sets upsert: ${e2.message}`);
      }
      itemsSynced += rows.length;
    }

    const ads = await fb.listAds(actId, token);
    if (ads.length > 0) {
      const { data: cps } = await supabaseAdmin.from("campaigns").select("id,fb_campaign_id").eq("ad_account_id", account.id);
      const { data: aset } = await supabaseAdmin.from("ad_sets").select("id,fb_adset_id").eq("ad_account_id", account.id);
      const cpMap = new Map((cps ?? []).map((c) => [c.fb_campaign_id, c.id]));
      const asMap = new Map((aset ?? []).map((a) => [a.fb_adset_id, a.id]));
      const rows = ads.filter((a: any) => cpMap.has(a.campaign_id) && asMap.has(a.adset_id)).map((a: any) => ({
        ad_set_id: asMap.get(a.adset_id)!,
        campaign_id: cpMap.get(a.campaign_id)!,
        ad_account_id: account.id,
        fb_ad_id: a.id,
        name: a.name,
        status: a.status ?? null,
        effective_status: a.effective_status ?? null,
        creative_thumbnail: a.creative?.thumbnail_url ?? null,
        creative_id: a.creative?.id ?? null,
        last_sync_at: new Date().toISOString(),
      }));
      if (rows.length > 0) {
        const { error: e3 } = await supabaseAdmin.from("ads").upsert(rows, { onConflict: "fb_ad_id" });
        if (e3) throw new Error(`ads upsert: ${e3.message}`);
      }
      itemsSynced += rows.length;
    }

    // Entity tables show MAXIMUM range to match Ads Manager's default.
    const acctInsights = await fb.getAccountInsights(actId, token, "maximum");
    const campInsights = await fb.getInsights(actId, token, "maximum", "campaign");
    const asInsights = await fb.getInsights(actId, token, "maximum", "adset");
    const adInsights = await fb.getInsights(actId, token, "maximum", "ad");

    // Reset metrics first so entities that fell out of range don't keep stale numbers.
    const zeroMetrics = {
      spend: 0, reach: 0, impressions: 0, clicks: 0,
      ctr: 0, cpc: 0, cpm: 0, frequency: 0, results: 0,
    };
    await supabaseAdmin.from("campaigns").update(zeroMetrics).eq("ad_account_id", account.id);
    await supabaseAdmin.from("ad_sets").update(zeroMetrics).eq("ad_account_id", account.id);
    await supabaseAdmin.from("ads").update(zeroMetrics).eq("ad_account_id", account.id);

    if (campInsights.length > 0) {
      for (const row of campInsights as any[]) {
        await supabaseAdmin.from("campaigns").update({
          spend: Number(row.spend) || 0,
          reach: Number(row.reach) || 0,
          impressions: Number(row.impressions) || 0,
          clicks: Number(row.clicks) || 0,
          ctr: Number(row.ctr) || 0,
          cpc: Number(row.cpc) || 0,
          cpm: Number(row.cpm) || 0,
          frequency: Number(row.frequency) || 0,
          results: extractPrimaryResults(row.actions, row.optimization_goal),
        }).eq("fb_campaign_id", row.campaign_id).eq("ad_account_id", account.id);
      }
    }
    if (asInsights.length > 0) {
      for (const row of asInsights as any[]) {
        await supabaseAdmin.from("ad_sets").update({
          spend: Number(row.spend) || 0,
          reach: Number(row.reach) || 0,
          impressions: Number(row.impressions) || 0,
          clicks: Number(row.clicks) || 0,
          ctr: Number(row.ctr) || 0,
          cpc: Number(row.cpc) || 0,
          cpm: Number(row.cpm) || 0,
          frequency: Number(row.frequency) || 0,
          results: extractPrimaryResults(row.actions, row.optimization_goal ?? adSetGoalByFbId.get(row.adset_id)),
        }).eq("fb_adset_id", row.adset_id).eq("ad_account_id", account.id);
      }
    }
    if (adInsights.length > 0) {
      for (const row of adInsights as any[]) {
        const goal = row.optimization_goal ?? adSetGoalByFbId.get(row.adset_id);
        await supabaseAdmin.from("ads").update({
          spend: Number(row.spend) || 0,
          reach: Number(row.reach) || 0,
          impressions: Number(row.impressions) || 0,
          clicks: Number(row.clicks) || 0,
          ctr: Number(row.ctr) || 0,
          cpc: Number(row.cpc) || 0,
          cpm: Number(row.cpm) || 0,
          frequency: Number(row.frequency) || 0,
          results: extractPrimaryResults(row.actions, goal),
        }).eq("fb_ad_id", row.ad_id).eq("ad_account_id", account.id);
      }
    }

    const snapshotSince = new Date();
    snapshotSince.setUTCDate(snapshotSince.getUTCDate() - 29);
    const snapshotSinceStr = snapshotSince.toISOString().slice(0, 10);

    await supabaseAdmin
      .from("insights_snapshots")
      .delete()
      .eq("ad_account_id", account.id)
      .eq("level", "account")
      .gte("date_start", snapshotSinceStr);

    const ts = await fb.getTimeSeries(actId, token, "last_30d");
    if (ts.length > 0) {
      const tsRows = (ts as any[]).map((r) => ({
        ad_account_id: account.id,
        level: "account" as const,
        entity_id: actId,
        date_start: r.date_start,
        date_stop: r.date_stop,
        spend: Number(r.spend) || 0,
        reach: Number(r.reach) || 0,
        impressions: Number(r.impressions) || 0,
        clicks: Number(r.clicks) || 0,
        ctr: Number(r.ctr) || 0,
        cpc: Number(r.cpc) || 0,
        cpm: Number(r.cpm) || 0,
        frequency: Number(r.frequency) || 0,
        results: extractPrimaryResults(r.actions),
      }));
      await supabaseAdmin.from("insights_snapshots").upsert(tsRows, { onConflict: "ad_account_id,level,entity_id,date_start,date_stop" });
    }

    await supabaseAdmin
      .from("insights_snapshots")
      .delete()
      .eq("ad_account_id", account.id)
      .eq("level", "campaign")
      .gte("date_start", snapshotSinceStr);

    const campTs = await fb.getCampaignTimeSeries(actId, token, [], "last_30d");
    if (campTs.length > 0) {
      const campTsRows = (campTs as any[]).map((r) => ({
        ad_account_id: account.id,
        level: "campaign" as const,
        entity_id: r.campaign_id,
        date_start: r.date_start,
        date_stop: r.date_stop,
        spend: Number(r.spend) || 0,
        reach: Number(r.reach) || 0,
        impressions: Number(r.impressions) || 0,
        clicks: Number(r.clicks) || 0,
        ctr: Number(r.ctr) || 0,
        cpc: Number(r.cpc) || 0,
        cpm: Number(r.cpm) || 0,
        frequency: Number(r.frequency) || 0,
        results: extractPrimaryResults(r.actions, r.optimization_goal),
      }));
      for (let i = 0; i < campTsRows.length; i += 500) {
        const chunk = campTsRows.slice(i, i + 500);
        await supabaseAdmin.from("insights_snapshots").upsert(chunk, { onConflict: "ad_account_id,level,entity_id,date_start,date_stop" });
      }
    }

    // ============ AD SET daily time series (NEW) ============
    // Ground-truth per-day adset metrics. The "maximum" preset call earlier in
    // this sync sometimes returns NO row for brand-new ad sets, leaving the
    // ad_sets table at zero. We store daily snapshots here so the portal can
    // aggregate adset metrics from the same source as the top dashboard
    // (no chance of mismatch between top KPIs and the Ad Set table).
    await supabaseAdmin
      .from("insights_snapshots")
      .delete()
      .eq("ad_account_id", account.id)
      .eq("level", "adset")
      .gte("date_start", snapshotSinceStr);

    const adsetTs = await fb.getAdSetTimeSeries(actId, token, "last_30d");
    if (adsetTs.length > 0) {
      const adsetTsRows = (adsetTs as any[]).map((r) => ({
        ad_account_id: account.id,
        level: "adset" as const,
        entity_id: r.adset_id,
        date_start: r.date_start,
        date_stop: r.date_stop,
        spend: Number(r.spend) || 0,
        reach: Number(r.reach) || 0,
        impressions: Number(r.impressions) || 0,
        clicks: Number(r.clicks) || 0,
        ctr: Number(r.ctr) || 0,
        cpc: Number(r.cpc) || 0,
        cpm: Number(r.cpm) || 0,
        frequency: Number(r.frequency) || 0,
        results: extractPrimaryResults(r.actions, r.optimization_goal ?? adSetGoalByFbId.get(r.adset_id)),
      }));
      for (let i = 0; i < adsetTsRows.length; i += 500) {
        const chunk = adsetTsRows.slice(i, i + 500);
        await supabaseAdmin.from("insights_snapshots").upsert(chunk, { onConflict: "ad_account_id,level,entity_id,date_start,date_stop" });
      }

      // Roll the daily rows up into the ad_sets table so any consumer reading
      // ad_sets.* directly (older queries, exports) also sees real numbers.
      // This OVERWRITES the earlier "maximum"-preset update because the
      // last_30d rollup is more reliable for new ad sets than Meta's
      // "maximum" preset (which can return nothing on day 1).
      const agg = new Map<string, { spend: number; reach: number; impressions: number; clicks: number; results: number; goal?: string | null }>();
      for (const r of adsetTs as any[]) {
        const id = r.adset_id;
        if (!id) continue;
        const cur = agg.get(id) ?? { spend: 0, reach: 0, impressions: 0, clicks: 0, results: 0, goal: r.optimization_goal ?? adSetGoalByFbId.get(id) ?? null };
        cur.spend       += Number(r.spend) || 0;
        cur.impressions += Number(r.impressions) || 0;
        cur.clicks      += Number(r.clicks) || 0;
        cur.results     += extractPrimaryResults(r.actions, cur.goal);
        // reach is unique users — take max across days (sum would double count).
        cur.reach = Math.max(cur.reach, Number(r.reach) || 0);
        agg.set(id, cur);
      }
      for (const [fbAdsetId, v] of agg) {
        const ctr = v.impressions > 0 ? (v.clicks / v.impressions) * 100 : 0;
        const cpc = v.clicks > 0 ? v.spend / v.clicks : 0;
        const cpm = v.impressions > 0 ? (v.spend / v.impressions) * 1000 : 0;
        const frequency = v.reach > 0 ? v.impressions / v.reach : 0;
        await supabaseAdmin.from("ad_sets").update({
          spend: v.spend,
          reach: v.reach,
          impressions: v.impressions,
          clicks: v.clicks,
          ctr,
          cpc,
          cpm,
          frequency,
          results: v.results,
        }).eq("fb_adset_id", fbAdsetId).eq("ad_account_id", account.id);
      }
    }

    const activeCampaigns = campaigns.filter((c: any) => c.effective_status === "ACTIVE").length;
    await supabaseAdmin.from("ad_accounts").update({
      account_name: info.name,
      currency: info.currency,
      timezone_name: info.timezone_name,
      account_status: info.account_status,
      business_name: info.business?.name ?? null,
      total_spend: acctInsights ? Number((acctInsights as any).spend) || 0 : 0,
      total_reach: acctInsights ? Number((acctInsights as any).reach) || 0 : 0,
      total_impressions: acctInsights ? Number((acctInsights as any).impressions) || 0 : 0,
      total_clicks: acctInsights ? Number((acctInsights as any).clicks) || 0 : 0,
      total_results: acctInsights ? extractPrimaryResults((acctInsights as any).actions) : 0,
      active_campaigns: activeCampaigns,
      last_sync_at: new Date().toISOString(),
      last_sync_status: "success",
      last_sync_error: null,
    }).eq("id", account.id);
  } catch (e) {
    error = e instanceof FbApiError
      ? `[FB ${e.code ?? ""}] ${e.message}${e.fbtrace_id ? ` (trace ${e.fbtrace_id})` : ""}`
      : (e as Error).message;

    console.error(
      `[syncAdAccount] FAILED account=${account.account_name ?? account.fb_account_id} (${account.id})`,
      "\n  error:", error,
      "\n  raw:", e,
    );

    await supabaseAdmin.from("ad_accounts").update({
      last_sync_at: new Date().toISOString(),
      last_sync_status: "failed",
      last_sync_error: error,
    }).eq("id", account.id);
    await supabaseAdmin.from("alerts").insert({
      client_id: account.client_id,
      ad_account_id: account.id,
      type: "sync_error",
      severity: "critical",
      title: "Sync failed",
      message: error,
    });
  }

  const duration = Date.now() - started;
  await supabaseAdmin.from("sync_logs").insert({
    ad_account_id: account.id,
    status: error ? "failed" : "success",
    items_synced: itemsSynced,
    error,
    duration_ms: duration,
    finished_at: new Date().toISOString(),
  });

  return { ok: !error, itemsSynced, error, duration_ms: duration };
}

export async function syncAllAccounts() {
  const health = await checkTokenHealth();
  const legacyToken = await getLegacyToken();

  // ✅ FIX: Legacy token invalid হলেও multi-BM connections থাকলে sync চালিয়ে যাও
  if (!health.ok && (health.status === "invalid" || health.status === "missing")) {
    const { count: connCount } = await supabaseAdmin
      .from("meta_connections")
      .select("id", { count: "exact", head: true })
      .eq("is_active", true);
    if ((connCount ?? 0) === 0) {
      // কোনো multi-BM connection নেই — skip করো
      return { count: 0, results: [], skipped: true, tokenHealth: health };
    }
    // Multi-BM connections আছে — sync চালিয়ে যাও
  }

  const { count: existingCount } = await supabaseAdmin
    .from("ad_accounts")
    .select("id", { count: "exact", head: true })
    .eq("is_active", true);
  const autoImport = existingCount === 0 && legacyToken ? await importVisibleAccountsForSync(legacyToken) : { imported: 0 };

  const { data: accounts } = await supabaseAdmin.from("ad_accounts").select("id,client_id,account_name,fb_account_id").eq("is_active", true);
  const results: Array<{ id: string; ok: boolean; error?: string | null; account_name?: string | null }> = [];
  for (const a of accounts ?? []) {
    try {
      const r = await syncAdAccount(a.id);
      results.push({ id: a.id, ok: r.ok, error: r.error, account_name: a.account_name });
    } catch (e) {
      const msg = (e as Error).message;
      console.error(`[syncAllAccounts] threw for account ${a.account_name ?? a.fb_account_id}:`, e);
      results.push({ id: a.id, ok: false, error: msg, account_name: a.account_name });
    }
  }

  try {
    await evaluateBudgetAlerts();
  } catch (e) {
    console.error("[syncAllAccounts] budget alerts failed", e);
  }

  return { count: results.length, results, tokenHealth: health, autoImport };
}

async function evaluateBudgetAlerts() {
  const { data: clients } = await supabaseAdmin
    .from("clients")
    .select("id,name,monthly_budget, ad_accounts(total_spend)")
    .eq("status", "active");
  const now = new Date();
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const dayOfMonth = now.getDate();
  const expectedPct = (dayOfMonth / daysInMonth) * 100;

  for (const c of (clients ?? []) as any[]) {
    const budget = Number(c.monthly_budget) || 0;
    if (budget <= 0) continue;
    const spent = (c.ad_accounts ?? []).reduce((s: number, a: any) => s + (Number(a.total_spend) || 0), 0);
    const pct = (spent / budget) * 100;
    const since = new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString();

    async function emit(type: string, severity: "info" | "warning" | "critical", title: string, message: string) {
      const { data: existing } = await supabaseAdmin
        .from("alerts").select("id").eq("client_id", c.id).eq("type", type)
        .gte("created_at", since).limit(1);
      if (existing && existing.length) return;
      await supabaseAdmin.from("alerts").insert({ client_id: c.id, type, severity, title, message });
    }

    if (pct >= 100) {
      await emit("budget_exceeded", "critical", `${c.name}: monthly budget exceeded`,
        `Spent ${spent.toFixed(2)} of ${budget.toFixed(2)} (${pct.toFixed(1)}%).`);
    } else if (pct >= 90) {
      await emit("budget_90", "critical", `${c.name}: 90% of monthly budget used`,
        `Spent ${spent.toFixed(2)} of ${budget.toFixed(2)} (${pct.toFixed(1)}%).`);
    } else if (pct >= 75) {
      await emit("budget_75", "warning", `${c.name}: 75% of monthly budget used`,
        `Spent ${spent.toFixed(2)} of ${budget.toFixed(2)} (${pct.toFixed(1)}%).`);
    }
    if (pct - expectedPct >= 20) {
      await emit("pacing_ahead", "warning", `${c.name}: spend pacing ahead of schedule`,
        `Actual ${pct.toFixed(1)}% vs expected ${expectedPct.toFixed(1)}% by today.`);
    }
  }
}

export async function syncConnectionAccounts(connectionId: string) {
  const { data: accounts } = await supabaseAdmin
    .from("ad_accounts")
    .select("id,account_name,fb_account_id")
    .eq("connection_id", connectionId)
    .eq("is_active", true);
  const results: Array<{ id: string; ok: boolean; error?: string | null; account_name?: string | null }> = [];
  for (const a of accounts ?? []) {
    try {
      const r = await syncAdAccount(a.id);
      results.push({ id: a.id, ok: r.ok, error: r.error, account_name: a.account_name });
    } catch (e) {
      console.error(`[syncConnectionAccounts] threw for ${a.account_name ?? a.fb_account_id}:`, e);
      results.push({ id: a.id, ok: false, error: (e as Error).message, account_name: a.account_name });
    }
  }
  return { count: results.length, results };
}
