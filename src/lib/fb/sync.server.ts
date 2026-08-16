// Sync engine — SERVER ONLY.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { fb, extractPrimaryResults, FbApiError } from "./api.server";
import { checkTokenHealth } from "./permissions.server";

async function getLegacyToken(): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from("app_settings")
    .select("fb_system_user_token")
    .eq("id", 1)
    .maybeSingle();
  return data?.fb_system_user_token ?? null;
}

async function getTokenForAccount(accountId: string): Promise<string> {
  const { data: acc } = await supabaseAdmin
    .from("ad_accounts")
    .select("connection_id,fb_account_id,account_name")
    .eq("id", accountId)
    .maybeSingle();
  if (acc?.connection_id) {
    const { data: c } = await (supabaseAdmin as any)
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
  const { data: settings } = await supabaseAdmin
    .from("app_settings")
    .select("fb_business_id")
    .eq("id", 1)
    .maybeSingle();
  const { accounts } = await fb.listAdAccountsDetailed(token, settings?.fb_business_id);
  if (accounts.length === 0) return { imported: 0 };

  const { data: client, error: clientError } = await supabaseAdmin
    .from("clients")
    .upsert(
      {
        name: "Meta Imported Accounts",
        slug: "meta-imported-accounts",
        company: "Facebook Ads",
      },
      { onConflict: "slug" },
    )
    .select("id")
    .single();
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
  const { data: imported, error } = await supabaseAdmin
    .from("ad_accounts")
    .upsert(rows, { onConflict: "fb_account_id" })
    .select("id");
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
      const { error: e1 } = await supabaseAdmin
        .from("campaigns")
        .upsert(rows, { onConflict: "fb_campaign_id" });
      if (e1) throw new Error(`campaigns upsert: ${e1.message}`);
      itemsSynced += campaigns.length;
    }

    // FIX (Cloudflare "Too many subrequests"): the campaign id map used to be
    // re-read for the ad sets phase AND again for the ads phase. It is read
    // once now and reused, cutting two PostgREST requests per sync.
    let cpMap = new Map<string, string>();
    const loadCampaignMap = async () => {
      const { data: cps, error } = await supabaseAdmin
        .from("campaigns")
        .select("id,fb_campaign_id")
        .eq("ad_account_id", account.id);
      if (error) throw new Error(`campaign id map: ${error.message}`);
      cpMap = new Map((cps ?? []).map((c) => [c.fb_campaign_id, c.id]));
    };

    // Capture optimization_goal per ad set so we can map "Results" correctly.
    const adSets = await fb.listAdSets(actId, token);
    const adSetGoalByFbId = new Map<string, string>();
    if (adSets.length > 0) {
      await loadCampaignMap();
      const rows = adSets
        .filter((a: any) => cpMap.has(a.campaign_id))
        .map((a: any) => {
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
        const { error: e2 } = await supabaseAdmin
          .from("ad_sets")
          .upsert(rows, { onConflict: "fb_adset_id" });
        if (e2) throw new Error(`ad_sets upsert: ${e2.message}`);
      }
      itemsSynced += rows.length;
    }

    const ads = await fb.listAds(actId, token);
    if (ads.length > 0) {
      if (cpMap.size === 0) await loadCampaignMap();
      const { data: aset, error: eAsetMap } = await supabaseAdmin
        .from("ad_sets")
        .select("id,fb_adset_id")
        .eq("ad_account_id", account.id);
      if (eAsetMap) throw new Error(`ad set id map: ${eAsetMap.message}`);
      const asMap = new Map((aset ?? []).map((a) => [a.fb_adset_id, a.id]));
      const rows = ads
        .filter((a: any) => cpMap.has(a.campaign_id) && asMap.has(a.adset_id))
        .map((a: any) => ({
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
        const { error: e3 } = await supabaseAdmin
          .from("ads")
          .upsert(rows, { onConflict: "fb_ad_id" });
        if (e3) throw new Error(`ads upsert: ${e3.message}`);
      }
      itemsSynced += rows.length;
    }


    // Entity tables show MAXIMUM range to match Ads Manager's default.
    const acctInsights = await fb.getAccountInsights(actId, token, "maximum");
    const campInsights = await fb.getInsights(actId, token, "maximum", "campaign");
    const asInsights = await fb.getInsights(actId, token, "maximum", "adset");
    const adInsights = await fb.getInsights(actId, token, "maximum", "ad");

    // ================= INSIGHT METRICS (UPDATE-ONLY) =================
    // ROOT CAUSE of `campaign insights upsert: null value in column "name" of
    // relation "campaigns" violates not-null constraint`:
    // Facebook's insights endpoint returns rows for campaigns / ad sets / ads
    // that do NOT exist in our tables (deleted on Facebook but still inside
    // the "maximum" lookback window, or owned by a different ad account).
    // A PostgREST `upsert` on such a row degrades into an INSERT carrying only
    // the Facebook id + metrics → NOT NULL violation → the whole sync failed.
    //
    // FIX: metrics now go through the SQL functions apply_campaign_metrics /
    // apply_ad_set_metrics / apply_ad_metrics (migration
    // 20260817001000_apply_insight_metrics.sql). They are set-based UPDATEs,
    // so an unknown Facebook id matches nothing and is silently ignored —
    // an INSERT (and therefore this error) is impossible. Bonus: no paginated
    // "known ids" reads are needed anymore, which removes several Worker
    // subrequests per sync.

    // Reset metrics first so entities that fell out of range don't keep stale
    // numbers — one RPC instead of three PostgREST UPDATE requests.
    {
      const { error: eReset } = await (supabaseAdmin as any).rpc("reset_account_metrics", {
        _ad_account_id: account.id,
      });
      if (eReset) throw new Error(`reset metrics: ${eReset.message}`);
    }

    const metricsOf = (row: any) => ({
      spend: Number(row.spend) || 0,
      reach: Number(row.reach) || 0,
      impressions: Number(row.impressions) || 0,
      clicks: Number(row.clicks) || 0,
      ctr: Number(row.ctr) || 0,
      cpc: Number(row.cpc) || 0,
      cpm: Number(row.cpm) || 0,
      frequency: Number(row.frequency) || 0,
    });

    if (campInsights.length > 0) {
      const rows = (campInsights as any[])
        .filter((row) => !!row.campaign_id)
        .map((row) => ({
          fb_campaign_id: String(row.campaign_id),
          ...metricsOf(row),
          results: extractPrimaryResults(row.actions, row.optimization_goal),
        }));
      if (rows.length > 0) {
        const { error: eCampIns } = await (supabaseAdmin as any).rpc("apply_campaign_metrics", {
          _ad_account_id: account.id,
          _rows: rows,
        });
        if (eCampIns) throw new Error(`campaign insights update: ${eCampIns.message}`);
      }
    }
    if (asInsights.length > 0) {
      const rows = (asInsights as any[])
        .filter((row) => !!row.adset_id)
        .map((row) => ({
          fb_adset_id: String(row.adset_id),
          ...metricsOf(row),
          results: extractPrimaryResults(
            row.actions,
            row.optimization_goal ?? adSetGoalByFbId.get(row.adset_id),
          ),
        }));
      if (rows.length > 0) {
        const { error: eAsIns } = await (supabaseAdmin as any).rpc("apply_ad_set_metrics", {
          _ad_account_id: account.id,
          _rows: rows,
        });
        if (eAsIns) throw new Error(`ad set insights update: ${eAsIns.message}`);
      }
    }
    if (adInsights.length > 0) {
      const rows = (adInsights as any[])
        .filter((row) => !!row.ad_id)
        .map((row) => ({
          fb_ad_id: String(row.ad_id),
          ...metricsOf(row),
          results: extractPrimaryResults(
            row.actions,
            row.optimization_goal ?? adSetGoalByFbId.get(row.adset_id),
          ),
        }));
      if (rows.length > 0) {
        const { error: eAdIns } = await (supabaseAdmin as any).rpc("apply_ad_metrics", {
          _ad_account_id: account.id,
          _rows: rows,
        });
        if (eAdIns) throw new Error(`ad insights update: ${eAdIns.message}`);
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
      await supabaseAdmin
        .from("insights_snapshots")
        .upsert(tsRows, { onConflict: "ad_account_id,level,entity_id,date_start,date_stop" });
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
        await supabaseAdmin
          .from("insights_snapshots")
          .upsert(chunk, { onConflict: "ad_account_id,level,entity_id,date_start,date_stop" });
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
        results: extractPrimaryResults(
          r.actions,
          r.optimization_goal ?? adSetGoalByFbId.get(r.adset_id),
        ),
      }));
      for (let i = 0; i < adsetTsRows.length; i += 500) {
        const chunk = adsetTsRows.slice(i, i + 500);
        await supabaseAdmin
          .from("insights_snapshots")
          .upsert(chunk, { onConflict: "ad_account_id,level,entity_id,date_start,date_stop" });
      }

      // Roll the daily rows up only as a ZERO-ROW fallback. Never overwrite
      // the earlier "maximum" aggregate insights: Ads Manager totals (especially
      // unique reach) cannot be reconstructed from daily rows without mismatch.
      const agg = new Map<
        string,
        {
          spend: number;
          reach: number;
          impressions: number;
          clicks: number;
          results: number;
          goal?: string | null;
        }
      >();
      for (const r of adsetTs as any[]) {
        const id = r.adset_id;
        if (!id) continue;
        const cur = agg.get(id) ?? {
          spend: 0,
          reach: 0,
          impressions: 0,
          clicks: 0,
          results: 0,
          goal: r.optimization_goal ?? adSetGoalByFbId.get(id) ?? null,
        };
        cur.spend += Number(r.spend) || 0;
        cur.impressions += Number(r.impressions) || 0;
        cur.clicks += Number(r.clicks) || 0;
        cur.results += extractPrimaryResults(r.actions, cur.goal);
        // reach is unique users — take max across days (sum would double count).
        cur.reach = Math.max(cur.reach, Number(r.reach) || 0);
        agg.set(id, cur);
      }
      // FIX: this was N conditional `.update()` calls (one per ad set) inside a
      // loop — another big subrequest contributor. We only need this fallback
      // for ad sets that are STILL all-zero after the primary insights update
      // above, so fetch current zero-valued ad sets once, then apply the
      // fallback in a single batched upsert instead of one call per row.
      const { data: zeroAdSets } = await supabaseAdmin
        .from("ad_sets")
        .select("fb_adset_id")
        .eq("ad_account_id", account.id)
        .eq("spend", 0)
        .eq("reach", 0)
        .eq("impressions", 0)
        .eq("clicks", 0)
        .eq("results", 0);
      const zeroIds = new Set((zeroAdSets ?? []).map((r) => r.fb_adset_id));

      const fallbackRows = [...agg]
        .filter(([fbAdsetId]) => zeroIds.has(fbAdsetId))
        .map(([fbAdsetId, v]) => {
          const ctr = v.impressions > 0 ? (v.clicks / v.impressions) * 100 : 0;
          const cpc = v.clicks > 0 ? v.spend / v.clicks : 0;
          const cpm = v.impressions > 0 ? (v.spend / v.impressions) * 1000 : 0;
          const frequency = v.reach > 0 ? v.impressions / v.reach : 0;
          return {
            fb_adset_id: fbAdsetId,
            spend: v.spend,
            reach: v.reach,
            impressions: v.impressions,
            clicks: v.clicks,
            ctr,
            cpc,
            cpm,
            frequency,
            results: v.results,
          };
        });
      if (fallbackRows.length > 0) {
        // UPDATE-only RPC (never INSERTs) — same not-null hardening as above.
        const { error: eFallback } = await (supabaseAdmin as any).rpc("apply_ad_set_metrics", {
          _ad_account_id: account.id,
          _rows: fallbackRows,
        });
        if (eFallback) throw new Error(`ad set fallback update: ${eFallback.message}`);
      }

    }

    const activeCampaigns = campaigns.filter((c: any) => c.effective_status === "ACTIVE").length;
    await supabaseAdmin
      .from("ad_accounts")
      .update({
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
      })
      .eq("id", account.id);
  } catch (e) {
    error =
      e instanceof FbApiError
        ? `[FB ${e.code ?? ""}] ${e.message}${e.fbtrace_id ? ` (trace ${e.fbtrace_id})` : ""}`
        : (e as Error).message;

    console.error(
      `[syncAdAccount] FAILED account=${account.account_name ?? account.fb_account_id} (${account.id})`,
      "\n  error:",
      error,
      "\n  raw:",
      e,
    );

    await supabaseAdmin
      .from("ad_accounts")
      .update({
        last_sync_at: new Date().toISOString(),
        last_sync_status: "failed",
        last_sync_error: error,
      })
      .eq("id", account.id);
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

// FIX: circuit breaker for Facebook rate limits.
// The cron used to re-hit an already-rate-limited account every single run
// (previously every minute), which never lets Facebook's rolling rate-limit
// score recover — so the account got stuck permanently failing ("[FB 17]
// User request limit reached"). We now skip an account for a cooldown
// window after a rate-limit-type failure instead of retrying immediately.
const RATE_LIMIT_COOLDOWN_MS = 15 * 60 * 1000; // 15 minutes
// FB error codes that mean "you're calling too fast / too much", not a real
// data problem: 4 = app-level rate limit, 17 = user request limit, 32 = page
// request limit, 613 = custom rate limit / ad account throttling.
const FB_RATE_LIMIT_CODES = ["4", "17", "32", "613"];
function isFbRateLimitError(message: string | null | undefined): boolean {
  if (!message) return false;
  const m = /^\[FB (\d+)\]/.exec(message);
  return !!m && FB_RATE_LIMIT_CODES.includes(m[1]);
}

// FIX: Cloudflare Worker error
//   "Too many subrequests by single Worker invocation."
// One account sync costs ~25-30 subrequests (Facebook Graph calls + database
// calls). Syncing EVERY account inside a single invocation therefore blew the
// per-invocation subrequest budget as soon as there were a few accounts, and
// every account after the first one or two failed.
//
// FIX: syncAllAccounts() now processes at most MAX_ACCOUNTS_PER_RUN accounts
// per invocation (least-recently-synced first, so every account gets its turn)
// and reports how many are still pending. The UI drives the remaining accounts
// one request per account, and the cron simply picks up where it left off.
const DEFAULT_MAX_ACCOUNTS_PER_RUN = 1;

function maxAccountsPerRun(requested?: number): number {
  const envValue = Number(process.env["SYNC_MAX_ACCOUNTS_PER_RUN"]);
  const fallback =
    Number.isFinite(envValue) && envValue > 0 ? Math.floor(envValue) : DEFAULT_MAX_ACCOUNTS_PER_RUN;
  const n = Number.isFinite(Number(requested)) && Number(requested)! > 0 ? Number(requested) : fallback;
  // Hard ceiling: never try more than 3 accounts in one Worker invocation.
  return Math.min(Math.floor(n), 3);
}

export async function syncAllAccounts(options?: { maxAccounts?: number }) {
  const limit = maxAccountsPerRun(options?.maxAccounts);
  const health = await checkTokenHealth();
  const legacyToken = await getLegacyToken();

  // ✅ FIX: Legacy token invalid হলেও multi-BM connections থাকলে sync চালিয়ে যাও
  if (!health.ok && (health.status === "invalid" || health.status === "missing")) {
    const { count: connCount } = await (supabaseAdmin as any)
      .from("meta_connections")
      .select("id", { count: "exact", head: true })
      .eq("is_active", true);
    if ((connCount ?? 0) === 0) {
      // কোনো multi-BM connection নেই — skip করো
      return { count: 0, results: [], skipped: true, tokenHealth: health, remaining: 0 };
    }
    // Multi-BM connections আছে — sync চালিয়ে যাও
  }

  const { count: existingCount } = await supabaseAdmin
    .from("ad_accounts")
    .select("id", { count: "exact", head: true })
    .eq("is_active", true);
  const autoImport =
    existingCount === 0 && legacyToken
      ? await importVisibleAccountsForSync(legacyToken)
      : { imported: 0 };

  // Least-recently-synced first (never-synced accounts win) so a capped run
  // still rotates through every account across consecutive runs.
  const { data: accounts } = await supabaseAdmin
    .from("ad_accounts")
    .select("id,client_id,account_name,fb_account_id,last_sync_at,last_sync_status,last_sync_error")
    .eq("is_active", true)
    .order("last_sync_at", { ascending: true, nullsFirst: true });

  const all = (accounts ?? []) as any[];
  const results: Array<{
    id: string;
    ok: boolean;
    error?: string | null;
    account_name?: string | null;
  }> = [];

  let processed = 0;
  let index = 0;
  for (; index < all.length; index++) {
    const a = all[index];
    if (processed >= limit) break;

    if (
      a.last_sync_status === "failed" &&
      isFbRateLimitError(a.last_sync_error) &&
      a.last_sync_at &&
      Date.now() - new Date(a.last_sync_at).getTime() < RATE_LIMIT_COOLDOWN_MS
    ) {
      results.push({
        id: a.id,
        ok: false,
        error: `skipped — cooling down after Facebook rate limit (retries again after ${new Date(
          new Date(a.last_sync_at).getTime() + RATE_LIMIT_COOLDOWN_MS,
        ).toISOString()})`,
        account_name: a.account_name,
      });
      continue; // cooldown skips cost no subrequests
    }

    try {
      const r = await syncAdAccount(a.id);
      results.push({ id: a.id, ok: r.ok, error: r.error, account_name: a.account_name });
    } catch (e) {
      const msg = (e as Error).message;
      console.error(`[syncAllAccounts] threw for account ${a.account_name ?? a.fb_account_id}:`, e);
      results.push({ id: a.id, ok: false, error: msg, account_name: a.account_name });
    }
    processed += 1;
  }

  const pending = all.slice(index).map((a) => ({
    id: a.id as string,
    account_name: (a.account_name ?? null) as string | null,
  }));

  // Budget alerts only when the whole rotation finished — they read aggregate
  // spend, and running them mid-rotation both wastes subrequests and alerts on
  // half-synced numbers.
  if (pending.length === 0) {
    try {
      await evaluateBudgetAlerts();
    } catch (e) {
      console.error("[syncAllAccounts] budget alerts failed", e);
    }
  }

  return {
    count: results.length,
    results,
    tokenHealth: health,
    autoImport,
    remaining: pending.length,
    pending,
    limit,
  };
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
    const spent = (c.ad_accounts ?? []).reduce(
      (s: number, a: any) => s + (Number(a.total_spend) || 0),
      0,
    );
    const pct = (spent / budget) * 100;
    const since = new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString();

    async function emit(
      type: string,
      severity: "info" | "warning" | "critical",
      title: string,
      message: string,
    ) {
      const { data: existing } = await supabaseAdmin
        .from("alerts")
        .select("id")
        .eq("client_id", c.id)
        .eq("type", type)
        .gte("created_at", since)
        .limit(1);
      if (existing && existing.length) return;
      await supabaseAdmin
        .from("alerts")
        .insert({ client_id: c.id, type, severity, title, message });
    }

    if (pct >= 100) {
      await emit(
        "budget_exceeded",
        "critical",
        `${c.name}: monthly budget exceeded`,
        `Spent ${spent.toFixed(2)} of ${budget.toFixed(2)} (${pct.toFixed(1)}%).`,
      );
    } else if (pct >= 90) {
      await emit(
        "budget_90",
        "critical",
        `${c.name}: 90% of monthly budget used`,
        `Spent ${spent.toFixed(2)} of ${budget.toFixed(2)} (${pct.toFixed(1)}%).`,
      );
    } else if (pct >= 75) {
      await emit(
        "budget_75",
        "warning",
        `${c.name}: 75% of monthly budget used`,
        `Spent ${spent.toFixed(2)} of ${budget.toFixed(2)} (${pct.toFixed(1)}%).`,
      );
    }
    if (pct - expectedPct >= 20) {
      await emit(
        "pacing_ahead",
        "warning",
        `${c.name}: spend pacing ahead of schedule`,
        `Actual ${pct.toFixed(1)}% vs expected ${expectedPct.toFixed(1)}% by today.`,
      );
    }
  }
}

export async function syncConnectionAccounts(connectionId: string) {
  const { data: accounts } = await supabaseAdmin
    .from("ad_accounts")
    .select("id,account_name,fb_account_id")
    .eq("connection_id", connectionId)
    .eq("is_active", true);
  const results: Array<{
    id: string;
    ok: boolean;
    error?: string | null;
    account_name?: string | null;
  }> = [];
  for (const a of accounts ?? []) {
    try {
      const r = await syncAdAccount(a.id);
      results.push({ id: a.id, ok: r.ok, error: r.error, account_name: a.account_name });
    } catch (e) {
      console.error(`[syncConnectionAccounts] threw for ${a.account_name ?? a.fb_account_id}:`, e);
      results.push({
        id: a.id,
        ok: false,
        error: (e as Error).message,
        account_name: a.account_name,
      });
    }
  }
  return { count: results.length, results };
}
