import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import CandlestickChart from "@/components/CandlestickChart";
import { BarChart3, Download } from "lucide-react";
import { toCsv, downloadCsv } from "@/lib/csv";

export const Route = createFileRoute("/_authenticated/insights")({
  head: () => ({ meta: [{ title: "Insights — GrowVibe Ads Solution" }] }),
  component: InsightsPage,
});

type Level = "campaign" | "adset" | "ad" | "timeseries";

function InsightsPage() {
  const [level, setLevel] = useState<Level>("timeseries");
  const [exporting, setExporting] = useState(false);

  const { data: snapshots } = useQuery({
    queryKey: ["insights-all"],
    queryFn: async () => {
      const { data } = await supabase
        .from("insights_snapshots")
        .select("date_start,spend,clicks,impressions,reach,results,ad_account:ad_accounts(account_name,client:clients(name))")
        .eq("level", "account")
        .gte("date_start", new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10))
        .order("date_start");
      const grouped: Record<string, any> = {};
      (data ?? []).forEach((r: any) => {
        const k = r.date_start;
        grouped[k] = grouped[k] ?? { date: k, spend: 0, clicks: 0, impressions: 0, reach: 0, results: 0 };
        grouped[k].spend += Number(r.spend) || 0;
        grouped[k].clicks += Number(r.clicks) || 0;
        grouped[k].impressions += Number(r.impressions) || 0;
        grouped[k].reach += Number(r.reach) || 0;
        grouped[k].results += Number(r.results) || 0;
      });
      return Object.values(grouped) as any[];
    },
  });

  const onExport = async () => {
    setExporting(true);
    try {
      let rows: any[] = [];
      let name = "insights";
      if (level === "timeseries") {
        const { data } = await supabase.from("insights_snapshots")
          .select("date_start,date_stop,spend,reach,impressions,clicks,ctr,cpc,cpm,results,frequency,ad_account:ad_accounts(account_name,fb_account_id,client:clients(name))")
          .eq("level", "account")
          .gte("date_start", new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10))
          .order("date_start");
        rows = (data ?? []).map((r: any) => ({
          date: r.date_start, date_stop: r.date_stop,
          client: r.ad_account?.client?.name ?? "",
          ad_account: r.ad_account?.account_name ?? r.ad_account?.fb_account_id ?? "",
          spend: r.spend, reach: r.reach, impressions: r.impressions, clicks: r.clicks,
          ctr: r.ctr, cpc: r.cpc, cpm: r.cpm, results: r.results, frequency: r.frequency,
        }));
        name = "insights-timeseries";
      } else {
        const table = level === "campaign" ? "campaigns" : level === "adset" ? "ad_sets" : "ads";
        const { data } = await supabase.from(table)
          .select("name,effective_status,spend,reach,impressions,clicks,ctr,cpc,cpm,results,frequency,ad_account:ad_accounts(account_name,fb_account_id,currency,client:clients(name))")
          .order("spend", { ascending: false });
        rows = (data ?? []).map((r: any) => ({
          client: r.ad_account?.client?.name ?? "",
          ad_account: r.ad_account?.account_name ?? r.ad_account?.fb_account_id ?? "",
          currency: r.ad_account?.currency ?? "",
          name: r.name, status: r.effective_status,
          spend: r.spend, reach: r.reach, impressions: r.impressions, clicks: r.clicks,
          ctr: r.ctr, cpc: r.cpc, cpm: r.cpm, results: r.results, frequency: r.frequency,
        }));
        name = `insights-${level}`;
      }
      downloadCsv(`${name}-${new Date().toISOString().slice(0, 10)}.csv`, toCsv(rows));
    } finally { setExporting(false); }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Insights</h1>
          <p className="text-muted-foreground text-sm">30-day time-series across all accounts. Auto-synced from Facebook Marketing API.</p>
        </div>
        <div className="flex items-center gap-2">
          <select value={level} onChange={(e) => setLevel(e.target.value as Level)} className="rounded-lg bg-input border border-border px-3 py-2 text-sm">
            <option value="timeseries">Time-series (account)</option>
            <option value="campaign">By campaign</option>
            <option value="adset">By ad set</option>
            <option value="ad">By ad</option>
          </select>
          <button onClick={onExport} disabled={exporting} className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-primary to-primary-glow text-primary-foreground px-3 py-2 text-sm font-semibold hover:opacity-90 disabled:opacity-50">
            <Download className="size-4" /> {exporting ? "Exporting…" : "Export CSV"}
          </button>
        </div>
      </div>
      <div className="glass-card p-5">
        <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
          <div className="flex items-center gap-2">
            <BarChart3 className="size-4 text-primary" />
            <div className="font-semibold">Daily performance</div>
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold rounded-md bg-primary/10 text-primary px-1.5 py-0.5">
              Candlestick
            </span>
          </div>
        </div>
        <CandlestickChart
          data={(snapshots ?? []) as any}
          height={340}
          series={[
            { key: "spend", label: "Spend", upColor: "oklch(0.78 0.18 165)", downColor: "oklch(0.66 0.22 25)", format: (v) => `$${v.toFixed(2)}` },
            { key: "clicks", label: "Clicks", upColor: "oklch(0.72 0.19 295)", downColor: "oklch(0.66 0.22 25)", format: (v) => v.toLocaleString() },
            { key: "results", label: "Results", upColor: "oklch(0.83 0.16 85)", downColor: "oklch(0.66 0.22 25)", format: (v) => v.toLocaleString() },
            { key: "impressions", label: "Impressions", upColor: "oklch(0.78 0.14 200)", downColor: "oklch(0.66 0.22 25)", format: (v) => v.toLocaleString() },
          ]}
        />
      </div>
    </div>
  );
}
