import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

// Public server fns for the client portal (/portal/:slug).

async function loadClientWithAuth(slug: string, token?: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const code = slug.toUpperCase();
  let { data: client, error } = await supabaseAdmin
    .from("clients")
    .select(
      "id,name,slug,client_code,company,logo_url,brand_color,status,monthly_budget,deposit_amount,deposit_currency,bdt_rate,portal_token,commission_enabled,commission_percent",
    )
    .eq("client_code", code)
    .maybeSingle();
  if (!client && !error) {
    const r2 = await supabaseAdmin
      .from("clients")
      .select(
        "id,name,slug,client_code,company,logo_url,brand_color,status,monthly_budget,deposit_amount,deposit_currency,bdt_rate,portal_token,commission_enabled,commission_percent",
      )
      .eq("slug", slug)
      .maybeSingle();
    client = r2.data as any;
    error = r2.error as any;
  }
  if (error) {
    console.error("[portal] client lookup error", { slug, code, error: error.message });
    throw new Error(error.message);
  }
  if (!client) {
    console.error("[portal] client not found", { slug, code });
    return { notFound: true as const };
  }
  if (client.status === "archived") return { notFound: true as const };

  if (client.portal_token && client.portal_token !== token) {
    return { forbidden: true as const };
  }
  return { client, supabaseAdmin } as const;
}

async function getTokenForPortalAccount(
  supabaseAdmin: any,
  account: any,
  legacyToken?: string | null,
) {
  if (account.connection_id) {
    const { data: c } = await (supabaseAdmin as any)
      .from("meta_connections")
      .select("fb_system_user_token")
      .eq("id", account.connection_id)
      .maybeSingle();
    if (c?.fb_system_user_token) return c.fb_system_user_token as string;
  }
  return legacyToken || null;
}

