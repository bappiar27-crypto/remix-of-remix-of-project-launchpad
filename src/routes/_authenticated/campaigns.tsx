import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Megaphone, ArrowUpRight } from "lucide-react";

export const Route = createFileRoute("/_authenticated/campaigns")({
  head: () => ({ meta: [{ title: "Campaigns — GrowVibe Ads Solution" }] }),
  component: CampaignsPage,
});

function CampaignsPage() {
  const { data: campaigns } = useQuery({
    queryKey: ["campaigns"],
    queryFn: async () => {
      const { data } = await supabase.from("campaigns").select("*, ad_account:ad_accounts(account_name, currency, client:clients(name,slug))").order("spend", { ascending: false });
      return data ?? [];
    },
  });

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold">Campaigns</h1>
        <p className="text-muted-foreground text-sm">All campaigns across every connected ad account, sorted by spend.</p>
      </div>
      <div className="glass-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-xs uppercase tracking-wider text-muted-foreground bg-surface/40">
            <tr>
              <th className="text-left px-4 py-3">Campaign</th>
              <th className="text-left px-4 py-3">Client</th>
              <th className="text-left px-4 py-3">Status</th>
              <th className="text-right px-4 py-3">Spend</th>
              <th className="text-right px-4 py-3">Reach</th>
              <th className="text-right px-4 py-3">Impr.</th>
              <th className="text-right px-4 py-3">Clicks</th>
              <th className="text-right px-4 py-3">CTR</th>
              <th className="text-right px-4 py-3">CPC</th>
              <th className="text-right px-4 py-3">Results</th>
            </tr>
          </thead>
          <tbody>
            {(campaigns ?? []).length === 0 ? (
              <tr><td colSpan={10} className="text-center py-12 text-muted-foreground"><Megaphone className="size-10 mx-auto opacity-30 mb-2" />No campaigns yet — connect an ad account in <Link to="/clients" className="text-primary underline">Clients</Link></td></tr>
            ) : (campaigns ?? []).map((c: any) => (
              <tr key={c.id} className="border-t border-border/40 hover:bg-surface/40">
                <td className="px-4 py-3 max-w-[300px]">
                  <div className="font-medium truncate">{c.name}</div>
                  <div className="text-xs text-muted-foreground">{c.objective}</div>
                </td>
                <td className="px-4 py-3 text-xs">{c.ad_account?.client?.name ?? "—"}</td>
                <td className="px-4 py-3"><StatusBadge status={c.effective_status ?? c.status} /></td>
                <td className="px-4 py-3 text-right font-medium">{c.ad_account?.currency ?? "$"}{Number(c.spend).toFixed(2)}</td>
                <td className="px-4 py-3 text-right">{Number(c.reach).toLocaleString()}</td>
                <td className="px-4 py-3 text-right">{Number(c.impressions).toLocaleString()}</td>
                <td className="px-4 py-3 text-right">{Number(c.clicks).toLocaleString()}</td>
                <td className="px-4 py-3 text-right">{(Number(c.ctr) * 1).toFixed(2)}%</td>
                <td className="px-4 py-3 text-right">${Number(c.cpc).toFixed(2)}</td>
                <td className="px-4 py-3 text-right font-medium text-primary">{Number(c.results).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function StatusBadge({ status }: { status?: string | null }) {
  if (!status) return <span className="text-xs text-muted-foreground">—</span>;
  const map: Record<string, string> = {
    ACTIVE: "bg-success/15 text-success",
    PAUSED: "bg-warning/15 text-warning",
    DELETED: "bg-destructive/15 text-destructive",
    ARCHIVED: "bg-muted text-muted-foreground",
  };
  return <span className={`text-[10px] font-semibold uppercase rounded-full px-2 py-0.5 ${map[status] ?? "bg-surface text-muted-foreground"}`}>{status.replace(/_/g, " ")}</span>;
}
