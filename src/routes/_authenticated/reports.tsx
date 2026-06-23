import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { FileText, Download } from "lucide-react";

export const Route = createFileRoute("/_authenticated/reports")({
  head: () => ({ meta: [{ title: "Reports — GrowVibe Ads Solution" }] }),
  component: ReportsPage,
});

function ReportsPage() {
  const { data: clients } = useQuery({
    queryKey: ["report-clients"],
    queryFn: async () => {
      const { data } = await supabase
        .from("clients")
        .select(
          "*, ad_accounts(account_name,total_spend,total_reach,total_results,active_campaigns)",
        )
        .order("name");
      return data ?? [];
    },
  });

  const exportCsv = () => {
    const rows = [["Client", "Account", "Spend", "Reach", "Results", "Active Campaigns"]];
    (clients ?? []).forEach((c: any) => {
      (c.ad_accounts ?? []).forEach((a: any) =>
        rows.push([
          c.name,
          a.account_name,
          a.total_spend,
          a.total_reach,
          a.total_results,
          a.active_campaigns,
        ]),
      );
    });
    const csv = rows
      .map((r) => r.map((x) => `"${String(x ?? "").replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `ads-report-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  };

  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold">Reports</h1>
          <p className="text-muted-foreground text-sm">
            Performance summary per client. Export to CSV.
          </p>
        </div>
        <button
          onClick={exportCsv}
          className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-primary to-primary-glow text-primary-foreground px-4 py-2 text-sm font-semibold shrink-0"
        >
          <Download className="size-4" /> Export CSV
        </button>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {(clients ?? []).length === 0 ? (
          <div className="glass-card p-12 text-center md:col-span-2">
            <FileText className="size-10 mx-auto opacity-30 mb-2" />
            <div className="text-sm text-muted-foreground">No data yet</div>
          </div>
        ) : (
          (clients ?? []).map((c: any) => {
            const totals = (c.ad_accounts ?? []).reduce(
              (acc: any, a: any) => ({
                spend: acc.spend + (Number(a.total_spend) || 0),
                reach: acc.reach + (Number(a.total_reach) || 0),
                results: acc.results + (Number(a.total_results) || 0),
              }),
              { spend: 0, reach: 0, results: 0 },
            );
            return (
              <div key={c.id} className="glass-card p-5">
                <div className="font-semibold text-lg">{c.name}</div>
                <div className="text-xs text-muted-foreground">
                  {c.ad_accounts?.length ?? 0} ad account{c.ad_accounts?.length !== 1 ? "s" : ""}
                </div>
                <div className="grid grid-cols-3 gap-3 mt-4">
                  <div className="rounded-lg bg-surface/60 p-3">
                    <div className="text-[10px] text-muted-foreground uppercase">Spend</div>
                    <div className="font-bold">${totals.spend.toFixed(2)}</div>
                  </div>
                  <div className="rounded-lg bg-surface/60 p-3">
                    <div className="text-[10px] text-muted-foreground uppercase">Reach</div>
                    <div className="font-bold">{totals.reach.toLocaleString()}</div>
                  </div>
                  <div className="rounded-lg bg-surface/60 p-3">
                    <div className="text-[10px] text-muted-foreground uppercase">Results</div>
                    <div className="font-bold text-primary">{totals.results.toLocaleString()}</div>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
