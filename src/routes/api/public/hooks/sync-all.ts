// Cron endpoint: called by pg_cron to sync all ad accounts.
// Public route (/api/public/*) bypasses auth — validates anon key.
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/hooks/sync-all")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apiKey = request.headers.get("apikey") || request.headers.get("x-api-key");
        const expected = process.env.SUPABASE_PUBLISHABLE_KEY;
        if (!expected || apiKey !== expected) {
          return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: { "Content-Type": "application/json" } });
        }
        try {
          const { syncAllAccounts } = await import("@/lib/fb/sync.server");
          const result = await syncAllAccounts();
          return new Response(JSON.stringify(result), { status: 200, headers: { "Content-Type": "application/json" } });
        } catch (e: any) {
          console.error("[sync-all] failed", e);
          return new Response(JSON.stringify({ error: e?.message ?? "Sync failed" }), { status: 500, headers: { "Content-Type": "application/json" } });
        }
      },
    },
  },
});
