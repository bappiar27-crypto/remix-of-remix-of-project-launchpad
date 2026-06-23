import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState, useEffect, useMemo, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  syncAllAccountsNow,
  getSettingsPublic,
  retestAndReimport,
  refreshAllData,
} from "@/lib/fb/admin.functions";
import { toast } from "sonner";
import {
  DollarSign,
  Users,
  CheckSquare,
  Megaphone,
  RefreshCw,
  Loader2,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { ResponsiveContainer, Tooltip, PieChart, Pie, Cell } from "recharts";
import CandlestickChart from "@/components/CandlestickChart";

const MAX_SYNC_ERRORS = 3;

const PIE_COLORS = [
  "oklch(0.78 0.18 165)",
  "oklch(0.66 0.22 295)",
  "oklch(0.83 0.16 85)",
  "oklch(0.70 0.20 30)",
  "oklch(0.62 0.18 220)",
];

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard — GrowVibe Ads Solution" }] }),
  component: Dashboard,
});

function Dashboard() {
  const qc = useQueryClient();
  const getSettings = useServerFn(getSettingsPublic);
  const syncFn = useServerFn(syncAllAccountsNow);
  const retestFn = useServerFn(retestAndReimport);
  const refreshFn = useServerFn(refreshAllData);

  const [autoSync, setAutoSync] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [retesting, setRetesting] = useState(false);
  const [refreshingAll, setRefreshingAll] = useState(false);
  const [datePreset] = useState("Last 7 days");
  const [, setAutoSyncErrors] = useState(0);
  const [showRefreshConfirm, setShowRefreshConfirm] = useState(false);

  // ✅ Fix #2: ref দিয়ে syncing track — dependency array pollution নেই
  const syncingRef = useRef(false);

  const { data: settings } = useQuery({
    queryKey: ["settings"],
    // ✅ Fix ts(2322): data: undefined দিয়ে call করা হয়েছে
    queryFn: () => getSettings({ data: undefined }),
  });

  const { data: accounts } = useQuery({
    queryKey: ["dashboard-accounts"],
    queryFn: async () => {
      const { data } = await supabase
        .from("ad_accounts")
        .select("*, client:clients(id,name,slug)")
        .eq("is_active", true)
        .order("total_spend", { ascending: false });
      return data ?? [];
    },
  });

  const { data: timeSeries } = useQuery({
    queryKey: ["dashboard-timeseries", datePreset],
    queryFn: async () => {
      const days =
        datePreset === "Today" || datePreset === "Yesterday"
          ? 1
          : datePreset === "Last 14 days"
          ? 14
          : datePreset === "Last 30 days"
          ? 30
          : 7;

      // ✅ Fix #4: Yesterday/Today date logic সঠিক
      const cutoff = new Date();
      if (datePreset === "Yesterday") {
        cutoff.setDate(cutoff.getDate() - 1);
      } else if (datePreset !== "Today") {
        cutoff.setDate(cutoff.getDate() - (days - 1));
      }
      const cutoffStr = cutoff.toISOString().slice(0, 10);

      let query = supabase
        .from("insights_snapshots")
        .select("date_start,spend,results,reach,impressions")
        .eq("level", "account")
        .gte("date_start", cutoffStr)
        .order("date_start");

      if (datePreset === "Today" || datePreset === "Yesterday") {
        query = query.lte("date_start", cutoffStr);
      }

      const { data } = await query;

      const grouped: Record<
        string,
        { date: string; spend: number; results: number; reach: number; impressions: number }
      > = {};

      (data ?? []).forEach((r: any) => {
        const k = r.date_start;
        grouped[k] = grouped[k] ?? { date: k, spend: 0, results: 0, reach: 0, impressions: 0 };
        grouped[k].spend += Number(r.spend) || 0;
        grouped[k].results += Number(r.results) || 0;
        grouped[k].reach += Number(r.reach) || 0;
        grouped[k].impressions += Number(r.impressions) || 0;
      });

      return Object.values(grouped).sort((a, b) => a.date.localeCompare(b.date));
    },
  });

  const { data: campaignsByObjective } = useQuery({
    queryKey: ["dashboard-by-objective"],
    queryFn: async () => {
      const { data } = await supabase.from("campaigns").select("objective, spend");
      const grouped: Record<string, number> = {};
      (data ?? []).forEach((c: any) => {
        const key = c.objective ?? "OTHER";
        grouped[key] = (grouped[key] ?? 0) + (Number(c.spend) || 0);
      });
      return Object.entries(grouped)
        .map(([name, value]) => ({ name, value }))
        .filter((x) => x.value > 0);
    },
  });

  useQuery({
    queryKey: ["dashboard-logs"],
    queryFn: async () => {
      const { data } = await supabase
        .from("sync_logs")
        .select("*, ad_account:ad_accounts(account_name,fb_account_id, client:clients(name))")
        .order("started_at", { ascending: false })
        .limit(8);
      return data ?? [];
    },
  });

  // settings থেকে autoSync sync করা
  useEffect(() => {
    if (settings?.auto_sync_enabled !== undefined) setAutoSync(settings.auto_sync_enabled);
  }, [settings?.auto_sync_enabled]);

  // ✅ Fix #1 + #2: stale closure ও dependency সমস্যা fix
  useEffect(() => {
    if (!autoSync || !settings?.has_token) {
      setAutoSyncErrors(0);
      return;
    }

    const minutes = Math.max(1, Number(settings.sync_interval_minutes) || 5);
    let isMounted = true;

    const runSync = async () => {
      if (syncingRef.current || !isMounted) return;

      try {
        // ✅ Fix ts(2322): data: undefined
        const res = await syncFn({ data: undefined });
        if (!res.skipped) {
          qc.invalidateQueries({ queryKey: ["dashboard-accounts"] });
          qc.invalidateQueries({ queryKey: ["dashboard-timeseries"] });
          qc.invalidateQueries({ queryKey: ["dashboard-logs"] });
          qc.invalidateQueries({ queryKey: ["dashboard-by-objective"] });
          setAutoSyncErrors(0);
        } else {
          setAutoSyncErrors((prev) => {
            const next = prev + 1;
            if (next >= MAX_SYNC_ERRORS) {
              console.error("[auto-sync] Max retries — disabling", res.tokenHealth?.error);
              toast.error("Auto-sync stopped. Check your settings.");
              setAutoSync(false);
            } else {
              console.warn("[auto-sync] Skipped", res.tokenHealth?.error);
            }
            return next;
          });
        }
      } catch (error) {
        setAutoSyncErrors((prev) => {
          const next = prev + 1;
          console.error("[auto-sync] failed:", error instanceof Error ? error.message : String(error));
          if (next >= MAX_SYNC_ERRORS) setAutoSync(false);
          return next;
        });
      }
    };

    const timer = window.setInterval(runSync, minutes * 60_000);
    const initialTimer = window.setTimeout(() => { if (isMounted) runSync(); }, 5000);

    return () => {
      isMounted = false;
      window.clearInterval(timer);
      window.clearTimeout(initialTimer);
    };
    // ✅ autoSyncErrors ও syncing বাদ — ref দিয়ে handle
  }, [autoSync, settings?.has_token, settings?.sync_interval_minutes, syncFn, qc]);

  // Realtime subscription
  useEffect(() => {
    let isActive = true;
    const ch = supabase
      .channel("dashboard-rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "ad_accounts" }, () => {
        if (isActive) qc.invalidateQueries({ queryKey: ["dashboard-accounts"] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "sync_logs" }, () => {
        if (isActive) qc.invalidateQueries({ queryKey: ["dashboard-logs"] });
      })
      .subscribe();

    return () => {
      isActive = false;
      supabase.removeChannel(ch);
    };
  }, [qc]);

  const totals = useMemo(() => {
    const acc = accounts ?? [];
    const rangeTotals = (timeSeries ?? []).reduce(
      (s: any, r: any) => ({
        spend: s.spend + (Number(r.spend) || 0),
        reach: s.reach + (Number(r.reach) || 0),
        results: s.results + (Number(r.results) || 0),
      }),
      { spend: 0, reach: 0, results: 0 },
    );
    return {
      spend: rangeTotals.spend,
      reach: rangeTotals.reach,
      results: rangeTotals.results,
      activeCampaigns: acc.reduce((s, a: any) => s + (Number(a.active_campaigns) || 0), 0),
      accounts: acc.length,
    };
  }, [accounts, timeSeries]);

  const onSync = async () => {
    if (!settings?.has_token) {
      toast.error("Add your Facebook System User token in Settings first");
      return;
    }
    setSyncing(true);
    syncingRef.current = true;
    try {
      // ✅ Fix ts(2322): data: undefined
      const res = await syncFn({ data: undefined });
      if (res.skipped) {
        toast.error(res.tokenHealth?.error ?? "Token check failed.");
      } else {
        qc.invalidateQueries({ queryKey: ["dashboard-accounts"] });
        qc.invalidateQueries({ queryKey: ["dashboard-timeseries"] });
        qc.invalidateQueries({ queryKey: ["dashboard-logs"] });
        qc.invalidateQueries({ queryKey: ["dashboard-by-objective"] });
        toast.success(`Synced ${res.count} accounts`);
      }
      setAutoSyncErrors(0);
    } catch (e: any) {
      toast.error(e?.message ?? "Sync failed");
    } finally {
      setSyncing(false);
      syncingRef.current = false;
    }
  };

  const onRetest = async () => {
    setRetesting(true);
    try {
      // ✅ Fix ts(2322): data: undefined
      const r = await retestFn({ data: undefined });
      if (!r.ok) toast.error(r.error ?? "Retest failed");
      else toast.success(`Re-imported ${r.imported} accounts`);
      qc.invalidateQueries({ queryKey: ["dashboard-accounts"] });
    } catch (e: any) {
      toast.error(e?.message ?? "Retest failed");
    } finally {
      setRetesting(false);
    }
  };

  // ✅ Fix #6: confirm() বাদ — custom modal দিয়ে
  const onRefreshAllConfirmed = async () => {
    setShowRefreshConfirm(false);
    setRefreshingAll(true);
    try {
      // ✅ Fix ts(2322): data: undefined
      const r = await refreshFn({ data: undefined });
      toast.success(`Cleared cache · synced ${r.count ?? 0} accounts`);
      qc.invalidateQueries({ queryKey: ["dashboard-accounts"] });
      qc.invalidateQueries({ queryKey: ["dashboard-timeseries"] });
      qc.invalidateQueries({ queryKey: ["dashboard-logs"] });
      qc.invalidateQueries({ queryKey: ["dashboard-by-objective"] });
    } catch (e: any) {
      toast.error(e?.message ?? "Refresh failed");
    } finally {
      setRefreshingAll(false);
    }
  };

  return (
    <div className="space-y-6 gv-fade-up">
      {/* Custom confirm modal */}
      {showRefreshConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="glass-card p-6 max-w-sm w-full mx-4 space-y-4">
            <h2 className="text-lg font-bold">সব ডেটা রিফ্রেশ করবেন?</h2>
            <p className="text-sm text-muted-foreground">
              এটা সব cached data মুছে ফেলবে এবং পুরো re-sync করবে।
            </p>
            <div className="flex gap-3">
              <button
                onClick={onRefreshAllConfirmed}
                className="flex-1 rounded-xl bg-destructive text-white px-4 py-2 text-sm font-semibold hover:bg-destructive/90"
              >
                হ্যাঁ, করুন
              </button>
              <button
                onClick={() => setShowRefreshConfirm(false)}
                className="flex-1 rounded-xl bg-surface-elevated border border-border px-4 py-2 text-sm font-medium hover:bg-surface"
              >
                বাতিল
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="hero-panel gv-border-glow p-6 lg:p-8 relative overflow-hidden">
        <div className="absolute -top-32 -right-20 size-72 rounded-full bg-primary/15 blur-3xl gv-float pointer-events-none" />
        <div className="relative z-10 flex flex-col lg:flex-row gap-6">
          <div className="flex-1">
            <h1 className="mt-2 text-2xl sm:text-3xl lg:text-4xl font-bold">
              Welcome to your <span className="gradient-text">Command Center</span>
            </h1>
            <div className="mt-5 flex flex-wrap gap-2">
              <button
                onClick={onSync}
                disabled={syncing}
                className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-primary to-primary-glow text-primary-foreground px-4 py-2.5 text-sm font-semibold hover:opacity-90 disabled:opacity-50"
              >
                {syncing ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
                Sync All Accounts
              </button>
              <button
                onClick={onRetest}
                disabled={retesting}
                className="inline-flex items-center gap-2 rounded-xl bg-surface-elevated border border-border px-4 py-2.5 text-sm font-medium hover:bg-surface disabled:opacity-50"
              >
                {retesting ? <Loader2 className="size-4 animate-spin" /> : <ShieldCheck className="size-4" />}
                Re-test & Re-import
              </button>
              <button
                onClick={() => setShowRefreshConfirm(true)}
                disabled={refreshingAll}
                className="inline-flex items-center gap-2 rounded-xl bg-destructive/10 border border-destructive/40 text-destructive px-4 py-2.5 text-sm font-medium hover:bg-destructive/20 disabled:opacity-50"
              >
                {refreshingAll ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
                Refresh all data
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 gv-stagger">
        <KpiCard icon={DollarSign} label="Total Spend" value={`$${totals.spend.toFixed(2)}`} accent="from-primary to-primary-glow" />
        <KpiCard icon={Users} label="Total Reach" value={totals.reach.toLocaleString()} accent="from-accent to-primary" />
        <KpiCard icon={CheckSquare} label="Results" value={totals.results.toLocaleString()} accent="from-warning to-primary-glow" />
        <KpiCard icon={Megaphone} label="Active Campaigns" value={String(totals.activeCampaigns)} accent="from-destructive to-accent" />
      </div>

      <div className="grid gap-4 lg:grid-cols-3 gv-stagger">
        <div className="glass-card p-5 lg:col-span-2">
          <CandlestickChart
            data={(timeSeries ?? []) as any}
            height={260}
            series={[
              {
                key: "spend",
                label: "Spend",
                upColor: "oklch(0.78 0.18 165)",
                downColor: "oklch(0.66 0.22 25)",
                format: (v) => `$${v.toFixed(2)}`,
              },
            ]}
          />
        </div>
        <div className="glass-card p-5">
          <div className="h-64">
            <ResponsiveContainer>
              <PieChart>
                <Pie data={campaignsByObjective} dataKey="value" innerRadius={48} outerRadius={80} paddingAngle={3}>
                  {(campaignsByObjective ?? []).map((_, i) => (
                    <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}

// ✅ Fix #7: LucideIcon type — type-safe
function KpiCard({
  icon: Icon,
  label,
  value,
  accent,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  accent: string;
}) {
  return (
    <div className="glass-card gv-lift gv-shimmer p-5 relative overflow-hidden">
      <div className={`absolute -top-8 -right-8 size-32 rounded-full bg-gradient-to-br ${accent} opacity-20 blur-2xl`} />
      <div className="flex items-start justify-between relative">
        <div className={`size-10 rounded-xl bg-gradient-to-br ${accent} grid place-items-center text-primary-foreground shadow-lg`}>
          <Icon className="size-5" />
        </div>
        <span className="text-xs font-semibold text-success bg-success/10 rounded-full px-2 py-0.5 inline-flex items-center gap-1.5">
          <span className="size-1.5 rounded-full bg-success gv-pulse-dot" /> live
        </span>
      </div>
      <div className="mt-4 text-[11px] font-semibold tracking-[0.14em] uppercase text-muted-foreground">{label}</div>
      <div className="mt-1 text-2xl sm:text-3xl font-bold gv-count tabular-nums truncate">{value}</div>
    </div>
  );
}
