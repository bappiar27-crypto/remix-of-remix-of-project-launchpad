import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Activity, BarChart3, Users, Zap, Shield, TrendingUp } from "lucide-react";
import { Logo } from "@/components/Logo";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "GrowVibe Ads Solution — Real-time Facebook Ads Command Center" },
      {
        name: "description",
        content:
          "Track every campaign, every client, every dollar — all in real time. Built for Facebook Ads agencies.",
      },
    ],
  }),
  component: Landing,
});

function Landing() {
  const [checking, setChecking] = useState(true);
  const [signedIn, setSignedIn] = useState(false);

  useEffect(() => {
    let isMounted = true;

    // ✅ FIX 1: Timeout যোগ করা হয়েছে — Supabase যদি connect না হয়
    // তাহলে ৩ সেকেন্ড পরে automatically page দেখাবে
    const timeout = setTimeout(() => {
      if (isMounted) setChecking(false);
    }, 3000);

    // ✅ FIX 2: Error handling যোগ করা হয়েছে — connection fail হলেও
    // blank screen এর বদলে landing page দেখাবে
    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (!isMounted) return;
        clearTimeout(timeout);
        setSignedIn(!!data?.session);
        setChecking(false);
      })
      .catch((error) => {
        if (!isMounted) return;
        console.warn(
          "[Auth] Session check failed:",
          error instanceof Error ? error.message : String(error),
        );
        clearTimeout(timeout);
        setChecking(false);
      });

    return () => {
      isMounted = false;
      clearTimeout(timeout);
    };
  }, []);

  // ✅ FIX 3: Blank div এর বদলে proper loading spinner দেখাচ্ছে
  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="size-10 rounded-full border-2 border-primary border-t-transparent animate-spin" />
          <p className="text-sm text-muted-foreground animate-pulse">Loading...</p>
        </div>
      </div>
    );
  }

  if (signedIn) return <Navigate to="/dashboard" />;

  return (
    <div className="min-h-screen">
      <header className="border-b border-border/40 backdrop-blur-md sticky top-0 z-20">
        <div className="container mx-auto flex items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <Logo className="h-10 w-auto" />
            <div className="font-display font-bold text-lg">GrowVibe Ads Solution</div>
          </div>
          <Link
            to="/auth"
            className="rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm font-semibold hover:opacity-90"
          >
            Sign in
          </Link>
        </div>
      </header>

      <main className="container mx-auto px-6 py-20">
        <section className="text-center max-w-3xl mx-auto">
          <div className="inline-flex items-center gap-2 rounded-full border border-border/50 bg-surface/60 px-4 py-1.5 text-xs font-medium text-muted-foreground mb-6">
            <span className="size-1.5 rounded-full bg-primary animate-pulse" /> Live Facebook
            Marketing API
          </div>
          <h1 className="text-5xl md:text-6xl font-bold tracking-tight">
            Your Ads. <span className="gradient-text">In real time.</span>
          </h1>
          <p className="mt-6 text-lg text-muted-foreground">
            Manage unlimited clients, ad accounts, campaigns and ads — and give each client a
            beautiful, branded live dashboard with a single shareable link.
          </p>
          <div className="mt-8 flex justify-center gap-3">
            <Link
              to="/auth"
              className="rounded-xl bg-gradient-to-r from-primary to-primary-glow px-6 py-3 font-semibold text-primary-foreground hover:opacity-90 ring-glow"
            >
              Get started
            </Link>
          </div>
        </section>

        <section className="mt-20 grid gap-5 md:grid-cols-3">
          {[
            {
              i: Activity,
              t: "Real-time sync",
              d: "Every 2-5 minutes from Facebook Marketing API.",
            },
            {
              i: BarChart3,
              t: "All KPIs in one place",
              d: "Spend, Reach, CTR, CPC, CPM, ROAS, Frequency.",
            },
            {
              i: Users,
              t: "Client portals",
              d: "Public link per client — they see only their data.",
            },
            { i: Zap, t: "Instant alerts", d: "Budget pacing, performance drops, sync failures." },
            {
              i: TrendingUp,
              t: "Deep insights",
              d: "Time-series charts down to ad-level breakdown.",
            },
            {
              i: Shield,
              t: "Secure by design",
              d: "Server-side token storage, never exposed to browser.",
            },
          ].map(({ i: Icon, t, d }) => (
            <div key={t} className="glass-card p-6">
              <Icon className="size-6 text-primary mb-3" />
              <div className="font-semibold">{t}</div>
              <p className="text-sm text-muted-foreground mt-1">{d}</p>
            </div>
          ))}
        </section>
      </main>
      <footer className="border-t border-border/40 py-8 text-center text-sm text-muted-foreground">
        © {new Date().getFullYear()} GrowVibe Ads Solution
      </footer>
    </div>
  );
}
