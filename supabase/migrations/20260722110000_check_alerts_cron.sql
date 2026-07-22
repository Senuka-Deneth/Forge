-- Schedule check-alerts every minute and publish price_alerts for Realtime toasts.

select cron.unschedule(jobid)
from cron.job
where jobname = 'check-price-alerts-minutely';

select cron.schedule(
  'check-price-alerts-minutely',
  '* * * * *',
  $$
  select net.http_post(
    url := coalesce(
      nullif(current_setting('app.settings.functions_base_url', true), ''),
      'http://host.docker.internal:54321/functions/v1'
    ) || '/check-alerts',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'X-Cron-Secret', coalesce(nullif(current_setting('app.settings.cron_secret', true), ''), 'local-dev-cron-secret')
    ),
    body := '{}'::jsonb
  ) as request_id;
  $$
);

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'price_alerts'
  ) then
    alter publication supabase_realtime add table public.price_alerts;
  end if;
end $$;
