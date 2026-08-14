import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import {
  getSettingsPublic,
  saveOrgInfo,
  saveBranding,
  savePreferences,
  updateMyProfile,
  clearAllData,
  clearSyncedData,
} from "@/lib/fb/admin.functions";
import { toast } from "sonner";
import {
  Building2,
  UserCog,
  Palette,
  Sliders,
  AlertTriangle,
  Save,
  Loader2,
  Upload,
  Lock,
  RefreshCw,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({ meta: [{ title: "Settings — GrowVibe Ads Solution" }] }),
  component: SettingsPage,
});

const TIMEZONES = [
  "Asia/Dhaka",
  "Asia/Kolkata",
  "Asia/Karachi",
  "Asia/Dubai",
  "Europe/London",
  "America/New_York",
  "America/Los_Angeles",
  "UTC",
];
const CURRENCIES = ["USD ($)", "EUR (€)", "GBP (£)", "BDT (৳)", "INR (₹)", "AED (د.إ)"];
const LANGUAGES = ["English", "বাংলা", "हिन्दी", "العربية", "Español"];
const ATTRIBUTION = ["1 Day Click", "7 Day Click", "28 Day Click", "1 Day View", "7 Day View"];

function SettingsPage() {
  const qc = useQueryClient();
  const getFn = useServerFn(getSettingsPublic);
  const saveOrgFn = useServerFn(saveOrgInfo);
  const saveBrandFn = useServerFn(saveBranding);
  const savePrefFn = useServerFn(savePreferences);
  const updateProfileFn = useServerFn(updateMyProfile);
  const clearFn = useServerFn(clearAllData);
  const clearSyncedFn = useServerFn(clearSyncedData);

  const { data: settings } = useQuery({
    queryKey: ["settings"],
    queryFn: () => getFn({ data: undefined as any }),
  });

  // --- Org ---
  const [orgName, setOrgName] = useState("");
  const [orgEmail, setOrgEmail] = useState("");
  const [orgPhone, setOrgPhone] = useState("");
  const [orgAddress, setOrgAddress] = useState("");
  const [savingOrg, setSavingOrg] = useState(false);

  // --- Profile ---
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);

  // --- Branding ---
  const [logoUrl, setLogoUrl] = useState("");
  const [primary, setPrimary] = useState("#1F2240");
  const [secondary, setSecondary] = useState("#8B5CF6");
  const [savingBrand, setSavingBrand] = useState(false);

  // --- Preferences ---
  const [tz, setTz] = useState("Asia/Dhaka");
  const [currency, setCurrency] = useState("USD ($)");
  const [language, setLanguage] = useState("English");
  const [attribution, setAttribution] = useState("28 Day Click");
  const [savingPref, setSavingPref] = useState(false);

  // --- Danger ---
  const [confirmText, setConfirmText] = useState("");
  const [clearing, setClearing] = useState(false);
  const [clearingSynced, setClearingSynced] = useState(false);

  useEffect(() => {
    if (settings) {
      setOrgName(settings.org_name ?? "");
      setOrgEmail(settings.org_email ?? "");
      setOrgPhone(settings.org_phone ?? "");
      setOrgAddress(settings.org_address ?? "");
      setLogoUrl(settings.brand_logo_url ?? "");
      setPrimary(settings.brand_primary_color ?? "#1F2240");
      setSecondary(settings.brand_secondary_color ?? "#8B5CF6");
      setTz(settings.pref_timezone ?? "Asia/Dhaka");
      setCurrency(settings.pref_currency ?? "USD ($)");
      setLanguage(settings.pref_language ?? "English");
      setAttribution(settings.pref_attribution_window ?? "28 Day Click");
    }
  }, [settings]);

  useEffect(() => {
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      setEmail(user.email ?? "");
      const { data: prof } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("id", user.id)
        .maybeSingle();
      setName(prof?.full_name ?? "");
    })();
  }, []);

  const onSaveOrg = async () => {
    setSavingOrg(true);
    try {
      await saveOrgFn({
        data: {
          org_name: orgName,
          org_email: orgEmail,
          org_phone: orgPhone,
          org_address: orgAddress,
        },
      });
      toast.success("Organization info saved");
      qc.invalidateQueries({ queryKey: ["settings"] });
    } catch (e: any) {
      toast.error(e?.message ?? "Save failed");
    } finally {
      setSavingOrg(false);
    }
  };

  const onSaveProfile = async () => {
    if (newPw && newPw !== confirmPw) {
      toast.error("Passwords do not match");
      return;
    }
    if (newPw && newPw.length < 8) {
      toast.error("Password must be at least 8 characters");
      return;
    }
    setSavingProfile(true);
    try {
      await updateProfileFn({
        data: {
          full_name: name,
          new_password: newPw || undefined,
          current_password: currentPw || undefined,
        },
      });
      toast.success("Profile updated");
      setCurrentPw("");
      setNewPw("");
      setConfirmPw("");
    } catch (e: any) {
      toast.error(e?.message ?? "Update failed");
    } finally {
      setSavingProfile(false);
    }
  };

  const onSaveBrand = async () => {
    setSavingBrand(true);
    try {
      await saveBrandFn({
        data: {
          brand_logo_url: logoUrl,
          brand_primary_color: primary,
          brand_secondary_color: secondary,
        },
      });
      toast.success("Branding saved");
      qc.invalidateQueries({ queryKey: ["settings"] });
    } catch (e: any) {
      toast.error(e?.message ?? "Save failed");
    } finally {
      setSavingBrand(false);
    }
  };

  const onSavePref = async () => {
    setSavingPref(true);
    try {
      await savePrefFn({
        data: {
          pref_timezone: tz,
          pref_currency: currency,
          pref_language: language,
          pref_attribution_window: attribution,
        },
      });
      toast.success("Preferences saved");
      qc.invalidateQueries({ queryKey: ["settings"] });
    } catch (e: any) {
      toast.error(e?.message ?? "Save failed");
    } finally {
      setSavingPref(false);
    }
  };

  const onClearSynced = async () => {
    if (!confirm("Clear all synced campaigns, ad sets, ads, insights & logs?\n\nFacebook connection and saved clients will be kept.")) {
      return;
    }
    setClearingSynced(true);
    try {
      await clearSyncedFn({ data: undefined as any });
      toast.success("Synced data cleared — run a fresh sync to repopulate");
      qc.invalidateQueries();
    } catch (e: any) {
      toast.error(e?.message ?? "Clear failed");
    } finally {
      setClearingSynced(false);
    }
  };

  const onClearAll = async () => {
    if (confirmText !== "FULL RESET") {
      toast.error('Type "FULL RESET" exactly to confirm');
      return;
    }
    setClearing(true);
    try {
      await clearFn({ data: { confirm: "FULL RESET" } });
      toast.success("Full reset complete — reconnect Facebook to start over");
      setConfirmText("");
      qc.invalidateQueries();
    } catch (e: any) {
      toast.error(e?.message ?? "Reset failed");
    } finally {
      setClearing(false);
    }
  };

  return (
    <div className="max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-muted-foreground text-sm">
          Manage organization details, profile, branding, preferences, and data.
        </p>
      </div>

      {/* General Information */}
      <Section icon={Building2} title="General Information">
        <Grid>
          <Field label="Organization Name">
            <input
              value={orgName}
              onChange={(e) => setOrgName(e.target.value)}
              placeholder="Enter organization name"
              className={inputCls}
            />
          </Field>
          <div />
          <Field label="Email">
            <input
              type="email"
              value={orgEmail}
              onChange={(e) => setOrgEmail(e.target.value)}
              placeholder="sales@example.com"
              className={inputCls}
            />
          </Field>
          <Field label="Phone">
            <input
              value={orgPhone}
              onChange={(e) => setOrgPhone(e.target.value)}
              placeholder="+8801XXXXXXXXX"
              className={inputCls}
            />
          </Field>
        </Grid>
        <Field label="Address" className="mt-4">
          <textarea
            value={orgAddress}
            onChange={(e) => setOrgAddress(e.target.value)}
            placeholder="Your business address"
            rows={3}
            className={inputCls + " resize-y"}
          />
        </Field>
        <FooterButton onClick={onSaveOrg} loading={savingOrg} label="Save Changes" />
      </Section>

      {/* Your Profile */}
      <Section icon={UserCog} title="Your Profile">
        <Grid>
          <Field label="Name">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your name"
              className={inputCls}
            />
          </Field>
          <Field label="Email Address">
            <input value={email} disabled className={inputCls + " opacity-60 cursor-not-allowed"} />
          </Field>
        </Grid>

        <div className="mt-6">
          <div className="flex items-center gap-2 text-sm font-semibold mb-3">
            <Lock className="size-4 text-primary" />
            Change Password
          </div>
          <Field label="Current Password">
            <input
              type="password"
              value={currentPw}
              onChange={(e) => setCurrentPw(e.target.value)}
              placeholder="Required only if changing password"
              className={inputCls}
            />
          </Field>
          <Grid className="mt-4">
            <Field label="New Password">
              <input
                type="password"
                value={newPw}
                onChange={(e) => setNewPw(e.target.value)}
                placeholder="Min 8 characters"
                className={inputCls}
              />
            </Field>
            <Field label="Confirm Password">
              <input
                type="password"
                value={confirmPw}
                onChange={(e) => setConfirmPw(e.target.value)}
                placeholder="Repeat new password"
                className={inputCls}
              />
            </Field>
          </Grid>
        </div>
        <FooterButton onClick={onSaveProfile} loading={savingProfile} label="Update Profile" />
      </Section>

      {/* Branding */}
      <Section icon={Palette} title="Branding">
        <Field label="Logo">
          <div className="flex items-center gap-3">
            <div className="size-12 rounded-md bg-surface border border-border grid place-items-center overflow-hidden">
              {logoUrl ? (
                <img src={logoUrl} alt="logo" className="size-full object-contain" />
              ) : (
                <Palette className="size-5 text-muted-foreground" />
              )}
            </div>
            <input
              value={logoUrl}
              onChange={(e) => setLogoUrl(e.target.value)}
              placeholder="https://… (paste a logo URL)"
              className={inputCls + " flex-1"}
            />
            <button
              type="button"
              onClick={() => toast.info("Paste a hosted image URL above")}
              className="inline-flex items-center gap-2 rounded-lg border border-border bg-surface hover:bg-surface-elevated px-3 py-2 text-xs font-semibold"
            >
              <Upload className="size-3.5" /> Upload new logo
            </button>
          </div>
        </Field>
        <Grid className="mt-4">
          <Field label="Primary Color">
            <ColorInput value={primary} onChange={setPrimary} />
          </Field>
          <Field label="Secondary Color">
            <ColorInput value={secondary} onChange={setSecondary} />
          </Field>
        </Grid>
        <FooterButton onClick={onSaveBrand} loading={savingBrand} label="Save Branding" />
      </Section>

      {/* Preferences */}
      <Section icon={Sliders} title="Preferences">
        <Grid>
          <Field label="Timezone">
            <select value={tz} onChange={(e) => setTz(e.target.value)} className={inputCls}>
              {TIMEZONES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Currency">
            <select
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              className={inputCls}
            >
              {CURRENCIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Language">
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              className={inputCls}
            >
              {LANGUAGES.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Attribution Window">
            <select
              value={attribution}
              onChange={(e) => setAttribution(e.target.value)}
              className={inputCls}
            >
              {ATTRIBUTION.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </Field>
        </Grid>
        <FooterButton onClick={onSavePref} loading={savingPref} label="Save Preferences" />
      </Section>

      {/* Danger Zone — Clear Synced Data (soft refresh) */}
      <div className="rounded-xl border border-amber-500/40 bg-amber-500/5 p-6">
        <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400 font-semibold mb-2">
          <RefreshCw className="size-5" /> Clear Synced Data
        </div>
        <p className="text-sm">
          Wipes Facebook-synced numbers so the next sync rebuilds them from scratch. Safe to use any
          time you suspect stale or wrong figures.
        </p>
        <ul className="mt-3 space-y-1 text-sm list-disc list-inside text-foreground/85">
          <li>All <strong>Campaigns, Ad Sets, Ads</strong></li>
          <li>All <strong>Insights snapshots</strong> & dashboard cached totals</li>
          <li>All <strong>Alerts</strong>, <strong>Sync Logs</strong>, webhook events</li>
        </ul>
        <p className="mt-3 text-sm text-foreground/90">
          <strong>Kept:</strong> Facebook connection (token, BM ID), saved Clients & client-campaign
          assignments, Ad Account list, organization info & preferences.
        </p>
        <div className="mt-4">
          <button
            onClick={onClearSynced}
            disabled={clearingSynced}
            className="inline-flex items-center gap-2 rounded-lg bg-amber-500 text-white px-4 py-2.5 text-sm font-semibold hover:opacity-90 disabled:opacity-50"
          >
            {clearingSynced ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <RefreshCw className="size-4" />
            )}{" "}
            Clear Synced Data
          </button>
        </div>
      </div>

      {/* Danger Zone — Full Reset */}
      <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-6">
        <div className="flex items-center gap-2 text-destructive font-semibold mb-2">
          <AlertTriangle className="size-5" /> Danger Zone — Full Reset
        </div>
        <p className="text-sm">
          This will <strong>permanently delete EVERYTHING</strong> and require you to reconnect
          Facebook from scratch:
        </p>
        <ul className="mt-3 space-y-1 text-sm list-disc list-inside text-foreground/85">
          <li>All <strong>Clients</strong> & client portals</li>
          <li>All <strong>Ad Accounts</strong> (Meta + manual)</li>
          <li>All <strong>Campaigns</strong>, <strong>Ad Sets</strong>, <strong>Ads</strong></li>
          <li>All <strong>Insights</strong>, <strong>Reports</strong>, cached totals</li>
          <li>All <strong>Alerts</strong> & activity logs</li>
          <li>
            <strong>Facebook access token, Business Manager ID, App ID & App Secret</strong>
          </li>
          <li>All <strong>Meta connections</strong> & account mappings</li>
        </ul>
        <p className="mt-3 text-sm text-foreground/90">
          <strong>Kept:</strong> your admin login, organization info, branding & preferences.
        </p>
        <p className="mt-4 text-xs text-muted-foreground">
          This action cannot be undone. You will need to reconnect Facebook via OAuth afterwards.
        </p>

        <div className="mt-4 flex flex-col sm:flex-row sm:items-center gap-3">
          <input
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder='Type "FULL RESET" to confirm'
            className={inputCls + " sm:max-w-xs"}
          />
          <button
            onClick={onClearAll}
            disabled={clearing || confirmText !== "FULL RESET"}
            className="inline-flex items-center gap-2 rounded-lg bg-destructive text-destructive-foreground px-4 py-2.5 text-sm font-semibold hover:opacity-90 disabled:opacity-50"
          >
            {clearing ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <AlertTriangle className="size-4" />
            )}{" "}
            Full Reset
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---------- helpers ---------- */
const inputCls = "w-full rounded-lg bg-input border border-border px-3 py-2.5 text-sm";

function Section({
  icon: Icon,
  title,
  children,
}: {
  icon: any;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="glass-card p-6">
      <div className="flex items-center gap-2 mb-4">
        <Icon className="size-5 text-primary" />
        <h2 className="font-semibold text-lg">{title}</h2>
      </div>
      {children}
    </div>
  );
}

function Grid({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`grid sm:grid-cols-2 gap-4 ${className}`}>{children}</div>;
}

function Field({
  label,
  children,
  className = "",
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </label>
      <div className="mt-1.5">{children}</div>
    </div>
  );
}

function ColorInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex items-center gap-2">
      <input
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="size-10 rounded-md border border-border bg-input cursor-pointer"
      />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={inputCls + " flex-1 font-mono"}
      />
    </div>
  );
}

function FooterButton({
  onClick,
  loading,
  label,
}: {
  onClick: () => void;
  loading: boolean;
  label: string;
}) {
  return (
    <div className="mt-5 flex justify-end">
      <button
        onClick={onClick}
        disabled={loading}
        className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-primary to-primary-glow text-primary-foreground px-4 py-2.5 text-sm font-semibold hover:opacity-90 disabled:opacity-50"
      >
        {loading ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}{" "}
        {label}
      </button>
    </div>
  );
}