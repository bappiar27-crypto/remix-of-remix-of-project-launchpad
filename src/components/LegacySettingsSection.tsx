import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  getSettingsPublic, saveSettings, testFbToken, importVisibleAdAccounts,
  checkTokenHealthNow, detectBusinessesFromToken,
} from "@/lib/fb/admin.functions";
import {
  Archive, Save, Loader2, FlaskConical, DownloadCloud, ShieldCheck, ChevronDown, ChevronUp, Building2,
} from "lucide-react";

// Legacy single-Business-Manager configuration.
export function LegacySettingsSection() {
  const qc = useQueryClient();
  const getFn = useServerFn(getSettingsPublic);
  const saveFn = useServerFn(saveSettings);
  const testFn = useServerFn(testFbToken);
  const importFn = useServerFn(importVisibleAdAccounts);
  const healthFn = useServerFn(checkTokenHealthNow);
  const detectFn = useServerFn(detectBusinessesFromToken);

  const { data: s } = useQuery({ queryKey: ["settings"], queryFn: () => getFn({ data: undefined as any }) });

  const [open, setOpen] = useState(false);
  const [token, setToken] = useState("");
  const [appId, setAppId] = useState("");
  const [appSecret, setAppSecret] = useState("");
  const [businessId, setBusinessId] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [businesses, setBusinesses] = useState<Array<{ id: string; name: string }>>([]);

  useEffect(() => {
    if (s) { setAppId(s.fb_app_id ?? ""); setBusinessId(s.fb_business_id ?? ""); }
  }, [s]);

  // Properly distinguishes success vs failure — no more generic "Ad account not found" toast.
  const run = async (
    key: string,
    fn: () => Promise<any>,
    successMsg: (r: any) => string,
  ) => {
    setBusy(key);
    try {
      const r = await fn();
      // Server functions often return { ok: false, error: "..." } instead of throwing
      if (r && typeof r === "object" && "ok" in r && r.ok === false) {
        const errMsg = (r as any).error ?? `${key} failed`;
        console.error(`[LegacySettings:${key}] returned not-ok`, r);
        toast.error(errMsg, { duration: 10000 });
        return r;
      }
      toast.success(successMsg(r));
      qc.invalidateQueries({ queryKey: ["settings"] });
      return r;
    } catch (e: any) {
      console.error(`[LegacySettings:${key}] exception`, e);
      toast.error(e?.message ?? `${key} failed`, { duration: 10000 });
    } finally {
      setBusy(null);
    }
  };

  const onSave = () => run("save", () => saveFn({ data: {
    token: token || undefined, fb_app_id: appId, fb_business_id: businessId,
    fb_app_secret: appSecret || undefined,
  }}), () => "Legacy settings saved");

  const onDetect = async () => {
    const r = await run("detect", () => detectFn({ data: undefined as any }),
      (r) => `Found ${r?.businesses?.length ?? 0} BM(s)`);
    if (r?.businesses) setBusinesses(r.businesses);
  };

  return (
    <div className="glass-card p-6">
      <button onClick={() => setOpen(!open)} className="flex items-center justify-between w-full text-left">
        <div className="flex items-center gap-2">
          <Archive className="size-5 text-muted-foreground" />
          <h2 className="font-semibold text-lg">Legacy single Business Manager</h2>
          <span className="text-[10px] uppercase rounded bg-muted px-1.5 py-0.5 text-muted-foreground">Legacy</span>
          {s?.has_token && <span className="text-xs text-success">● configured</span>}
        </div>
        {open ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
      </button>

      {open && (
        <div className="mt-4 space-y-4">
          <p className="text-xs text-muted-foreground">
            পুরানো single-BM setup এখনো কাজ করছে। নতুন BM যোগ করতে চাইলে উপরের "Business Managers" section ব্যবহার করুন — multi-BM সবসময় সঠিক token দিয়ে sync করবে।
          </p>

          <div className="grid sm:grid-cols-2 gap-3">
            <Field label="App ID">
              <input value={appId} onChange={(e) => setAppId(e.target.value)} className="w-full rounded-lg bg-input border border-border px-3 py-2 text-sm" />
            </Field>
            <Field label="Business Manager ID">
              <div className="flex gap-2">
                <input value={businessId} onChange={(e) => setBusinessId(e.target.value)} className="flex-1 rounded-lg bg-input border border-border px-3 py-2 text-sm" />
                <button onClick={onDetect} disabled={!!busy} className="rounded-md border border-border bg-surface px-2 text-xs hover:bg-surface-elevated disabled:opacity-50 inline-flex items-center gap-1">
                  {busy === "detect" ? <Loader2 className="size-3 animate-spin" /> : <Building2 className="size-3" />} Detect
                </button>
              </div>
              {businesses.length > 0 && (
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {businesses.map(b => (
                    <button key={b.id} onClick={() => setBusinessId(b.id)} className="text-[10px] rounded border border-border px-1.5 py-0.5 hover:bg-surface-elevated">
                      {b.name} <code className="opacity-60">({b.id})</code>
                    </button>
                  ))}
                </div>
              )}
            </Field>
            <Field label={`App Secret ${s?.has_app_secret ? "(saved — leave blank to keep)" : ""}`}>
              <input type="password" value={appSecret} onChange={(e) => setAppSecret(e.target.value)} placeholder={s?.has_app_secret ? "••••••" : ""} className="w-full rounded-lg bg-input border border-border px-3 py-2 text-sm font-mono" />
            </Field>
            <Field label={`System User Token ${s?.has_token ? "(saved — leave blank to keep)" : ""}`}>
              <input type="password" value={token} onChange={(e) => setToken(e.target.value)} placeholder={s?.has_token ? "•••••••• (leave blank to keep)" : "EAA…"} className="w-full rounded-lg bg-input border border-border px-3 py-2 text-sm font-mono" />
            </Field>
          </div>

          {s?.token_status && (
            <div className="text-xs flex items-center gap-2 text-muted-foreground">
              <ShieldCheck className="size-3.5" />
              Token status: <span className={s.token_status === "ok" ? "text-success" : "text-warning"}>{s.token_status}</span>
              {s.token_user_name && <>· user: <span className="text-foreground">{s.token_user_name}</span></>}
              {s.token_checked_at && <>· checked: <span className="text-foreground">{new Date(s.token_checked_at).toLocaleString()}</span></>}
            </div>
          )}

          <div className="flex flex-wrap gap-2 pt-2">
            <button onClick={onSave} disabled={!!busy} className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-primary to-primary-glow text-primary-foreground px-4 py-2 text-sm font-semibold hover:opacity-90 disabled:opacity-50">
              {busy === "save" ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />} Save
            </button>
            <button onClick={() => run("test", () => testFn({ data: undefined as any }),
                (r) => `Connected · ${r?.accounts?.length ?? 0} ad accounts`)}
              disabled={!!busy} className="inline-flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-sm hover:bg-surface-elevated disabled:opacity-50">
              {busy === "test" ? <Loader2 className="size-4 animate-spin" /> : <FlaskConical className="size-4" />} Test
            </button>
            <button onClick={() => run("health", () => healthFn({ data: undefined as any }),
                (r) => `Status: ${r?.status}`)}
              disabled={!!busy} className="inline-flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-sm hover:bg-surface-elevated disabled:opacity-50">
              {busy === "health" ? <Loader2 className="size-4 animate-spin" /> : <ShieldCheck className="size-4" />} Check health
            </button>
            <button onClick={() => run("import", () => importFn({ data: undefined as any }),
                (r) => `Imported ${r?.imported ?? 0} accounts`)}
              disabled={!!busy} className="inline-flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-sm hover:bg-surface-elevated disabled:opacity-50">
              {busy === "import" ? <Loader2 className="size-4 animate-spin" /> : <DownloadCloud className="size-4" />} Import & sync
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-xs font-medium block mb-1">{label}</label>
      {children}
    </div>
  );
}
