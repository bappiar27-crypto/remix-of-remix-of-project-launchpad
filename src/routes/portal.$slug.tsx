// Public client portal — shareable link at /portal/:slug and /client/:code.
// If client.portal_token is set, the URL must include ?token=... matching it.
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  getClientPortalData,
  getClientInsightsForExport,
  triggerClientSync,
} from "@/lib/fb/portal.functions";
import { supabase } from "@/integrations/supabase/client";
import {
  RefreshCw,
  Download,
  Printer,
  FileImage,
  FileText,
  ShieldAlert,
  AlertCircle,
  CheckCircle2,
  Clock as ClockIcon,
  ChevronDown,
  DollarSign,
  Wallet,
  CircleDollarSign,
  Eye,
  Users,
  MousePointerClick,
  Target,
  TrendingUp,
  Percent,
  Activity,
  Image as ImageIcon,
  BarChart3,
  Coins,
  Gauge,
  Repeat,
  MousePointer,
} from "lucide-react";
import { toCsv, downloadCsv } from "@/lib/csv";
import { useI18n } from "@/lib/i18n-context";
import { ThemePicker, LanguageToggle, ModeToggle } from "@/components/HeaderControls";
import { LiveClock } from "@/components/LiveClock";
import { LogoMark } from "@/components/Logo";
import { z } from "zod";

const searchSchema = z.object({ token: z.string().optional() });

