-- =========================================================================
-- client_ad_sets — ad-set-level assignment for the client portal
--
-- Why: previously a partner was assigned only at campaign level, so picking
-- a single ad-set in the "Add Partner" UI ended up showing EVERY ad-set
-- under the parent campaign in the portal. This table tracks the exact
-- Facebook ad-set IDs assigned to a partner.
-- =========================================================================

CREATE TABLE IF NOT EXISTS public.client_ad_sets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  fb_adset_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (client_id, fb_adset_id)
);

CREATE INDEX IF NOT EXISTS client_ad_sets_client_id_idx
  ON public.client_ad_sets (client_id);

CREATE INDEX IF NOT EXISTS client_ad_sets_fb_adset_id_idx
  ON public.client_ad_sets (fb_adset_id);

-- Grants (Supabase Data API does NOT grant by default)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_ad_sets TO authenticated;
GRANT ALL ON public.client_ad_sets TO service_role;

ALTER TABLE public.client_ad_sets ENABLE ROW LEVEL SECURITY;

-- Authenticated users (the admin app) can manage assignments
DROP POLICY IF EXISTS "client_ad_sets read auth" ON public.client_ad_sets;
CREATE POLICY "client_ad_sets read auth"
  ON public.client_ad_sets FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "client_ad_sets write auth" ON public.client_ad_sets;
CREATE POLICY "client_ad_sets write auth"
  ON public.client_ad_sets FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);
