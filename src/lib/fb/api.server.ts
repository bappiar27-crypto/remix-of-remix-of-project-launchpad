// Facebook Marketing Graph API helpers — SERVER ONLY.
// This file is suffixed `.server.ts` so the bundler refuses any client import.

const GRAPH_VERSION = "v21.0";
const GRAPH = `https://graph.facebook.com/${GRAPH_VERSION}`;
const VISIBLE_ENTITY_STATUSES = "['ACTIVE','PAUSED','ARCHIVED','CAMPAIGN_PAUSED','ADSET_PAUSED','IN_PROCESS','WITH_ISSUES','PENDING_REVIEW','DISAPPROVED','PREAPPROVED','PENDING_BILLING_INFO']";
const INSIGHTS_ATTRIBUTION_PARAMS = {
  use_unified_attribution_setting: "true",
  action_report_time: "conversion",
};

function formatDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

function recentRangeThroughToday(days: number) {
  const until = new Date();
  const since = new Date(until);
  since.setUTCDate(since.getUTCDate() - (days - 1));
  return JSON.stringify({ since: formatDate(since), until: formatDate(until) });
}

export class FbApiError extends Error {
  constructor(message: string, public code?: number, public type?: string, public fbtrace_id?: string) {
    super(message);
  }
}

async function fbFetch<T = any>(path: string, params: Record<string, string>, token: string): Promise<T> {
  const url = new URL(`${GRAPH}${path.startsWith("/") ? path : "/" + path}`);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  url.searchParams.set("access_token", token);
  const res = await fetch(url.toString(), { headers: { Accept: "application/json" } });
  const json: any = await res.json();
  if (!res.ok || json.error) {
    const e = json.error ?? {};
    throw new FbApiError(e.message ?? `HTTP ${res.status}`, e.code, e.type, e.fbtrace_id);
  }
  return json as T;
}

async function fbFetchAll<T = any>(path: string, params: Record<string, string>, token: string, max = 1000): Promise<T[]> {
  let url = `${GRAPH}${path.startsWith("/") ? path : "/" + path}`;
  let first = true;
  const all: T[] = [];
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const u = new URL(url);
    if (first) {
      Object.entries(params).forEach(([k, v]) => u.searchParams.set(k, v));
      first = false;
    }
    u.searchParams.set("access_token", token);
    const res = await fetch(u.toString(), { headers: { Accept: "application/json" } });
    const json: any = await res.json();
    if (!res.ok || json.error) {
      const e = json.error ?? {};
      throw new FbApiError(e.message ?? `HTTP ${res.status}`, e.code, e.type, e.fbtrace_id);
    }
    if (Array.isArray(json.data)) all.push(...json.data);
    if (all.length >= max) break;
    const next = json.paging?.next as string | undefined;
    if (!next) break;
    url = next;
  }
  return all;
}

export interface FbAccountInfo {
  id: string; name: string; account_status: number; currency: string; timezone_name: string;
  business?: { id: string; name: string };
}

export interface EndpointProbe {
  endpoint: string;
  ok: boolean;
  count: number;
  error?: { code?: number; type?: string; message: string; fbtrace_id?: string };
}

export interface AccountDataProbe extends EndpointProbe {
  account_id: string;
  account_name?: string;
}

