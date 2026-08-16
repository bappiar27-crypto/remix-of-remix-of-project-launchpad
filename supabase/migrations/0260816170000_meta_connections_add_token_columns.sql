-- FIX: "Could not find the 'fb_app_secret' column of 'meta_connections' in the schema cache"
--
-- Cause: public.meta_connections was created with the columns
--   fb_app_secret_encrypted / fb_system_user_token_enc
-- but the whole app (src/lib/fb/connections.functions.ts, sync.server.ts,
-- permissions.server.ts, portal.functions.ts, admin.functions.ts) writes and
-- reads plain fb_app_secret / fb_system_user_token on that table.
-- PostgREST therefore rejects the INSERT and no Business Manager gets saved.
--
-- Fix: add the columns the app actually uses, migrate any existing values,
-- and make the public RPC report has_token / has_app_secret from either column.

ALTER TABLE public.meta_connections
  ADD COLUMN IF NOT EXISTS fb_app_secret        text,
  ADD COLUMN IF NOT EXISTS fb_system_user_token text;

-- carry over anything previously stored in the *_enc columns
UPDATE public.meta_connections
SET fb_app_secret = COALESCE(fb_app_secret, fb_app_secret_encrypted),
    fb_system_user_token = COALESCE(fb_system_user_token, fb_system_user_token_enc)
WHERE fb_app_secret IS NULL OR fb_system_user_token IS NULL;

CREATE OR REPLACE FUNCTION public.get_meta_connections_public()
RETURNS TABLE(
  id uuid, label text, fb_app_id text, fb_business_id text,
  has_token boolean, has_app_secret boolean,
  token_status text, token_scopes text[], token_missing_scopes text[],
  token_user_name text, token_expires_at timestamptz, token_checked_at timestamptz, token_error text,
  is_active boolean, account_count bigint,
  created_at timestamptz, updated_at timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    mc.id, mc.label, mc.fb_app_id, mc.fb_business_id,
    (COALESCE(mc.fb_system_user_token, mc.fb_system_user_token_enc, '') <> ''),
    (COALESCE(mc.fb_app_secret, mc.fb_app_secret_encrypted, '') <> ''),
    mc.token_status, mc.token_scopes, mc.token_missing_scopes,
    mc.token_user_name, mc.token_expires_at, mc.token_checked_at, mc.token_error,
    mc.is_active,
    (SELECT count(*) FROM public.ad_accounts a WHERE a.connection_id = mc.id),
    mc.created_at, mc.updated_at
  FROM public.meta_connections mc
  WHERE public.has_role(auth.uid(), 'admin'::public.app_role)
  ORDER BY mc.created_at ASC;
$$;

REVOKE ALL ON FUNCTION public.get_meta_connections_public() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_meta_connections_public() TO authenticated, service_role;

-- refresh PostgREST schema cache so the new columns are visible immediately
NOTIFY pgrst, 'reload schema';