export const getClientPortalData = createServerFn({ method: "POST" })
  .inputValidator((d: { slug: string; token?: string }) =>
    z
      .object({
        slug: z.string().min(1).max(120),
        token: z.string().min(4).max(128).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const r = await loadClientWithAuth(data.slug, data.token);
    if ("notFound" in r) return { notFound: true as const };
    if ("forbidden" in r) return { forbidden: true as const };
    const { client, supabaseAdmin } = r;

    const { data: assigned } = await supabaseAdmin
      .from("client_campaigns")
      .select("campaign_id")
      .eq("client_id", client.id);
    const assignedCampaignIds = (assigned ?? []).map((r) => r.campaign_id);

    // Ad-set level scope (preferred): if the admin assigned specific ad sets,
    // we only return THOSE ad sets and their ads. Falls back to campaign scope.
    const { data: assignedAdsetRows } = await (supabaseAdmin as any)
      .from("client_ad_sets")
      .select("fb_adset_id")
      .eq("client_id", client.id);
    const assignedAdsetFbIds = (assignedAdsetRows ?? [])
      .map((r: any) => r.fb_adset_id)
      .filter(Boolean);

    let accounts: any[] = [];
    let campaigns: any[] = [];
    let adSets: any[] = [];
    let ads: any[] = [];
    // fb_campaign_id list for scoping live time-series to assigned campaigns
    let assignedFbCampaignIds: string[] = [];

    if (assignedCampaignIds.length) {
      const { data: assignedCampaigns } = await supabaseAdmin
        .from("campaigns")
        .select(
          "id,fb_campaign_id,ad_account_id,name,objective,effective_status,daily_budget,lifetime_budget,spend,reach,impressions,clicks,ctr,cpc,cpm,frequency,results",
        )
        .in("id", assignedCampaignIds)
        .order("spend", { ascending: false })
        .limit(50);
      campaigns = assignedCampaigns ?? [];
      assignedFbCampaignIds = campaigns.map((c: any) => c.fb_campaign_id).filter(Boolean);

      let adSetsQuery = supabaseAdmin
        .from("ad_sets")
        .select(
          "id,fb_adset_id,campaign_id,ad_account_id,name,effective_status,daily_budget,lifetime_budget,optimization_goal,start_time,end_time,spend,reach,impressions,clicks,ctr,cpc,cpm,results,frequency",
        )
        .in("campaign_id", assignedCampaignIds);
      if (assignedAdsetFbIds.length > 0) {
        adSetsQuery = adSetsQuery.in("fb_adset_id", assignedAdsetFbIds);
      }
      const { data: assignedAdSets } = await adSetsQuery
        .order("spend", { ascending: false })
        .limit(200);
      adSets = assignedAdSets ?? [];

      // Use the internal UUIDs of the (already-scoped) ad sets to narrow ads,
      // so we never leak ads from sibling ad sets under the same campaign.
      const scopedAdSetUuids = adSets.map((s: any) => s.id).filter(Boolean);
      let adsQuery = supabaseAdmin
        .from("ads")
        .select(
          "id,ad_account_id,campaign_id,ad_set_id,name,fb_ad_id,effective_status,creative_thumbnail,preview_link,spend,reach,impressions,clicks,ctr,results",
        );
      if (assignedAdsetFbIds.length > 0) {
        if (scopedAdSetUuids.length === 0) {
          ads = [];
          adsQuery = null as any;
        } else {
          adsQuery = adsQuery.in("ad_set_id", scopedAdSetUuids);
        }
      } else {
        adsQuery = adsQuery.in("campaign_id", assignedCampaignIds);
      }
      if (adsQuery) {
        const { data: assignedAds } = await adsQuery
          .order("spend", { ascending: false })
          .limit(200);
        ads = assignedAds ?? [];
      }

      const campaignAccountIds = Array.from(
        new Set(campaigns.map((c) => c.ad_account_id).filter(Boolean)),
      );
      if (campaignAccountIds.length) {
        const { data: scopedAccounts } = await supabaseAdmin
          .from("ad_accounts")
          .select(
            "id,connection_id,fb_account_id,account_name,currency,timezone_name,business_name,total_spend,total_reach,total_impressions,total_clicks,total_results,active_campaigns,last_sync_at,last_sync_status,account_status",
          )
          .in("id", campaignAccountIds)
          .eq("is_active", true);
        accounts = scopedAccounts ?? [];
      }
    } else {
      const { data: clientAccounts } = await supabaseAdmin
        .from("ad_accounts")
        .select(
          "id,connection_id,fb_account_id,account_name,currency,timezone_name,business_name,total_spend,total_reach,total_impressions,total_clicks,total_results,active_campaigns,last_sync_at,last_sync_status,account_status",
        )
        .eq("client_id", client.id)
        .eq("is_active", true);
      accounts = clientAccounts ?? [];
      const accountIds = accounts.map((a) => a.id);

      // Ad-set-only scope: client has assigned ad sets but no client_campaigns.
      // Narrow ad sets (and ads) to ONLY those FB ad-set IDs, and derive
      // campaigns from those ad sets so the portal shows only the selected
      // ad set's data — never the whole account.
      if (assignedAdsetFbIds.length > 0) {
        const { data: scopedAdSets } = await supabaseAdmin
          .from("ad_sets")
          .select(
            "id,fb_adset_id,campaign_id,ad_account_id,name,effective_status,daily_budget,lifetime_budget,optimization_goal,start_time,end_time,spend,reach,impressions,clicks,ctr,cpc,cpm,results,frequency",
          )
          .in("fb_adset_id", assignedAdsetFbIds)
          .order("spend", { ascending: false })
          .limit(200);
        adSets = scopedAdSets ?? [];

        const scopedAdSetUuids = adSets.map((s: any) => s.id).filter(Boolean);
        const scopedCampaignIds = Array.from(
          new Set(adSets.map((s: any) => s.campaign_id).filter(Boolean)),
        );
        const scopedAccountIds = Array.from(
          new Set(adSets.map((s: any) => s.ad_account_id).filter(Boolean)),
        );

        if (scopedCampaignIds.length) {
          const { data: scopedCampaigns } = await supabaseAdmin
            .from("campaigns")
            .select(
              "id,fb_campaign_id,ad_account_id,name,objective,effective_status,daily_budget,lifetime_budget,spend,reach,impressions,clicks,ctr,cpc,cpm,frequency,results",
            )
            .in("id", scopedCampaignIds);
          campaigns = scopedCampaigns ?? [];
          assignedFbCampaignIds = campaigns.map((c: any) => c.fb_campaign_id).filter(Boolean);
        }

        if (scopedAdSetUuids.length) {
          const { data: scopedAds } = await supabaseAdmin
            .from("ads")
            .select(
              "id,ad_account_id,campaign_id,ad_set_id,name,fb_ad_id,effective_status,creative_thumbnail,preview_link,spend,reach,impressions,clicks,ctr,results",
            )
            .in("ad_set_id", scopedAdSetUuids)
            .order("spend", { ascending: false })
            .limit(200);
          ads = scopedAds ?? [];
        }

        // Load the accounts that actually host the scoped ad sets. Do not rely on
        // ad_accounts.client_id here: ad-set-only portal assignments often point
        // to an account owned by the agency/import client, not by this client row.
        // If we only filter the client's own accounts, Refresh has no account to
        // sync and the portal keeps showing the old ad_sets snapshot forever.
        if (scopedAccountIds.length) {
          const { data: scopedAccounts } = await supabaseAdmin
            .from("ad_accounts")
            .select(
              "id,connection_id,fb_account_id,account_name,currency,timezone_name,business_name,total_spend,total_reach,total_impressions,total_clicks,total_results,active_campaigns,last_sync_at,last_sync_status,account_status",
            )
            .in("id", scopedAccountIds)
            .eq("is_active", true);
          accounts = scopedAccounts ?? [];
        } else {
          accounts = [];
        }
      } else if (accountIds.length) {
        const [{ data: accountCampaigns }, { data: accountAdSets }, { data: accountAds }] =
          await Promise.all([
            supabaseAdmin
              .from("campaigns")
              .select(
                "id,fb_campaign_id,ad_account_id,name,objective,effective_status,daily_budget,lifetime_budget,spend,reach,impressions,clicks,ctr,cpc,cpm,frequency,results",
              )
              .in("ad_account_id", accountIds)
              .order("spend", { ascending: false })
              .limit(50),
            supabaseAdmin
              .from("ad_sets")
              .select(
                "id,fb_adset_id,campaign_id,ad_account_id,name,effective_status,daily_budget,lifetime_budget,optimization_goal,start_time,end_time,spend,reach,impressions,clicks,ctr,cpc,cpm,results,frequency",
              )
              .in("ad_account_id", accountIds)
              .order("spend", { ascending: false })
              .limit(200),
            supabaseAdmin
              .from("ads")
              .select(
                "id,ad_account_id,campaign_id,ad_set_id,name,fb_ad_id,effective_status,creative_thumbnail,preview_link,spend,reach,impressions,clicks,ctr,results",
              )
              .in("ad_account_id", accountIds)
              .order("spend", { ascending: false })
              .limit(200),
          ]);
        campaigns = accountCampaigns ?? [];
        adSets = accountAdSets ?? [];
        ads = accountAds ?? [];
      }
    }

    const accountIds = accounts.map((a) => a.id);

    // Time series — scoping rules:
    //   * Client has assigned campaigns → live per-campaign time series filtered
    //     to ONLY their campaigns (matches Ads Manager numbers exactly).
    //   * No assignments → account-level time series (whole ad account).
    let liveTimeSeries: any[] | null = null;
    const liveAdsetAggregateById = new Map<string, any>();
    if (accounts.length > 0) {
      try {
        const { fb, extractPrimaryResults } = await import("./api.server");
        const { data: settings } = await supabaseAdmin
          .from("app_settings")
          .select("fb_system_user_token")
          .eq("id", 1)
          .maybeSingle();
        const liveRows: any[] = [];
        for (const account of accounts) {
          const token = await getTokenForPortalAccount(
            supabaseAdmin,
            account,
            settings?.fb_system_user_token,
          );
          if (!token) continue;
          if (assignedAdsetFbIds.length > 0) {
            // Ad-set scoped portals must use ad-set insights. Fetching the parent
            // campaign would include sibling ad sets and can never match Ads Manager
            // for a single assigned ad set.
            const acctAdsetFbIds = adSets
              .filter((s: any) => s.ad_account_id === account.id)
              .map((s: any) => s.fb_adset_id)
              .filter(Boolean);
            if (acctAdsetFbIds.length === 0) continue;

            // Exact current totals must come from Meta aggregate insights without
            // time_increment. Ads Manager's Reach is unique over the selected
            // range, so daily rows cannot be recomposed into the same number.
            const aggregateRows = await fb.getAdSetAggregateInsights(
              account.fb_account_id,
              token,
              "maximum",
              acctAdsetFbIds,
            );
            for (const row of aggregateRows as any[]) {
              if (!row?.adset_id || !acctAdsetFbIds.includes(row.adset_id)) continue;
              const adSet = (adSets as any[]).find((s: any) => s.fb_adset_id === row.adset_id);
              const goal = row.optimization_goal ?? adSet?.optimization_goal ?? null;
              const results = extractPrimaryResults(row.actions, goal);
              liveAdsetAggregateById.set(row.adset_id, { ...row, results });
              if (!adSet) continue;
              adSet.spend = Number(row.spend) || 0;
              adSet.reach = Number(row.reach) || 0;
              adSet.impressions = Number(row.impressions) || 0;
              adSet.clicks = Number(row.clicks) || 0;
              adSet.ctr = Number(row.ctr) || 0;
              adSet.cpc = Number(row.cpc) || 0;
              adSet.cpm = Number(row.cpm) || 0;
              adSet.frequency = Number(row.frequency) || 0;
              adSet.results = results;
            }

            const rows = await fb.getAdSetTimeSeries(
              account.fb_account_id,
              token,
              "last_30d",
              acctAdsetFbIds,
            );
            liveRows.push(
              ...rows.map((row: any) => ({
                ...row,
                ad_account_id: account.id,
                entity_id: row.adset_id,
                results: extractPrimaryResults(row.actions, row.optimization_goal),
              })),
            );
          } else if (assignedFbCampaignIds.length > 0) {
            // Only campaigns belonging to THIS account
            const acctCampaignFbIds = campaigns
              .filter((c: any) => c.ad_account_id === account.id)
              .map((c: any) => c.fb_campaign_id)
              .filter(Boolean);
            if (acctCampaignFbIds.length === 0) continue;
            const rows = await fb.getCampaignTimeSeries(
              account.fb_account_id,
              token,
              acctCampaignFbIds,
              "last_30d",
            );
            liveRows.push(
              ...rows.map((row: any) => ({
                ...row,
                ad_account_id: account.id,
                entity_id: row.campaign_id,
                results: extractPrimaryResults(row.actions, row.optimization_goal),
              })),
            );
          } else {
            const rows = await fb.getTimeSeries(account.fb_account_id, token, "last_30d");
            liveRows.push(
              ...rows.map((row: any) => ({
                ...row,
                ad_account_id: account.id,
                entity_id: account.fb_account_id,
                results: extractPrimaryResults(row.actions),
              })),
            );
          }
        }
        liveTimeSeries = liveRows;
      } catch (e) {
        liveTimeSeries = null;
      }
    }

    // DB fallback time series — also scoped to assigned campaigns when applicable.
    let dbTimeSeries: any[] = [];
    if (accountIds.length) {
      const sinceStr = new Date(Date.now() - 29 * 86400000).toISOString().slice(0, 10);
      if (assignedAdsetFbIds.length > 0) {
        if (liveTimeSeries && liveTimeSeries.length > 0) {
          dbTimeSeries = [];
        } else {
          const { data: ts } = await supabaseAdmin
            .from("insights_snapshots")
            .select("ad_account_id,date_start,spend,reach,impressions,clicks,results,entity_id")
            .in("ad_account_id", accountIds)
            .eq("level", "adset")
            .in("entity_id", assignedAdsetFbIds)
            .gte("date_start", sinceStr)
            .order("date_start", { ascending: true });
          dbTimeSeries = ts ?? [];
        }
      } else if (assignedFbCampaignIds.length > 0) {
        const { data: ts } = await supabaseAdmin
          .from("insights_snapshots")
          .select("ad_account_id,date_start,spend,reach,impressions,clicks,results,entity_id")
          .in("ad_account_id", accountIds)
          .eq("level", "campaign")
          .in("entity_id", assignedFbCampaignIds)
          .gte("date_start", sinceStr)
          .order("date_start", { ascending: true });
        dbTimeSeries = ts ?? [];
      } else {
        const { data: ts } = await supabaseAdmin
          .from("insights_snapshots")
          .select("ad_account_id,date_start,spend,reach,impressions,clicks,results")
          .in("ad_account_id", accountIds)
          .eq("level", "account")
          .gte("date_start", sinceStr)
          .order("date_start", { ascending: true });
        dbTimeSeries = ts ?? [];
      }
    }

    // ============ AD SET aggregated metrics (NEW) ============
    // We aggregate per-adset daily snapshots from insights_snapshots so the
    // Ad Set Performance table uses the SAME source as the top KPIs. This
    // guarantees no row renders as zero just because Meta's "maximum" preset
    // skipped a brand-new ad set on day 1.
    if (accountIds.length && adSets.length > 0) {
      const sinceStr = new Date(Date.now() - 29 * 86400000).toISOString().slice(0, 10);
      const allFbIds = adSets.map((s: any) => s.fb_adset_id).filter(Boolean);
      if (allFbIds.length > 0) {
        const liveAdsetRows = (liveTimeSeries ?? []).filter((r: any) =>
          allFbIds.includes(r.entity_id ?? r.adset_id),
        );
        let sourceRows = liveAdsetRows;

        if (sourceRows.length === 0) {
          const { data: snaps } = await supabaseAdmin
            .from("insights_snapshots")
            .select("entity_id,spend,reach,impressions,clicks,results")
            .in("ad_account_id", accountIds)
            .eq("level", "adset")
            .in("entity_id", allFbIds)
            .gte("date_start", sinceStr);
          sourceRows = snaps ?? [];
        }

        const agg = new Map<
          string,
          { spend: number; reach: number; impressions: number; clicks: number; results: number }
        >();
        for (const r of sourceRows) {
          const id = (r as any).entity_id ?? (r as any).adset_id;
          if (!id) continue;
          const cur = agg.get(id) ?? { spend: 0, reach: 0, impressions: 0, clicks: 0, results: 0 };
          cur.spend += Number((r as any).spend) || 0;
          cur.impressions += Number((r as any).impressions) || 0;
          cur.clicks += Number((r as any).clicks) || 0;
          cur.results += Number((r as any).results) || 0;
          cur.reach = Math.max(cur.reach, Number((r as any).reach) || 0);
          agg.set(id, cur);
        }

        // Merge aggregated numbers into each ad set row. We OVERWRITE the
        // ad_sets columns when the aggregate is non-zero — that matches Ads
        // Manager because snapshots come from Meta's own daily insights
        // endpoint. If aggregate is zero (no snapshots yet) we keep whatever
        // is in ad_sets so we never DOWNGRADE real numbers.
        for (const s of adSets as any[]) {
          const v = agg.get(s.fb_adset_id);
          if (!v) continue;
          const hasData =
            v.spend > 0 || v.impressions > 0 || v.clicks > 0 || v.results > 0 || v.reach > 0;
          if (!hasData) continue;
          // Daily rows are only a fallback for zero rows. They are not allowed
          // to overwrite aggregate Ads Manager totals, because reach is unique
          // over the whole range and daily max/sum creates visible mismatches.
          const alreadyHasAggregateData =
            liveAdsetAggregateById.has(s.fb_adset_id) ||
            Number(s.spend) > 0 ||
            Number(s.impressions) > 0 ||
            Number(s.clicks) > 0 ||
            Number(s.results) > 0 ||
            Number(s.reach) > 0;
          if (alreadyHasAggregateData) continue;
          s.spend = v.spend;
          s.impressions = v.impressions;
          s.clicks = v.clicks;
          s.reach = v.reach;
          s.results = v.results;
          s.ctr = v.impressions > 0 ? (v.clicks / v.impressions) * 100 : 0;
          s.cpc = v.clicks > 0 ? v.spend / v.clicks : 0;
          s.cpm = v.impressions > 0 ? (v.spend / v.impressions) * 1000 : 0;
          s.frequency = v.reach > 0 ? v.impressions / v.reach : 0;
        }
        // Re-sort by spend so highest-spend ad sets appear first.
        adSets.sort((a: any, b: any) => (Number(b.spend) || 0) - (Number(a.spend) || 0));
      }
    }

    const { data: alerts } = await supabaseAdmin
      .from("alerts")
      .select("id,type,severity,title,message,created_at")
      .eq("client_id", client.id)
      .order("created_at", { ascending: false })
      .limit(15);

    // Strip portal_token — never expose it.
    const { portal_token: _t, ...clientPub } = client as any;

    return {
      notFound: false as const,
      forbidden: false as const,
      client: clientPub,
      accounts,
      campaigns,
      adSets,
      ads,
      assignedCampaignIds,
      assignedAdsetFbIds,
      adsetScoped: assignedAdsetFbIds.length > 0,
      timeSeries: liveTimeSeries && liveTimeSeries.length > 0 ? liveTimeSeries : dbTimeSeries,
      alerts: alerts ?? [],
    };
  });

// CSV-export-ready row fetch for the portal. Level = campaign|adset|ad.
export const getClientInsightsForExport = createServerFn({ method: "POST" })
  .inputValidator((d: { slug: string; token?: string; level: "campaign" | "adset" | "ad" }) =>
    z
      .object({
        slug: z.string().min(1).max(120),
        token: z.string().min(4).max(128).optional(),
        level: z.enum(["campaign", "adset", "ad"]),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const r = await loadClientWithAuth(data.slug, data.token);
    if ("notFound" in r) return { forbidden: true as const };
    if ("forbidden" in r) return { forbidden: true as const };
    const { client, supabaseAdmin } = r;

    // Scope the export to assigned campaigns when present (same as portal view).
    const { data: assigned } = await supabaseAdmin
      .from("client_campaigns")
      .select("campaign_id")
      .eq("client_id", client.id);
    const assignedIds = (assigned ?? []).map((a) => a.campaign_id);

    // Ad-set level scope — if present, narrow exports too.
    const { data: assignedAdsetRows } = await (supabaseAdmin as any)
      .from("client_ad_sets")
      .select("fb_adset_id")
      .eq("client_id", client.id);
    const assignedAdsetFbIds = (assignedAdsetRows ?? [])
      .map((r: any) => r.fb_adset_id)
      .filter(Boolean);

    const { data: accounts } = await supabaseAdmin
      .from("ad_accounts")
      .select("id,fb_account_id,account_name,currency")
      .eq("client_id", client.id)
      .eq("is_active", true);
    const ids = (accounts ?? []).map((a) => a.id);
    if (!ids.length && !assignedIds.length) return { forbidden: false as const, rows: [] as any[] };
    const acctById = new Map((accounts ?? []).map((a) => [a.id, a]));

    const table =
      data.level === "campaign" ? "campaigns" : data.level === "adset" ? "ad_sets" : "ads";

    let query = supabaseAdmin
      .from(table)
      .select(
        "ad_account_id,campaign_id,name,effective_status,spend,reach,impressions,clicks,ctr,cpc,cpm,results,frequency",
      )
      .order("spend", { ascending: false });

    if (assignedIds.length) {
      if (data.level === "campaign") {
        query = query.in("id", assignedIds);
      } else if (data.level === "adset") {
        query = query.in("campaign_id", assignedIds);
        if (assignedAdsetFbIds.length > 0) {
          query = query.in("fb_adset_id", assignedAdsetFbIds);
        }
      } else {
        // ad level — narrow to scoped ad sets when available
        if (assignedAdsetFbIds.length > 0) {
          const { data: scopedSets } = await supabaseAdmin
            .from("ad_sets")
            .select("id")
            .in("fb_adset_id", assignedAdsetFbIds);
          const setUuids = (scopedSets ?? []).map((r: any) => r.id);
          if (setUuids.length === 0) {
            return { forbidden: false as const, rows: [] as any[] };
          }
          query = query.in("ad_set_id", setUuids);
        } else {
          query = query.in("campaign_id", assignedIds);
        }
      }
    } else if (ids.length) {
      query = query.in("ad_account_id", ids);
    }

    const { data: rows } = await query;

    const enriched = (rows ?? []).map((r: any) => {
      const acct: any = acctById.get(r.ad_account_id);
      return {
        client: client.name,
        ad_account: acct?.account_name ?? acct?.fb_account_id ?? "",
        currency: acct?.currency ?? "",
        name: r.name,
        status: r.effective_status,
        spend: r.spend,
        reach: r.reach,
        impressions: r.impressions,
        clicks: r.clicks,
        ctr: r.ctr,
        cpc: r.cpc,
        cpm: r.cpm,
        results: r.results,
        frequency: r.frequency,
      };
    });
    return { forbidden: false as const, rows: enriched };
  });

// Trigger a fresh Meta sync for all ad accounts attached to a client/portal slug.
export const triggerClientSync = createServerFn({ method: "POST" })
  .inputValidator((d: { slug: string; token?: string; minAgeSec?: number; force?: boolean }) =>
    z
      .object({
        slug: z.string().min(1).max(120),
        token: z.string().min(4).max(128).optional(),
        minAgeSec: z.number().int().min(0).max(3600).optional(),
        force: z.boolean().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const r = await loadClientWithAuth(data.slug, data.token);
    if ("notFound" in r) return { ok: false as const, reason: "not-found" as const };
    if ("forbidden" in r) return { ok: false as const, reason: "forbidden" as const };
    const { client, supabaseAdmin } = r;

    const { data: assigned } = await supabaseAdmin
      .from("client_campaigns")
      .select("campaign_id")
      .eq("client_id", client.id);
    const assignedIds = (assigned ?? []).map((a) => a.campaign_id);

    const { data: assignedAdsetRows } = await (supabaseAdmin as any)
      .from("client_ad_sets")
      .select("fb_adset_id")
      .eq("client_id", client.id);
    const assignedAdsetFbIds = (assignedAdsetRows ?? [])
      .map((r: any) => r.fb_adset_id)
      .filter(Boolean);

    let accountIds: string[] = [];
    if (assignedIds.length) {
      const { data: cs } = await supabaseAdmin
        .from("campaigns")
        .select("ad_account_id")
        .in("id", assignedIds);
      accountIds = (cs ?? []).map((c) => c.ad_account_id).filter(Boolean);
    }

    if (assignedAdsetFbIds.length) {
      const { data: scopedSets } = await supabaseAdmin
        .from("ad_sets")
        .select("ad_account_id")
        .in("fb_adset_id", assignedAdsetFbIds);
      accountIds.push(...((scopedSets ?? []).map((s) => s.ad_account_id).filter(Boolean)));
    }

    accountIds = Array.from(new Set(accountIds));

    if (!accountIds.length) {
      const { data: as } = await supabaseAdmin
        .from("ad_accounts")
        .select("id")
        .eq("client_id", client.id)
        .eq("is_active", true);
      accountIds = (as ?? []).map((a) => a.id);
    }
    if (!accountIds.length) return { ok: true as const, synced: 0, skipped: 0, failed: 0 };

    const minAgeSec = data.minAgeSec ?? 50;
    const cutoff = new Date(Date.now() - minAgeSec * 1000).toISOString();
    const { data: accounts } = await supabaseAdmin
      .from("ad_accounts")
      .select("id,last_sync_at,last_sync_status")
      .in("id", accountIds);

    const toSync = (accounts ?? []).filter(
      (a) =>
        data.force ||
        a.last_sync_status === "failed" ||
        !a.last_sync_at ||
        a.last_sync_at < cutoff,
    );
    if (!toSync.length) {
      return { ok: true as const, synced: 0, skipped: accountIds.length, failed: 0 };
    }

    const { syncAdAccount } = await import("./sync.server");
    const results = await Promise.allSettled(toSync.map((a) => syncAdAccount(a.id)));
    const synced = results.filter((r) => r.status === "fulfilled" && r.value?.ok).length;
    const errors = results
      .map((r) => {
        if (r.status === "rejected") return (r.reason as Error)?.message ?? String(r.reason);
        return r.value?.ok ? null : r.value?.error || "Sync failed";
      })
      .filter(Boolean) as string[];
    const failed = errors.length;
    return {
      ok: failed === 0,
      synced,
      skipped: accountIds.length - toSync.length,
      failed,
      errors,
    };
  });
