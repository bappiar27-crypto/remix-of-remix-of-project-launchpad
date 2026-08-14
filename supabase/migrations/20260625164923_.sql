
CREATE TABLE IF NOT EXISTS public.login_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ip_address text NOT NULL,
  email text,
  success boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_login_attempts_ip ON public.login_attempts(ip_address);
CREATE INDEX IF NOT EXISTS idx_login_attempts_created ON public.login_attempts(created_at DESC);

GRANT SELECT ON public.login_attempts TO authenticated;
GRANT ALL ON public.login_attempts TO service_role;

ALTER TABLE public.login_attempts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admins read login_attempts" ON public.login_attempts;
CREATE POLICY "admins read login_attempts" ON public.login_attempts
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE OR REPLACE FUNCTION public.record_login_attempt(_ip text, _email text, _success boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF _ip IS NULL OR length(_ip) = 0 THEN RETURN; END IF;
  INSERT INTO public.login_attempts (ip_address, email, success)
  VALUES (_ip, _email, COALESCE(_success, false));
  IF _success THEN
    DELETE FROM public.login_attempts WHERE ip_address = _ip AND success = false;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.is_ip_blocked(_ip text)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((
    SELECT count(*) >= 2 FROM public.login_attempts
    WHERE ip_address = _ip AND success = false
  ), false);
$$;

CREATE OR REPLACE FUNCTION public.admin_unblock_ip(_ip text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'Forbidden: admin role required';
  END IF;
  DELETE FROM public.login_attempts WHERE ip_address = _ip;
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_login_attempt(text, text, boolean) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_ip_blocked(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_unblock_ip(text) TO authenticated;
