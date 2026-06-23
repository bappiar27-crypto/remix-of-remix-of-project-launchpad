import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getSettingsPublic, saveSettings } from "@/lib/fb/admin.functions";
import { toast } from "sonner";
import { Save, Loader2, Info, ExternalLink, ListChecks } from "lucide-react";
import { BusinessManagersSection } from "@/components/BusinessManagersSection";
import { LegacySettingsSection } from "@/components/LegacySettingsSection";

export const Route = createFileRoute("/_authenticated/facebook-marketing-api")({
  head: () => ({ meta: [{ title: "Facebook Marketing API — GrowVibe Ads Solution" }] }),
  component: SettingsPage,
});

const CHECKLIST_STEPS = [
  "Business Settings → Users → System Users → আপনার system user select করুন।",
  "Add Assets → Ad Accounts → যেই ad account গুলো track করতে চান সেগুলো tick দিন।",
  "প্রতিটা ad account-এ Full Control toggle on করে Save Changes দিন।",
  'এর পর উপরের Business Manager card-এ "Test" → "Import accounts" → "Sync now" চাপুন।',
] as const;

function SettingsPage() {
  const qc = useQueryClient();
  const getFn = useServerFn(getSettingsPublic);
  const saveFn = useServerFn(saveSettings);

  const { data: settings } = useQuery({
    queryKey: ["settings"],
    queryFn: () => getFn({ data: undefined as any }),
  });

  const [interval, setInterval] = useState(5);
  const [autoSync, setAutoSync] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (settings) {
      setInterval(settings.sync_interval_minutes ?? 5);
      setAutoSync(settings.auto_sync_enabled ?? true);
    }
  }, [settings]);

  const onSaveSync = async () => {
    setSaving(true);
    try {
      await saveFn({ data: { sync_interval_minutes: interval, auto_sync_enabled: autoSync } });
      toast.success("Auto-sync settings saved");
      qc.invalidateQueries({ queryKey: ["settings"] });
    } catch (e: any) {
      toast.error(e?.message ?? "Save failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Facebook Marketing API</h1>
        <p className="text-muted-foreground text-sm">
          একাধিক Business Manager connect করুন। প্রতিটা ad account সবসময় তার নিজের BM-এর token
          দিয়েই sync হবে — Ads Manager-এর সাথে data 100% match থাকবে।
        </p>
      </div>

      {/* Multiple Business Managers — recommended path */}
      <BusinessManagersSection />

      {/* Legacy single-BM (kept available, collapsed by default) */}
      <LegacySettingsSection />

      {/* How-to */}
      <div className="glass-card p-6">
        <div className="flex items-center gap-2 mb-3">
          <Info className="size-5 text-primary" />
          <h2 className="font-semibold text-lg">System User Token কোথা থেকে পাবেন</h2>
        </div>
        <ol className="space-y-1.5 list-decimal list-inside text-sm text-muted-foreground">
          <li>
            <a
              className="text-primary underline inline-flex items-center gap-1"
              href="https://business.facebook.com/settings/system-users"
              target="_blank"
              rel="noreferrer"
            >
              Meta Business Settings → System Users <ExternalLink className="size-3" />
            </a>{" "}
            open করুন।
          </li>
          <li>
            একটা System User add করুন <strong>Admin</strong> access সহ। ad account গুলো assign করুন।
          </li>
          <li>
            <strong>Generate New Token</strong> → আপনার app select করুন → scopes:{" "}
            <code className="bg-input px-1.5 py-0.5 rounded">ads_read</code>,{" "}
            <code className="bg-input px-1.5 py-0.5 rounded">ads_management</code>,{" "}
            <code className="bg-input px-1.5 py-0.5 rounded">business_management</code>
          </li>
          <li>
            Token expiry <strong>Never</strong> দিন, copy করে উপরের "Add Business Manager" form-এ
            paste করুন।
          </li>
        </ol>
      </div>

      {/* Asset checklist */}
      <div className="glass-card p-6">
        <div className="flex items-center gap-2 mb-3">
          <ListChecks className="size-5 text-primary" />
          <h2 className="font-semibold text-lg">Ad account assign করার পর checklist</h2>
        </div>
        <ul className="space-y-2">
          {CHECKLIST_STEPS.map((s, i) => (
            <li
              key={i}
              className="flex items-start gap-3 rounded-lg border border-border/50 bg-surface/60 px-3 py-2 text-sm"
            >
              <span className="font-semibold text-primary">{i + 1}.</span>
              <span>{s}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* Sync config */}
      <div className="glass-card p-6">
        <h2 className="font-semibold text-lg mb-3">Auto-sync</h2>
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className="text-sm font-medium">Sync frequency</label>
            <div className="mt-1.5 flex gap-2">
              <select
                value={
                  [5, 15, 30, 60, 180, 360, 720, 1440].includes(interval)
                    ? String(interval)
                    : "custom"
                }
                onChange={(e) => {
                  if (e.target.value !== "custom") setInterval(Number(e.target.value));
                }}
                className="flex-1 rounded-lg bg-input border border-border px-3 py-2 text-sm"
              >
                <option value="5">Every 5 minutes</option>
                <option value="15">Every 15 minutes</option>
                <option value="30">Every 30 minutes</option>
                <option value="60">Hourly</option>
                <option value="180">Every 3 hours</option>
                <option value="360">Every 6 hours</option>
                <option value="720">Every 12 hours</option>
                <option value="1440">Daily</option>
                <option value="custom">Custom (minutes)…</option>
              </select>
              <input
                type="number"
                min={1}
                max={1440}
                value={interval}
                onChange={(e) => setInterval(Number(e.target.value))}
                className="w-24 rounded-lg bg-input border border-border px-3 py-2 text-sm"
              />
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Facebook updates insights every 15–60 min. Custom range: 1–1440 minutes.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <input
              id="auto"
              type="checkbox"
              checked={autoSync}
              onChange={(e) => setAutoSync(e.target.checked)}
              className="size-4 accent-primary"
            />
            <label htmlFor="auto" className="text-sm">
              Enable scheduled auto-sync
            </label>
          </div>
        </div>
        <button
          onClick={onSaveSync}
          disabled={saving}
          className="mt-4 inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-primary to-primary-glow text-primary-foreground px-4 py-2.5 text-sm font-semibold hover:opacity-90 disabled:opacity-50"
        >
          {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />} Save
          auto-sync
        </button>
      </div>
    </div>
  );
}
