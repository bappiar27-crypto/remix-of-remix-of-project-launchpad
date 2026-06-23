// Meta Marketing API webhook endpoint.
//   GET  → subscription verification (echoes hub.challenge if verify_token matches)
//   POST → signed event delivery (verifies X-Hub-Signature-256 HMAC with fb_app_secret)
// Path: /api/public/hooks/meta-webhook  (bypasses auth on published builds)
import { createFileRoute } from "@tanstack/react-router";
import { createHmac, timingSafeEqual } from "node:crypto";

export const Route = createFileRoute("/api/public/hooks/meta-webhook")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const mode = url.searchParams.get("hub.mode");
        const token = url.searchParams.get("hub.verify_token");
        const challenge = url.searchParams.get("hub.challenge");
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: s } = await supabaseAdmin
          .from("app_settings")
          .select("fb_verify_token")
          .eq("id", 1)
          .maybeSingle();
        const expected = s?.fb_verify_token;
        if (mode === "subscribe" && expected && token === expected && challenge) {
          return new Response(challenge, {
            status: 200,
            headers: { "Content-Type": "text/plain" },
          });
        }
        return new Response("Forbidden", { status: 403 });
      },
      POST: async ({ request }) => {
        const body = await request.text();
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: s } = await supabaseAdmin
          .from("app_settings")
          .select("fb_app_secret")
          .eq("id", 1)
          .maybeSingle();
        const appSecret = s?.fb_app_secret;

        const sigHeader = request.headers.get("x-hub-signature-256") || "";
        let valid = false;
        if (appSecret && sigHeader.startsWith("sha256=")) {
          try {
            const expected = "sha256=" + createHmac("sha256", appSecret).update(body).digest("hex");
            const a = Buffer.from(sigHeader);
            const b = Buffer.from(expected);
            valid = a.length === b.length && timingSafeEqual(a, b);
          } catch {
            /* keep valid=false */
          }
        }

        if (!valid) {
          // Log invalid attempt for audit, then refuse
          try {
            await supabaseAdmin.from("meta_webhook_events").insert({
              object: null,
              field: null,
              payload: safeParse(body),
              signature_valid: false,
              error: "Invalid signature",
            });
          } catch {
            /* ignore */
          }
          return new Response("Invalid signature", { status: 401 });
        }

        let payload: any;
        try {
          payload = JSON.parse(body);
        } catch {
          return new Response("Bad JSON", { status: 400 });
        }

        try {
          await processWebhook(payload, supabaseAdmin);
        } catch (e: any) {
          console.error("[meta-webhook] process error", e);
        }
        return new Response("ok", { status: 200 });
      },
    },
  },
});

function safeParse(s: string) {
  try {
    return JSON.parse(s);
  } catch {
    return { raw: s.slice(0, 2000) };
  }
}

async function processWebhook(payload: any, db: any) {
  const object = payload?.object as string | undefined;
  const entries: any[] = Array.isArray(payload?.entry) ? payload.entry : [];

  for (const entry of entries) {
    const fbAccountId = entry?.id
      ? String(entry.id).startsWith("act_")
        ? String(entry.id)
        : `act_${entry.id}`
      : null;
    const { data: account } = fbAccountId
      ? await db
          .from("ad_accounts")
          .select("id,client_id,account_name")
          .eq("fb_account_id", fbAccountId)
          .maybeSingle()
      : { data: null };

    const changes: any[] = Array.isArray(entry?.changes) ? entry.changes : [];
    for (const ch of changes) {
      const field = ch?.field as string | undefined;
      const value = ch?.value ?? {};

      await db.from("meta_webhook_events").insert({
        object,
        field,
        fb_account_id: fbAccountId,
        ad_account_id: account?.id ?? null,
        payload: { entry_id: entry.id, change: ch },
        signature_valid: true,
        processed: true,
      });

      // Translate common ad-account events into alerts
      const acctLabel = account?.account_name ?? fbAccountId ?? "ad account";
      if (field === "account_disable_reason" || field === "disable_reason") {
        await db.from("alerts").insert({
          client_id: account?.client_id ?? null,
          ad_account_id: account?.id ?? null,
          type: "account_disabled",
          severity: "critical",
          title: `Ad account disabled: ${acctLabel}`,
          message: `Meta reported disable reason: ${value?.disable_reason ?? "unknown"}.`,
          metadata: value,
        });
      } else if (field === "spend_cap_reached" || value?.spend_cap_reached) {
        await db.from("alerts").insert({
          client_id: account?.client_id ?? null,
          ad_account_id: account?.id ?? null,
          type: "spend_cap_reached",
          severity: "critical",
          title: `Spend cap reached: ${acctLabel}`,
          message: `Ad account hit its spend cap and may pause delivery.`,
          metadata: value,
        });
      } else if (field === "account_status") {
        await db.from("alerts").insert({
          client_id: account?.client_id ?? null,
          ad_account_id: account?.id ?? null,
          type: "account_status",
          severity: "warning",
          title: `Ad account status changed: ${acctLabel}`,
          message: `New status: ${value?.account_status ?? "unknown"}.`,
          metadata: value,
        });
      } else if (field === "campaign" || field === "adset" || field === "ad") {
        // Trigger a sync for this account if we know it
        if (account?.id) {
          try {
            const { syncAdAccount } = await import("@/lib/fb/sync.server");
            // fire and forget
            syncAdAccount(account.id).catch(() => {});
          } catch {
            /* ignore */
          }
        }
      } else {
        await db.from("alerts").insert({
          client_id: account?.client_id ?? null,
          ad_account_id: account?.id ?? null,
          type: `webhook_${field ?? "event"}`,
          severity: "info",
          title: `Meta event: ${field ?? "update"} (${acctLabel})`,
          message: JSON.stringify(value).slice(0, 400),
          metadata: value,
        });
      }
    }
  }
}
