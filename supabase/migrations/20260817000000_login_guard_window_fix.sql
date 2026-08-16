-- ============================================================================
-- FIX: permanent sign-in lockout ("This IP has been blocked ...") on /auth.
--
-- BUG: public.is_ip_blocked() counted EVERY failed attempt ever recorded for
-- an IP and blocked at >= 2. There was no time window and no automatic
-- expiry, so two typos at any point in the past locked that IP out of the
-- dashboard forever — the admin had to unblock manually.
--
-- FIX: only count recent failures (15-minute rolling window) and raise the
-- threshold to 10. record_login_attempt() also prunes rows older than 7 days
-- so the table cannot grow forever.
-- ============================================================================

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

  -- A successful sign-in clears the failure streak for that IP.
  IF _success THEN
    DELETE FROM public.login_attempts WHERE ip_address = _ip AND success = false;
  END IF;

  -- Housekeeping: attempts older than 7 days are irrelevant.
  DELETE FROM public.login_attempts WHERE created_at < now() - interval '7 days';
END;
$$;

CREATE OR REPLACE FUNCTION public.is_ip_blocked(_ip text)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((
    SELECT count(*) >= 10
    FROM public.login_attempts
    WHERE ip_address = _ip
      AND success = false
      AND created_at > now() - interval '15 minutes'
  ), false);
$$;

-- Clear the historical lockouts created by the old (windowless) rule.
DELETE FROM public.login_attempts
WHERE success = false
  AND created_at < now() - interval '15 minutes';

GRANT EXECUTE ON FUNCTION public.record_login_attempt(text, text, boolean) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_ip_blocked(text) TO anon, authenticated;
