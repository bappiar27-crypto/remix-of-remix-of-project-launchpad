import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Image as ImageIcon } from "lucide-react";
import { StatusBadge } from "./campaigns";

export const Route = createFileRoute("/_authenticated/ads")({
  head: () => ({ meta: [{ title: "Ads — GrowVibe Ads Solution" }] }),
  component: AdsPage,
});

function AdsPage() {
  const { data: items } = useQuery({
    queryKey: ["ads-list"],
    queryFn: async () => {
      const { data } = await supabase
        .from("ads")
        .select("*, campaign:campaigns(name), ad_set:ad_sets(name), ad_account:ad_accounts(currency, client:clients(name))")
        .order("spend", { ascending: false });
      return data ?? [];
    },
  });

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold">Ads</h1>
        <p className="text-muted-foreground text-sm">Individual ad creatives across all ad sets.</p>
      </div>
      <div className="glass-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-xs uppercase tracking-wider text-muted-foreground bg-surface/40">
            <tr>
              <th className="text-left px-4 py-3">Ad</th>
              <th className="text-left px-4 py-3">Campaign / Ad Set</th>
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
              <tr>
                <td colSpan={9} className="text-center py-12 text-muted-foreground">
                  <ImageIcon className="size-10 mx-auto opacity-30 mb-2" />
                  No ads yet
                </td>
              </tr>
            ) : (
              (items ?? []).map((a: any) => (
                <tr key={a.id} className="border-t border-border/40 hover:bg-surface/40">
                  <td className="px-4 py-3 max-w-[280px]">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="size-10 rounded-md bg-surface border border-border overflow-hidden grid place-items-center shrink-0">
                        {a.creative_thumbnail ? (
                          <img src={a.creative_thumbnail} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <ImageIcon className="size-4 opacity-40" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className="font-medium truncate">{a.name}</div>
                        <div className="text-xs text-muted-foreground truncate">{a.ad_account?.client?.name ?? ""}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-xs max-w-[220px]">
                    <div className="truncate">{a.campaign?.name}</div>
                    <div className="text-muted-foreground truncate">{a.ad_set?.name}</div>
                  </td>
                  <td className="px-4 py-3"><StatusBadge status={a.effective_status ?? a.status} /></td>
                  <td className="px-4 py-3 text-right font-medium">{a.ad_account?.currency ?? "$"}{Number(a.spend).toFixed(2)}</td>
                  <td className="px-4 py-3 text-right">{Number(a.impressions).toLocaleString()}</td>
                  <td className="px-4 py-3 text-right">{Number(a.clicks).toLocaleString()}</td>
                  <td className="px-4 py-3 text-right">{Number(a.ctr).toFixed(2)}%</td>
                  <td className="px-4 py-3 text-right">${Number(a.cpm).toFixed(2)}</td>
                  <td className="px-4 py-3 text-right font-medium text-primary">{Number(a.results).toLocaleString()}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
