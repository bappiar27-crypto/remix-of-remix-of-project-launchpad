import {
  createFileRoute,
  Outlet,
  redirect,
  Link,
  useRouter,
  useLocation,
} from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { ensureBootstrapAdmin } from "@/lib/auth-bootstrap.functions";
import {
  LayoutDashboard,
  Megaphone,
  Layers,
  Image as ImageIcon,
  BarChart3,
  Users,
  FileText,
  Wallet,
  BellRing,
  Facebook,
  Settings,
  LogOut,
  Menu,
  X,
  Plus,
  Activity,
  UserCheck,

} from "lucide-react";
import { toast } from "sonner";
import { Logo } from "@/components/Logo";
import { useI18n } from "@/lib/i18n-context";
import { LiveClock } from "@/components/LiveClock";
import { ThemePicker, LanguageToggle, ModeToggle } from "@/components/HeaderControls";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });
    // Defense in depth: block non-approved users from anything inside /_authenticated.
    const { data: prof } = await supabase
      .from("profiles")
      .select("approval_status")
      .eq("id", data.user.id)
      .maybeSingle();
    if (!prof || prof.approval_status !== "approved") {
      await supabase.auth.signOut();
      throw redirect({ to: "/auth" });
    }
    return { user: data.user };
  },
  component: AuthedLayout,
});

const NAV_MAIN = [
  { to: "/dashboard", labelKey: "nav.dashboard", icon: LayoutDashboard },
  { to: "/campaigns", labelKey: "nav.campaigns", icon: Megaphone },
  { to: "/ad-sets", labelKey: "nav.adsets", icon: Layers },
  { to: "/ads", labelKey: "nav.ads", icon: ImageIcon },
  { to: "/insights", labelKey: "nav.insights", icon: BarChart3 },
] as const;

const NAV_MANAGEMENT = [
  { to: "/clients", labelKey: "nav.clients", icon: Users },
  { to: "/reports", labelKey: "nav.reports", icon: FileText },
  { to: "/budget-tracker", labelKey: "nav.budget", icon: Wallet },
  { to: "/alerts", labelKey: "nav.alerts", icon: BellRing },
] as const;

const NAV_SYSTEM = [
  { to: "/sync-activity", labelKey: "nav.sync", icon: Activity },
  { to: "/facebook-marketing-api", labelKey: "nav.fbapi", icon: Facebook },
  { to: "/settings", labelKey: "nav.settings", icon: Settings },
] as const;

