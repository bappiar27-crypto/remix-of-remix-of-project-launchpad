import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  listConnections,
  upsertConnection,
  removeConnection,
  testConnection,
  checkConnectionHealth,
  syncConnection,
  importVisibleForConnection,
  getConnectionAccountsStatus,
  matchCheckConnection,
} from "@/lib/fb/connections.functions";
import {
  Building2,
  Plus,
  Trash2,
  FlaskConical,
  RefreshCw,
  DownloadCloud,
  RotateCw,
  CheckCircle2,
  XCircle,
  Loader2,
  ShieldCheck,
  AlertTriangle,
  Pencil,
  X,
  Activity,
  GitCompare,
  Clock,
} from "lucide-react";

type Conn = {
  id: string;
  label: string;
  fb_app_id: string | null;
  fb_business_id: string | null;
  has_token: boolean;
  has_app_secret: boolean;
  token_status: string | null;
  token_scopes: string[] | null;
  token_missing_scopes: string[] | null;
  token_user_name: string | null;
  token_expires_at: string | null;
  token_checked_at: string | null;
  token_error: string | null;
  is_active: boolean;
  account_count: number;
  created_at: string;
  updated_at: string;
};

export function BusinessManagersSection() {
  const qc = useQueryClient();
  const listFn = useServerFn(listConnections);
  const { data: connections = [] } = useQuery({
    queryKey: ["meta-connections"],
    queryFn: () => listFn({ data: undefined as any }),
  });
  const [editing, setEditing] = useState<Conn | null>(null);
  const [adding, setAdding] = useState(false);

  return (
    <div className="glass-card p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Building2 className="size-5 text-primary" />
          <h2 className="font-semibold text-lg">Business Managers</h2>
        </div>
        <button
          onClick={() => {
            setAdding(true);
            setEditing(null);
          }}
          className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-primary to-primary-glow text-primary-foreground px-3 py-1.5 text-xs font-semibold hover:opacity-90"
        >
          <Plus className="size-3.5" /> Add Business Manager
        </button>
      </div>

      <p className="text-sm text-muted-foreground mb-4">
        একটার বেশি Business Manager যোগ করতে পারবেন। প্রতিটার নিজস্ব App ID, App Secret, Business ID
        আর System User Token হবে। প্রতিটা ad account সবসময় তার নিজের BM-এর token দিয়েই sync হবে —
        Ads Manager-এর সাথে data 1:1 match থাকবে।
      </p>

      {connections.length === 0 && !adding && (
        <div className="rounded-lg border border-dashed border-border bg-surface/40 p-6 text-center text-sm text-muted-foreground">
          এখনো কোনো Business Manager add করা হয়নি। উপরে "Add Business Manager" চাপুন।
        </div>
      )}

      <div className="space-y-3">
        {connections.map((c) => (
          <ConnectionCard
            key={c.id}
            c={c}
            onEdit={() => {
              setEditing(c);
              setAdding(false);
            }}
          />
        ))}
      </div>

      {(adding || editing) && (
        <ConnectionForm
          initial={editing ?? null}
          onClose={() => {
            setAdding(false);
            setEditing(null);
          }}
          onSaved={() => {
            setAdding(false);
            setEditing(null);
            qc.invalidateQueries({ queryKey: ["meta-connections"] });
          }}
        />
      )}
    </div>
  );
}

