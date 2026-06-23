-- ============ EXTENSIONS ============
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- ============ ENUMS ============
CREATE TYPE public.app_role AS ENUM ('admin', 'member');
CREATE TYPE public.client_status AS ENUM ('active', 'paused', 'archived');
CREATE TYPE public.entity_status AS ENUM (
  'ACTIVE', 'PAUSED', 'DELETED', 'ARCHIVED',
  'PENDING_REVIEW', 'DISAPPROVED', 'PREAPPROVED',
  'PENDING_BILLING_INFO', 'CAMPAIGN_PAUSED', 'ADSET_PAUSED',
  'IN_PROCESS', 'WITH_ISSUES'
);
CREATE TYPE public.insight_level AS ENUM ('account', 'campaign', 'adset', 'ad');
CREATE TYPE public.alert_severity AS ENUM ('info', 'warning', 'critical');
CREATE TYPE public.sync_status AS ENUM ('running', 'success', 'failed');

-- ============ HELPER FUNCTION ============
CREATE OR REPLACE FUNCTION public.tg_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END; $$;

-- ============ PROFILES ============
CREATE TABLE public.profiles (
  id         UUID PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
  full_name  TEXT,
  email      TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "profiles_select_authenticated"
  ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "profiles_update_own"
  ON public.profiles FOR UPDATE TO authenticated
  USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
CREATE TRIGGER profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- ============ USER ROLES ============
CREATE TABLE public.user_roles (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  role       public.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "user_roles_select_own"
  ON public.user_roles FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- ============ has_role & is_admin (user_roles এর পরে) ============
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql STABLE SECURITY INVOKER SET search_path TO 'public' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  );
$$;

CREATE OR REPLACE FUNCTION public.is_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY INVOKER SET search_path TO 'public' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = 'admin'
  );
$$;

-- ============ HANDLE NEW USER ============
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email)
  )
  ON CONFLICT (id) DO UPDATE
  SET email      = EXCLUDED.email,
      full_name  = COALESCE(public.profiles.full_name, EXCLUDED.full_name),
      updated_at = now();

  INSERT INTO public.user_roles (user_id, role)
  VALUES (
    NEW.id,
    CASE
      WHEN NOT EXISTS (SELECT 1 FROM public.user_roles WHERE role = 'admin')
      THEN 'admin'::public.app_role
      ELSE 'member'::public.app_role
    END
  )
  ON CONFLICT (user_id, role) DO NOTHING;

  RETURN NEW;
