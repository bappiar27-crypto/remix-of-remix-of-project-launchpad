-- ============================================================================
--  Split "Clear All Data" into two operations:
--    1) admin_clear_synced_data  -> soft refresh (keeps connection + clients)
--    2) admin_full_reset         -> factory reset (wipes EVERYTHING incl. FB creds)
-- ============================================================================

-- ---------- 1. Soft refresh: synced data only ----------
CREATE OR REPLACE FUNCTION public.admin_clear_synced_data(_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NOT public.has_role(_user_id, 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'Forbidden: admin role required';
  END IF;

  DELETE FROM public.insights_snapshots;
  DELETE FROM public.alerts;
  DELETE FROM public.sync_logs;
  DELETE FROM public.meta_webhook_events;
  DELETE FROM public.ads;
  DELETE FROM public.ad_sets;
  DELETE FROM public.campaigns;

  -- Reset cached totals on ad_accounts so dashboard KPIs zero out
  UPDATE public.ad_accounts SET
    total_spend   = 0,
    total_reach   = 0,
    total_results = 0,
    last_synced_at = NULL;

  RETURN jsonb_build_object(
    'mode',       'synced_only',
    'cleared_at', now(),
    'cleared_by', _user_id
  );
END; $$;

REVOKE ALL ON FUNCTION public.admin_clear_synced_data(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_clear_synced_data(uuid) TO service_role;

-- ---------- 2. Full factory reset ----------
CREATE OR REPLACE FUNCTION public.admin_full_reset(
  _user_id uuid,
  _confirm text DEFAULT ''
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NOT public.has_role(_user_id, 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'Forbidden: admin role required';
  END IF;

  IF _confirm != 'CONFIRM_FULL_RESET' THEN
    RAISE EXCEPTION 'Safety check failed: pass CONFIRM_FULL_RESET to proceed';
  END IF;

  -- Operational data (FK-safe order)
  DELETE FROM public.insights_snapshots;
  DELETE FROM public.alerts;
  DELETE FROM public.sync_logs;
  DELETE FROM public.meta_webhook_events;
  DELETE FROM public.client_campaigns;
  DELETE FROM public.ads;
  DELETE FROM public.ad_sets;
  DELETE FROM public.campaigns;
  DELETE FROM public.ad_accounts;
  DELETE FROM public.clients;

  -- Wipe stored FB connections (token, BM ID, App ID/Secret)
  DELETE FROM public.meta_connections;

  -- Reset FB credential fields on the singleton app_settings row,
  -- but keep org info / branding / preferences intact.
  UPDATE public.app_settings SET
    fb_system_user_token = NULL,
    fb_app_id            = NULL,
    fb_business_id       = NULL,
    fb_verify_token      = NULL,
    fb_app_secret        = NULL,
    token_status         = NULL,
    token_scopes         = NULL,
    token_missing_scopes = NULL,
    token_user_name      = NULL,
    token_expires_at     = NULL,
    token_checked_at     = NULL,
    token_error          = NULL
  WHERE id = 1;

  RETURN jsonb_build_object(
    'mode',       'full_reset',
    'cleared_at', now(),
    'cleared_by', _user_id
  );
END; $$;

REVOKE ALL ON FUNCTION public.admin_full_reset(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_full_reset(uuid, text) TO service_role;
