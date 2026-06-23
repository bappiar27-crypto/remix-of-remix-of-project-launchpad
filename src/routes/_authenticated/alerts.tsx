import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { BellRing, CheckCheck } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/alerts")({
  head: () => ({ meta: [{ title: "Alerts — GrowVibe Ads Solution" }] }),
  component: AlertsPage,
});

function AlertsPage() {
  const qc = useQueryClient();
  const { data: alerts } = useQuery({
    queryKey: ["alerts"],
    queryFn: async () => {
      const { data } = await supabase.from("alerts").select("*, client:clients(name)").order("created_at", { ascending: false }).limit(100);
      return data ?? [];
    },
  });

  const markAll = async () => {
    await supabase.from("alerts").update({ is_read: true }).eq("is_read", false);
    toast.success("All marked as read");
    qc.invalidateQueries({ queryKey: ["alerts"] });
  };

  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold">Alerts</h1>
          <p className="text-muted-foreground text-sm">Budget, performance, and sync notifications.</p>
        </div>
        <button onClick={markAll} className="inline-flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-sm hover:bg-surface-elevated shrink-0"><CheckCheck className="size-4" /> Mark all read</button>
      </div>

      <div className="space-y-2">
        {(alerts ?? []).length === 0 ? (
          <div className="glass-card p-12 text-center"><BellRing className="size-10 mx-auto opacity-30 mb-2" /><div className="text-sm text-muted-foreground">No alerts yet</div></div>
        ) : (alerts ?? []).map((a: any) => (
          <div key={a.id} className={`glass-card p-4 flex items-start gap-3 ${!a.is_read ? "border-primary/30" : ""}`}>
            <div className={`size-9 rounded-lg grid place-items-center text-sm ${a.severity === "critical" ? "bg-destructive/15 text-destructive" : a.severity === "warning" ? "bg-warning/15 text-warning" : "bg-primary/15 text-primary"}`}><BellRing className="size-4" /></div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <div className="font-semibold text-sm truncate">{a.title}</div>
                <div className="text-[11px] text-muted-foreground">{new Date(a.created_at).toLocaleString()}</div>
              </div>
              {a.message && <p className="text-xs text-muted-foreground mt-0.5">{a.message}</p>}
              {a.client?.name && <div className="text-[10px] uppercase tracking-wider text-muted-foreground mt-1">{a.client.name}</div>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