function AuthedLayout() {
  const { t } = useI18n();
  const router = useRouter();
  const loc = useLocation();
  const ensureAdminFn = useServerFn(ensureBootstrapAdmin);
  const [open, setOpen] = useState(false);
  const [profile, setProfile] = useState<{ name: string; email: string; isAdmin: boolean }>({
    name: "",
    email: "",
    isAdmin: false,
  });
  const [accountsConnected, setAccountsConnected] = useState<number | null>(null);

  useEffect(() => {
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      await ensureAdminFn({ data: undefined as any });
      const [{ data: prof }, { data: roles }, { count }] = await Promise.all([
        supabase.from("profiles").select("full_name,email").eq("id", user.id).maybeSingle(),
        supabase.from("user_roles").select("role").eq("user_id", user.id),
        supabase
          .from("ad_accounts")
          .select("*", { count: "exact", head: true })
          .eq("is_active", true),
      ]);
      setProfile({
        name: prof?.full_name ?? user.email ?? "User",
        email: prof?.email ?? user.email ?? "",
        isAdmin: !!roles?.some((r) => r.role === "admin"),
      });
      setAccountsConnected(count ?? 0);
    })();
  }, [loc.pathname]);

  const signOut = async () => {
    await supabase.auth.signOut();
    toast.success("Signed out");
    router.navigate({ to: "/auth" });
  };

  const NavSection = ({
    title,
    items,
  }: {
    title: string;
    items: ReadonlyArray<{ to: string; labelKey: string; icon: any }>;
  }) => (
    <div className="px-3 mt-6 first:mt-0">
      <div className="px-3 text-[10px] tracking-[0.18em] uppercase text-muted-foreground/60 font-semibold mb-2">
        {title}
      </div>
      <nav className="space-y-1">
        {items.map(({ to, labelKey, icon: Icon }) => (
          <Link
            key={to}
            to={to}
            onClick={() => setOpen(false)}
            activeProps={{
              className: "bg-sidebar-accent text-sidebar-primary border-l-2 border-l-primary",
            }}
            inactiveProps={{
              className:
                "text-sidebar-foreground/80 hover:bg-sidebar-accent/60 border-l-2 border-l-transparent",
            }}
            className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition"
          >
            <Icon className="size-4" />
            {t(labelKey)}
          </Link>
        ))}
      </nav>
    </div>
  );

  return (
    <div className="min-h-screen flex">
      {/* Sidebar */}
      <aside
        className={`fixed lg:sticky top-0 left-0 z-30 h-screen w-72 bg-sidebar border-r border-sidebar-border flex flex-col transition-transform ${open ? "translate-x-0" : "-translate-x-full"} lg:translate-x-0`}
      >
        <div className="px-5 py-4 border-b border-sidebar-border flex items-center gap-3">
          <Logo className="h-10 w-auto" />
          <div className="flex-1">
            <div className="font-display font-bold text-sm">GrowVibe Ads Solution</div>
            <div className="text-[11px] text-muted-foreground truncate">
              {profile.email || "..."}
            </div>
          </div>
          <button onClick={() => setOpen(false)} className="lg:hidden text-muted-foreground">
            <X className="size-5" />
          </button>
        </div>
        <div className="px-5 py-3 border-b border-sidebar-border/60 flex items-center gap-3">
          <div className="size-9 rounded-full bg-gradient-to-br from-accent to-primary grid place-items-center font-bold text-sm">
            {(profile.name || "U").slice(0, 1).toUpperCase()}
          </div>
          <div className="text-sm">
            <div className="font-semibold leading-tight">{profile.name || t("user.default")}</div>
            <div className="text-[11px] text-muted-foreground">
              {profile.isAdmin ? t("role.admin") : t("role.member")}
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto py-2">
          <NavSection title={t("nav.main")} items={NAV_MAIN} />
          <NavSection title={t("nav.management")} items={NAV_MANAGEMENT} />
          <NavSection title={t("nav.system")} items={NAV_SYSTEM} />
          {profile.isAdmin && (
            <NavSection
              title="Admin"
              items={[
                { to: "/admin-approvals", labelKey: "User Approvals", icon: UserCheck },
              ]}
            />
          )}
        </div>

        <div className="border-t border-sidebar-border px-4 py-3 flex items-center gap-2 text-xs text-muted-foreground">
          <span
            className={`size-1.5 rounded-full ${accountsConnected ? "bg-success animate-pulse" : "bg-muted-foreground"}`}
          />
          {accountsConnected === null
            ? t("status.checking")
            : accountsConnected === 0
              ? t("status.noAccounts")
              : `${accountsConnected} ${t("status.live")}`}
        </div>
      </aside>

      {open && (
        <div onClick={() => setOpen(false)} className="lg:hidden fixed inset-0 bg-black/50 z-20" />
      )}

      {/* Main */}
      <div className="flex-1 min-w-0 flex flex-col">
        <header className="sticky top-0 z-10 bg-background/70 backdrop-blur-md border-b border-border/50">
          <div className="flex items-center justify-between gap-3 px-4 lg:px-6 py-3">
            <div className="flex items-center gap-3 min-w-0">
              <button
                onClick={() => setOpen(true)}
                className="lg:hidden p-2 rounded-lg hover:bg-surface"
              >
                <Menu className="size-5" />
              </button>
              <div className="flex items-center gap-2 min-w-0">
                <Logo className="h-7 w-auto shrink-0" />
                <span className="font-semibold text-sm truncate hidden sm:inline">
                  GrowVibe Ads Solution
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <LiveClock />
              <ModeToggle />
              <LanguageToggle />
              <ThemePicker />
              <Link
                to="/clients"
                className="hidden md:inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-primary to-primary-glow text-primary-foreground px-3 py-1.5 text-xs font-semibold hover:opacity-90"
              >
                <Plus className="size-3.5" /> {t("header.newClient")}
              </Link>
              <button
                onClick={signOut}
                className="inline-flex items-center gap-2 rounded-lg border border-border bg-surface hover:bg-surface-elevated px-3 py-1.5 text-xs font-medium"
              >
                <LogOut className="size-3.5" />{" "}
                <span className="hidden sm:inline">{t("header.logout")}</span>
              </button>
            </div>
          </div>
        </header>
        <main className="flex-1 p-4 lg:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
