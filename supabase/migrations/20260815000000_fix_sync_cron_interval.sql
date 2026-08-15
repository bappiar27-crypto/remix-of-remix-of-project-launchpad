-- FIX: the sync-all cron job was running EVERY MINUTE.
-- Each run makes ~10 Facebook Graph API calls per ad account, sequentially,
-- with no backoff. Retrying every minute — including while already rate
-- limited — never lets Facebook's rolling rate-limit score recover, which is
-- why accounts got stuck permanently failing with "[FB 17] User request
-- limit reached". Ad account metrics do not need per-minute freshness, so we
-- slow the job down to every 20 minutes.
--
-- NOTE: we intentionally do NOT touch the job's `command` (the http_post
-- call to /api/public/hooks/sync-all with its URL + apikey), since that was
-- configured directly against this project and isn't tracked in migrations.
-- cron.alter_job() only changes the schedule, leaving the command untouched.
--
-- Run the SELECT below first to confirm the jobname/jobid before altering:
--   SELECT jobid, jobname, schedule, command FROM cron.job;

DO $$
DECLARE
  job_record RECORD;
BEGIN
  FOR job_record IN
    SELECT jobid FROM cron.job WHERE command ILIKE '%sync-all%'
  LOOP
    PERFORM cron.alter_job(job_id := job_record.jobid, schedule := '*/20 * * * *');
    RAISE NOTICE 'Rescheduled cron job % to run every 20 minutes', job_record.jobid;
  END LOOP;
END $$;
