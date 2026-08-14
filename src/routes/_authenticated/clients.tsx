import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { deleteClient } from "@/lib/fb/admin.functions";
import { toast } from "sonner";
import { Plus, Search, Eye, Link2, Pencil, Trash2, ChevronDown } from "lucide-react";

export const Route = createFileRoute("/_authenticated/clients")({
  head: () => ({ meta: [{ title: "Clients — GrowVibe Ads Solution" }] }),
  component: ClientsPage,
});

function initials(name: string) {
  return (name || "?")
    .trim()
    .split(/\s+/)
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function fmtUSD(n: number) {
  return `$${(Number(n) || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function fmtBDT(n: number) {
  return `৳${Math.round(Number(n) || 0).toLocaleString()}`;
}

function ClientsPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const deleteFn = useServerFn(deleteClient);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const { data: clients } = useQuery({
    queryKey: ["clients"],
    queryFn: async () => {
      const { data } = await supabase
        .from("clients")
        .select("*, ad_accounts(id,total_spend,currency)")
        .order("created_at", { ascending: false });
      const rows = data ?? [];
      // Fallback — if ad_accounts.total_spend is 0/stale, derive spend from
      // the campaigns table so the list never shows $0 when there IS spend.
      void rows.map((c: any) => c.id);
      const acctIds = rows.flatMap((c: any) => (c.ad_accounts ?? []).map((a: any) => a.id));
      const spendByClient = new Map<string, number>();
      if (acctIds.length) {
        const { data: camps } = await supabase
          .from("campaigns")
          .select("ad_account_id, spend, ad_accounts!inner(client_id)")
          .in("ad_account_id", acctIds);
        for (const c of camps ?? []) {
          const cid = (c as any).ad_accounts?.client_id;
          if (!cid) continue;
          spendByClient.set(cid, (spendByClient.get(cid) ?? 0) + (Number((c as any).spend) || 0));
        }
      }
      return rows.map((c: any) => {
        const acctTotal = (c.ad_accounts ?? []).reduce(
          (s: number, a: any) => s + (Number(a.total_spend) || 0),
          0,
        );
        const fallback = spendByClient.get(c.id) ?? 0;
        return { ...c, _derived_spend_usd: acctTotal > 0 ? acctTotal : fallback };
      });
    },
  });

  const filtered = (clients ?? []).filter((c: any) => {
    if (statusFilter !== "all" && c.status !== statusFilter) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      c.name?.toLowerCase().includes(q) ||
      c.slug?.includes(q) ||
      c.company?.toLowerCase().includes(q)
    );
  });

  const onDelete = async (id: string, name: string) => {
    if (!confirm(`Delete partner "${name}"? This removes all their ad accounts and data.`)) return;
    await deleteFn({ data: { id } });
    toast.success("Deleted");
    qc.invalidateQueries({ queryKey: ["clients"] });
  };

  const copyPortal = async (client: any) => {
    const code = client.client_code || client.slug;
    const url = `${window.location.origin}/client/${code}`;
    await navigator.clipboard.writeText(url);
    toast.success("Portal link copied");
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold">Clients</h1>
          <p className="text-muted-foreground text-sm mt-1">Manage your agency's clients</p>
        </div>
        <Link
          to="/clients/new"
          className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-emerald-500 to-teal-500 text-white px-4 py-2.5 text-sm font-semibold shadow-lg shadow-emerald-500/20 hover:opacity-95"
        >
          <Plus className="size-4" /> Add new client
        </Link>
      </div>

      {/* Toolbar */}
      <div className="glass-card p-3 flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[240px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search clients…"
            className="w-full rounded-lg bg-surface border border-border pl-9 pr-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/40"
          />
        </div>
        <div className="relative">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="appearance-none rounded-lg bg-surface border border-border pl-3 pr-9 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/40 min-w-[160px]"
          >
            <option value="all">All status</option>
            <option value="active">Active</option>
            <option value="paused">Paused</option>
            <option value="archived">Archived</option>
          </select>
          <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
        </div>
      </div>

      {/* Table */}
      <div className="glass-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-surface/60 text-[11px] uppercase tracking-wider text-muted-foreground">
                <th className="text-left px-4 py-3 w-10">
                  <input type="checkbox" className="rounded" />
                </th>
                <th className="text-left px-4 py-3">Client</th>
                <th className="text-left px-4 py-3">Website</th>
                <th className="text-left px-4 py-3">Client ID</th>
                <th className="text-left px-4 py-3">Status</th>
                <th className="text-right px-4 py-3">Total Deposit</th>
                <th className="text-right px-4 py-3">Total Spent</th>
                <th className="text-right px-4 py-3">Remaining Balance</th>
                <th className="text-right px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-16 text-center">
                    <div className="size-14 mx-auto rounded-2xl bg-gradient-to-br from-primary/20 to-accent/20 grid place-items-center mb-3">
                      👥
                    </div>
                    <div className="font-semibold">No clients yet</div>
                    <p className="text-xs text-muted-foreground mt-1">
                      Add your first client to start tracking ads.
                    </p>
                    <Link
                      to="/clients/new"
                      className="mt-4 inline-flex items-center gap-2 rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm font-semibold"
                    >
                      <Plus className="size-4" /> Add new client
                    </Link>
                  </td>
                </tr>
              ) : (
                filtered.map((c: any) => {
                  const totalSpentUsd = c._derived_spend_usd ?? (c.ad_accounts ?? []).reduce(
                    (s: number, a: any) => s + (Number(a.total_spend) || 0),
                    0,
                  );
                  const deposit = Number(c.deposit_amount) || 0;
                  const remaining = deposit - totalSpentUsd;
                  const acctCount = c.ad_accounts?.length ?? 0;
                  return (
                    <tr key={c.id} className="border-t border-border/40 hover:bg-surface/40">
                      <td className="px-4 py-4">
                        <input type="checkbox" className="rounded" />
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex items-center gap-3">
                          <div className="size-9 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-500 grid place-items-center font-bold text-white text-sm">
                            {initials(c.name)}
                          </div>
                          <div className="min-w-0">
                            <div className="font-semibold truncate">{c.name}</div>
                            {c.company && (
                              <div className="text-xs text-muted-foreground truncate">
                                {c.company}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-4 text-muted-foreground">
                        {c.website ? (
                          <a
                            href={c.website.startsWith("http") ? c.website : `https://${c.website}`}
                            target="_blank"
                            rel="noreferrer"
                            className="text-primary hover:underline"
                          >
                            {c.website.replace(/^https?:\/\//, "")}
                          </a>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="px-4 py-4">
                        <code className="text-xs px-2 py-1 rounded bg-emerald-500/10 text-emerald-400 font-mono">
                          {c.client_code ?? c.slug?.slice(0, 8).toUpperCase()}
                        </code>
                      </td>
                      <td className="px-4 py-4">
                        <span
                          className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full ${
                            c.status === "active"
                              ? "bg-emerald-500/15 text-emerald-400"
                              : c.status === "paused"
                                ? "bg-amber-500/15 text-amber-400"
                                : "bg-muted/40 text-muted-foreground"
                          }`}
                        >
                          <span
                            className={`size-1.5 rounded-full ${c.status === "active" ? "bg-emerald-400" : c.status === "paused" ? "bg-amber-400" : "bg-muted-foreground"}`}
                          />
                          {c.status.charAt(0).toUpperCase() + c.status.slice(1)}
                        </span>
                      </td>
                      <td className="px-4 py-4 text-right">
                        {c.deposit_currency === "BDT" && c.bdt_rate ? (
                          <>
                            <div className="font-bold">{fmtBDT(deposit * Number(c.bdt_rate))}</div>
                            <div className="text-[11px] text-muted-foreground">
                              {fmtUSD(deposit)}
                            </div>
                          </>
                        ) : (
                          <div className="font-bold">{fmtUSD(deposit)}</div>
                        )}
                      </td>
                      <td className="px-4 py-4 text-right">
                        <div className="font-bold">{fmtUSD(totalSpentUsd)}</div>
                        <div className="text-[11px] text-muted-foreground">
                          {acctCount} ad acct{acctCount !== 1 ? "s" : ""}
                        </div>
                      </td>
                      <td className="px-4 py-4 text-right">
                        <div
                          className={`font-bold ${remaining < 0 ? "text-destructive" : "text-emerald-400"}`}
                        >
                          {fmtUSD(remaining)}
                        </div>
                        {c.deposit_currency === "BDT" && c.bdt_rate && (
                          <div className="text-[11px] text-muted-foreground">
                            {fmtBDT(remaining * Number(c.bdt_rate))}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex items-center justify-end gap-1.5 rounded-xl border border-border/60 bg-surface/40 p-1.5 w-fit ml-auto">
                          <button
                            onClick={() =>
                              navigate({ to: "/clients/$slug/report", params: { slug: c.slug } })
                            }
                            title="View general report"
                            className="inline-flex items-center justify-center size-9 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-500 text-white shadow-md shadow-emerald-500/30 hover:opacity-90 transition"
                          >
                            <Eye className="size-4" />
                          </button>
                          <button
                            onClick={() => copyPortal(c)}
                            title="Copy shareable portal link"
                            className="inline-flex items-center justify-center size-9 rounded-lg border border-border bg-surface text-muted-foreground hover:text-primary hover:border-primary/50 transition"
                          >
                            <Link2 className="size-4" />
                          </button>
                          <button
                            onClick={() =>
                              navigate({ to: "/clients/new", search: { edit: c.id } as any })
                            }
                            title="Edit client"
                            className="inline-flex items-center justify-center size-9 rounded-lg border border-border bg-surface text-muted-foreground hover:text-amber-400 hover:border-amber-400/50 transition"
                          >
                            <Pencil className="size-4" />
                          </button>
                          <button
                            onClick={() => onDelete(c.id, c.name)}
                            title="Delete client"
                            className="inline-flex items-center justify-center size-9 rounded-lg border border-border bg-surface text-muted-foreground hover:text-destructive hover:border-destructive/50 hover:bg-destructive/10 transition"
                          >
                            <Trash2 className="size-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        {filtered.length > 0 && (
          <div className="px-4 py-3 text-xs text-muted-foreground border-t border-border/40">
            {filtered.length} of {clients?.length ?? 0} client
            {(clients?.length ?? 0) !== 1 ? "s" : ""}
          </div>
        )}
      </div>
    </div>
  );
}
