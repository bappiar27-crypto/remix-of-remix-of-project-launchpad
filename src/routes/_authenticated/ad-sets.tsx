import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Layers } from "lucide-react";
import { StatusBadge } from "./campaigns";

export const Route = createFileRoute("/_authenticated/ad-sets")({
  head: () => ({ meta: [{ title: "Ad Sets — GrowVibe Ads Solution" }] }),
  component: AdSetsPage,
});

function AdSetsPage() {
  const { data: items } = useQuery({
    queryKey: ["adsets"],
    queryFn: async () => {
      const { data } = await supabase.from("ad_sets").select("*, campaign:campaigns(name), ad_account:ad_accounts(account_name, currency, client:clients(name))").order("spend", { ascending: false });
      return data ?? [];
    },
  });

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold">Ad Sets</h1>
        <p className="text-muted-foreground text-sm">Ad-set level breakdown across all clients.</p>
      </div>
      <div className="glass-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-xs uppercase tracking-wider text-muted-foreground bg-surface/40">
            <tr>
              <th className="text-left px-4 py-3">Ad Set</th>
              <th className="text-left px-4 py-3">Campaign</th>
              <th className="text-left px-4 py-3">Status</th>
              <th className="text-right px-4 py-3">Spend</th>
              <th className="text-right px-4 py-3">Impr.</th>
              <th className="text-right px-4 py-3">Clicks</th>
              <th className="text-right px-4 py-3">CTR</th>
              <th className="text-right px-4 py-3">CPM</th>
              <th className="text-right px-4 py-3">Results</th>
            </tr>
          </thead>
          <tbody>
            {(items ?? []).length === 0 ? (
              <tr><td colSpan={9} className="text-center py-12 text-muted-foreground"><Layers className="size-10 mx-auto opacity-30 mb-2" />No ad sets yet</td></tr>
            ) : (items ?? []).map((a: any) => (
              <tr key={a.id} className="border-t border-border/40 hover:bg-surface/40">
                <td className="px-4 py-3 max-w-[280px]"><div className="font-medium truncate">{a.name}</div><div className="text-xs text-muted-foreground">{a.optimization_goal}</div></td>
                <td className="px-4 py-3 text-xs max-w-[200px] truncate">{a.campaign?.name}</td>
                <td className="px-4 py-3"><StatusBadge status={a.effective_status ?? a.status} /></td>
                <td className="px-4 py-3 text-right font-medium">{a.ad_account?.currency ?? "$"}{Number(a.spend).toFixed(2)}</td>
                <td className="px-4 py-3 text-right">{Number(a.impressions).toLocaleString()}</td>
                <td className="px-4 py-3 text-right">{Number(a.clicks).toLocaleString()}</td>
                <td className="px-4 py-3 text-right">{Number(a.ctr).toFixed(2)}%</td>
                <td className="px-4 py-3 text-right">${Number(a.cpm).toFixed(2)}</td>
                <td className="px-4 py-3 text-right font-medium text-primary">{Number(a.results).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