export const fb = {
  async validateToken(token: string) {
    return fbFetch("/me", { fields: "id,name" }, token);
  },
  async listBusinesses(token: string): Promise<Array<{ id: string; name: string }>> {
    try {
      return await fbFetchAll<{ id: string; name: string }>("/me/businesses", { fields: "id,name", limit: "100" }, token);
    } catch (e) {
      console.warn("[fb] /me/businesses failed", e);
      return [];
    }
  },
  async listAdAccountsDetailed(token: string, businessId?: string | null): Promise<{ accounts: FbAccountInfo[]; probes: EndpointProbe[] }> {
    const fields = "id,name,account_status,currency,timezone_name,business{id,name}";
    const seen = new Map<string, FbAccountInfo>();
    const probes: EndpointProbe[] = [];
    const add = (rows: FbAccountInfo[]) => rows.forEach((r) => { if (r?.id) seen.set(r.id, r); });

    const probe = async (endpoint: string, fn: () => Promise<FbAccountInfo[]>) => {
      try {
        const rows = await fn();
        add(rows);
        probes.push({ endpoint, ok: true, count: rows.length });
      } catch (e: any) {
        probes.push({
          endpoint, ok: false, count: 0,
          error: { code: e?.code, type: e?.type, message: e?.message ?? String(e), fbtrace_id: e?.fbtrace_id },
        });
      }
    };

    await probe("/me/adaccounts", () => fbFetchAll<FbAccountInfo>("/me/adaccounts", { fields, limit: "200" }, token));
    if (businessId) {
      const bid = businessId.replace(/^B?_?/, "").trim();
      await probe(`/${bid}/owned_ad_accounts`, () => fbFetchAll<FbAccountInfo>(`/${bid}/owned_ad_accounts`, { fields, limit: "200" }, token));
      await probe(`/${bid}/client_ad_accounts`, () => fbFetchAll<FbAccountInfo>(`/${bid}/client_ad_accounts`, { fields, limit: "200" }, token));
    }
    return { accounts: Array.from(seen.values()), probes };
  },
  async listAdAccounts(token: string, businessId?: string | null): Promise<FbAccountInfo[]> {
    const { accounts } = await this.listAdAccountsDetailed(token, businessId);
    return accounts;
  },
  async probeAccountDataAccess(accounts: FbAccountInfo[], token: string, maxAccounts = 10): Promise<AccountDataProbe[]> {
    const probes: AccountDataProbe[] = [];
    const probe = async (account: FbAccountInfo, endpoint: string, fn: () => Promise<any[]>) => {
      try {
        const rows = await fn();
        probes.push({ account_id: account.id, account_name: account.name, endpoint, ok: true, count: rows.length });
      } catch (e: any) {
        probes.push({
          account_id: account.id,
          account_name: account.name,
          endpoint,
          ok: false,
          count: 0,
          error: { code: e?.code, type: e?.type, message: e?.message ?? String(e), fbtrace_id: e?.fbtrace_id },
        });
      }
    };

    for (const account of accounts.slice(0, maxAccounts)) {
      await probe(account, `/${account.id}/campaigns`, () => fbFetchAll(`/${account.id}/campaigns`, { fields: "id,name,effective_status", limit: "1" }, token, 1));
      await probe(account, `/${account.id}/adsets`, () => fbFetchAll(`/${account.id}/adsets`, { fields: "id,name,effective_status", limit: "1" }, token, 1));
      await probe(account, `/${account.id}/ads`, () => fbFetchAll(`/${account.id}/ads`, { fields: "id,name,effective_status", limit: "1" }, token, 1));
      await probe(account, `/${account.id}/insights`, () => fbFetchAll(`/${account.id}/insights`, { level: "account", date_preset: "maximum", fields: "spend,reach,impressions,clicks,date_start,date_stop", limit: "1", ...INSIGHTS_ATTRIBUTION_PARAMS }, token, 1));
    }
    return probes;
  },
  async getAccount(actId: string, token: string): Promise<FbAccountInfo> {
    return fbFetch(`/${actId}`, { fields: "id,name,account_status,currency,timezone_name,business{id,name}" }, token);
  },
  async listCampaigns(actId: string, token: string) {
    return fbFetchAll(`/${actId}/campaigns`, {
      fields: "id,name,objective,status,effective_status,daily_budget,lifetime_budget,buying_type,start_time,stop_time",
      effective_status: VISIBLE_ENTITY_STATUSES,
      limit: "200",
    }, token);
  },
  async listAdSets(actId: string, token: string) {
    return fbFetchAll(`/${actId}/adsets`, {
      fields: "id,name,campaign_id,status,effective_status,daily_budget,lifetime_budget,optimization_goal,billing_event,bid_amount,start_time,end_time",
      effective_status: VISIBLE_ENTITY_STATUSES,
      limit: "300",
    }, token);
  },
  async listAds(actId: string, token: string) {
    return fbFetchAll(`/${actId}/ads`, {
      fields: "id,name,adset_id,campaign_id,status,effective_status,creative{id,thumbnail_url,object_story_spec}",
      effective_status: VISIBLE_ENTITY_STATUSES,
      limit: "500",
    }, token);
  },
  async getInsights(actId: string, token: string, datePreset = "last_7d", level: "account" | "campaign" | "adset" | "ad" = "campaign") {
    return fbFetchAll(`/${actId}/insights`, {
      level,
      date_preset: datePreset,
      fields: "campaign_id,campaign_name,adset_id,adset_name,ad_id,ad_name,spend,reach,impressions,clicks,ctr,cpc,cpm,frequency,actions,optimization_goal,date_start,date_stop",
      limit: "500",
      ...INSIGHTS_ATTRIBUTION_PARAMS,
    }, token);
  },
  async getAccountInsights(actId: string, token: string, datePreset = "last_7d") {
    const rows = await fbFetchAll(`/${actId}/insights`, {
      level: "account",
      date_preset: datePreset,
      fields: "spend,reach,impressions,clicks,ctr,cpc,cpm,frequency,actions,date_start,date_stop",
      limit: "1",
      ...INSIGHTS_ATTRIBUTION_PARAMS,
    }, token);
    return rows[0] ?? null;
  },
  async getTimeSeries(actId: string, token: string, datePreset = "last_7d") {
    const params: Record<string, string> = {
      level: "account",
      time_increment: "1",
      fields: "spend,reach,impressions,clicks,ctr,cpc,cpm,frequency,actions,date_start,date_stop",
      limit: "100",
      ...INSIGHTS_ATTRIBUTION_PARAMS,
    };
    if (datePreset === "last_30d") params.time_range = recentRangeThroughToday(30);
    else params.date_preset = datePreset;
    return fbFetchAll(`/${actId}/insights`, params, token);
  },
  // Per-campaign time series for an ad account, optionally filtered to a
  // specific set of campaign IDs. This is what the portal uses when the client
  // has assigned campaigns, so totals only include their campaigns instead of
  // the entire ad account's history.
  async getCampaignTimeSeries(actId: string, token: string, fbCampaignIds: string[], datePreset = "last_30d") {
    const params: Record<string, string> = {
      level: "campaign",
      time_increment: "1",
      fields: "campaign_id,campaign_name,spend,reach,impressions,clicks,ctr,cpc,cpm,frequency,actions,optimization_goal,date_start,date_stop",
      limit: "500",
      ...INSIGHTS_ATTRIBUTION_PARAMS,
    };
    if (fbCampaignIds.length > 0) {
      params.filtering = JSON.stringify([
        { field: "campaign.id", operator: "IN", value: fbCampaignIds },
      ]);
    }
    if (datePreset === "last_30d") params.time_range = recentRangeThroughToday(30);
    else params.date_preset = datePreset;
    return fbFetchAll(`/${actId}/insights`, params, token);
  },
  // NEW — Per-adset daily time series. We use this so the portal always has
  // ground-truth metrics for every ad set even when Meta's "maximum" preset
  // returns no row for a brand-new ad set on day 1.
  async getAdSetTimeSeries(actId: string, token: string, datePreset = "last_30d") {
    const params: Record<string, string> = {
      level: "adset",
      time_increment: "1",
      fields: "campaign_id,adset_id,adset_name,spend,reach,impressions,clicks,ctr,cpc,cpm,frequency,actions,optimization_goal,date_start,date_stop",
      limit: "500",
      ...INSIGHTS_ATTRIBUTION_PARAMS,
    };
    if (datePreset === "last_30d") params.time_range = recentRangeThroughToday(30);
    else params.date_preset = datePreset;
    return fbFetchAll(`/${actId}/insights`, params, token);
  },
};

