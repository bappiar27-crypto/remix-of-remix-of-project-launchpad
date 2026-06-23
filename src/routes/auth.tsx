import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { ensureBootstrapAdmin } from "@/lib/auth-bootstrap.functions";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { Logo } from "@/components/Logo";

export const Route = createFileRoute("/auth")({
  head: () => ({ meta: [{ title: "Sign in — GrowVibe Ads Solution" }] }),
  component: AuthPage,
});

function AuthPage() {
  const nav = useNavigate();
  const ensureAdminFn = useServerFn(ensureBootstrapAdmin);
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        ensureAdminFn({ data: undefined as any }).finally(() => nav({ to: "/dashboard" }));
      }
    });
  }, [nav]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { full_name: fullName },
            emailRedirectTo: window.location.origin + "/dashboard",
          },
        });
        if (error) throw error;
        toast.success("Account created — signing in…");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
      await ensureAdminFn({ data: undefined as any });
      nav({ to: "/dashboard" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Authentication failed");
    } finally {
      setLoading(false);
    }
  };

  const onGoogle = async () => {
    setLoading(true);
    const res = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: window.location.origin + "/dashboard",
    });
    if (res.error) {
      toast.error(res.error.message ?? "Google sign-in failed");
      setLoading(false);
      return;
    }
    if (res.redirected) return;
    nav({ to: "/dashboard" });
  };

  return (
    <div className="min-h-screen grid lg:grid-cols-2">
      <div className="hidden lg:flex flex-col justify-between p-12 hero-panel m-6 rounded-3xl">
        <div className="flex items-center gap-3">
          <Logo className="h-12 w-auto" />
          <span className="font-display font-bold text-lg">GrowVibe Ads Solution</span>
        </div>
        <div>
          <h2 className="text-4xl font-bold leading-tight">
            Welcome to your <span className="gradient-text">Command Center</span>
          </h2>
          <p className="text-muted-foreground mt-4 max-w-md">
            Track every campaign, every client, every dollar — all in real time.
          </p>
        </div>
        <div className="text-xs text-muted-foreground">
          © {new Date().getFullYear()} GrowVibe Ads Solution
        </div>
      </div>

      <div className="flex items-center justify-center p-6">
        <div className="w-full max-w-md glass-card p-8 gv-fade-up">
          <div className="flex flex-col items-center justify-center gap-2 mb-5">
            <Logo className="h-14 w-auto" />
            <div className="font-display font-extrabold text-xl tracking-tight gradient-text">
              GrowVibe Ads Solution
            </div>
          </div>
          <h1 className="text-2xl font-bold text-center">
            {mode === "signin" ? "Sign in" : "Create account"}
          </h1>
          <p className="text-sm text-muted-foreground mt-1 text-center">
            {mode === "signin"
              ? "Welcome back to GrowVibe Ads Solution"
              : "First user becomes admin automatically."}
          </p>

          <button
            onClick={onGoogle}
            disabled={loading}
            className="w-full mt-6 flex items-center justify-center gap-2 rounded-lg border border-border bg-surface hover:bg-surface-elevated px-4 py-2.5 text-sm font-medium transition-all hover:shadow-md disabled:opacity-50"
          >
            {loading ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <svg className="size-4" viewBox="0 0 24 24">
                <path
                  fill="currentColor"
                  d="M21.35 11.1H12v3.8h5.35c-.23 1.23-1.39 3.62-5.35 3.62-3.22 0-5.85-2.67-5.85-5.96s2.63-5.96 5.85-5.96c1.83 0 3.07.78 3.78 1.45l2.58-2.48C16.65 4.07 14.55 3 12 3 7 3 3 7 3 12s4 9 9 9c5.2 0 8.62-3.65 8.62-8.8 0-.6-.07-1.06-.17-1.5Z"
                />
              </svg>
            )}
            Continue with Google
          </button>

          <div className="flex items-center gap-3 my-5">
            <div className="h-px flex-1 bg-border" />
            <span className="text-xs text-muted-foreground">or</span>
            <div className="h-px flex-1 bg-border" />
          </div>

          <form onSubmit={onSubmit} className="space-y-3">
            {mode === "signup" && (
              <input
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                required
                placeholder="Full name"
                className="w-full rounded-lg bg-input border border-border px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-ring"
              />
            )}
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="Email"
              className="w-full rounded-lg bg-input border border-border px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              placeholder="Password"
              className="w-full rounded-lg bg-input border border-border px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg bg-gradient-to-r from-primary to-primary-glow px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50 inline-flex items-center justify-center gap-2"
            >
              {loading && <Loader2 className="size-4 animate-spin" />}{" "}
              {mode === "signin" ? "Sign in" : "Create account"}
            </button>
          </form>

          <div className="text-center text-sm text-muted-foreground mt-5">
            {mode === "signin" ? (
              <>
                Don't have an account?{" "}
                <button onClick={() => setMode("signup")} className="text-primary font-medium">
                  Sign up
                </button>
              </>
            ) : (
              <>
                Already have one?{" "}
                <button onClick={() => setMode("signin")} className="text-primary font-medium">
                  Sign in
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
