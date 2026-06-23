import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Wallet, TrendingUp, AlertTriangle } from "lucide-react";

export const Route = createFileRoute("/_authenticated/budget-tracker")({
  head: () => ({ meta: [{ title: "Budget Tracker — GrowVibe Ads Solution" }] }),
  component: BudgetTracker,
});

function BudgetTracker() {
  const { data: clients } = useQuery({
    queryKey: ["budget-clients"],
    queryFn: async () => {
      const { data } = await supabase
        .from("clients")
        .select("id,name,monthly_budget, ad_accounts(id,total_spend,currency)")
        .eq("status", "active");
      return (data ?? []).map((c: any) => ({
        ...c,
        spent: (c.ad_accounts ?? []).reduce((s: number, a: any) => s + (Number(a.total_spend) || 0), 0),
        currency: c.ad_accounts?.[0]?.currency ?? "$",
      }));
    },
  });

  // 30-day daily series → forecasting
  const { data: pacing } = useQuery({
    queryKey: ["budget-pacing"],
    queryFn: async () => {
      const since = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
      const { data } = await supabase
        .from("insights_snapshots")
        .select("date_start,spend,ad_account:ad_accounts(id,client_id)")
        .eq("level", "account")
        .gte("date_start", since);
      const byClient: Record<string, { dates: Set<string>; total: number; perDay: Record<string, number> }> = {};
      (data ?? []).forEach((r: any) => {
        const cid = r.ad_account?.client_id;
        if (!cid) return;
        byClient[cid] = byClient[cid] ?? { dates: new Set(), total: 0, perDay: {} };
        byClient[cid].dates.add(r.date_start);
        byClient[cid].perDay[r.date_start] = (byClient[cid].perDay[r.date_start] ?? 0) + (Number(r.spend) || 0);
        byClient[cid].total += Number(r.spend) || 0;
      });
      return byClient;
    },
  });

  const now = new Date();
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const dayOfMonth = now.getDate();
  const remainingDays = daysInMonth - dayOfMonth;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold">Budget Tracker</h1>
        <p className="text-muted-foreground text-sm">Monthly pacing & spend forecast based on the last 30 days of insights.</p>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {(clients ?? []).length === 0 ? (
          <div className="glass-card p-12 text-center md:col-span-2"><Wallet className="size-10 mx-auto opacity-30 mb-2" /><div className="text-sm text-muted-foreground">No clients yet</div></div>
        ) : (clients ?? []).map((c: any) => {
          const budget = Number(c.monthly_budget) || 0;
          const spent = Number(c.spent) || 0;
          const pct = budget > 0 ? (spent / budget) * 100 : 0;
          const expectedPct = budget > 0 ? (dayOfMonth / daysInMonth) * 100 : 0;
          const series = pacing?.[c.id]?.perDay ?? {};
          const last7 = Array.from({ length: 7 }, (_, i) => {
            const d = new Date(); d.setDate(d.getDate() - (6 - i));
            return series[d.toISOString().slice(0, 10)] ?? 0;
          });
          const avgDaily = last7.length ? last7.reduce((s, n) => s + n, 0) / last7.length : 0;
          const projectedMonth = spent + avgDaily * remainingDays;
          const overBy = projectedMonth - budget;
          const onTrack = budget === 0 ? null : projectedMonth <= budget;

          return (
            <div key={c.id} className="glass-card p-5 space-y-3">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="font-semibold min-w-0 truncate">{c.name}</div>
                <div className="text-xs text-muted-foreground">{c.currency} {spent.toFixed(2)} / {c.currency} {budget.toFixed(2)}</div>
              </div>

              <div>
                <div className="h-2 rounded-full bg-surface overflow-hidden relative">
                  <div className={`h-full ${pct > 90 ? "bg-destructive" : pct > 70 ? "bg-warning" : "bg-gradient-to-r from-primary to-primary-glow"}`} style={{ width: `${Math.min(100, pct)}%` }} />
                  {budget > 0 && (
                    <div className="absolute top-0 h-full w-px bg-foreground/40" style={{ left: `${Math.min(100, expectedPct)}%` }} title={`Expected pace today: ${expectedPct.toFixed(0)}%`} />
                  )}
                </div>
                <div className="mt-1.5 text-xs text-muted-foreground flex justify-between">
                  <span>{pct.toFixed(1)}% used</span>
                  {budget > 0 && <span className={pct - expectedPct > 20 ? "text-destructive" : pct - expectedPct > 0 ? "text-warning" : "text-success"}>
                    {pct > expectedPct ? `+${(pct - expectedPct).toFixed(1)}pp vs schedule` : `${(expectedPct - pct).toFixed(1)}pp under schedule`}
                  </span>}
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2 text-center">
                <Tile label="Avg daily (7d)" value={`${c.currency} ${avgDaily.toFixed(2)}`} />
                <Tile label="Weekly proj." value={`${c.currency} ${(avgDaily * 7).toFixed(2)}`} icon={<TrendingUp className="size-3.5" />} />
                <Tile label="Month-end proj." value={`${c.currency} ${projectedMonth.toFixed(2)}`} accent={budget > 0 ? (onTrack ? "success" : "destructive") : undefined} />
              </div>
              {budget > 0 && !onTrack && (
                <div className="flex items-start gap-2 text-xs text-destructive bg-destructive/10 rounded-lg p-2.5">
                  <AlertTriangle className="size-3.5 mt-0.5 shrink-0" />
                  Projected to exceed budget by {c.currency} {overBy.toFixed(2)} ({(((overBy) / budget) * 100).toFixed(1)}%).
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Tile({ label, value, accent, icon }: { label: string; value: string; accent?: "success" | "destructive"; icon?: any }) {
  const color = accent === "destructive" ? "text-destructive" : accent === "success" ? "text-success" : "";
  return (
    <div className="rounded-lg bg-surface/60 border border-border px-2 py-2">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground flex items-center justify-center gap-1">{icon}{label}</div>
      <div className={`text-sm font-bold mt-0.5 ${color}`}>{value}</div>
    </div>
  );
}
