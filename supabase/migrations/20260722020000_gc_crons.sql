-- Purge expired AI analysis cache every 15 minutes
select cron.unschedule(jobid)
from cron.job
where jobname = 'purge-expired-ai-analysis-cache';

select cron.schedule(
  'purge-expired-ai-analysis-cache',
  '*/15 * * * *',
  $$delete from public.ai_analysis_cache where expires_at < now()$$
);

-- Prune old AI analysis logs daily
select cron.unschedule(jobid)
from cron.job
where jobname = 'prune-ai-analysis-logs';

select cron.schedule(
  'prune-ai-analysis-logs',
  '45 3 * * *',
  $$
  delete from public.ai_analysis_logs
  where created_at < now() - interval '90 days'
     or (status in ('error', 'rate_limited') and created_at < now() - interval '14 days')
  $$
);
