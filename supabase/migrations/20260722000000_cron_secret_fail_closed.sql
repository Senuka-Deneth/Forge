-- Fail closed on CRON_SECRET: remove committed literal fallback from pg_cron job.
-- Pair database setting with edge-function secret:
--   alter database postgres set app.settings.cron_secret = 'your-strong-secret';
--   supabase secrets set CRON_SECRET=your-strong-secret

select cron.unschedule(jobid)
from cron.job
where jobname = 'score-ai-predictions-hourly';

select cron.schedule(
  'score-ai-predictions-hourly',
  '15 * * * *',
  $$
  select net.http_post(
    url := coalesce(
      nullif(current_setting('app.settings.functions_base_url', true), ''),
      'http://host.docker.internal:54321/functions/v1'
    ) || '/score-predictions',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'X-Cron-Secret', nullif(current_setting('app.settings.cron_secret', true), '')
    ),
    body := '{}'::jsonb
  ) as request_id;
  $$
);
