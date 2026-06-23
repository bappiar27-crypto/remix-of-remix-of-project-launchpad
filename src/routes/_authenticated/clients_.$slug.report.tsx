import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  ArrowLeft,
  Copy,
  ExternalLink,
  Eye,
  MousePointerClick,
  Users,
  DollarSign,
  Wallet,
  TrendingDown,
  Target,
  Link2,
  Pencil,
  FileDown,
  Mail,
  Phone,
  MapPin,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/clients_/$slug/report")({
  head: ({ params }) => ({ meta: [{ title: `${params.slug} — General Report` }] }),
  component: ClientReportPage,
});

function fmtUSD(n: number) {
  return `$${(Number(n) || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function fmtInt(n: number) {
  return (Number(n) || 0).toLocaleString();
}

function ClientReportPage() {
  const { slug } = Route.useParams();

  const { data, isLoading } = useQuery({
    queryKey: ["client-report", slug],
    enabled: Boolean(slug),
    queryFn: async () => {
      if (!slug) return null;

      const { data: client, error: clientError } = await supabase
        .from("clients")
        .select("*")
        .eq("slug", slug)
        .maybeSingle();
      if (clientError) throw clientError;
      if (!client) return null;

      const { data: accounts, error: accountsError } = await supabase
        .from("ad_accounts")
        .select("*")
        .eq("client_id", client.id);
      if (accountsError) throw accountsError;
      const acctIds = (accounts ?? []).map((a: any) => a.id);

      const { data: assigned, error: assignedError } = await supabase
        .from("client_campaigns")
        .select("campaign_id")
        .eq("client_id", client.id);
      if (assignedError) throw assignedError;
      const assignedIds = (assigned ?? []).map((r: any) => r.campaign_id);

      let campaigns: any[] = [];
      if (assignedIds.length) {
        const { data, error } = await supabase.from("campaigns").select("*").in("id", assignedIds);
        if (error) throw error;
        campaigns = data ?? [];
      } else if (acctIds.length) {
        const { data, error } = await supabase
          .from("campaigns")
          .select("*")
          .in("ad_account_id", acctIds);
        if (error) throw error;
        campaigns = data ?? [];
      }

      const campIds = campaigns.map((c) => c.id);
      let ads: any[] = [];
      if (campIds.length) {
        const { data, error } = await supabase
          .from("ads")
          .select(
            "id,name,fb_ad_id,effective_status,campaign_id,ad_account_id,spend,impressions,reach,clicks,results",
          )
          .in("campaign_id", campIds)
          .order("spend", { ascending: false })
          .limit(200);
        if (error) throw error;
        ads = data ?? [];
      }

      const acctById = new Map((accounts ?? []).map((a: any) => [a.id, a]));
      return { client, accounts: accounts ?? [], campaigns, ads, acctById };
    },
  });

  if (isLoading) {
    return (
      <div className="min-h-[60vh] grid place-items-center text-muted-foreground">
        Loading report…
      </div>
    );
  }
  if (!data) {
    return (
      <div className="space-y-3">
        <Link
          to="/clients"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" /> Back to clients
        </Link>
        <div className="glass-card p-10 text-center">Client not found.</div>
      </div>
    );
  }

  const { client, accounts, campaigns, ads, acctById } = data;
  const clientIdShort = client.client_code ?? (client.slug ?? "").slice(0, 8).toUpperCase();
  const portalUrl = `${typeof window !== "undefined" ? window.location.origin : ""}/portal/${client.slug}${client.portal_token ? `?token=${client.portal_token}` : ""}`;
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&margin=8&bgcolor=0f172a&color=10b981&data=${encodeURIComponent(portalUrl)}`;

  // Aggregate from assigned campaigns (preferred) or accounts fallback
  const baseRows = campaigns.length ? campaigns : accounts;
  const totals = baseRows.reduce(
    (acc: any, r: any) => ({
      spend: acc.spend + (Number(r.spend ?? r.total_spend) || 0),
      impressions: acc.impressions + (Number(r.impressions ?? r.total_impressions) || 0),
      reach: acc.reach + (Number(r.reach ?? r.total_reach) || 0),
      clicks: acc.clicks + (Number(r.clicks ?? r.total_clicks) || 0),
      results: acc.results + (Number(r.results ?? r.total_results) || 0),
    }),
    { spend: 0, impressions: 0, reach: 0, clicks: 0, results: 0 },
  );

  const deposit = Number(client.deposit_amount) || 0;
  const remaining = deposit - totals.spend;
  const costPerResult = totals.results > 0 ? totals.spend / totals.results : 0;

  const copy = async (text: string, label = "Copied") => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(label);
    } catch (error) {
      console.error("Clipboard copy failed", error);
      toast.error("Unable to copy");
    }
  };

  return (
    <div className="space-y-6">
      <Link
        to="/clients"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> Back to clients
      </Link>

      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3 min-w-0 flex-wrap">
          <h1 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold tracking-tight break-words">
            {client.name}
          </h1>
          <span
            className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full ${
              client.status === "active"
                ? "bg-emerald-500/15 text-emerald-400"
                : client.status === "paused"
                  ? "bg-amber-500/15 text-amber-400"
                  : "bg-muted/40 text-muted-foreground"
            }`}
          >
            <span
              className={`size-1.5 rounded-full ${client.status === "active" ? "bg-emerald-400" : "bg-muted-foreground"}`}
            />
            {String(client.status).charAt(0).toUpperCase() + String(client.status).slice(1)}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Link
            to="/clients/new"
            search={{ edit: client.id } as any}
            className="inline-flex items-center gap-2 rounded-lg border border-border bg-surface px-3.5 py-2 text-sm font-semibold hover:bg-surface-elevated"
          >
            <Pencil className="size-4" /> Edit Client
          </Link>
          <button
            onClick={() => window.print()}
            className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-emerald-500 to-teal-500 text-white px-4 py-2 text-sm font-semibold shadow-lg shadow-emerald-500/20 hover:opacity-95"
          >
            <FileDown className="size-4" /> Generate Report
          </button>
        </div>
      </div>

      {/* Client ID */}
      <div className="glass-card p-3 inline-flex items-center gap-3 text-sm">
        <span className="text-muted-foreground text-xs uppercase tracking-wider">Client ID:</span>
        <code className="font-mono text-emerald-400">{clientIdShort}</code>
        <button
          onClick={() => copy(clientIdShort, "Client ID copied")}
          className="inline-flex items-center gap-1 rounded-md border border-border bg-surface px-2 py-1 text-xs hover:bg-surface-elevated"
        >
          <Copy className="size-3" /> Copy
        </button>
      </div>

      {/* Share link + QR */}
      <div className="glass-card p-5">
        <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground mb-3">
          <Link2 className="size-3.5 text-emerald-400" /> Client share link (no login required)
        </div>
        <div className="grid md:grid-cols-[1fr_auto] gap-5 items-start">
          <div className="space-y-3 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <code className="flex-1 min-w-0 truncate text-xs sm:text-sm rounded-lg border border-border bg-surface px-3 py-2 font-mono text-emerald-300">
                {portalUrl}
              </code>
              <button
                onClick={() => copy(portalUrl, "Link copied")}
                className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500 text-white px-3 py-2 text-xs font-semibold hover:bg-emerald-600"
              >
                <Copy className="size-3.5" /> Copy
              </button>
              <a
                href={portalUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-2 text-xs font-semibold hover:bg-surface-elevated"
              >
                <ExternalLink className="size-3.5" /> Open
              </a>
            </div>
            <p className="text-xs text-muted-foreground">
              Send this link to your client — they'll see their ad details instantly, without
              logging in. Scan the QR code with a phone to open.
            </p>
          </div>
          <div className="rounded-xl bg-white p-2 shadow-lg shadow-emerald-500/10 mx-auto">
            <img src={qrUrl} alt="Portal QR" width={160} height={160} className="block" />
          </div>
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <KPI icon={Wallet} tone="emerald" label="Total Deposit (USD)" value={fmtUSD(deposit)} />
        <KPI icon={DollarSign} tone="cyan" label="Total Spend" value={fmtUSD(totals.spend)} />
        <KPI
          icon={TrendingDown}
          tone="amber"
          label="Remaining Balance"
          value={fmtUSD(remaining)}
          sub="Remaining"
        />
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KPI
          icon={Eye}
          tone="violet"
          label="Impressions"
          value={fmtInt(totals.impressions)}
          compact
        />
        <KPI icon={Users} tone="sky" label="Reach" value={fmtInt(totals.reach)} compact />
        <KPI icon={Target} tone="rose" label="Results" value={fmtInt(totals.results)} compact />
        <KPI
          icon={MousePointerClick}
          tone="emerald"
          label="Cost / Result"
          value={costPerResult ? fmtUSD(costPerResult) : "$0"}
          compact
        />
      </div>

      {/* Contact + Assigned Ads */}
      <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
        <aside className="glass-card p-4 space-y-4">
          <div className="text-xs uppercase tracking-wider text-muted-foreground border-b border-border/40 pb-2">
            Contact Info
          </div>
          <Field icon={Mail} label="Email Address" value={client.contact_email} />
          <Field icon={Phone} label="Phone Number" value={client.contact_phone} />
          <Field icon={MapPin} label="Address" value={client.address} />
          <div>
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1.5">
              Access Portal
            </div>
            <a
              href={portalUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 px-3 py-1.5 text-xs font-semibold"
            >
              <ExternalLink className="size-3.5" /> Campaign Lookup
            </a>
          </div>
        </aside>

        <div className="glass-card overflow-hidden">
          <div className="px-4 py-3 border-b border-border/40 text-xs text-emerald-400">
            ✓ Loaded {ads.length} assigned ad{ads.length !== 1 ? "s" : ""}
          </div>
          <div className="px-4 py-3 border-b border-border/40 flex items-center justify-between">
            <div className="font-semibold">Assigned Ads</div>
            <div className="text-xs text-muted-foreground">{ads.length} ADS</div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[11px] uppercase tracking-wider text-muted-foreground bg-surface/40">
                  <th className="text-left px-4 py-2.5">Ad Name</th>
                  <th className="text-left px-4 py-2.5">Ad ID</th>
                  <th className="text-left px-4 py-2.5">Ad Account</th>
                  <th className="text-left px-4 py-2.5">Status</th>
                  <th className="text-right px-4 py-2.5">Spend</th>
                  <th className="text-right px-4 py-2.5">Results</th>
                </tr>
              </thead>
              <tbody>
                {ads.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="text-center py-12 text-muted-foreground text-sm">
                      No assigned ads.
                    </td>
                  </tr>
                ) : (
                  ads.map((a: any) => {
                    const acct: any = acctById.get(a.ad_account_id);
                    return (
                      <tr key={a.id} className="border-t border-border/40 hover:bg-surface/40">
                        <td className="px-4 py-3 max-w-[260px]">
                          <div className="font-medium truncate">{a.name}</div>
                        </td>
                        <td className="px-4 py-3">
                          <code className="text-xs font-mono text-muted-foreground">
                            {a.fb_ad_id}
                          </code>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {acct?.account_name ?? acct?.fb_account_id ?? "—"}
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-[10px] font-semibold uppercase rounded-full px-2 py-0.5 bg-surface text-muted-foreground">
                            {a.effective_status ?? "—"}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right font-medium">{fmtUSD(a.spend)}</td>
                        <td className="px-4 py-3 text-right text-primary font-medium">
                          {fmtInt(a.results)}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

function KPI({ icon: Icon, label, value, sub, tone = "emerald", compact = false }: any) {
  const tones: Record<string, string> = {
    emerald: "from-emerald-500/20 to-emerald-500/0 text-emerald-400",
    cyan: "from-cyan-500/20 to-cyan-500/0 text-cyan-400",
    amber: "from-amber-500/20 to-amber-500/0 text-amber-400",
    violet: "from-violet-500/20 to-violet-500/0 text-violet-400",
    sky: "from-sky-500/20 to-sky-500/0 text-sky-400",
    rose: "from-rose-500/20 to-rose-500/0 text-rose-400",
  };
  return (
    <div className="glass-card p-4 relative overflow-hidden">
      <div
        className={`absolute -top-10 -right-10 size-28 rounded-full bg-gradient-to-br ${tones[tone]} blur-2xl pointer-events-none`}
      />
      <div className={`size-9 rounded-xl grid place-items-center bg-gradient-to-br ${tones[tone]}`}>
        <Icon className="size-4" />
      </div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground mt-3">{label}</div>
      <div
        className={`${compact ? "text-xl sm:text-2xl" : "text-2xl sm:text-3xl"} font-extrabold mt-1 break-words`}
      >
        {value}
      </div>
      {sub && <div className="text-[11px] text-muted-foreground mt-0.5">{sub}</div>}
    </div>
  );
}

function Field({ icon: Icon, label, value }: any) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1 flex items-center gap-1.5">
        <Icon className="size-3" /> {label}
      </div>
      <div className="text-sm truncate">
        {value || <span className="text-muted-foreground">—</span>}
      </div>
    </div>
  );
}