function ConnectionCard({ c, onEdit }: { c: Conn; onEdit: () => void }) {
  const qc = useQueryClient();
  const testFn = useServerFn(testConnection);
  const healthFn = useServerFn(checkConnectionHealth);
  const syncFn = useServerFn(syncConnection);
  const importFn = useServerFn(importVisibleForConnection);
  const removeFn = useServerFn(removeConnection);
  const statusFn = useServerFn(getConnectionAccountsStatus);
  const matchFn = useServerFn(matchCheckConnection);
  const [busy, setBusy] = useState<string | null>(null);
  const [statusOpen, setStatusOpen] = useState(false);
  const [matchOpen, setMatchOpen] = useState(false);
  const [accounts, setAccounts] = useState<any[] | null>(null);
  const [matchResult, setMatchResult] = useState<any | null>(null);
  const [matchPreset, setMatchPreset] = useState("last_7d");

  const run = async (key: string, fn: () => Promise<any>, successMsg: (r: any) => string) => {
    setBusy(key);
    try {
      const r = await fn();
      toast.success(successMsg(r));
      qc.invalidateQueries({ queryKey: ["meta-connections"] });
    } catch (e: any) {
      toast.error(e?.message ?? "Failed");
    } finally {
      setBusy(null);
    }
  };

  const statusColor =
    c.token_status === "ok"
      ? "text-success"
      : c.token_status === "missing_scopes" || c.token_status === "expiring"
        ? "text-warning"
        : c.token_status === "invalid"
          ? "text-destructive"
          : "text-muted-foreground";

  return (
    <div className="rounded-lg border border-border bg-surface/60 p-4">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-semibold truncate">{c.label}</h3>
            {!c.is_active && (
              <span className="text-[10px] uppercase rounded bg-muted px-1.5 py-0.5">Disabled</span>
            )}
            <span className={`text-xs inline-flex items-center gap-1 ${statusColor}`}>
              <ShieldCheck className="size-3.5" />
              {c.token_status ?? "Not checked"}
            </span>
          </div>
          <div className="text-xs text-muted-foreground mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
            {c.fb_business_id && (
              <span>
                BM: <code className="text-foreground">{c.fb_business_id}</code>
              </span>
            )}
            {c.fb_app_id && (
              <span>
                App: <code className="text-foreground">{c.fb_app_id}</code>
              </span>
            )}
            <span>
              Token:{" "}
              {c.has_token ? (
                <span className="text-success">✓</span>
              ) : (
                <span className="text-destructive">missing</span>
              )}
            </span>
            <span>
              Ad accounts: <span className="text-foreground font-medium">{c.account_count}</span>
            </span>
            {c.token_user_name && (
              <span>
                System user: <span className="text-foreground">{c.token_user_name}</span>
              </span>
            )}
          </div>
          {c.token_error && (
            <div className="mt-2 text-xs text-destructive flex items-start gap-1">
              <AlertTriangle className="size-3.5 mt-0.5 shrink-0" /> {c.token_error}
            </div>
          )}
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            onClick={onEdit}
            className="rounded-md border border-border bg-surface px-2 py-1 text-xs hover:bg-surface-elevated inline-flex items-center gap-1"
          >
            <Pencil className="size-3" /> Edit
          </button>
          <button
            onClick={() => {
              if (confirm(`Remove "${c.label}"? Ad accounts will be unlinked but kept.`))
                run(
                  "remove",
                  () => removeFn({ data: { id: c.id } }),
                  () => "Connection removed",
                );
            }}
            disabled={busy === "remove"}
            className="rounded-md border border-destructive/30 bg-destructive/10 px-2 py-1 text-xs text-destructive hover:bg-destructive/20 inline-flex items-center gap-1 disabled:opacity-50"
          >
            <Trash2 className="size-3" /> Remove
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          onClick={() =>
            run(
              "health",
              () => healthFn({ data: { id: c.id } }),
              (r: any) =>
                `Status: ${r.status}${r.missing?.length ? " · missing " + r.missing.join(", ") : ""}`,
            )
          }
          disabled={!!busy || !c.has_token}
          className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface px-2.5 py-1.5 text-xs hover:bg-surface-elevated disabled:opacity-50"
        >
          {busy === "health" ? (
            <Loader2 className="size-3 animate-spin" />
          ) : (
            <RefreshCw className="size-3" />
          )}{" "}
          Check health
        </button>
        <button
          onClick={() =>
            run(
              "test",
              () => testFn({ data: { id: c.id } }),
              (r: any) =>
                r.ok
                  ? `Connected as ${r.user?.name} · ${r.accounts?.length ?? 0} ad accounts`
                  : (r.error ?? "Failed"),
            )
          }
          disabled={!!busy || !c.has_token}
          className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface px-2.5 py-1.5 text-xs hover:bg-surface-elevated disabled:opacity-50"
        >
          {busy === "test" ? (
            <Loader2 className="size-3 animate-spin" />
          ) : (
            <FlaskConical className="size-3" />
          )}{" "}
          Test
        </button>
        <button
          onClick={() =>
            run(
              "import",
              () => importFn({ data: { id: c.id } }),
              (r: any) => `Imported ${r.imported} ad accounts`,
            )
          }
          disabled={!!busy || !c.has_token}
          className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface px-2.5 py-1.5 text-xs hover:bg-surface-elevated disabled:opacity-50"
        >
          {busy === "import" ? (
            <Loader2 className="size-3 animate-spin" />
          ) : (
            <DownloadCloud className="size-3" />
          )}{" "}
          Import accounts
        </button>
        <button
          onClick={() =>
            run(
              "sync",
              () => syncFn({ data: { id: c.id } }),
              (r: any) => `Synced ${r.count} accounts`,
            )
          }
          disabled={!!busy || c.account_count === 0}
          className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface px-2.5 py-1.5 text-xs hover:bg-surface-elevated disabled:opacity-50"
        >
          {busy === "sync" ? (
            <Loader2 className="size-3 animate-spin" />
          ) : (
            <RotateCw className="size-3" />
          )}{" "}
          Sync now
        </button>
        <button
          onClick={async () => {
            const next = !statusOpen;
            setStatusOpen(next);
            if (next && !accounts) {
              setBusy("status");
              try {
                const r = await statusFn({ data: { id: c.id } });
                setAccounts(r as any);
              } catch (e: any) {
                toast.error(e?.message ?? "Failed");
              } finally {
                setBusy(null);
              }
            }
          }}
          disabled={c.account_count === 0}
          className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface px-2.5 py-1.5 text-xs hover:bg-surface-elevated disabled:opacity-50"
        >
          {busy === "status" ? (
            <Loader2 className="size-3 animate-spin" />
          ) : (
            <Activity className="size-3" />
          )}{" "}
          Sync status
        </button>
        <button
          onClick={async () => {
            setMatchOpen(true);
            setBusy("match");
            try {
              const r = await matchFn({ data: { id: c.id, date_preset: matchPreset as any } });
              setMatchResult(r);
            } catch (e: any) {
              toast.error(e?.message ?? "Failed");
              setMatchOpen(false);
            } finally {
              setBusy(null);
            }
          }}
          disabled={!!busy || !c.has_token || c.account_count === 0}
          className="inline-flex items-center gap-1.5 rounded-md border border-primary/30 bg-primary/10 px-2.5 py-1.5 text-xs text-primary hover:bg-primary/20 disabled:opacity-50"
        >
          {busy === "match" ? (
            <Loader2 className="size-3 animate-spin" />
          ) : (
            <GitCompare className="size-3" />
          )}{" "}
          Match check
        </button>
      </div>

      {statusOpen && (
        <div className="mt-3 rounded-md border border-border bg-surface/40 p-3">
          <div className="text-xs font-semibold mb-2 flex items-center gap-1.5">
            <Clock className="size-3.5" /> Real-time sync status
          </div>
          {!accounts ? (
            <div className="text-xs text-muted-foreground">Loading…</div>
          ) : accounts.length === 0 ? (
            <div className="text-xs text-muted-foreground">No ad accounts linked yet.</div>
          ) : (
            <div className="space-y-1.5">
              {accounts.map((a: any) => {
                const ok = a.last_sync_status === "ok" || a.last_sync_status === "success";
                const stale = a.last_sync_at
                  ? (Date.now() - new Date(a.last_sync_at).getTime()) / 60000
                  : null;
                return (
                  <div
                    key={a.id}
                    className="flex items-center justify-between gap-2 text-xs border-b border-border/40 last:border-0 pb-1.5 last:pb-0"
                  >
                    <div className="min-w-0">
                      <div className="truncate font-medium">
                        {a.account_name ?? a.fb_account_id}
                      </div>
                      <div className="text-muted-foreground text-[10px]">{a.fb_account_id}</div>
                    </div>
                    <div className="text-right shrink-0">
                      <div
                        className={
                          ok
                            ? "text-success"
                            : a.last_sync_status
                              ? "text-destructive"
                              : "text-muted-foreground"
                        }
                      >
                        {ok ? (
                          <CheckCircle2 className="size-3.5 inline" />
                        ) : a.last_sync_status ? (
                          <XCircle className="size-3.5 inline" />
                        ) : (
                          "—"
                        )}
                        <span className="ml-1">{a.last_sync_status ?? "never"}</span>
                      </div>
                      <div className="text-muted-foreground text-[10px]">
                        {a.last_sync_at ? `${stale!.toFixed(0)}m ago` : "—"}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {matchOpen && (
        <div className="mt-3 rounded-md border border-primary/30 bg-primary/5 p-3">
          <div className="flex items-center justify-between mb-2">
            <div className="text-xs font-semibold flex items-center gap-1.5">
              <GitCompare className="size-3.5" /> Match check — Ads Manager ↔ Local DB
            </div>
            <div className="flex items-center gap-2">
              <select
                value={matchPreset}
                onChange={async (e) => {
                  const p = e.target.value;
                  setMatchPreset(p);
                  setBusy("match");
                  try {
                    const r = await matchFn({ data: { id: c.id, date_preset: p as any } });
                    setMatchResult(r);
                  } catch (err: any) {
                    toast.error(err?.message ?? "Failed");
                  } finally {
                    setBusy(null);
                  }
                }}
                className="text-[10px] rounded bg-input border border-border px-1.5 py-0.5"
              >
                <option value="today">Today</option>
                <option value="yesterday">Yesterday</option>
                <option value="last_7d">Last 7d</option>
                <option value="last_30d">Last 30d</option>
                <option value="this_month">This month</option>
                <option value="last_month">Last month</option>
                <option value="maximum">Maximum</option>
              </select>
              <button
                onClick={() => {
                  setMatchOpen(false);
                  setMatchResult(null);
                }}
                className="rounded p-0.5 hover:bg-surface"
              >
                <X className="size-3.5" />
              </button>
            </div>
          </div>
          {busy === "match" || !matchResult ? (
            <div className="text-xs text-muted-foreground">Comparing…</div>
          ) : (
            <div className="space-y-1">
              <div className="grid grid-cols-12 text-[10px] uppercase text-muted-foreground border-b border-border pb-1">
                <div className="col-span-5">Account</div>
                <div className="col-span-2 text-right">Live spend</div>
                <div className="col-span-2 text-right">DB spend</div>
                <div className="col-span-2 text-right">Δ</div>
                <div className="col-span-1 text-right">OK</div>
              </div>
              {matchResult.results.map((r: any) => (
                <div
                  key={r.ad_account_id}
                  className="grid grid-cols-12 text-xs py-1 border-b border-border/30 last:border-0 items-center"
                >
                  <div className="col-span-5 truncate">{r.account_name ?? r.fb_account_id}</div>
                  <div className="col-span-2 text-right font-mono">
                    {r.live_spend.toFixed(2)} {r.currency ?? ""}
                  </div>
                  <div className="col-span-2 text-right font-mono">{r.db_spend.toFixed(2)}</div>
                  <div
                    className={`col-span-2 text-right font-mono ${Math.abs(r.diff_pct) < 1 ? "text-success" : "text-warning"}`}
                  >
                    {r.diff >= 0 ? "+" : ""}
                    {r.diff.toFixed(2)} ({r.diff_pct.toFixed(1)}%)
                  </div>
                  <div className="col-span-1 text-right">
                    {r.error ? (
                      <span title={r.error}>
                        <AlertTriangle className="size-3.5 text-destructive inline" />
                      </span>
                    ) : r.ok ? (
                      <CheckCircle2 className="size-3.5 text-success inline" />
                    ) : (
                      <XCircle className="size-3.5 text-warning inline" />
                    )}
                  </div>
                </div>
              ))}
              <div className="text-[10px] text-muted-foreground mt-2">
                Note: DB spend uses cumulative campaign spend (maximum window). "Maximum" preset is
                the most accurate 1:1 check; other presets show approximation until per-day storage
                is enabled.
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ConnectionForm({
  initial,
  onClose,
  onSaved,
}: {
  initial: Conn | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const saveFn = useServerFn(upsertConnection);
  const [label, setLabel] = useState(initial?.label ?? "");
  const [appId, setAppId] = useState(initial?.fb_app_id ?? "");
  const [appSecret, setAppSecret] = useState("");
  const [businessId, setBusinessId] = useState(initial?.fb_business_id ?? "");
  const [token, setToken] = useState("");
  const [active, setActive] = useState(initial?.is_active ?? true);
  const [saving, setSaving] = useState(false);

  const onSave = async () => {
    if (!label.trim()) {
      toast.error("Label is required");
      return;
    }
    setSaving(true);
    try {
      await saveFn({
        data: {
          id: initial?.id,
          label: label.trim(),
          fb_app_id: appId.trim() || null,
          fb_business_id: businessId.trim() || null,
          fb_app_secret: appSecret || null,
          fb_system_user_token: token || null,
          is_active: active,
        },
      });
      toast.success(initial ? "Connection updated" : "Connection added");
      onSaved();
    } catch (e: any) {
      toast.error(e?.message ?? "Save failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mt-4 rounded-lg border border-primary/30 bg-primary/5 p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-sm">
          {initial ? `Edit "${initial.label}"` : "Add Business Manager"}
        </h3>
        <button onClick={onClose} className="rounded-md p-1 hover:bg-surface">
          <X className="size-4" />
        </button>
      </div>
      <div className="grid sm:grid-cols-2 gap-3">
        <Field label="Label (your nickname for this BM)" required>
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="e.g. Main BM, Client X BM"
            className="w-full rounded-lg bg-input border border-border px-3 py-2 text-sm"
          />
        </Field>
        <Field label="Business Manager ID">
          <input
            value={businessId}
            onChange={(e) => setBusinessId(e.target.value)}
            placeholder="123456789"
            className="w-full rounded-lg bg-input border border-border px-3 py-2 text-sm"
          />
        </Field>
        <Field label="App ID">
          <input
            value={appId}
            onChange={(e) => setAppId(e.target.value)}
            placeholder="123456789"
            className="w-full rounded-lg bg-input border border-border px-3 py-2 text-sm"
          />
        </Field>
        <Field
          label={`App Secret ${initial?.has_app_secret ? "(saved — leave blank to keep)" : ""}`}
        >
          <input
            type="password"
            value={appSecret}
            onChange={(e) => setAppSecret(e.target.value)}
            placeholder={initial?.has_app_secret ? "••••••" : ""}
            className="w-full rounded-lg bg-input border border-border px-3 py-2 text-sm font-mono"
          />
        </Field>
        <Field
          label={`System User Access Token ${initial?.has_token ? "(saved — leave blank to keep)" : ""}`}
          className="sm:col-span-2"
        >
          <input
            type="password"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder={initial?.has_token ? "•••••••• (leave blank to keep current)" : "EAA…"}
            className="w-full rounded-lg bg-input border border-border px-3 py-2 text-sm font-mono"
          />
        </Field>
      </div>
      <div className="mt-3 flex items-center justify-between">
        <label className="inline-flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={active}
            onChange={(e) => setActive(e.target.checked)}
            className="size-4 accent-primary"
          />
          Active (include in auto-sync)
        </label>
        <button
          onClick={onSave}
          disabled={saving}
          className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-primary to-primary-glow text-primary-foreground px-4 py-2 text-sm font-semibold hover:opacity-90 disabled:opacity-50"
        >
          {saving ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <CheckCircle2 className="size-4" />
          )}{" "}
          Save
        </button>
      </div>
    </div>
  );
}

function Field({
  label,
  children,
  required,
  className,
}: {
  label: string;
  children: React.ReactNode;
  required?: boolean;
  className?: string;
}) {
  return (
    <div className={className}>
      <label className="text-xs font-medium block mb-1">
        {label} {required && <span className="text-destructive">*</span>}
      </label>
      {children}
    </div>
  );
}
