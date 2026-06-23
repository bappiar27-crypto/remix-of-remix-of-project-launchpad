import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import {
  createClient,
  listAvailableAdAccounts,
  listAvailableAdSets,
  syncAllAccountsNow,
} from "@/lib/fb/admin.functions";
import { toast } from "sonner";
import {
  ArrowLeft,
  Search,
  Lock,
  ShieldCheck,
  ChevronDown,
  Loader2,
  Check,
  AlertCircle,
  RefreshCw,
  Clock,
  Wifi,
  WifiOff,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/clients_/new")({
  head: () => ({ meta: [{ title: "Add New Partner — GrowVibe Ads Solution" }] }),
  component: AddPartnerPage,
});

function AddPartnerPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const createFn = useServerFn(createClient);
  const listAccountsFn = useServerFn(listAvailableAdAccounts);
  const listAdSetsFn = useServerFn(listAvailableAdSets);
  const syncNowFn = useServerFn(syncAllAccountsNow);

  // Profile fields
  const [name, setName] = useState("");
  const [company, setCompany] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [website, setWebsite] = useState("");
  const [address, setAddress] = useState("");
  const [depositAmount, setDepositAmount] = useState<string>("");

  // BDT-USD converter
  const [showConverter, setShowConverter] = useState(false);
  const [bdtAmount, setBdtAmount] = useState<string>("");
  const [bdtRate, setBdtRate] = useState<string>("");

  // Commission — custom percentage entered by admin (no presets)
  const [commissionEnabled, setCommissionEnabled] = useState(false);
  const [commissionPct, setCommissionPct] = useState<string>("");
  const [commissionNotes, setCommissionNotes] = useState("");

  // Campaign assignment — now ad-set level
  type AdSetRow = {
    id: string;
    name: string;
    status: string;
    campaign_id: string;
    campaign_name: string;
    account_id: string;
    account_name: string;
    currency: string | null;
    thumbnail_url: string | null;
    internal_campaign_id: string | null;
    assignedClientName: string | null;
    assignedClientSlug: string | null;
  };
  const [accounts, setAccounts] = useState<any[]>([]);
  const [adsets, setAdsets] = useState<AdSetRow[]>([]);
  const [adsetMeta, setAdsetMeta] = useState<{
    totalAccounts: number;
    truncatedAccounts: number;
    perAccountErrors: Array<{ account_id: string; account_name: string; error: string }>;
  }>({ totalAccounts: 0, truncatedAccounts: 0, perAccountErrors: [] });
  const [loadingAccounts, setLoadingAccounts] = useState(true);
  const [accountLoadError, setAccountLoadError] = useState<string | null>(null);
  const [liveError, setLiveError] = useState<string | null>(null);
  const [lastLoadedAt, setLastLoadedAt] = useState<Date | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [selectedAdsets, setSelectedAdsets] = useState<Set<string>>(new Set()); // fb adset IDs
  const [accountSearch, setAccountSearch] = useState("");
  const [accountStatus, setAccountStatus] = useState("all");

  const [saving, setSaving] = useState(false);

  const loadAccounts = async () => {
    setLoadingAccounts(true);
    setAccountLoadError(null);
    try {
      const [accountsRes, adsetsRes] = await Promise.all([
        listAccountsFn({ data: undefined as any }),
        listAdSetsFn({ data: undefined as any }),
      ]);
      const accList = accountsRes ?? [];
      setAccounts(accList);
      setAdsets(adsetsRes?.adsets ?? []);
      setAdsetMeta({
        totalAccounts: adsetsRes?.totalAccounts ?? 0,
        truncatedAccounts: adsetsRes?.truncatedAccounts ?? 0,
        perAccountErrors: adsetsRes?.perAccountErrors ?? [],
      });
      setLiveError(adsetsRes?.liveError ?? (accList[0] as any)?.liveError ?? null);
      setLastLoadedAt(new Date());
    } catch (e: any) {
      setAccountLoadError(e?.message ?? "Could not load Meta ad sets");
    } finally {
      setLoadingAccounts(false);
    }
  };

  useEffect(() => {
    loadAccounts();
  }, []);

  const runSyncNow = async () => {
    setSyncing(true);
    const tId = toast.loading("Refreshing campaigns from Meta…");
    try {
      const res: any = await syncNowFn({ data: undefined as any });
      toast.dismiss(tId);
      if (res?.ok === false) toast.error(res.error ?? "Sync failed");
      else toast.success(`Synced ${res?.synced ?? 0} accounts`);
      await loadAccounts();
    } catch (e: any) {
      toast.dismiss(tId);
      toast.error(e?.message ?? "Sync failed");
    } finally {
      setSyncing(false);
    }
  };

  const applyConverter = () => {
    const amt = Number(bdtAmount);
    const rate = Number(bdtRate);
    if (!amt || !rate) {
      toast.error("Enter BDT amount and rate");
      return;
    }
    const usd = amt / rate;
    setDepositAmount(usd.toFixed(2));
    toast.success(`Converted ৳${amt.toLocaleString()} → $${usd.toFixed(2)}`);
  };

  const toggleAdset = (id: string) => {
    setSelectedAdsets((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const filteredAdsets = adsets.filter((a) => {
    if (accountStatus === "active" && a.status !== "ACTIVE") return false;
    if (accountStatus !== "all" && accountStatus !== "active" && a.status !== accountStatus)
      return false;
    if (accountSearch) {
      const q = accountSearch.toLowerCase();
      const hay =
        `${a.name} ${a.campaign_name} ${a.account_name} ${a.id} ${a.campaign_id}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  // Group filtered ad sets by account for the reference-style grouped grid.
  const groupedByAccount = (() => {
    const groups = new Map<
      string,
      { account_id: string; account_name: string; currency: string | null; items: AdSetRow[] }
    >();
    for (const a of filteredAdsets) {
      const key = a.account_id;
      const g = groups.get(key) ?? {
        account_id: a.account_id,
        account_name: a.account_name,
        currency: a.currency,
        items: [],
      };
      g.items.push(a);
      groups.set(key, g);
    }
    return Array.from(groups.values()).sort(
      (x, y) => y.items.length - x.items.length || x.account_name.localeCompare(y.account_name),
    );
  })();

  const onSave = async () => {
    if (!name.trim()) {
      toast.error("Client name is required");
      return;
    }
    setSaving(true);
    try {
      await createFn({
        data: {
          name: name.trim(),
          company: company || undefined,
          contact_email: email || undefined,
          contact_phone: phone || undefined,
          website: website || undefined,
          address: address || undefined,
          deposit_amount: Number(depositAmount) || 0,
          deposit_currency: bdtRate && Number(bdtRate) > 0 ? "BDT" : "USD",
          bdt_rate: bdtRate ? Number(bdtRate) : null,
          commission_enabled: commissionEnabled,
          commission_percent: Number(commissionPct) || 0,
          commission_notes: commissionNotes || undefined,
          // Derive distinct accounts + parent-campaign internal IDs from the
          // selected ad sets. Account assignment stays automatic so the
          // selected ad sets remain visible to the client portal.
          ad_account_ids: Array.from(
            new Set(adsets.filter((a) => selectedAdsets.has(a.id)).map((a) => a.account_id)),
          ),
          campaign_ids: Array.from(
            new Set(
              adsets
                .filter((a) => selectedAdsets.has(a.id) && a.internal_campaign_id)
                .map((a) => a.internal_campaign_id as string),
            ),
          ),
        },
      });
      toast.success("Partner saved");
      qc.invalidateQueries({ queryKey: ["clients"] });
      navigate({ to: "/clients" });
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold">Add New Partner</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Create a new client profile and assign campaign access
          </p>
        </div>
        <Link
          to="/clients"
          className="inline-flex items-center gap-2 rounded-lg border border-border bg-surface hover:bg-surface-elevated px-4 py-2 text-sm font-semibold"
        >
          <ArrowLeft className="size-4" /> Back to Clients
        </Link>
      </div>

      <div className="grid lg:grid-cols-2 gap-5">
        {/* LEFT — Profile Details */}
        <div className="space-y-5">
          <section className="glass-card p-5">
            <div className="flex items-center gap-2 mb-4">
              <div className="size-7 rounded-lg bg-emerald-500/15 text-emerald-400 grid place-items-center text-xs font-bold">
                P
              </div>
              <h2 className="font-semibold">Profile Details</h2>
            </div>

            <div className="space-y-4">
              <Field label="Client Name *">
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="input"
                  placeholder="e.g. Jamie Doe"
                />
              </Field>
              <Field label="Company Name">
                <input
                  value={company}
                  onChange={(e) => setCompany(e.target.value)}
                  className="input"
                  placeholder="Acme Enterprises"
                />
              </Field>
              <Field label="Email Address">
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="input"
                  placeholder="client@example.com"
                />
              </Field>
              <Field label="Phone Number">
                <input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="input"
                  placeholder="+1 (555) 000-0000"
                />
              </Field>
              <Field label="Website">
                <input
                  value={website}
                  onChange={(e) => setWebsite(e.target.value)}
                  className="input"
                  placeholder="example.com"
                />
              </Field>
              <Field label="Address">
                <input
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  className="input"
                  placeholder="Street, City, Country"
                />
              </Field>
              <Field label="Deposit Amount ($ USD) *">
                <input
                  type="number"
                  step="0.01"
                  value={depositAmount}
                  onChange={(e) => setDepositAmount(e.target.value)}
                  className="input"
                  placeholder="e.g. 1000"
                />
              </Field>

              {/* BDT/USD converter */}
              <div className="rounded-xl border border-border/60 bg-surface/40 p-3">
                <label className="flex items-center gap-2 text-sm font-medium cursor-pointer">
                  <input
                    type="checkbox"
                    checked={showConverter}
                    onChange={(e) => setShowConverter(e.target.checked)}
                    className="rounded accent-emerald-500"
                  />
                  BDT → USD CONVERTER{" "}
                  <span className="text-[11px] text-muted-foreground font-normal">
                    Optional helper
                  </span>
                </label>
                {showConverter && (
                  <>
                    <div className="grid grid-cols-[1fr_1fr_auto] gap-2 mt-3 items-end">
                      <div>
                        <div className="text-[10px] uppercase text-muted-foreground mb-1">
                          Amount (BDT)
                        </div>
                        <input
                          type="number"
                          value={bdtAmount}
                          onChange={(e) => setBdtAmount(e.target.value)}
                          className="input"
                          placeholder="e.g. 50000"
                        />
                      </div>
                      <div>
                        <div className="text-[10px] uppercase text-muted-foreground mb-1">Rate</div>
                        <input
                          type="number"
                          step="0.01"
                          value={bdtRate}
                          onChange={(e) => setBdtRate(e.target.value)}
                          className="input"
                          placeholder="120"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={applyConverter}
                        className="rounded-lg bg-emerald-500 text-white px-4 py-2 text-sm font-semibold"
                      >
                        Apply →
                      </button>
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-2">
                      Enter BDT amount & rate to auto-fill USD deposit.
                    </p>
                  </>
                )}
              </div>

              {/* Commission */}
              <div className="rounded-xl border border-border/60 bg-surface/40 p-3 space-y-3">
                <label className="flex items-center gap-2 text-sm font-medium cursor-pointer">
                  <input
                    type="checkbox"
                    checked={commissionEnabled}
                    onChange={(e) => setCommissionEnabled(e.target.checked)}
                    className="rounded accent-emerald-500"
                  />
                  Enable Commission
                </label>
                {commissionEnabled && (
                  <>
                    <Field label="Commission (%) — Custom — Agency markup hidden from client">
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        max="100"
                        value={commissionPct}
                        onChange={(e) => setCommissionPct(e.target.value)}
                        className="input"
                        placeholder="Enter any % e.g. 25, 30, 42.5"
                      />
                    </Field>
                    <p className="text-[11px] text-muted-foreground -mt-2">
                      The agency reduces Meta ad budget by this %, but the client portal still shows
                      the original daily/total budget the client paid for.
                    </p>
                    <textarea
                      value={commissionNotes}
                      onChange={(e) => setCommissionNotes(e.target.value)}
                      placeholder="Internal commission notes (not shown to client)"
                      className="input min-h-[80px] resize-y"
                    />
                  </>
                )}
              </div>
            </div>
          </section>

          {/* Secure Access */}
          <section className="rounded-2xl p-5 border border-purple-500/30 bg-gradient-to-br from-purple-600/20 via-indigo-600/15 to-blue-600/20 relative overflow-hidden">
            <div className="flex items-center gap-2 mb-2">
              <div className="size-7 rounded-lg bg-white/10 grid place-items-center">
                <Lock className="size-3.5" />
              </div>
              <h3 className="font-semibold">Secure Access</h3>
            </div>
            <p className="text-xs text-muted-foreground">
              The client will receive a unique secure access link. They can view their campaign
              dashboard instantly without a password.
            </p>
            <div className="mt-3 inline-flex items-center gap-1.5 text-[11px] font-medium text-emerald-300">
              <ShieldCheck className="size-3.5" /> Protected with encryption
            </div>
          </section>
        </div>

        {/* RIGHT — Campaign Assignment */}
        <div>
          <section className="glass-card p-5 sticky top-20">
            <div className="flex items-center justify-between gap-2 mb-3">
              <div className="flex items-center gap-2">
                <div className="size-7 rounded-lg bg-blue-500/15 text-blue-400 grid place-items-center text-xs font-bold">
                  C
                </div>
                <h2 className="font-semibold">Campaign Assignment</h2>
              </div>
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                Step 2 of 2
              </span>
            </div>

            {/* Sync status bar */}
            <div className="flex items-center justify-between gap-2 mb-3 rounded-lg border border-border/60 bg-surface/40 px-3 py-2 text-xs">
              <div className="flex items-center gap-2 min-w-0">
                {liveError ? (
                  <>
                    <WifiOff className="size-3.5 text-amber-400 shrink-0" />
                    <span className="text-amber-300 truncate">
                      Live Meta unreachable — showing cached
                    </span>
                  </>
                ) : (
                  <>
                    <Wifi className="size-3.5 text-emerald-400 shrink-0" />
                    <span className="text-emerald-300">Meta connected</span>
                  </>
                )}
                <span className="text-muted-foreground flex items-center gap-1 ml-2 shrink-0">
                  <Clock className="size-3" />
                  {lastLoadedAt ? `Updated ${lastLoadedAt.toLocaleTimeString()}` : "—"}
                </span>
              </div>
              <button
                type="button"
                onClick={runSyncNow}
                disabled={syncing || loadingAccounts}
                className="inline-flex items-center gap-1.5 rounded-md bg-primary/15 hover:bg-primary/25 text-primary px-2.5 py-1 font-semibold disabled:opacity-60"
                title="Pull latest campaigns from Meta now"
              >
                <RefreshCw className={`size-3.5 ${syncing ? "animate-spin" : ""}`} />
                {syncing ? "Syncing…" : "Sync now"}
              </button>
            </div>

            {liveError && accounts.length > 0 && (
              <div className="mb-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-2.5 text-[11px] text-amber-200">
                <div className="font-semibold mb-0.5 flex items-center gap-1.5">
                  <AlertCircle className="size-3.5" /> Live Meta call failed
                </div>
                <div className="text-amber-200/80">{liveError}</div>
                <div className="text-amber-200/70 mt-1">
                  Showing cached campaigns. Click <b>Sync now</b> or check the token in{" "}
                  <Link to="/facebook-marketing-api" className="underline">
                    Meta connection settings
                  </Link>
                  .
                </div>
              </div>
            )}

            <div className="flex items-center gap-2 mb-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                <input
                  value={accountSearch}
                  onChange={(e) => setAccountSearch(e.target.value)}
                  placeholder="Search by ad set, campaign or account name…"
                  className="w-full rounded-lg bg-surface border border-border pl-9 pr-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/40"
                />
              </div>
              <div className="relative">
                <select
                  value={accountStatus}
                  onChange={(e) => setAccountStatus(e.target.value)}
                  className="appearance-none rounded-lg bg-surface border border-border pl-3 pr-9 py-2 text-sm"
                >
                  <option value="all">All Statuses</option>
                  <option value="ACTIVE">Active</option>
                  <option value="PAUSED">Paused</option>
                  <option value="ADSET_PAUSED">Ad set paused</option>
                  <option value="CAMPAIGN_PAUSED">Campaign paused</option>
                  <option value="ARCHIVED">Archived</option>
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
              </div>
            </div>

            {loadingAccounts ? (
              <div className="py-12 grid place-items-center">
                <Loader2 className="size-6 animate-spin text-primary" />
              </div>
            ) : accountLoadError && accounts.length === 0 ? (
              <div className="py-12 text-center text-sm space-y-3">
                <AlertCircle className="size-7 mx-auto text-amber-400" />
                <div className="font-semibold text-foreground">Could not load Meta accounts</div>
                <p className="text-muted-foreground">{accountLoadError}</p>
                <div className="rounded-lg border border-border/60 bg-surface/40 p-3 text-left text-xs text-muted-foreground space-y-1">
                  <div className="font-semibold text-foreground">How to fix:</div>
                  <ol className="list-decimal ml-4 space-y-0.5">
                    <li>
                      Open{" "}
                      <Link to="/facebook-marketing-api" className="text-primary hover:underline">
                        Meta connection settings
                      </Link>
                      .
                    </li>
                    <li>Paste a valid System User token and Business ID.</li>
                    <li>Assign Ad Accounts to the System User (Full control).</li>
                    <li>
                      Come back and click <b>Sync now</b>.
                    </li>
                  </ol>
                </div>
                <button
                  type="button"
                  onClick={runSyncNow}
                  disabled={syncing}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-primary text-primary-foreground px-3 py-1.5 text-xs font-semibold disabled:opacity-60"
                >
                  <RefreshCw className={`size-3.5 ${syncing ? "animate-spin" : ""}`} /> Retry / Sync
                  now
                </button>
              </div>
            ) : groupedByAccount.length === 0 ? (
              <div className="py-12 text-center text-sm text-muted-foreground space-y-2">
                <div>No matching ad sets found.</div>
                <div className="text-xs">
                  Try a different search, or click <b>Sync now</b> above to refresh from Meta.
                </div>
              </div>
            ) : (
              <div className="space-y-4 max-h-[560px] overflow-y-auto pr-1">
                {groupedByAccount.map((group) => (
                  <div
                    key={group.account_id}
                    className="rounded-xl border border-border/60 bg-surface/40 overflow-hidden"
                  >
                    {/* Account header */}
                    <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-border/40 bg-surface/60">
                      <div className="min-w-0">
                        <div className="text-sm font-semibold truncate">{group.account_name}</div>
                        <div className="text-[11px] text-muted-foreground truncate">
                          <code>{group.account_id}</code>
                          {group.currency ? <> · {group.currency}</> : null}
                          <>
                            {" "}
                            · {group.items.length} ad set{group.items.length !== 1 ? "s" : ""}
                          </>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          const allIds = group.items.map((i) => i.id);
                          const allSelected = allIds.every((id) => selectedAdsets.has(id));
                          setSelectedAdsets((prev) => {
                            const next = new Set(prev);
                            if (allSelected) allIds.forEach((id) => next.delete(id));
                            else allIds.forEach((id) => next.add(id));
                            return next;
                          });
                        }}
                        className="text-[11px] rounded-md bg-primary/15 hover:bg-primary/25 text-primary px-2 py-1 font-semibold shrink-0"
                      >
                        {group.items.every((i) => selectedAdsets.has(i.id))
                          ? "Clear all"
                          : "Select all"}
                      </button>
                    </div>
                    {/* Ad set cards */}
                    <div className="grid sm:grid-cols-2 gap-2 p-3">
                      {group.items.map((a) => {
                        const checked = selectedAdsets.has(a.id);
                        const status = (a.status || "").toUpperCase();
                        const statusColor =
                          status === "ACTIVE"
                            ? "text-emerald-300 bg-emerald-500/15"
                            : status === "PAUSED" ||
                                status === "CAMPAIGN_PAUSED" ||
                                status === "ADSET_PAUSED"
                              ? "text-amber-300 bg-amber-500/15"
                              : status === "ARCHIVED"
                                ? "text-muted-foreground bg-muted/30"
                                : status === "COMPLETED"
                                  ? "text-blue-300 bg-blue-500/15"
                                  : "text-foreground/70 bg-surface";
                        return (
                          <button
                            key={a.id}
                            type="button"
                            onClick={() => toggleAdset(a.id)}
                            className={`text-left rounded-lg border p-2 transition flex items-start gap-2 ${
                              checked
                                ? "border-emerald-500/60 bg-emerald-500/10"
                                : "border-border bg-surface hover:bg-surface-elevated"
                            }`}
                          >
                            <div
                              className={`mt-0.5 size-4 rounded border grid place-items-center shrink-0 ${checked ? "bg-emerald-500 border-emerald-500" : "border-border"}`}
                            >
                              {checked && <Check className="size-3 text-white" />}
                            </div>
                            <div className="size-10 rounded-md overflow-hidden bg-surface-elevated shrink-0 grid place-items-center">
                              {a.thumbnail_url ? (
                                <img
                                  src={a.thumbnail_url}
                                  alt=""
                                  loading="lazy"
                                  className="size-full object-cover"
                                />
                              ) : (
                                <span className="text-[10px] text-muted-foreground">No img</span>
                              )}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div
                                className="text-[13px] font-medium leading-tight truncate"
                                title={a.name}
                              >
                                {a.name}
                              </div>
                              <div
                                className="text-[10px] text-muted-foreground truncate"
                                title={a.campaign_name}
                              >
                                {a.campaign_name}
                              </div>
                              <div className="mt-1 flex items-center gap-1">
                                <span
                                  className={`text-[9px] uppercase tracking-wide rounded px-1.5 py-0.5 font-semibold ${statusColor}`}
                                >
                                  {status.replace(/_/g, " ")}
                                </span>
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
                {adsetMeta.truncatedAccounts > 0 && (
                  <div className="text-[11px] text-muted-foreground text-center py-2">
                    Showing first {adsetMeta.totalAccounts - adsetMeta.truncatedAccounts} of{" "}
                    {adsetMeta.totalAccounts} ad accounts. Narrow with search to find ad sets in
                    other accounts.
                  </div>
                )}
                {adsetMeta.perAccountErrors.length > 0 && (
                  <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-2 text-[11px] text-amber-200">
                    <div className="font-semibold mb-1">
                      Some accounts failed to load ({adsetMeta.perAccountErrors.length}):
                    </div>
                    <ul className="space-y-0.5 max-h-24 overflow-y-auto">
                      {adsetMeta.perAccountErrors.slice(0, 6).map((e) => (
                        <li key={e.account_id} className="truncate">
                          • {e.account_name}: {e.error}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

            <div className="mt-4 pt-3 border-t border-border/40 text-xs text-muted-foreground flex items-center justify-between gap-2 flex-wrap">
              <span>
                {selectedAdsets.size > 0
                  ? `${selectedAdsets.size} ad set${selectedAdsets.size !== 1 ? "s" : ""} selected`
                  : `${adsets.length} ad set${adsets.length !== 1 ? "s" : ""} loaded from ${adsetMeta.totalAccounts} ad account${adsetMeta.totalAccounts !== 1 ? "s" : ""}.`}
              </span>
              {selectedAdsets.size > 0 && (
                <button
                  type="button"
                  onClick={() => setSelectedAdsets(new Set())}
                  className="text-[11px] underline text-muted-foreground hover:text-foreground"
                >
                  Clear selection
                </button>
              )}
            </div>
          </section>
        </div>
      </div>

      {/* Footer actions */}
      <div className="sticky bottom-0 -mx-4 lg:-mx-6 mt-6 px-4 lg:px-6 py-3 bg-background/80 backdrop-blur-md border-t border-border/60 flex items-center justify-end gap-3">
        <Link
          to="/clients"
          className="rounded-lg border border-border bg-surface hover:bg-surface-elevated px-5 py-2.5 text-sm font-semibold"
        >
          Cancel
        </Link>
        <button
          type="button"
          onClick={onSave}
          disabled={saving}
          className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-emerald-500 to-teal-500 text-white px-6 py-2.5 text-sm font-semibold shadow-lg shadow-emerald-500/20 disabled:opacity-60"
        >
          {saving ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
          Save Partner
        </button>
      </div>

      <style>{`.input{width:100%;border-radius:.5rem;background:var(--input);border:1px solid var(--border);padding:.6rem .8rem;font-size:.875rem;outline:none;color:var(--foreground)}.input:focus{box-shadow:0 0 0 2px color-mix(in oklab, var(--primary) 40%, transparent)}.input::placeholder{color:color-mix(in oklab, var(--muted-foreground) 80%, transparent)}`}</style>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold mb-1.5">
        {label}
      </div>
      {children}
    </label>
  );
}