export const Route = createFileRoute("/portal/$slug")({
  validateSearch: (s: Record<string, unknown>) => searchSchema.parse(s),
  head: ({ params }) => ({
    meta: [
      { title: `${params.slug} — Live Ads Dashboard` },
      {
        name: "description",
        content: `Live Facebook Ads performance dashboard for ${params.slug}.`,
      },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: PortalPage,
});

type DateRange = "all" | "today" | "7d" | "30d" | "month";

function PortalPage() {
  const { slug } = Route.useParams();
  const { token } = Route.useSearch();
  return <PortalDashboard slug={slug} token={token} />;
}

export function PortalDashboard({ slug, token }: { slug: string; token?: string }) {
  const { t } = useI18n();
  const fetchPortal = useServerFn(getClientPortalData);
  const fetchExport = useServerFn(getClientInsightsForExport);
  const runSync = useServerFn(triggerClientSync);
  const [exporting, setExporting] = useState<string | null>(null);
  // Default to "Last 7 days" so the portal aligns with Ads Manager's default
  // 7-day view instead of an inflated lifetime total.
  const [range, setRange] = useState<DateRange>("all");
  const [pendingRange, setPendingRange] = useState<DateRange>("all");

  const [syncing, setSyncing] = useState(false);
  const [lastSyncAt, setLastSyncAt] = useState<number | null>(null);

  const { data, isLoading, isFetching, refetch, dataUpdatedAt } = useQuery({
    queryKey: ["portal", slug, token ?? ""],
    queryFn: () => fetchPortal({ data: { slug, token } }),
    refetchInterval: 60_000,
  });

  // Trigger a fresh Meta sync on portal mount (debounced — skips accounts
  // already synced in the last 2 minutes). Ensures the client sees real-time
  // numbers instead of whatever the last cron run left in the DB.
  useEffect(() => {
    let cancelled = false;
    const run = async (minAgeSec: number) => {
      if (cancelled) return;
      try {
        setSyncing(true);
        const r: any = await runSync({ data: { slug, token, minAgeSec } });
        if (!cancelled && r?.ok) {
          setLastSyncAt(Date.now());
          if (r.synced > 0) refetch();
        }
      } catch (_e) {
        // Sync failure is non-fatal — the realtime channel + 60s refetch still keep UI live.
      } finally {
        if (!cancelled) setSyncing(false);
      }
    };
    // Immediate fetch on mount (allow up-to-2-min-old data on first paint),
    // then a per-minute background sync that fires even if the tab is idle.
    run(120);
    const id = setInterval(() => run(50), 60_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [slug, token, runSync, refetch]);

  // Hard refresh: force a Meta sync + refetch (bound to the header button).
  const hardRefresh = async () => {
    try {
      setSyncing(true);
      await runSync({ data: { slug, token, force: true } });
      setLastSyncAt(Date.now());
      await refetch();
    } catch (_e) {
      await refetch();
    } finally {
      setSyncing(false);
    }
  };

  useEffect(() => {
    const ch = supabase
      .channel(`portal-${slug}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "ad_accounts" }, () =>
        refetch(),
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "campaigns" }, () => refetch())
      .on("postgres_changes", { event: "*", schema: "public", table: "ad_sets" }, () => refetch())
      .on("postgres_changes", { event: "*", schema: "public", table: "insights_snapshots" }, () =>
        refetch(),
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "alerts" }, () => refetch())
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [slug, token, refetch]);

  // Filter timeSeries by selected range
  const rangeDays =
    range === "today"
      ? 1
      : range === "7d"
        ? 7
        : range === "30d"
          ? 30
          : range === "month"
            ? new Date().getDate()
            : 9999;
  const filteredTS = useMemo(() => {
    if (!data || (data as any).notFound || (data as any).forbidden) return [] as any[];
    const ts = ((data as any).timeSeries ?? []) as any[];
    if (range === "all") return ts;
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - (rangeDays - 1));
    const cutoffStr = cutoff.toISOString().slice(0, 10);
    return ts.filter((r) => r.date_start >= cutoffStr);
  }, [data, range, rangeDays]);

  const totals = useMemo(() => {
    const empty = {
      spend: 0,
      reach: 0,
      impressions: 0,
      clicks: 0,
      results: 0,
      active: 0,
      frequency: 0,
    };
    if (!data || (data as any).notFound || (data as any).forbidden) return empty;
    const d: any = data;

    // Range filter — daily snapshot sum. Reach unique → max, not sum.
    if (range !== "all") {
      const sum = filteredTS.reduce(
        (a, r) => ({
          spend: a.spend + (Number(r.spend) || 0),
          impressions: a.impressions + (Number(r.impressions) || 0),
          clicks: a.clicks + (Number(r.clicks) || 0),
          results: a.results + (Number(r.results) || 0),
          reach: Math.max(a.reach, Number(r.reach) || 0),
        }),
        { spend: 0, reach: 0, impressions: 0, clicks: 0, results: 0 },
      );
      return {
        ...sum,
        active: (d.campaigns ?? []).filter((c: any) => c.effective_status === "ACTIVE").length,
        frequency: sum.reach > 0 ? sum.impressions / sum.reach : 0,
      };
    }

    // "All Time" with assigned campaigns → lifetime sum.
    // When ad-set scope is active, sum from the (already narrowed) ad sets so
    // the totals reflect ONLY the assigned ad sets — not every sibling ad set
    // under the parent campaign.
    if ((d.assignedCampaignIds ?? []).length) {
      // Helper — sum scope-aware metrics from any row collection.
      const sumScoped = (rows: any[]) =>
        rows.reduce(
          (acc: any, s: any) => ({
            spend: acc.spend + (Number(s.spend) || 0),
            reach: Math.max(acc.reach, Number(s.reach) || 0),
            impressions: acc.impressions + (Number(s.impressions) || 0),
            clicks: acc.clicks + (Number(s.clicks) || 0),
            results: acc.results + (Number(s.results) || 0),
            active: acc.active + (s.effective_status === "ACTIVE" ? 1 : 0),
          }),
          { spend: 0, reach: 0, impressions: 0, clicks: 0, results: 0, active: 0 },
        );

      // Pick the primary scope first (ad sets when ad-set-scoped, otherwise
      // campaigns). If that comes back at $0 / 0 across the board (a known
      // failure mode when Meta's insight save fell short for new entities),
      // fall back to the per-ad rows which are already scope-narrowed by
      // the server fn — guaranteeing the portal mirrors Ads Manager.
      const primary =
        d.adsetScoped && (d.adSets ?? []).length ? d.adSets : (d.campaigns ?? []);
      let sum = sumScoped(primary);
      if (
        sum.spend === 0 &&
        sum.impressions === 0 &&
        sum.results === 0 &&
        (d.ads ?? []).length > 0
      ) {
        sum = sumScoped(d.ads);
      }
      return { ...sum, frequency: sum.reach > 0 ? sum.impressions / sum.reach : 0 };
    }

    // "All Time" no assignments → account lifetime totals
    const sum = (d.accounts ?? []).reduce(
      (acc: any, a: any) => ({
        spend: acc.spend + (Number(a.total_spend) || 0),
        reach: Math.max(acc.reach, Number(a.total_reach) || 0),
        impressions: acc.impressions + (Number(a.total_impressions) || 0),
        clicks: acc.clicks + (Number(a.total_clicks) || 0),
        results: acc.results + (Number(a.total_results) || 0),
        active: acc.active + (Number(a.active_campaigns) || 0),
      }),
      { spend: 0, reach: 0, impressions: 0, clicks: 0, results: 0, active: 0 },
    );
    return { ...sum, frequency: sum.reach > 0 ? sum.impressions / sum.reach : 0 };
  }, [data, range, filteredTS]);

  if (isLoading)
    return (
      <div className="min-h-screen grid place-items-center text-muted-foreground">Loading…</div>
    );
  if (!data || (data as any).notFound) return <NotFoundCard reason="not-found" />;
  if ((data as any).forbidden) return <NotFoundCard reason="forbidden" />;

  const d: any = data;
  const { client, accounts, campaigns, adSets } = d;
  const currency = (accounts as any[])[0]?.currency ?? "USD";
  const bdtRate = Number(client.bdt_rate) || 0;
  const bdt = (n: number) =>
    bdtRate > 0
      ? `৳${(n * bdtRate).toLocaleString(undefined, { maximumFractionDigits: 0 })}`
      : null;

  // Commission markup — agency reduces real Meta budget by X%, but client portal
  // shows the original numbers (real / (1 - pct/100)). When disabled, markup = 1.
  const commissionPct = Number(client.commission_percent) || 0;
  const commissionOn = !!client.commission_enabled && commissionPct > 0 && commissionPct < 100;
  const markup = commissionOn ? 1 / (1 - commissionPct / 100) : 1;
  const mk = (n: number) => (Number(n) || 0) * markup;

  const cur = (n: number) => `${currencySymbol(currency)}${(Number(n) || 0).toFixed(2)}`;
  const dcur = (n: number) => cur(mk(n)); // display currency with markup
  const num = (n: number) => (Number(n) || 0).toLocaleString();

  // Last 7 days = today + previous 6 calendar days, not "last 7 cached rows".

  // Featured campaign = top by spend
  const featured = (campaigns as any[])[0];
  const featuredSpend = featured ? Number(featured.spend) || 0 : 0;
  const featuredResults = featured ? Number(featured.results) || 0 : 0;
  const featuredCtr = featured ? Number(featured.ctr) || 0 : 0;
  const featuredCostPerResult = featuredResults > 0 ? mk(featuredSpend) / featuredResults : 0;

  // Budget (deposit is what the CLIENT paid — already client-facing, no markup needed)
  const monthlyBudget = Number(client.monthly_budget) || 0;
  const deposit = Number(client.deposit_amount) || 0;
  const totalDeposit = monthlyBudget || deposit;
  const displaySpend = mk(totals.spend);
  const remaining = totalDeposit - displaySpend;
  const budgetPct = totalDeposit > 0 ? (displaySpend / totalDeposit) * 100 : 0;

  // Snapshot calcs — markup applied to currency outputs only
  const cpm = totals.impressions > 0 ? (mk(totals.spend) / totals.impressions) * 1000 : 0;
  const cpc = totals.clicks > 0 ? mk(totals.spend) / totals.clicks : 0;
  const ctr = totals.impressions > 0 ? (totals.clicks / totals.impressions) * 100 : 0;
  const resultRate = totals.impressions > 0 ? (totals.results / totals.impressions) * 100 : 0;
  const reachRate = totals.impressions > 0 ? (totals.reach / totals.impressions) * 100 : 0;
  const costPerResult = totals.results > 0 ? mk(totals.spend) / totals.results : 0;

  // Campaign Journey bar max
  const journey = [
    { label: "Impressions", value: totals.impressions, color: "from-blue-500 to-cyan-500" },
    { label: "Reach", value: totals.reach, color: "from-emerald-500 to-teal-500" },
    { label: "Clicks", value: totals.clicks, color: "from-amber-500 to-orange-500" },
    { label: "Results", value: totals.results, color: "from-violet-500 to-fuchsia-500" },
  ];
  const journeyMax = Math.max(...journey.map((j) => j.value), 1);

  const applyRange = () => setRange(pendingRange);

  const downloadExport = async (level: "campaign" | "adset" | "ad") => {
    setExporting(level);
    try {
      const res = await fetchExport({ data: { slug, token, level } });
      if (!res || (res as any).forbidden) return;
      const rows = (res as any).rows ?? [];
      const csv = toCsv(rows);
      downloadCsv(`${client.slug}-${level}-${new Date().toISOString().slice(0, 10)}.csv`, csv);
    } finally {
      setExporting(null);
    }
  };

  const adSetList: any[] = adSets ?? [];
  const adSetsCount = adSetList.length;

  const totalAdSetSpend = adSetList.reduce((a, r) => a + (Number(r.spend) || 0), 0);

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-surface/40 to-background">
      {/* Top dark header */}
      <header className="bg-[oklch(0.18_0.04_262)] text-white border-b border-white/10 sticky top-0 z-30 backdrop-blur shadow-lg">
        <div className="container mx-auto grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 px-3 py-3 sm:flex sm:flex-wrap sm:justify-between sm:gap-3 sm:px-4 sm:py-4">
          <div className="flex min-w-0 items-center gap-2 sm:gap-3">
            <LogoMark className="size-9 sm:size-11 shrink-0 p-1 shadow-xl" />
            <div className="min-w-0">
              <div className="font-display font-extrabold text-sm sm:text-xl lg:text-2xl tracking-tight leading-tight truncate">
                GrowVibe Ads Solution
              </div>
              <div className="text-[10px] sm:text-[12px] text-white/70 truncate">
                <span className="font-semibold text-white/85">{client.name}</span> ·{" "}
                {t("portal.tagline")}
              </div>
            </div>
          </div>
          <div className="col-span-2 flex items-center gap-1.5 sm:gap-2 flex-wrap justify-end sm:col-span-1">
            <LiveClock />
            <ModeToggle />
            <LanguageToggle />
            <ThemePicker />
            <button
              onClick={hardRefresh}
              disabled={isFetching || syncing}
              className="inline-flex items-center gap-1.5 rounded-lg bg-white/15 hover:bg-white/25 border border-white/20 px-3 py-2 sm:px-3 sm:py-1.5 text-[11px] sm:text-xs font-semibold disabled:opacity-60 transition-all min-h-[36px] sm:min-h-0"
            >
              <RefreshCw
                className={`size-3.5 sm:size-3.5 ${isFetching || syncing ? "animate-spin" : ""}`}
              />
              <span className="hidden sm:inline">
                {syncing ? "Syncing…" : (t("portal.refresh") ?? "Refresh")}
              </span>
              <span className="sm:hidden">{syncing ? "Sync…" : "Sync"}</span>
            </button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-3 sm:px-4 py-4 sm:py-6 space-y-4 sm:space-y-5 gv-fade-up">
        {/* Toolbar */}
        <div className="rounded-2xl bg-card border border-border shadow-sm p-3 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">
              Date Range
            </div>
            <div className="relative">
              <select
                value={pendingRange}
                onChange={(e) => setPendingRange(e.target.value as DateRange)}
                className="appearance-none rounded-lg border border-border bg-surface pl-3 pr-9 py-2 text-sm font-medium outline-none focus:ring-2 focus:ring-primary/40 min-w-[140px]"
              >
                <option value="all">All Time</option>
                <option value="today">Today</option>
                <option value="7d">Last 7 days</option>
                <option value="30d">Last 30 days</option>
                <option value="month">This Month</option>
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
            </div>
            <button
              onClick={applyRange}
              className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-indigo-500 to-violet-500 text-white px-4 py-2 text-sm font-semibold shadow hover:opacity-95 hover:-translate-y-0.5 hover:shadow-lg transition-all"
            >
              Apply Filter
            </button>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <div className="text-xs text-muted-foreground font-medium inline-flex items-center gap-2">
              <span
                className={`size-1.5 rounded-full ${syncing ? "bg-amber-500 animate-pulse" : "bg-emerald-500 gv-pulse-dot"}`}
              />
              {adSetsCount} Ad Set{adSetsCount !== 1 ? "s" : ""} ·{" "}
              {syncing ? "Syncing live…" : "Live Data"}
            </div>
            <SyncedAgo at={lastSyncAt ?? dataUpdatedAt} />
          </div>
        </div>

        {accounts.length === 0 && (
          <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-5 text-sm">
            <div className="flex items-center gap-2 font-semibold text-amber-500">
              <AlertCircle className="size-4" /> No connected campaigns yet
            </div>
            <p className="text-amber-700 dark:text-amber-300/80 mt-1">
              Your agency hasn't linked any active campaigns to this portal yet, or the latest Meta
              sync hasn't completed.
            </p>
          </div>
        )}

        {/* FEATURED CAMPAIGN — TOP */}
        {featured && (
          <div
            className="relative overflow-hidden rounded-2xl p-4 sm:p-6 lg:p-7 text-white shadow-xl gv-border-glow"
            style={{
              background:
                "linear-gradient(135deg, oklch(0.55 0.22 265) 0%, oklch(0.48 0.24 280) 60%, oklch(0.55 0.22 320) 100%)",
            }}
          >
            <div className="absolute -top-24 -right-24 size-72 rounded-full bg-white/10 blur-3xl pointer-events-none gv-float" />
            <div
              className="absolute -bottom-24 -left-24 size-72 rounded-full bg-white/10 blur-3xl pointer-events-none gv-float"
              style={{ animationDelay: "2s" }}
            />
            <div className="relative">
              <div className="text-[10px] sm:text-[11px] uppercase tracking-widest font-bold text-white/80 mb-2 inline-flex items-center gap-2">
                <span className="size-1.5 rounded-full bg-emerald-300 gv-pulse-dot" />
                Last 7 days · Top Campaign
              </div>
              <h2 className="text-xl sm:text-3xl lg:text-4xl font-extrabold truncate">
                {featured.name || client.slug}
              </h2>
              <div className="text-[10px] sm:text-xs text-white/70 mt-1 truncate">
                Campaign ID: {featured.id?.slice(0, 8).toUpperCase()} · {featured.objective ?? "—"}{" "}
                · Live data
              </div>
              <div className="mt-5 grid grid-cols-2 lg:grid-cols-4 gap-3">
                <FeatureStat label="Results" value={num(featuredResults)} />
                <FeatureStat
                  label="Cost / Result"
                  value={featuredResults > 0 ? cur(featuredCostPerResult) : "—"}
                />
                <FeatureStat label="CTR" value={`${featuredCtr.toFixed(2)}%`} />
                <FeatureStat label="Total Spend" value={dcur(featuredSpend)} />
              </div>
            </div>
          </div>
        )}

        {/* ============ Top 3 KPI Cards (Deposit / Spend / Remaining) ============ */}
        <div className="grid gap-4 grid-cols-1 md:grid-cols-3 gv-stagger">
          <KpiHeroCard
            label={`Total Deposit (${currency})`}
            value={cur(totalDeposit)}
            secondary={bdt(totalDeposit)}
            icon={<DollarSign className="size-4" />}
            accent="indigo"
          />
          <KpiHeroCard
            label="Total Spend"
            value={dcur(totals.spend)}
            secondary={bdt(displaySpend)}
            icon={<Wallet className="size-4" />}
            accent="violet"
          />
          <KpiHeroCard
            label="Remaining Balance"
            value={cur(remaining)}
            secondary={bdt(remaining)}
            tag={remaining < 0 ? "OVER BUDGET" : "REMAINING"}
            tagTone={remaining < 0 ? "danger" : "success"}
            icon={
              remaining < 0 ? (
                <AlertCircle className="size-4" />
              ) : (
                <CheckCircle2 className="size-4" />
              )
            }
            accent={remaining < 0 ? "rose" : "emerald"}
          />
        </div>

        {/* Budget Usage strip */}
        <div className="rounded-2xl bg-card border border-border p-4 shadow-sm gv-lift">
          <div className="flex items-center justify-between text-[11px] mb-2">
            <span className="text-muted-foreground font-semibold uppercase tracking-wider inline-flex items-center gap-1.5">
              <Gauge className="size-3.5" /> Budget Usage
            </span>
            <span
              className={`font-bold ${budgetPct > 100 ? "text-destructive" : budgetPct > 80 ? "text-amber-500" : "text-emerald-500"}`}
            >
              {budgetPct.toFixed(1)}%
            </span>
          </div>
          <div className="h-2.5 rounded-full bg-surface overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-700 ${budgetPct > 100 ? "bg-gradient-to-r from-rose-500 to-red-500" : "bg-gradient-to-r from-indigo-500 via-violet-500 to-emerald-500"}`}
              style={{ width: `${Math.min(100, budgetPct)}%` }}
            />
          </div>
        </div>

        {/* ============ Mini Metrics Grid ============ */}
        <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gv-stagger">
          <BentoMetric
            label="Impressions"
            value={num(totals.impressions)}
            dot="amber"
            icon={<Eye className="size-3.5" />}
          />
          <BentoMetric
            label="Reach"
            value={num(totals.reach)}
            dot="emerald"
            icon={<Users className="size-3.5" />}
          />
          <BentoMetric
            label="Clicks"
            value={num(totals.clicks)}
            dot="amber"
            icon={<MousePointerClick className="size-3.5" />}
          />
          <BentoMetric
            label="Results"
            value={num(totals.results)}
            dot="rose"
            icon={<Target className="size-3.5" />}
          />
          <BentoMetric
            label="CTR"
            value={`${ctr.toFixed(2)}%`}
            dot="violet"
            icon={<Percent className="size-3.5" />}
          />
          <BentoMetric
            label="Cost / Result"
            value={totals.results > 0 ? cur(costPerResult) : "—"}
            dot="violet"
            icon={<Coins className="size-3.5" />}
          />
        </div>

        {/* ============ Performance Snapshot ============ */}
        <div className="rounded-2xl bg-card border border-border p-5 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div className="font-bold inline-flex items-center gap-2">
              <BarChart3 className="size-4 text-primary" /> Performance Snapshot
            </div>
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">
              Traffic &amp; Cost
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <SnapCell
              label="Results"
              value={num(totals.results)}
              icon={<Target className="size-3.5" />}
            />
            <SnapCell
              label="Cost per result"
              value={totals.results > 0 ? cur(costPerResult) : "—"}
              icon={<Coins className="size-3.5" />}
            />
            <SnapCell
              label="Spend"
              value={dcur(totals.spend)}
              icon={<Wallet className="size-3.5" />}
            />
            <SnapCell
              label="Reach"
              value={num(totals.reach)}
              icon={<Users className="size-3.5" />}
            />
            <SnapCell
              label="Impressions"
              value={num(totals.impressions)}
              icon={<Eye className="size-3.5" />}
            />
            <SnapCell
              label="Frequency"
              value={totals.frequency > 0 ? totals.frequency.toFixed(2) : "—"}
              icon={<Repeat className="size-3.5" />}
            />
            <SnapCell
              label="CPM"
              value={totals.impressions > 0 ? cur(cpm) : "—"}
              icon={<CircleDollarSign className="size-3.5" />}
            />
            <SnapCell
              label="CPC"
              value={totals.clicks > 0 ? cur(cpc) : "—"}
              icon={<MousePointer className="size-3.5" />}
            />
            <SnapCell
              label="Clicks"
              value={num(totals.clicks)}
              icon={<MousePointerClick className="size-3.5" />}
            />
            <SnapCell
              label="CTR"
              value={`${ctr.toFixed(2)}%`}
              icon={<Percent className="size-3.5" />}
            />
            <SnapCell
              label="Result Rate"
              value={totals.impressions > 0 ? `${resultRate.toFixed(2)}%` : "—"}
              icon={<TrendingUp className="size-3.5" />}
            />
          </div>
        </div>

        {/* ============ Campaign Journey ============ */}
        <div className="rounded-2xl bg-card border border-border p-5 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div className="font-bold inline-flex items-center gap-2">
              <Activity className="size-4 text-primary" /> Campaign Journey
            </div>
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">
              Impressions → Conversion
            </div>
          </div>
          <div className="space-y-3">
            {journey.map((j) => (
              <div key={j.label} className="flex items-center gap-3">
                <div className="w-24 text-sm font-medium text-muted-foreground shrink-0">
                  {j.label}
                </div>
                <div className="flex-1 h-2.5 rounded-full bg-surface overflow-hidden">
                  <div
                    className={`h-full rounded-full bg-gradient-to-r ${j.color} transition-all duration-700`}
                    style={{ width: `${(j.value / journeyMax) * 100}%` }}
                  />
                </div>
                <div className="w-28 text-right text-sm font-bold tabular-nums">{num(j.value)}</div>
              </div>
            ))}
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <RateCell
              label="CTR"
              value={`${ctr.toFixed(2)}%`}
              icon={<Percent className="size-3.5" />}
            />
            <RateCell
              label="Reach Rate"
              value={totals.impressions > 0 ? `${reachRate.toFixed(2)}%` : "—"}
              icon={<Users className="size-3.5" />}
            />
            <RateCell
              label="Result Rate"
              value={totals.impressions > 0 ? `${resultRate.toFixed(2)}%` : "—"}
              icon={<TrendingUp className="size-3.5" />}
            />
            <RateCell
              label="Cost / Result"
              value={totals.results > 0 ? cur(costPerResult) : "—"}
              icon={<Coins className="size-3.5" />}
            />
          </div>
        </div>

        {/* ============ Ad Set Performance — AD SET level ============ */}
        <div className="rounded-2xl bg-card border border-border shadow-sm overflow-hidden gv-lift">
          <div className="px-5 py-4 border-b border-border flex items-center justify-between gap-3 flex-wrap">
            <div>
              <div className="font-bold inline-flex items-center gap-2">
                <ImageIcon className="size-4 text-primary" /> Ad Set Performance
              </div>
              <div className="text-xs text-muted-foreground mt-0.5">
                {adSetsCount} ad set{adSetsCount !== 1 ? "s" : ""} assigned to your account
              </div>
            </div>
            <div className="size-9 grid place-items-center rounded-lg border border-border bg-surface/60">
              <BarChart3 className="size-4 text-muted-foreground" />
            </div>
          </div>
          {/* Mobile card list — easier to scan on phones than horizontal scroll */}
          <div className="md:hidden divide-y divide-border/60">
            {adSetList.length === 0 ? (
              <div className="text-center py-10 text-muted-foreground text-sm">
                No ad sets assigned yet. Contact your agency.
              </div>
            ) : (
              adSetList.map((s: any) => {
                const aSpend = Number(s.spend) || 0;
                const aResults = Number(s.results) || 0;
                const aImpr = Number(s.impressions) || 0;
                const dailyBudget = s.daily_budget ? Number(s.daily_budget) : 0;
                const resultRateAd = aImpr > 0 ? (aResults / aImpr) * 100 : 0;
                const spendPct = totalAdSetSpend > 0 ? (aSpend / totalAdSetSpend) * 100 : 0;
                const costPerR = aResults > 0 ? mk(aSpend) / aResults : 0;
                return (
                  <div key={s.id} className="p-4 space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="font-semibold text-sm leading-tight truncate">{s.name}</div>
                        <div className="text-[10px] text-muted-foreground tabular-nums mt-1">
                          {(s.id ?? "").toString().slice(0, 16)}
                        </div>
                      </div>
                      <span
                        className={`shrink-0 inline-flex items-center gap-1.5 text-[10px] font-bold uppercase rounded-full px-2.5 py-1 ${
                          s.effective_status === "ACTIVE"
                            ? "bg-emerald-500/15 text-emerald-500"
                            : s.effective_status === "PAUSED"
                              ? "bg-amber-500/15 text-amber-500"
                              : "bg-muted/40 text-muted-foreground"
                        }`}
                      >
                        {s.effective_status ?? "—"}
                      </span>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <div className="rounded-lg bg-surface/60 px-2.5 py-2">
                        <div className="text-[9px] uppercase tracking-wider text-muted-foreground font-semibold">
                          Spend
                        </div>
                        <div className="text-sm font-bold tabular-nums mt-0.5 truncate">
                          {dcur(aSpend)}
                        </div>
                      </div>
                      <div className="rounded-lg bg-surface/60 px-2.5 py-2">
                        <div className="text-[9px] uppercase tracking-wider text-muted-foreground font-semibold">
                          Results
                        </div>
                        <div className="text-sm font-bold tabular-nums mt-0.5 truncate">
                          {num(aResults)}
                        </div>
                      </div>
                      <div className="rounded-lg bg-surface/60 px-2.5 py-2">
                        <div className="text-[9px] uppercase tracking-wider text-muted-foreground font-semibold">
                          Cost/Res
                        </div>
                        <div className="text-sm font-bold tabular-nums mt-0.5 truncate">
                          {aResults > 0 ? cur(costPerR) : "—"}
                        </div>
                      </div>
                      <div className="rounded-lg bg-surface/60 px-2.5 py-2">
                        <div className="text-[9px] uppercase tracking-wider text-muted-foreground font-semibold">
                          Impr.
                        </div>
                        <div className="text-sm font-bold tabular-nums mt-0.5 truncate">
                          {num(aImpr)}
                        </div>
                      </div>
                      <div className="rounded-lg bg-surface/60 px-2.5 py-2">
                        <div className="text-[9px] uppercase tracking-wider text-muted-foreground font-semibold">
                          Reach
                        </div>
                        <div className="text-sm font-bold tabular-nums mt-0.5 truncate">
                          {num(Number(s.reach) || 0)}
                        </div>
                      </div>
                      <div className="rounded-lg bg-surface/60 px-2.5 py-2">
                        <div className="text-[9px] uppercase tracking-wider text-muted-foreground font-semibold">
                          CTR
                        </div>
                        <div className="text-sm font-bold tabular-nums mt-0.5 truncate">
                          {Number(s.ctr || 0).toFixed(2)}%
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                      <span>
                        Daily:{" "}
                        <span className="font-semibold text-foreground">
                          {dailyBudget > 0 ? dcur(dailyBudget) : "—"}
                        </span>
                      </span>
                      <span>
                        Result Rate:{" "}
                        <span className="font-semibold text-foreground">
                          {aImpr > 0 ? `${resultRateAd.toFixed(2)}%` : "—"}
                        </span>
                      </span>
                    </div>
                    <div className="h-1.5 rounded-full bg-surface overflow-hidden">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-indigo-500 via-violet-500 to-fuchsia-500 transition-all duration-700"
                        style={{ width: `${Math.min(100, spendPct)}%` }}
                      />
                    </div>
                  </div>
                );
              })
            )}
          </div>

          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-[10px] uppercase tracking-wider text-muted-foreground bg-surface/60">
                <tr>
                  <th className="text-left px-4 py-3">Ad Set Name</th>
                  <th className="text-center px-3 py-3">Status</th>
                  <th className="text-center px-3 py-3">Daily Budget</th>
                  <th className="text-center px-3 py-3">End Date</th>
                  <th className="text-center px-3 py-3">Spend</th>
                  <th className="text-center px-3 py-3">Impressions</th>
                  <th className="text-center px-3 py-3">Reach</th>
                  <th className="text-center px-3 py-3">CTR</th>
                  <th className="text-center px-3 py-3">Result Rate</th>
                  <th className="text-center px-3 py-3">Results</th>
                  <th className="text-center px-3 py-3">Cost / Result</th>
                  <th className="text-center px-3 py-3">Result Value</th>
                  <th className="text-center px-3 py-3">ROAS</th>
                  <th className="text-center px-3 py-3">Spend %</th>
                </tr>
              </thead>
              <tbody>
                {adSetList.length === 0 ? (
                  <tr>
                    <td colSpan={14} className="text-center py-12 text-muted-foreground">
                      No ad sets assigned yet. Contact your agency.
                    </td>
                  </tr>
                ) : (
                  adSetList.map((s: any) => {
                    const aSpend = Number(s.spend) || 0;
                    const aResults = Number(s.results) || 0;
                    const aImpr = Number(s.impressions) || 0;
                    const dailyBudget = s.daily_budget ? Number(s.daily_budget) : 0;
                    const endTime = s.end_time;
                    const goal = s.optimization_goal ?? "";
                    const resultRateAd = aImpr > 0 ? (aResults / aImpr) * 100 : 0;
                    const spendPct = totalAdSetSpend > 0 ? (aSpend / totalAdSetSpend) * 100 : 0;
                    const goalLabel = goalToLabel(goal);
                    return (
                      <tr
                        key={s.id}
                        className="border-t border-border/60 hover:bg-surface/40 transition-colors"
                      >
                        <td className="px-4 py-3 max-w-[280px]">
                          <div className="min-w-0">
                            <div className="font-semibold truncate">{s.name}</div>
                            <div className="text-[10px] text-muted-foreground tabular-nums mt-0.5">
                              {(s.id ?? "").toString().slice(0, 16)}
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-3 text-center">
                          <span
                            className={`inline-flex items-center gap-1.5 text-[10px] font-bold uppercase rounded-full px-2.5 py-1 ${
                              s.effective_status === "ACTIVE"
                                ? "bg-emerald-500/15 text-emerald-500"
                                : s.effective_status === "PAUSED"
                                  ? "bg-amber-500/15 text-amber-500"
                                  : "bg-muted/40 text-muted-foreground"
                            }`}
                          >
                            {s.effective_status ?? "—"}
                          </span>
                        </td>
                        <td className="px-3 py-3 text-center tabular-nums">
                          {dailyBudget > 0 ? dcur(dailyBudget) : "—"}
                        </td>
                        <td className="px-3 py-3 text-center text-xs text-muted-foreground">
                          {formatEndDate(endTime)}
                        </td>
                        <td className="px-3 py-3 text-center font-bold tabular-nums">
                          {dcur(aSpend)}
                        </td>
                        <td className="px-3 py-3 text-center tabular-nums">{num(aImpr)}</td>
                        <td className="px-3 py-3 text-center tabular-nums">
                          {num(Number(s.reach) || 0)}
                        </td>
                        <td className="px-3 py-3 text-center tabular-nums">
                          {Number(s.ctr || 0).toFixed(2)}%
                        </td>
                        <td className="px-3 py-3 text-center tabular-nums">
                          {aImpr > 0 ? `${resultRateAd.toFixed(2)}%` : "—"}
                        </td>
                        <td className="px-3 py-3 text-center">
                          <div className="font-bold tabular-nums">{num(aResults)}</div>
                          {goalLabel && (
                            <div className="text-[9px] uppercase tracking-wider text-muted-foreground mt-0.5">
                              {goalLabel}
                            </div>
                          )}
                        </td>
                        <td className="px-3 py-3 text-center tabular-nums">
                          {aResults > 0 ? cur(mk(aSpend) / aResults) : "—"}
                        </td>
                        <td className="px-3 py-3 text-center tabular-nums text-muted-foreground">
                          {cur(0)}
                        </td>
                        <td className="px-3 py-3 text-center tabular-nums">0.00x</td>
                        <td className="px-3 py-3 text-center min-w-[110px]">
                          <div className="flex flex-col items-center gap-1">
                            <div className="h-1.5 w-full rounded-full bg-surface overflow-hidden">
                              <div
                                className="h-full rounded-full bg-gradient-to-r from-indigo-500 via-violet-500 to-fuchsia-500 transition-all duration-700"
                                style={{ width: `${Math.min(100, spendPct)}%` }}
                              />
                            </div>
                            <span className="text-[10px] font-semibold tabular-nums">
                              {spendPct.toFixed(1)}%
                            </span>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* ============ Export actions ============ */}
        <div className="flex flex-wrap items-center justify-end gap-2">
          <button
            onClick={() => downloadExport("campaign")}
            disabled={exporting === "campaign"}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-4 py-2 text-sm font-semibold hover:bg-surface disabled:opacity-50"
          >
            <Download className="size-4" /> Export CSV
          </button>
          <button
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-4 py-2 text-sm font-semibold hover:bg-surface"
          >
            <FileImage className="size-4" /> Download PNG
          </button>
          <button
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-4 py-2 text-sm font-semibold hover:bg-surface"
          >
            <FileText className="size-4" /> Download PDF
          </button>
          <button
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 rounded-lg bg-foreground text-background px-4 py-2 text-sm font-semibold hover:opacity-90"
          >
            <Printer className="size-4" /> {t("portal.print")}
          </button>
        </div>

        <footer className="text-center text-xs text-muted-foreground py-6 space-y-2 border-t border-border/40 mt-4">
          <div className="flex items-center justify-center gap-2 font-medium">
            <CheckCircle2 className="size-3.5 text-emerald-500" />
            <span>{t("portal.autoUpdated")}</span>
          </div>
          <div className="text-muted-foreground/80">
            {t("portal.poweredBy")}{" "}
            <span className="font-bold gradient-text">GrowVibe Ads Solution</span>
          </div>
          <div className="flex items-center justify-center gap-1.5 text-[11px] opacity-70">
            <ClockIcon className="size-3" />
            {t("portal.lastSync")}: {dataUpdatedAt ? new Date(dataUpdatedAt).toLocaleString() : "—"}
          </div>
          <div className="flex items-center justify-center gap-2.5 pt-3">
            <LogoMark className="size-10 p-0.5 gv-float" />
            <span className="font-display font-extrabold text-lg sm:text-xl gradient-text gv-brand-shimmer tracking-tight">
              GrowVibe Ads Solution
            </span>
          </div>
        </footer>
      </main>
    </div>
  );
}

/* ================= Subcomponents ================= */

function currencySymbol(code: string) {
  switch ((code || "").toUpperCase()) {
    case "USD":
      return "$";
    case "BDT":
      return "৳";
    case "EUR":
      return "€";
    case "GBP":
      return "£";
    case "INR":
      return "₹";
    default:
      return `${code} `;
  }
}

function FeatureStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-white/15 backdrop-blur px-4 py-3 border border-white/20">
      <div className="text-[10px] uppercase tracking-wider text-white/70 font-semibold">
        {label}
      </div>
      <div className="text-2xl font-extrabold mt-0.5 tabular-nums">{value}</div>
    </div>
  );
}

function BentoMetric({
  label,
  value,
  dot,
  icon,
}: {
  label: string;
  value: string;
  dot: "amber" | "emerald" | "rose" | "violet";
  icon?: ReactNode;
}) {
  const iconBg = {
    amber: "bg-amber-500/15 text-amber-500",
    emerald: "bg-emerald-500/15 text-emerald-500",
    rose: "bg-rose-500/15 text-rose-500",
    violet: "bg-violet-500/15 text-violet-500",
  }[dot];
  const glow = {
    amber: "from-amber-500/15",
    emerald: "from-emerald-500/15",
    rose: "from-rose-500/15",
    violet: "from-violet-500/15",
  }[dot];
  return (
    <div className="col-span-1 lg:col-span-1 rounded-2xl bg-card border border-border p-4 shadow-sm relative overflow-hidden gv-lift">
      <div
        className={`absolute -top-8 -right-8 size-24 rounded-full bg-gradient-to-br ${glow} to-transparent blur-2xl pointer-events-none`}
      />
      <div className="flex items-center justify-between relative">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold truncate">
          {label}
        </div>
        <span className={`size-6 rounded-md grid place-items-center shrink-0 ${iconBg}`}>
          {icon}
        </span>
      </div>
      <div
        key={value}
        className="text-xl lg:text-2xl font-extrabold mt-1.5 tabular-nums truncate gv-count"
      >
        {value}
      </div>
    </div>
  );
}

function KpiHeroCard({
  label,
  value,
  secondary,
  tag,
  tagTone,
  icon,
  accent,
}: {
  label: string;
  value: string;
  secondary?: string | null;
  tag?: string;
  tagTone?: "success" | "danger";
  icon: ReactNode;
  accent: "indigo" | "violet" | "emerald" | "rose";
}) {
  const styles = {
    indigo: {
      ring: "from-indigo-500/15",
      badge: "bg-indigo-500/15 text-indigo-500 border-indigo-500/30",
      border: "border-indigo-500/25",
    },
    violet: {
      ring: "from-violet-500/15",
      badge: "bg-violet-500/15 text-violet-500 border-violet-500/30",
      border: "border-violet-500/25",
    },
    emerald: {
      ring: "from-emerald-500/15",
      badge: "bg-emerald-500/15 text-emerald-500 border-emerald-500/30",
      border: "border-emerald-500/25",
    },
    rose: {
      ring: "from-rose-500/15",
      badge: "bg-rose-500/15 text-rose-500 border-rose-500/30",
      border: "border-rose-500/25",
    },
  }[accent];
  return (
    <div
      className={`relative rounded-2xl bg-card border ${styles.border} p-5 shadow-sm overflow-hidden gv-lift gv-shimmer`}
    >
      <div
        className={`absolute -top-16 -right-16 size-40 rounded-full bg-gradient-to-br ${styles.ring} to-transparent blur-2xl pointer-events-none`}
      />
      <div className="relative flex items-start justify-between">
        <div className="text-[11px] uppercase tracking-wider text-muted-foreground font-bold">
          {label}
        </div>
        <span className={`size-8 rounded-lg grid place-items-center border ${styles.badge}`}>
          {icon}
        </span>
      </div>
      <div key={value} className="mt-3 text-3xl lg:text-4xl font-extrabold tabular-nums gv-count">
        {value}
      </div>
      {secondary && (
        <div className="text-xs text-muted-foreground mt-1 tabular-nums">{secondary}</div>
      )}
      {tag && (
        <div
          className={`mt-2 text-[10px] font-bold uppercase tracking-wider ${tagTone === "danger" ? "text-rose-500" : "text-emerald-500"}`}
        >
          {tag}
        </div>
      )}
    </div>
  );
}

function SnapCell({ label, value, icon }: { label: string; value: string; icon?: ReactNode }) {
  return (
    <div className="rounded-xl border border-border/70 bg-surface/40 px-3 py-2.5 transition-all hover:border-primary/40 hover:bg-surface/70">
      <div className="flex items-center justify-between text-muted-foreground">
        <div className="text-[10px] uppercase tracking-wider font-semibold">{label}</div>
        {icon}
      </div>
      <div className="text-base font-bold mt-1 tabular-nums">{value}</div>
    </div>
  );
}

function RateCell({ label, value, icon }: { label: string; value: string; icon?: ReactNode }) {
  return (
    <div className="rounded-xl bg-gradient-to-br from-primary/10 to-primary/0 border border-primary/20 px-3 py-3 text-center transition-all hover:from-primary/20">
      <div className="flex items-center justify-center gap-1.5 text-muted-foreground">
        {icon}
        <div className="text-[10px] uppercase tracking-wider font-semibold">{label}</div>
      </div>
      <div className="text-xl font-extrabold mt-1 tabular-nums">{value}</div>
    </div>
  );
}

function goalToLabel(goal: string): string {
  if (!goal) return "";
  const g = goal.toUpperCase();
  if (g.includes("MESSAGE") || g.includes("CONVERSATION") || g.includes("REPLIES"))
    return "Messages";
  if (g.includes("LEAD")) return "Leads";
  if (g.includes("PURCHASE")) return "Purchases";
  if (g.includes("LINK_CLICKS")) return "Link Clicks";
  if (g.includes("LANDING_PAGE")) return "Landing Page Views";
  if (g.includes("REACH")) return "Reach";
  if (g.includes("IMPRESSION")) return "Impressions";
  if (g.includes("VIDEO")) return "Video Views";
  if (g.includes("ENGAGEMENT") || g.includes("POST")) return "Engagement";
  return goal
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatEndDate(end?: string | null): string {
  if (!end) return "—";
  try {
    const d = new Date(end);
    if (isNaN(d.getTime())) return "—";
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  } catch {
    return "—";
  }
}
function NotFoundCard({ reason }: { reason: "not-found" | "forbidden" }) {
  return (
    <div className="min-h-screen grid place-items-center px-4">
      <div className="rounded-2xl bg-card border border-border p-10 text-center max-w-md shadow-lg">
        <div className="size-16 mx-auto rounded-2xl bg-surface grid place-items-center text-2xl">
          {reason === "forbidden" ? <ShieldAlert className="size-7 text-destructive" /> : "🔍"}
        </div>
        <h1 className="mt-4 text-xl font-bold">
          {reason === "forbidden" ? "Access token required" : "Dashboard not found"}
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          {reason === "forbidden"
            ? "This portal requires a verified access token. Please open the full link sent to you by your agency."
            : "Please check the link or contact your agency."}
        </p>
      </div>
    </div>
  );
}

function SyncedAgo({ at }: { at: number | null | undefined }) {
  const [, tick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 15_000);
    return () => clearInterval(id);
  }, []);
  if (!at) return null;
  const diff = Math.max(0, Math.floor((Date.now() - at) / 1000));
  const label =
    diff < 10
      ? "just now"
      : diff < 60
        ? `${diff}s ago`
        : diff < 3600
          ? `${Math.floor(diff / 60)}m ago`
          : `${Math.floor(diff / 3600)}h ago`;
  return (
    <div className="text-[11px] text-muted-foreground inline-flex items-center gap-1.5">
      <ClockIcon className="size-3" />
      Synced {label}
    </div>
  );
}
