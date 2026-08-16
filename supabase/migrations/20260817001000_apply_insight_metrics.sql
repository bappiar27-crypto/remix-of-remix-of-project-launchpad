-- ============================================================================
-- FIX: sync failure
--   `campaign insights upsert: null value in column "name" of relation
--    "campaigns" violates not-null constraint`
--
-- BUG: insight metrics were written with PostgREST `upsert(..., onConflict:
-- fb_campaign_id)`. Facebook's insights endpoint returns rows for campaigns /
-- ad sets / ads that no longer exist locally (deleted on Facebook but still
-- inside the "maximum" lookback window, or owned by another ad account).
-- For those rows the upsert degraded into an INSERT that only carried the
-- Facebook id + metrics, so NOT NULL columns (name, campaign_id, ad_set_id)
-- were violated and the WHOLE sync run failed.
--
-- FIX: metrics are applied through these UPDATE-ONLY set-based functions.
-- An unknown Facebook id simply matches no row — it can never INSERT, so the
-- not-null class of failures is structurally impossible. Each call is also a
-- single request, which keeps the Cloudflare Worker subrequest count low.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.apply_campaign_metrics(_ad_account_id uuid, _rows jsonb)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  updated integer;
BEGIN
  IF _rows IS NULL OR jsonb_typeof(_rows) <> 'array' THEN RETURN 0; END IF;

  WITH src AS (
    SELECT * FROM jsonb_to_recordset(_rows) AS x(
      fb_campaign_id text,
      spend numeric, reach bigint, impressions bigint, clicks bigint,
      ctr numeric, cpc numeric, cpm numeric, frequency numeric, results bigint
    )
  ), upd AS (
    UPDATE public.campaigns c
       SET spend = COALESCE(src.spend, 0),
           reach = COALESCE(src.reach, 0),
           impressions = COALESCE(src.impressions, 0),
           clicks = COALESCE(src.clicks, 0),
           ctr = COALESCE(src.ctr, 0),
           cpc = COALESCE(src.cpc, 0),
           cpm = COALESCE(src.cpm, 0),
           frequency = COALESCE(src.frequency, 0),
           results = COALESCE(src.results, 0),
           last_sync_at = now()
      FROM src
     WHERE c.fb_campaign_id = src.fb_campaign_id
       AND c.ad_account_id = _ad_account_id
    RETURNING 1
  )
  SELECT count(*)::int INTO updated FROM upd;

  RETURN updated;
END;
$$;

CREATE OR REPLACE FUNCTION public.apply_ad_set_metrics(_ad_account_id uuid, _rows jsonb)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  updated integer;
BEGIN
  IF _rows IS NULL OR jsonb_typeof(_rows) <> 'array' THEN RETURN 0; END IF;

  WITH src AS (
    SELECT * FROM jsonb_to_recordset(_rows) AS x(
      fb_adset_id text,
      spend numeric, reach bigint, impressions bigint, clicks bigint,
      ctr numeric, cpc numeric, cpm numeric, frequency numeric, results bigint
    )
  ), upd AS (
    UPDATE public.ad_sets a
       SET spend = COALESCE(src.spend, 0),
           reach = COALESCE(src.reach, 0),
           impressions = COALESCE(src.impressions, 0),
           clicks = COALESCE(src.clicks, 0),
           ctr = COALESCE(src.ctr, 0),
           cpc = COALESCE(src.cpc, 0),
           cpm = COALESCE(src.cpm, 0),
           frequency = COALESCE(src.frequency, 0),
           results = COALESCE(src.results, 0),
           last_sync_at = now()
      FROM src
     WHERE a.fb_adset_id = src.fb_adset_id
       AND a.ad_account_id = _ad_account_id
    RETURNING 1
  )
  SELECT count(*)::int INTO updated FROM upd;

  RETURN updated;
END;
$$;

CREATE OR REPLACE FUNCTION public.apply_ad_metrics(_ad_account_id uuid, _rows jsonb)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  updated integer;
BEGIN
  IF _rows IS NULL OR jsonb_typeof(_rows) <> 'array' THEN RETURN 0; END IF;

  WITH src AS (
    SELECT * FROM jsonb_to_recordset(_rows) AS x(
      fb_ad_id text,
      spend numeric, reach bigint, impressions bigint, clicks bigint,
      ctr numeric, cpc numeric, cpm numeric, frequency numeric, results bigint
    )
  ), upd AS (
    UPDATE public.ads d
       SET spend = COALESCE(src.spend, 0),
           reach = COALESCE(src.reach, 0),
           impressions = COALESCE(src.impressions, 0),
           clicks = COALESCE(src.clicks, 0),
           ctr = COALESCE(src.ctr, 0),
           cpc = COALESCE(src.cpc, 0),
           cpm = COALESCE(src.cpm, 0),
           frequency = COALESCE(src.frequency, 0),
           results = COALESCE(src.results, 0),
           last_sync_at = now()
      FROM src
     WHERE d.fb_ad_id = src.fb_ad_id
       AND d.ad_account_id = _ad_account_id
    RETURNING 1
  )
  SELECT count(*)::int INTO updated FROM upd;

  RETURN updated;
END;
$$;

-- Reset all metric columns for one ad account in a single request (previously
-- three separate PostgREST UPDATE calls per sync).
CREATE OR REPLACE FUNCTION public.reset_account_metrics(_ad_account_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.campaigns
     SET spend = 0, reach = 0, impressions = 0, clicks = 0,
         ctr = 0, cpc = 0, cpm = 0, frequency = 0, results = 0
   WHERE ad_account_id = _ad_account_id;

  UPDATE public.ad_sets
     SET spend = 0, reach = 0, impressions = 0, clicks = 0,
         ctr = 0, cpc = 0, cpm = 0, frequency = 0, results = 0
   WHERE ad_account_id = _ad_account_id;

  UPDATE public.ads
     SET spend = 0, reach = 0, impressions = 0, clicks = 0,
         ctr = 0, cpc = 0, cpm = 0, frequency = 0, results = 0
   WHERE ad_account_id = _ad_account_id;
END;
$$;

REVOKE ALL ON FUNCTION public.apply_campaign_metrics(uuid, jsonb) FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.apply_ad_set_metrics(uuid, jsonb) FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.apply_ad_metrics(uuid, jsonb) FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.reset_account_metrics(uuid) FROM anon, authenticated;

GRANT EXECUTE ON FUNCTION public.apply_campaign_metrics(uuid, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.apply_ad_set_metrics(uuid, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.apply_ad_metrics(uuid, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.reset_account_metrics(uuid) TO service_role;