// Pick the "Results" number that mirrors what Meta Ads Manager shows.
// When optimizationGoal is known, prefer that family's action types first.
// Crucially we DO NOT fall back to link_click for generic objectives — that
// was making messaging campaigns report Clicks as Results.
export function extractPrimaryResults(actions: any[] | undefined, optimizationGoal?: string | null): number {
  if (!actions || !Array.isArray(actions) || actions.length === 0) return 0;

  const goal = (optimizationGoal ?? "").toUpperCase();
  const find = (t: string) => {
    const a = actions.find((x) => x.action_type === t);
    return a ? Number(a.value) || 0 : null;
  };

  // Goal-aware priority
  const goalOrder: string[] = [];
  if (goal.includes("CONVERSATION") || goal.includes("MESSAGE") || goal.includes("REPLIES")) {
    goalOrder.push(
      "onsite_conversion.messaging_conversation_started_7d",
      "onsite_conversion.total_messaging_connection",
      "onsite_conversion.messaging_first_reply",
      "messaging_conversation_started",
    );
  } else if (goal.includes("LEAD")) {
    goalOrder.push("onsite_conversion.lead_grouped", "lead", "offsite_conversion.fb_pixel_lead");
  } else if (goal.includes("PURCHASE") || goal.includes("VALUE")) {
    goalOrder.push("offsite_conversion.fb_pixel_purchase", "purchase", "omni_purchase");
  } else if (goal.includes("REGISTRATION") || goal.includes("COMPLETE_REGISTRATION")) {
    goalOrder.push("complete_registration", "offsite_conversion.fb_pixel_complete_registration");
  } else if (goal.includes("LINK_CLICK") || goal === "LINK_CLICKS") {
    goalOrder.push("link_click");
  } else if (goal.includes("LANDING_PAGE")) {
    goalOrder.push("landing_page_view");
  } else if (goal.includes("VIDEO")) {
    goalOrder.push("video_view");
  } else if (goal.includes("ENGAGEMENT") || goal.includes("POST_ENGAGEMENT")) {
    goalOrder.push("post_engagement", "page_engagement");
  }

  for (const t of goalOrder) {
    const v = find(t);
    if (v !== null) return v;
  }

  // Generic fallback — same as Meta's "Results" column when goal is unknown.
  // NOTE: link_click is intentionally NOT here. If a non-link campaign has no
  // matching action it should show 0, not its click count.
  const generic = [
    "onsite_conversion.messaging_conversation_started_7d",
    "onsite_conversion.total_messaging_connection",
    "onsite_conversion.messaging_first_reply",
    "messaging_conversation_started",
    "onsite_conversion.lead_grouped",
    "lead",
    "offsite_conversion.fb_pixel_lead",
    "offsite_conversion.fb_pixel_purchase",
    "purchase",
    "complete_registration",
  ];
  for (const t of generic) {
    const v = find(t);
    if (v !== null) return v;
  }
  return 0;
}

export function normalizeActId(s: string): string {
  const t = s.trim();
  return t.startsWith("act_") ? t : `act_${t.replace(/\D/g, "")}`;
}