END; $$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============ APP SETTINGS ============
CREATE TABLE public.app_settings (
  id                      INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  fb_system_user_token    TEXT,
  fb_app_id               TEXT,
  fb_business_id          TEXT,
  fb_verify_token         TEXT,
  fb_app_secret           TEXT,
  sync_interval_minutes   INT NOT NULL DEFAULT 5,
  auto_sync_enabled       BOOLEAN NOT NULL DEFAULT true,
  token_status            TEXT,
  token_scopes            TEXT[],
  token_missing_scopes    TEXT[],
  token_user_name         TEXT,
  token_expires_at        TIMESTAMPTZ,
  token_checked_at        TIMESTAMPTZ,
  token_error             TEXT,
  org_name                TEXT,
  org_email               TEXT,
  org_phone               TEXT,
  org_address             TEXT,
  brand_logo_url          TEXT,
  brand_primary_color     TEXT DEFAULT '#1F2240',
  brand_secondary_color   TEXT DEFAULT '#8B5CF6',
  pref_timezone           TEXT DEFAULT 'Asia/Dhaka',
  pref_currency           TEXT DEFAULT 'USD',
  pref_language           TEXT DEFAULT 'en',
  pref_attribution_window TEXT DEFAULT '28d_click',
  updated_by              UUID REFERENCES auth.users,
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT ALL ON public.app_settings TO service_role;
REVOKE ALL ON public.app_settings FROM anon, authenticated;
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_settings_no_direct_access"
  ON public.app_settings FOR ALL TO authenticated
  USING (false) WITH CHECK (false);
INSERT INTO public.app_settings (id) VALUES (1) ON CONFLICT DO NOTHING;

-- ============ META CONNECTIONS ============
CREATE TABLE public.meta_connections (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  label                text NOT NULL,
  fb_app_id            text,
  fb_app_secret        text,
  fb_business_id       text,
  fb_system_user_token text,
  token_status         text,
  token_scopes         text[],
  token_missing_scopes text[],
  token_user_name      text,
  token_expires_at     timestamptz,
  token_checked_at     timestamptz,
  token_error          text,
  is_active            boolean NOT NULL DEFAULT true,
  created_by           uuid REFERENCES auth.users(id),
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.meta_connections TO authenticated;
GRANT ALL ON public.meta_connections TO service_role;
ALTER TABLE public.meta_connections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "meta_connections_admin_manage"
  ON public.meta_connections FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE TRIGGER meta_connections_updated_at
  BEFORE UPDATE ON public.meta_connections
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- ============ generate_client_code (clients এর আগে) ============
CREATE OR REPLACE FUNCTION public.generate_client_code()
RETURNS text
LANGUAGE plpgsql VOLATILE SET search_path = public AS $$
DECLARE
  chars  text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  result text;
  i      integer;
BEGIN
  LOOP
    result := '';
    FOR i IN 1..8 LOOP
      result := result || substr(chars, 1 + floor(random() * length(chars))::integer, 1);
    END LOOP;
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.clients WHERE client_code = result);
  END LOOP;
  RETURN result;
END; $$;

-- ============ CLIENTS ============
CREATE TABLE public.clients (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name               TEXT NOT NULL,
  slug               TEXT NOT NULL UNIQUE,
  client_code        TEXT NOT NULL DEFAULT public.generate_client_code(),
  contact_email      TEXT,
  contact_phone      TEXT,
  company            TEXT,
  notes              TEXT,
  status             public.client_status NOT NULL DEFAULT 'active',
  monthly_budget     NUMERIC(14,2) DEFAULT 0,
  logo_url           TEXT,
  brand_color        TEXT,
  portal_password    TEXT,
  portal_token       TEXT,
  website            TEXT,
  address            TEXT,
  deposit_amount     NUMERIC(14,2) NOT NULL DEFAULT 0,
  deposit_currency   TEXT NOT NULL DEFAULT 'USD',
  bdt_rate           NUMERIC(10,4),
  commission_enabled BOOLEAN NOT NULL DEFAULT false,
  commission_percent NUMERIC(6,2) NOT NULL DEFAULT 0,
  commission_notes   TEXT,
  created_by         UUID REFERENCES auth.users,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.clients TO authenticated;
GRANT ALL ON public.clients TO service_role;
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
CREATE POLICY "clients_select_authenticated"
  ON public.clients FOR SELECT TO authenticated USING (true);
CREATE POLICY "clients_admin_modify"
  ON public.clients FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE TRIGGER clients_updated_at
  BEFORE UPDATE ON public.clients
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
CREATE INDEX clients_slug_idx ON public.clients(slug);
CREATE UNIQUE INDEX clients_client_code_unique ON public.clients(client_code);
CREATE UNIQUE INDEX clients_portal_token_unique ON public.clients(portal_token) WHERE portal_token IS NOT NULL;

-- ============ AD ACCOUNTS ============
CREATE TABLE public.ad_accounts (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id         UUID NOT NULL REFERENCES public.clients ON DELETE CASCADE,
  connection_id     uuid REFERENCES public.meta_connections(id) ON DELETE SET NULL,
  fb_account_id     TEXT NOT NULL UNIQUE,
  account_name      TEXT,
  currency          TEXT,
  timezone_name     TEXT,
  account_status    INT,
  business_name     TEXT,
  total_spend       NUMERIC(14,2) DEFAULT 0,
  total_reach       BIGINT DEFAULT 0,
  total_impressions BIGINT DEFAULT 0,
  total_clicks      BIGINT DEFAULT 0,
  total_results     BIGINT DEFAULT 0,
  active_campaigns  INT DEFAULT 0,
  last_sync_at      TIMESTAMPTZ,
  last_sync_status  public.sync_status,
  last_sync_error   TEXT,
  is_active         BOOLEAN NOT NULL DEFAULT true,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ad_accounts TO authenticated;
GRANT ALL ON public.ad_accounts TO service_role;
ALTER TABLE public.ad_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ad_accounts_select_auth"
  ON public.ad_accounts FOR SELECT TO authenticated USING (true);
CREATE POLICY "ad_accounts_admin_modify"
  ON public.ad_accounts FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE TRIGGER ad_accounts_updated_at
  BEFORE UPDATE ON public.ad_accounts
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
CREATE INDEX ad_accounts_client_idx ON public.ad_accounts(client_id);
CREATE INDEX ad_accounts_connection_id_idx ON public.ad_accounts(connection_id);

-- ============ CAMPAIGNS ============
CREATE TABLE public.campaigns (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ad_account_id    UUID NOT NULL REFERENCES public.ad_accounts ON DELETE CASCADE,
  fb_campaign_id   TEXT NOT NULL UNIQUE,
  name             TEXT NOT NULL,
  objective        TEXT,
  status           public.entity_status,
  effective_status public.entity_status,
  daily_budget     NUMERIC(14,2),
  lifetime_budget  NUMERIC(14,2),
  buying_type      TEXT,
  start_time       TIMESTAMPTZ,
  stop_time        TIMESTAMPTZ,
  spend            NUMERIC(14,2) DEFAULT 0,
  reach            BIGINT DEFAULT 0,
  impressions      BIGINT DEFAULT 0,
  clicks           BIGINT DEFAULT 0,
  ctr              NUMERIC(8,4) DEFAULT 0,
  cpc              NUMERIC(10,4) DEFAULT 0,
  cpm              NUMERIC(10,4) DEFAULT 0,
  results          BIGINT DEFAULT 0,
  frequency        NUMERIC(8,4) DEFAULT 0,
  last_sync_at     TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.campaigns TO authenticated;
GRANT ALL ON public.campaigns TO service_role;
ALTER TABLE public.campaigns ENABLE ROW LEVEL SECURITY;
CREATE POLICY "campaigns_select_auth"
  ON public.campaigns FOR SELECT TO authenticated USING (true);
CREATE POLICY "campaigns_admin_modify"
  ON public.campaigns FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE TRIGGER campaigns_updated_at
  BEFORE UPDATE ON public.campaigns
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
CREATE INDEX campaigns_account_idx ON public.campaigns(ad_account_id);

-- ============ AD SETS ============
CREATE TABLE public.ad_sets (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id       UUID NOT NULL REFERENCES public.campaigns ON DELETE CASCADE,
  ad_account_id     UUID NOT NULL REFERENCES public.ad_accounts ON DELETE CASCADE,
  fb_adset_id       TEXT NOT NULL UNIQUE,
  name              TEXT NOT NULL,
  status            public.entity_status,
  effective_status  public.entity_status,
  daily_budget      NUMERIC(14,2),
  lifetime_budget   NUMERIC(14,2),
  optimization_goal TEXT,
  billing_event     TEXT,
  bid_amount        NUMERIC(14,2),
  start_time        TIMESTAMPTZ,
  end_time          TIMESTAMPTZ,
  spend             NUMERIC(14,2) DEFAULT 0,
  reach             BIGINT DEFAULT 0,
  impressions       BIGINT DEFAULT 0,
  clicks            BIGINT DEFAULT 0,
  ctr               NUMERIC(8,4) DEFAULT 0,
  cpc               NUMERIC(10,4) DEFAULT 0,
  cpm               NUMERIC(10,4) DEFAULT 0,
  results           BIGINT DEFAULT 0,
  frequency         NUMERIC(8,4) DEFAULT 0,
  last_sync_at      TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ad_sets TO authenticated;
GRANT ALL ON public.ad_sets TO service_role;
ALTER TABLE public.ad_sets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "adsets_select_auth"
  ON public.ad_sets FOR SELECT TO authenticated USING (true);
CREATE POLICY "adsets_admin_modify"
  ON public.ad_sets FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE TRIGGER adsets_updated_at
  BEFORE UPDATE ON public.ad_sets
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
CREATE INDEX adsets_campaign_idx ON public.ad_sets(campaign_id);
CREATE INDEX adsets_account_idx ON public.ad_sets(ad_account_id);

-- ============ ADS ============
CREATE TABLE public.ads (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ad_set_id        UUID NOT NULL REFERENCES public.ad_sets ON DELETE CASCADE,
  campaign_id      UUID NOT NULL REFERENCES public.campaigns ON DELETE CASCADE,
  ad_account_id    UUID NOT NULL REFERENCES public.ad_accounts ON DELETE CASCADE,
  fb_ad_id         TEXT NOT NULL UNIQUE,
  name             TEXT NOT NULL,
  status           public.entity_status,
  effective_status public.entity_status,
  creative_thumbnail TEXT,
  creative_id      TEXT,
  preview_link     TEXT,
  spend            NUMERIC(14,2) DEFAULT 0,
  reach            BIGINT DEFAULT 0,
  impressions      BIGINT DEFAULT 0,
  clicks           BIGINT DEFAULT 0,
  ctr              NUMERIC(8,4) DEFAULT 0,
  cpc              NUMERIC(10,4) DEFAULT 0,
  cpm              NUMERIC(10,4) DEFAULT 0,
  results          BIGINT DEFAULT 0,
  frequency        NUMERIC(8,4) DEFAULT 0,
  last_sync_at     TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ads TO authenticated;
GRANT ALL ON public.ads TO service_role;
ALTER TABLE public.ads ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ads_select_auth"
  ON public.ads FOR SELECT TO authenticated USING (true);
CREATE POLICY "ads_admin_modify"
  ON public.ads FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE TRIGGER ads_updated_at
  BEFORE UPDATE ON public.ads
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
CREATE INDEX ads_adset_idx ON public.ads(ad_set_id);
CREATE INDEX ads_account_idx ON public.ads(ad_account_id);

-- ============ INSIGHTS SNAPSHOTS ============
CREATE TABLE public.insights_snapshots (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ad_account_id UUID NOT NULL REFERENCES public.ad_accounts ON DELETE CASCADE,
  level         public.insight_level NOT NULL,
  entity_id     TEXT NOT NULL,
  date_start    DATE NOT NULL,
  date_stop     DATE NOT NULL,
  spend         NUMERIC(14,2) DEFAULT 0,
  reach         BIGINT DEFAULT 0,
  impressions   BIGINT DEFAULT 0,
  clicks        BIGINT DEFAULT 0,
  ctr           NUMERIC(8,4) DEFAULT 0,
  cpc           NUMERIC(10,4) DEFAULT 0,
  cpm           NUMERIC(10,4) DEFAULT 0,
  results       BIGINT DEFAULT 0,
  frequency     NUMERIC(8,4) DEFAULT 0,
  raw           JSONB,
  captured_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(ad_account_id, level, entity_id, date_start, date_stop)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.insights_snapshots TO authenticated;
GRANT ALL ON public.insights_snapshots TO service_role;
ALTER TABLE public.insights_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "insights_select_auth"
  ON public.insights_snapshots FOR SELECT TO authenticated USING (true);
CREATE POLICY "insights_admin_modify"
  ON public.insights_snapshots FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE INDEX insights_account_date_idx ON public.insights_snapshots(ad_account_id, date_start DESC);
CREATE INDEX insights_entity_idx ON public.insights_snapshots(level, entity_id);

-- ============ ALERTS ============
CREATE TABLE public.alerts (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id     UUID REFERENCES public.clients ON DELETE CASCADE,
  ad_account_id UUID REFERENCES public.ad_accounts ON DELETE CASCADE,
  type          TEXT NOT NULL,
  severity      public.alert_severity NOT NULL DEFAULT 'info',
  title         TEXT NOT NULL,
  message       TEXT,
  is_read       BOOLEAN NOT NULL DEFAULT false,
  metadata      JSONB,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.alerts TO authenticated;
GRANT ALL ON public.alerts TO service_role;
ALTER TABLE public.alerts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "alerts_select_auth"
  ON public.alerts FOR SELECT TO authenticated USING (true);
CREATE POLICY "alerts_admin_modify"
  ON public.alerts FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE INDEX alerts_client_idx ON public.alerts(client_id, created_at DESC);

-- ============ SYNC LOGS ============
CREATE TABLE public.sync_logs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ad_account_id UUID REFERENCES public.ad_accounts ON DELETE CASCADE,
  status        public.sync_status NOT NULL,
  items_synced  INT DEFAULT 0,
  error         TEXT,
  duration_ms   INT,
  started_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at   TIMESTAMPTZ
);
GRANT SELECT, INSERT, UPDATE ON public.sync_logs TO authenticated;
GRANT ALL ON public.sync_logs TO service_role;
ALTER TABLE public.sync_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sync_logs_select_auth"
  ON public.sync_logs FOR SELECT TO authenticated USING (true);
CREATE POLICY "sync_logs_admin_modify"
  ON public.sync_logs FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE INDEX sync_logs_account_idx ON public.sync_logs(ad_account_id, started_at DESC);

-- ============ META WEBHOOK EVENTS ============
CREATE TABLE public.meta_webhook_events (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  object          TEXT,
  field           TEXT,
  fb_account_id   TEXT,
  ad_account_id   UUID REFERENCES public.ad_accounts ON DELETE SET NULL,
  payload         JSONB NOT NULL,
  signature_valid BOOLEAN NOT NULL DEFAULT false,
  processed       BOOLEAN NOT NULL DEFAULT false,
  error           TEXT,
  received_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.meta_webhook_events TO authenticated;
GRANT ALL ON public.meta_webhook_events TO service_role;
ALTER TABLE public.meta_webhook_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "webhook_events_admin_select"
  ON public.meta_webhook_events FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE INDEX meta_webhook_events_received_idx ON public.meta_webhook_events(received_at DESC);

-- ============ CLIENT CAMPAIGNS ============
CREATE TABLE public.client_campaigns (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id   UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  campaign_id UUID NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (client_id, campaign_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_campaigns TO authenticated;
GRANT ALL ON public.client_campaigns TO service_role;
ALTER TABLE public.client_campaigns ENABLE ROW LEVEL SECURITY;
CREATE POLICY "client_campaigns_select_auth"
  ON public.client_campaigns FOR SELECT TO authenticated USING (true);
CREATE POLICY "client_campaigns_admin_modify"
  ON public.client_campaigns FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE TRIGGER client_campaigns_updated_at
  BEFORE UPDATE ON public.client_campaigns
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
CREATE INDEX client_campaigns_client_idx ON public.client_campaigns(client_id);
CREATE INDEX client_campaigns_campaign_idx ON public.client_campaigns(campaign_id);

-- ============ PUBLIC FUNCTIONS ============
CREATE OR REPLACE FUNCTION public.get_settings_public()
RETURNS TABLE(
  has_token               boolean,
  fb_app_id               text,
  fb_business_id          text,
  sync_interval_minutes   integer,
  auto_sync_enabled       boolean,
  updated_at              timestamptz,
  has_verify_token        boolean,
  has_app_secret          boolean,
  token_status            text,
  token_scopes            text[],
  token_missing_scopes    text[],
  token_user_name         text,
  token_expires_at        timestamptz,
  token_checked_at        timestamptz,
  token_error             text,
  org_name                text,
  org_email               text,
  org_phone               text,
  org_address             text,
  brand_logo_url          text,
  brand_primary_color     text,
  brand_secondary_color   text,
  pref_timezone           text,
  pref_currency           text,
  pref_language           text,
  pref_attribution_window text
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT
    (fb_system_user_token IS NOT NULL AND length(fb_system_user_token) > 0),
    fb_app_id, fb_business_id, sync_interval_minutes, auto_sync_enabled, updated_at,
    (fb_verify_token IS NOT NULL AND length(fb_verify_token) > 0),
    (fb_app_secret IS NOT NULL AND length(fb_app_secret) > 0),
    token_status, token_scopes, token_missing_scopes, token_user_name,
    token_expires_at, token_checked_at, token_error,
    org_name, org_email, org_phone, org_address,
    brand_logo_url, brand_primary_color, brand_secondary_color,
    pref_timezone, pref_currency, pref_language, pref_attribution_window
  FROM public.app_settings WHERE id = 1;
$$;

CREATE OR REPLACE FUNCTION public.get_meta_connections_public()
RETURNS TABLE(
  id                   uuid,
  label                text,
  fb_app_id            text,
  fb_business_id       text,
  has_token            boolean,
  has_app_secret       boolean,
  token_status         text,
  token_scopes         text[],
  token_missing_scopes text[],
  token_user_name      text,
  token_expires_at     timestamptz,
  token_checked_at     timestamptz,
  token_error          text,
  is_active            boolean,
  account_count        bigint,
  created_at           timestamptz,
  updated_at           timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    mc.id, mc.label, mc.fb_app_id, mc.fb_business_id,
    (mc.fb_system_user_token IS NOT NULL AND length(mc.fb_system_user_token) > 0),
    (mc.fb_app_secret IS NOT NULL AND length(mc.fb_app_secret) > 0),
    mc.token_status, mc.token_scopes, mc.token_missing_scopes,
    mc.token_user_name, mc.token_expires_at, mc.token_checked_at, mc.token_error,
    mc.is_active,
    (SELECT count(*) FROM public.ad_accounts a WHERE a.connection_id = mc.id),
    mc.created_at, mc.updated_at
  FROM public.meta_connections mc
  WHERE public.has_role(auth.uid(), 'admin'::public.app_role)
  ORDER BY mc.created_at ASC;
$$;

CREATE OR REPLACE FUNCTION public.admin_clear_all_data(_user_id uuid)
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
  DELETE FROM public.client_campaigns;
  DELETE FROM public.ads;
  DELETE FROM public.ad_sets;
  DELETE FROM public.campaigns;
  DELETE FROM public.ad_accounts;
  DELETE FROM public.clients;
  RETURN jsonb_build_object('cleared_at', now(), 'cleared_by', _user_id);
END; $$;

-- ============ FUNCTION PERMISSIONS ============
REVOKE ALL ON FUNCTION public.tg_set_updated_at()                FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.handle_new_user()                   FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_settings_public()               FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_meta_connections_public()       FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_clear_all_data(uuid)          FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role)     FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_admin(uuid)                      FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.generate_client_code()              FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.tg_set_updated_at()              TO service_role;
GRANT EXECUTE ON FUNCTION public.handle_new_user()                TO service_role;
GRANT EXECUTE ON FUNCTION public.get_settings_public()            TO service_role;
GRANT EXECUTE ON FUNCTION public.get_meta_connections_public()    TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_clear_all_data(uuid)       TO service_role;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role)  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_admin(uuid)                   TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.generate_client_code()           TO authenticated, service_role;

-- ============ SCHEMA USAGE ============
GRANT USAGE ON SCHEMA public TO authenticated, service_role;

-- ============ REALTIME ============
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.ad_accounts;       EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.campaigns;          EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.ad_sets;            EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.insights_snapshots; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.alerts;             EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.sync_logs;          EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============ BACKFILL EXISTING USERS ============
INSERT INTO public.profiles (id, email, full_name)
SELECT u.id, u.email, COALESCE(u.raw_user_meta_data->>'full_name', u.email)
FROM auth.users u
LEFT JOIN public.profiles p ON p.id = u.id
WHERE p.id IS NULL;

WITH ordered AS (
  SELECT u.id, ROW_NUMBER() OVER (ORDER BY u.created_at) AS rn
  FROM auth.users u
  LEFT JOIN public.user_roles r ON r.user_id = u.id
  WHERE r.user_id IS NULL
)
INSERT INTO public.user_roles (user_id, role)
SELECT id,
  CASE
    WHEN rn = 1 AND NOT EXISTS (SELECT 1 FROM public.user_roles WHERE role = 'admin')
    THEN 'admin'::public.app_role
    ELSE 'member'::public.app_role
  END
FROM ordered;